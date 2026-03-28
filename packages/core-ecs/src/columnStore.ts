import type { ArrayIndex, ComponentSchema, FieldType, TypedArray } from "./types.js";

const INITIAL_CAPACITY = 8;

/**
 * サポートされていないフィールド型が使用された場合に投げられるエラー。
 */
export class UnsupportedFieldTypeError extends Error {}

/**
 * ColumnStore は、コンポーネントのスキーマに基づいて各フィールドを個別の TypedArray として
 * 管理する列志向（カラムナ）ストレージです。
 *
 * - ジェネリック型 T はストアするコンポーネントの型を表します。
 * - 各フィールドは ComponentSchema に従って適切な TypedArray にマッピングされます。
 * - 内部的に capacity（確保済み容量）と size（実際の要素数）を管理し、必要に応じて倍増戦略でリサイズします。
 *
 * @template T ストアするコンポーネント型
 */
export class ColumnStore<T = unknown> {
  /**
   * 内部で保持するフィールド名から対応する TypedArray へのマップ。
   *
   * - キーはスキーマ内のフィールド名（文字列）、
   * - 値は当該フィールドを格納する TypedArray（例: Float32Array, Int32Array, BigInt64Array など）。
   *
   * @private
   */
  private typedArrayMap: Map<string, TypedArray>;

  /**
   * 現在確保している各配列の長さ（要素数）。
   *
   * - 要求に応じて ensureCapacity により倍増して拡張される。
   *
   * @private
   */
  private capacity: number;

  /**
   * ストアされている要素数（有効なインデックスの最大 + 1）。
   *
   * - set により index が size を超えた場合は更新される。
   *
   * @private
   */
  private size: number;

  /**
   * 指定したスキーマに基づいて ColumnStore を初期化します。
   *
   * - 各フィールドについて createArrayForType を用いて初期配列を作成します。
   * - initialCapacity は最小確保容量で、1 未満は無視されます。
   *
   * @param schema コンポーネントのフィールド名と型のスキーマ
   * @param initialCapacity 初期に確保する配列長（デフォルト: 8）
   */
  public constructor(
    public readonly schema: ComponentSchema<T>,
    initialCapacity: number = INITIAL_CAPACITY,
  ) {
    this.capacity = Math.max(initialCapacity, 1);
    this.typedArrayMap = new Map<string, TypedArray>();
    this.size = 0;

    for (const key of Object.keys(schema) as Array<keyof T & string>) {
      const type = schema[key];
      const arr = ColumnStore.createArrayForType(type, this.capacity);
      this.typedArrayMap.set(key, arr);
    }
  }

  /**
   * 指定した最小容量を満たすように内部配列を拡張します。
   *
   * - 現在の capacity が minCapacity 未満の場合、capacity を倍にしながら
   *   minCapacity 以上になるまで拡張します（成長戦略は指数的）。
   * - 各フィールドごとに新しい TypedArray を作成し、既存データをコピーします。
   * - BigInt 系の配列と number 系の配列が混在するような不整合があれば
   *   UnsupportedFieldTypeError を投げます。
   *
   * @param minCapacity 必要とする最小容量（この値以上を保証する）
   * @throws UnsupportedFieldTypeError 配列型の不整合が発生した場合
   */
  private ensureCapacity(minCapacity: number): void {
    if (this.capacity >= minCapacity) {
      return;
    }
    let newCap = this.capacity;
    while (newCap < minCapacity) {
      newCap *= 2;
    }
    for (const [key, oldArr] of Array.from(this.typedArrayMap.entries())) {
      const ft = this.schema[key as keyof T & string];
      const newArr = ColumnStore.createArrayForType(ft, newCap);
      // Ensure correct type for .set()
      if (
        (newArr instanceof BigInt64Array || newArr instanceof BigUint64Array) &&
        (oldArr instanceof BigInt64Array || oldArr instanceof BigUint64Array)
      ) {
        newArr.set(oldArr, 0);
      } else if (
        !(newArr instanceof BigInt64Array || newArr instanceof BigUint64Array) &&
        !(oldArr instanceof BigInt64Array || oldArr instanceof BigUint64Array)
      ) {
        newArr.set(oldArr, 0);
      } else {
        throw new UnsupportedFieldTypeError(
          `Mismatched array types during resize for field ${key}`,
        );
      }
      this.typedArrayMap.set(key, newArr);
    }
    this.capacity = newCap;
  }

  /**
   * 指定インデックスにコンポーネント値を設定します。
   *
   * - index が capacity を超える場合は ensureCapacity を呼んで拡張します。
   * - 各フィールドの値は typeof に基づき適切に変換して対応する TypedArray に格納されます：
   *   - bigint は BigInt 系配列へ、
   *   - number は数値系配列へ、
   *   - boolean は 1/0 に変換して格納（bool は Uint8Array を使う）、
   *   - string は小数表現や指数表現を考慮して parseFloat/parseInt により数値化、
   *   - undefined はデフォルト 0 を格納します。
   * - 非対応の値型（function/object/symbol など）や不適合な型の場合は
   *   UnsupportedFieldTypeError を投げます。
   * - index が負の場合は RangeError を投げします。
   * - size は必要に応じて更新されます。
   *
   * @param index 設定先のインデックス（0 以上）
   * @param value 設定するコンポーネント値（部分的なフィールド未定義も可）
   * @throws RangeError index が負のとき
   * @throws UnsupportedFieldTypeError サポート外の値型や格納不能な場合
   * @throws Error 内部配列が見つからない等の想定外状態のとき
   */
  public set(index: ArrayIndex, value: T): void {
    if (index < 0) {
      throw new RangeError("Index must be non-negative");
    }
    if (index >= this.capacity) {
      this.ensureCapacity(index + 1);
    }
    for (const key of Object.keys(this.schema) as Array<keyof T & string>) {
      const arr = this.typedArrayMap.get(key);
      if (!arr) {
        throw new Error(`Array for field ${key} not found`);
      }
      const raw = value[key];
      switch (typeof raw) {
        case "bigint": {
          arr[index] = raw;
          break;
        }
        case "string": {
          if (raw.includes(".") || raw.includes("e") || raw.includes("E")) {
            arr[index] = Number.parseFloat(raw);
            break;
          }
          arr[index] = parseInt(raw, 10);
          break;
        }
        case "number": {
          arr[index] = raw;
          break;
        }
        case "boolean": {
          arr[index] = raw ? 1 : 0;
          break;
        }
        case "undefined": {
          arr[index] = 0; // default
          break;
        }
        default:
          throw new UnsupportedFieldTypeError(
            `Unsupported value type for field ${key}: ${typeof raw}`,
          );
      }
    }

    if (index >= this.size) {
      this.size = index + 1;
    }
  }

  /**
   * 指定インデックスのコンポーネントを再構成して返します。
   *
   * - 内部の TypedArray から各フィールドの生データを取り出し、
   *   スキーマに従って number / boolean / bigint 等に変換してオブジェクトを組み立てます。
   * - 範囲チェックは行わないため、index が size を超える場合は配列から取得される
   *   デフォルト値（通常 0 や 0n 等）や未定義値が返される可能性があります。
   * - 未対応のフィールド型がスキーマに含まれる場合は UnsupportedFieldTypeError を投げます。
   *
   * @param index 取得するインデックス
   * @returns 指定インデックスのコンポーネント（ジェネリック型 T）
   * @throws UnsupportedFieldTypeError スキーマに未サポート型が含まれる場合
   * @throws Error 内部配列が見つからない等の想定外状態のとき
   */
  public get(index: ArrayIndex): T {
    const out = {} as Record<keyof T, unknown>;
    for (const key of Object.keys(this.schema) as Array<keyof T & string>) {
      const arr = this.typedArrayMap.get(key);
      if (!arr) {
        throw new Error(`Array for field ${key} not found`);
      }
      const ft = this.schema[key];
      const raw = index < this.size ? arr[index] : 0;
      switch (ft) {
        case "f16":
        case "f32":
        case "f64":
        case "i8":
        case "i16":
        case "i32":
        case "u8":
        case "u16":
        case "u32":
        case "u8c": {
          out[key] = raw;
          break;
        }
        case "bool": {
          out[key] = raw !== 0;
          break;
        }
        case "bi64":
        case "biu64": {
          out[key] = raw === undefined ? undefined : BigInt(raw);
          break;
        }
        default:
          throw new UnsupportedFieldTypeError(`Unsupported field type: ${ft}`);
      }
    }
    return out as unknown as T;
  }

  /**
   * 与えられたインデックスの要素を高速削除（swap-remove）します。
   *
   * - 最後の要素を削除対象の位置にコピーして size をデクリメントします。
   * - 削除対象が最後の要素自身であれば単に size をデクリメントします。
   * - インデックスが範囲外（index < 0 || index >= size）の場合は Error を投げます。
   *
   * @param index 削除する要素のインデックス
   * @throws Error インデックスが範囲外のとき
   */
  public swapRemove(index: ArrayIndex): void {
    const last = this.size - 1;
    if (index < 0 || index >= this.size) {
      throw new Error("Index out of range");
    }
    if (index === last) {
      // just shrink
      this.size--;
      return;
    }
    // copy last to index
    for (const key of Object.keys(this.schema) as Array<keyof T & string>) {
      const arr = this.typedArrayMap.get(key);
      if (!arr || arr[last] === undefined) {
        throw new Error(`Array for field ${key} not found`);
      }
      arr[index] = arr[last];
    }
    this.size--;
  }

  /**
   * 別の ColumnStore から単一フィールド列コピーを行います。
   *
   * - this の指定 indexTarget に対して other の indexSrc に格納された値をコピーします。
   * - indexTarget が capacity を超える場合は ensureCapacity によって拡張します。
   * - indexSrc が other.size の範囲外であれば RangeError を投げします。
   * - コピーは各フィールドの TypedArray の単一要素代入により行われます。
   * - コピー後、indexTarget が現在の size を超えていれば size を更新します。
   *
   * @param indexTarget コピー先のインデックス
   * @param other コピー元の ColumnStore
   * @param indexSrc コピー元のインデックス（other 側）
   * @throws RangeError indexSrc が other の有効範囲外のとき
   */
  public copyFrom(indexTarget: ArrayIndex, other: ColumnStore<T>, indexSrc: ArrayIndex): void {
    // ensure capacity
    if (indexTarget >= this.capacity) {
      this.ensureCapacity(indexTarget + 1);
    }
    if (indexSrc < 0 || indexSrc >= other.size) {
      throw new RangeError("Source index out of range");
    }
    for (const key of Object.keys(this.schema) as Array<keyof T & string>) {
      const dst = this.typedArrayMap.get(key);
      const src = other.typedArrayMap.get(key);
      if (!dst || !src) {
        throw new Error(`Array for field ${key} not found`);
      }
      if (src[indexSrc] === undefined) {
        throw new Error(`Source array for field ${key} has undefined at index ${indexSrc}`);
      }
      // copy single element
      // (no need to check types, ensured at construction)
      dst[indexTarget] = src[indexSrc];
    }
    if (indexTarget >= this.size) {
      this.size = indexTarget + 1;
    }
  }

  /**
   * 指定されたフィールド型に対応する新しい TypedArray を作成して返します。
   *
   * - サポートされる型:
   *   "f16" -> Float16Array
   *   "f32" -> Float32Array
   *   "f64" -> Float64Array
   *   "i8", "i16", "i32" -> Int8Array / Int16Array / Int32Array
   *   "u8", "u16", "u32" -> Uint8Array / Uint16Array / Uint32Array
   *   "u8c" -> Uint8ClampedArray
   *   "bool" -> Uint8Array（0/1 を使用）
   *   "bi64" -> BigInt64Array
   *   "biu64" -> BigUint64Array
   * - 未サポートの型が渡された場合は UnsupportedFieldTypeError を投げます。
   *
   * @private
   * @param type フィールドの型（FieldType）
   * @param length 作成する配列の長さ（要素数）
   * @returns 指定長の TypedArray
   * @throws UnsupportedFieldTypeError 未サポートのフィールド型が指定されたとき
   */
  private static createArrayForType(type: FieldType, length: number): TypedArray {
    switch (type) {
      case "f16":
        return new Float16Array(length);
      case "f32":
        return new Float32Array(length);
      case "f64":
        return new Float64Array(length);
      case "i8":
        return new Int8Array(length);
      case "i16":
        return new Int16Array(length);
      case "i32":
        return new Int32Array(length);
      case "u8":
      case "bool": // use 0 and 1 for boolean values
        return new Uint8Array(length);
      case "u16":
        return new Uint16Array(length);
      case "u32":
        return new Uint32Array(length);
      case "u8c":
        return new Uint8ClampedArray(length);
      case "bi64":
        return new BigInt64Array(length);
      case "biu64":
        return new BigUint64Array(length);
      default:
        throw new UnsupportedFieldTypeError(`Unsupported field type: ${String(type)}`);
    }
  }
}
