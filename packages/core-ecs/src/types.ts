/**
 * FieldType は、ECS（エンティティ・コンポーネント・システム）やバイナリレイアウトで
 * 使用されるフィールドの基本データ型を表す文字列リテラルのユニオン型です。
 *
 * 各リテラルの意味:
 * - "f16"  : 16ビット浮動小数点（half-precision）
 * - "f32"  : 32ビット浮動小数点（single-precision）
 * - "f64"  : 64ビット浮動小数点（double-precision）
 * - "i8"   : 8ビット符号付き整数
 * - "i16"  : 16ビット符号付き整数
 * - "i32"  : 32ビット符号付き整数
 * - "u8"   : 8ビット符号無し整数
 * - "u16"  : 16ビット符号無し整数
 * - "u32"  : 32ビット符号無し整数
 * - "u8c"  : 8ビット符号無しクランプ（0–255に制限される用途を想定）
 * - "bi64" : 64ビット符号付き整数（BigInt を用いる想定）
 * - "biu64": 64ビット符号無し整数（BigInt を用いる想定）
 * - "bool" : ブール値（true / false）
 *
 * 備考:
 * - この型定義は文字列リテラルの集合であり、実際のランタイムの型（JavaScript の number / BigInt / boolean）とは
 *   直接対応しません。使用側で適切にマッピング（例: "f32" -> number（32bit 表現での扱い）、
 *   "bi64"/"biu64" -> BigInt）やエンコード/デコードの実装を行う必要があります。
 * - エンディアン性やバイトアライメント、符号拡張などの取り扱いは実装に依存します。
 */
export type FieldType =
  | "f16"
  | "f32"
  | "f64"
  | "i8"
  | "i16"
  | "i32"
  | "u8"
  | "u16"
  | "u32"
  | "u8c"
  | "bi64"
  | "biu64"
  | "bool";

/**
 * コンポーネント型を一意に識別する文字列型エイリアス。
 *
 * 用途:
 * - ECS（エンティティ・コンポーネント・システム）内でコンポーネントの登録、検索、マッピングに使用するIDを表します。
 *
 * 要件:
 * - プロジェクト内で一意であること。
 * - 実行間で安定していること（ランダムやメモリアドレスに依存しないこと）。
 * - 文字列で表現可能な任意の形式を使用可能（例: "Position", "Velocity", "Health"）。
 */
export type ComponentTypeId = string;
/**
 * Signature はコンポーネント構成やアーキタイプを表すための短い文字列です。
 *
 * 例: `"Physics|Velocity|Health"` のようなコンポーネント名の連結やハッシュを想定しています。
 */
export type Signature = string;

/**
 * 配列インデックスを表す数値型エイリアス。
 *
 * ECS の内部配列やカラムストアのインデックスを明示的に区別するために利用します。
 */
export type ArrayIndex = number;

/**
 * フレーム間の経過時間（秒）を表す数値型。
 *
 * システム更新で受け渡される `dt`（delta time）に対応します。
 */
export type DeltaTime = number;

/**
 * コンポーネントのスキーマ定義。
 *
 * ジェネリクス `T` の各プロパティキーに対して、保存されるフィールドの `FieldType` をマッピングします。
 * 例: `type Position = { x: 'f32', y: 'f32' }` のように使用します。
 */
export type ComponentSchema<T> = {
  [K in keyof T]: FieldType;
};

/**
 * コンポーネントのコンストラクタインターフェース。
 *
 * 要素:
 * - `new (): T` : コンポーネントのインスタンスを生成するコンストラクタ。
 * - `typeId`    : コンポーネントを一意に識別する文字列。
 * - `schema`    : コンポーネントのフィールドスキーマ（`ComponentSchema`）。
 */
export interface ComponentConstructor<T = unknown> {
  new (): T;
  readonly typeId: ComponentTypeId;
  readonly schema: ComponentSchema<T>;
}

/**
 * バイナリ/数値データの格納に使用され得る型の集合。
 *
 * JavaScript のビルトインの型配列（TypedArray）と BigInt の配列型を含みます。
 */
export type TypedArray =
  | Float16Array
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Uint8ClampedArray
  | BigInt64Array
  | BigUint64Array;
