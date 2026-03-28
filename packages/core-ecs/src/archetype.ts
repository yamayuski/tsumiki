import { ColumnStore } from "./columnStore.js";
import type { Entity } from "./entity.js";
import type { ArrayIndex, ComponentConstructor, ComponentTypeId, Signature } from "./types.js";

/**
 * デフォルトのコンポーネントストア容量
 */
const DEFAULT_CAPACITY = 8;

/**
 * Archetype クラス
 *
 * ECS（エンティティ・コンポーネント・システム）におけるアーキタイプを表現します。
 * アーキタイプは特定のコンポーネント型の集合（typeIds）を持ち、
 * その集合に一致するエンティティと各コンポーネント列（ColumnStore）を管理します。
 *
 * 主な特徴:
 * - コンポーネントコンストラクタ（ctors）は typeId に基づいてソートされ、アーキタイプの正規形を形成します。
 * - 各コンポーネント型ごとに ColumnStore を構築して列ストレージを保持します。
 * - エンティティは entityIds 配列と indexByEntity マップで管理され、O(1) の追加・削除を行います（最後尾とスワップして削除する戦略）。
 */
export class Archetype {
  /**
   * アーキタイプが保持する型 ID の配列（ソート済み）。
   *
   * - 各要素はコンポーネント型を一意に識別する文字列 ID です。
   * - 要素は決定論的な順序でソートされており、等価比較やハッシュ生成、二分探索などの高速化を可能にします。
   * - 重複を持たないことを前提とし、配列自体は不変（readonly）として扱われることを想定しています。
   *
   * 例: ["Position", "Renderable", "Velocity"]
   */
  private readonly typeIds: ComponentTypeId[];

  /**
   * アーキタイプが保持するコンポーネントのコンストラクタ一覧です。
   *
   * 各要素は ComponentConstructor<unknown> 型のコンストラクタで、アーキタイプが表すコンポーネント型群を定義します。
   * 配列の順序は内部のレイアウトやコンポーネントインデックスに影響するため、一貫した順序で管理されます。
   * この配列は読み取り専用（readonly）であり、外部からの変更は想定されていません。
   *
   * 主にエンティティ生成・コンポーネントのマッチング・シリアライズ等で参照されます。保持しているのはコンストラクタ自体であり、コンポーネントのインスタンスではありません。
   *
   * @private
   * @readonly
   */
  private readonly ctors: ReadonlyArray<ComponentConstructor<unknown>>;

  /**
   * アーキタイプに属するエンティティの識別子一覧。
   *
   * 各要素は Entity 型の一意なエンティティIDで、同じアーキタイプ内のエンティティを連続的に格納します。
   * この配列はエンティティの追加・削除に伴って更新されますが、外部からは読み取り専用として扱われます。
   * 同じインデックスを用いて別配列に格納されたコンポーネントデータと対応づけられ、効率的なイテレーションやバッチ処理に利用されます。
   *
   * @internal
   * @readonly
   */
  private readonly entityIds: Entity[];

  /**
   * Entity を内部配列内のインデックスにマッピングする辞書。
   *
   * - キー: Entity（エンティティ識別子）
   * - 値: 内部エンティティ配列における 0 以上のインデックス
   *
   * このマップは archetype 内でエンティティの位置を高速に（O(1)）取得するために使われます。不変条件として、
   * マップに格納されたインデックスは常に内部のエンティティ配列上の実際の位置と一致している必要があります。
   * エンティティが削除されるか位置が入れ替わる際には必ずマップを更新してください（例: スワップして末尾を削除するパターンの場合、
   * スワップ先のエンティティのインデックスも更新する必要があります）。
   *
   * 注意:
   * - この構造体はエンティティのライフタイム管理を行いません。エンティティが削除されたら対応するエントリを削除すること。
   * - スレッドセーフではありません。並行アクセスがある場合は外部で同期してください。
   *
   * @internal 用途は Archetype 内部のインデックス管理のため。
   */
  private readonly indexByEntity: Map<Entity, ArrayIndex>;

  /**
   * 各コンポーネント型ID (typeId) をキーとして、対応する ColumnStore を保持するマップ。
   *
   * Map のキーはコンポーネントを一意に識別する文字列 (typeId)、
   * 値はそのコンポーネント列（ColumnStore<unknown>）で、アーキタイプ内の
   * コンポーネントデータの格納および高速アクセスに使用されます。
   *
   * unknown を用いることで異種コンポーネント列を同一コレクションで扱えるようにしているため、
   * 値を取り出す際には適切な型キャストまたは型ガードを行ってください。
   *
   * @private
   * @readonly
   */
  private readonly stores: Map<ComponentTypeId, ColumnStore<unknown>>;

  /**
   * Archetype を初期化するコンストラクタ。
   *
   * 渡されたコンポーネントコンストラクタ群を typeId によってソートし、アーキタイプの正規化された表現を作成します。
   * ソートされたコンストラクタ配列から typeIds を抽出し、エンティティ ID 用の配列とエンティティ→インデックスのマップを初期化します。
   * 各コンポーネントに対して ComponentSchema を用いた ColumnStore を生成し、既定容量 (DEFAULT_CAPACITY) で格納する Map を構築します。
   *
   * @param ctors ソート対象のコンポーネントコンストラクタの配列。各コンストラクタは少なくとも `typeId`（文字列）と `schema` を持つことが期待されます。
   *
   * @remarks
   * - ソートによりアーキタイプは typeId 順の標準形（canonical representation）となるため、渡す配列の順序に依存しません。
   * - 初期化の計算量はソートに伴う O(n log n) と、各コンポーネントに対するストア生成の O(n) です。
   * - エンティティ ID とインデックスのマップは bigint をキー／値を number として扱います。
   */
  public constructor(ctors: ReadonlyArray<ComponentConstructor>) {
    // sort by typeId to get canonical representation
    const sorted = ctors.slice().sort((a, b) => a.typeId.localeCompare(b.typeId));
    this.ctors = sorted;
    this.typeIds = sorted.map((c) => c.typeId);
    this.entityIds = [];
    this.indexByEntity = new Map<Entity, ArrayIndex>();
    this.stores = new Map<ComponentTypeId, ColumnStore<unknown>>();
    for (const c of this.ctors) {
      const schema = c.schema;
      const store = new ColumnStore(schema, DEFAULT_CAPACITY);
      this.stores.set(c.typeId, store);
    }
  }

  /**
   * コンポーネントのコンストラクタ一覧のシャローコピーを返します。
   *
   * 内部で保持している配列の参照をそのまま返さず、slice() によって新しい配列を作成して返すため、
   * 呼び出し側が戻り値を変更しても内部状態に影響を与えません。
   *
   * @returns Array<ComponentConstructor<unknown>> コンポーネントコンストラクタの読み取り専用配列
   */
  public copyConstructorList(): Array<ComponentConstructor<unknown>> {
    return this.ctors.slice();
  }

  /**
   * Archetype に関連付けられたコンポーネント型 ID の配列を '|' で連結して返すゲッター。
   *
   * @remarks
   * - typeIds の各要素は文字列化されて結合されるため、数値やシンボルなども安全に扱える。
   * - 生成される署名文字列は typeIds 配列の順序に依存するため、順序が異なれば別の署名とみなされる。
   * - 主にマップのキーや比較用の一意な識別子として使用されることを想定している。
   * - 副作用はなく、呼び出すたびに現在の typeIds に基づく新しい文字列が返される。
   *
   * @returns 連結された署名文字列（例: "Position|Velocity" または "1|2|3"）。
   *
   * @example
   * // typeIds = ["Position", "Velocity"] の場合
   * // signature => "Position|Velocity"
   */
  public get signature(): Signature {
    return this.typeIds.join("|");
  }

  /**
   * 指定した型IDがこのアーキタイプに含まれているかを判定します。
   *
   * @param typeId - 検査する型ID。文字列は完全一致（大文字・小文字を区別）で比較されます。
   * @returns 型IDが含まれていれば true、含まれていなければ false を返します。
   * @remarks 内部的には this.typeIds 配列に対して Array.prototype.includes を用いて検索するため、最悪計算量は O(n) です。副作用はありません。
   */
  public containsTypeId(typeId: ComponentTypeId): boolean {
    return this.typeIds.includes(typeId);
  }

  /**
   * 指定したエンティティをこのアーキタイプに追加します。
   *
   * - 新しいエンティティのインデックスは現在の entityIds.length を使用して決定されます。
   * - entityIds にエンティティを追加し、indexByEntity にエンティティ -> インデックスの対応を登録します。
   * - this.ctors に含まれる各コンポーネントについて対応する ColumnStore を取得し、componentValues から値を取り出して当該インデックスに格納します。
   * - componentValues に該当するコンポーネント値が存在しない場合は、当該コンポーネントのデフォルト（引数なしコンストラクタで生成した空インスタンス）を生成して格納します。
   *
   * @param entity 追加するエンティティ識別子
   * @param componentValues コンポーネントの typeId をキーとするマップ。指定がないコンポーネントはデフォルトインスタンスで補われます。
   *
   * @remarks
   * - このメソッドは this.entityIds、this.indexByEntity、および各 ColumnStore を破壊的に変更します。
   * - 各コンポーネントコンストラクタは引数なしでインスタンス化可能であることが前提です。
   */
  public addEntity(entity: Entity, componentValues: Map<ComponentTypeId, unknown>): void {
    const index = this.entityIds.length;
    this.entityIds.push(entity);
    this.indexByEntity.set(entity, index);
    // set per component
    for (const c of this.ctors) {
      const store = this.stores.get(c.typeId);
      if (!store) {
        throw new Error(`Component store for ${c.typeId} missing`);
      }
      const compRaw = componentValues.get(c.typeId);
      if (compRaw === undefined) {
        // set defaults (empty instance)
        const defaultInstance = new c();
        store.set(index, defaultInstance);
      } else {
        store.set(index, compRaw);
      }
    }
  }

  /**
   * 指定したエンティティをこのアーキタイプから削除します。
   *
   * アルゴリズム:
   * - `indexByEntity` マップでエンティティの位置を調べ、存在しなければ何もしません（no-op）。
   * - 配列の末尾要素と削除対象の位置をスワップし、末尾を pop する「スワップ削除」を行います。
   * - スワップが発生した場合は、末尾から移動してきたエンティティのインデックスを `indexByEntity` に更新します。
   * - 各ストアに対して `store.swapRemove(idx)` または末尾削除時は `store.swapRemove(last)` を呼び出し、対応する内部配列を縮小／スワップ更新します。
   *
   * 副作用:
   * - このメソッドはインスタンスの内部状態（`entityIds`、`indexByEntity`、および全てのストア）を変更します。
   * - スワップ削除のため、エンティティ配列の順序は保持されません（順序は変わる可能性があります）。
   *
   * パフォーマンス:
   * - マップ検索と配列の末尾削除は O(1)。
   * - 各ストアに対する更新はストア数に比例するため、全体としてはストア数に依存する O(S)（S = ストア数）。
   *
   * @param entity 削除対象のエンティティ。存在しない場合は何も行いません。
   * @returns なし（void）。
   */
  public removeEntity(entity: Entity): void {
    const idx = this.indexByEntity.get(entity);
    if (idx === undefined) {
      return;
    }
    const last = this.entityIds.length - 1;
    const lastEntity = this.entityIds[last];
    if (lastEntity === undefined) {
      throw new Error("Internal error: entityIds inconsistent state");
    }
    // swap remove in arrays
    this.entityIds[idx] = lastEntity;
    this.entityIds.pop();
    this.indexByEntity.delete(entity);
    if (idx !== last) {
      this.indexByEntity.set(lastEntity, idx);
      // for each store, swap last->idx
      for (const [_, store] of Array.from(this.stores.entries())) {
        store.swapRemove(idx);
      }
    } else {
      // just shrink stores size
      for (const [_, store] of Array.from(this.stores.entries())) {
        store.swapRemove(last);
      }
    }
  }

  /**
   * 指定したエンティティに対応する内部インデックスを取得します。
   *
   * 内部の indexByEntity マップを参照してエンティティのインデックスを返します。
   * エンティティがマップに存在しない場合は undefined を返します。
   *
   * @param entity インデックスを取得したいエンティティ
   * @returns エンティティのインデックス。存在しない場合は undefined
   */
  public indexOf(entity: Entity): ArrayIndex | undefined {
    return this.indexByEntity.get(entity);
  }

  /**
   * 指定したコンポーネントコンストラクタとインデックスに対応するコンポーネントインスタンスを取得します。
   *
   * @template T 取得するコンポーネントの型
   * @param ctor コンポーネントのコンストラクタ（`typeId` を持つことを期待します）
   * @param index アーキタイプ内のコンポーネント配列におけるゼロベースのインデックス
   * @returns 指定したインデックスにあるコンポーネントインスタンス（型 T として返されます）
   * @throws {Error} 指定したコンポーネントのストアがこのアーキタイプに存在しない場合（`Component ${ctor.typeId} not in archetype`）
   * @remarks
   * - インデックスが配列の範囲外である場合の挙動は内部のストア実装に依存します。範囲チェックが必要な場合は呼び出し側で行ってください。
   */
  public getComponentAt<T>(ctor: ComponentConstructor<T>, index: ArrayIndex): T {
    const store = this.stores.get(ctor.typeId);
    if (!store) {
      throw new Error(`Component ${ctor.typeId} not in archetype`);
    }
    return store.get(index) as T;
  }

  /**
   * 指定したインデックスのエンティティから、別の Archetype に対応するコンポーネント値のマップを生成して返します。
   *
   * 対象の target.ctors を走査し、各コンポーネントの typeId をキーにして値を決定します。
   * - コピー元（this）に同じ typeId のストアが存在する場合は、そのストアから値を取得して格納します（参照をコピーし、深い複製は行いません）。
   * - コピー元に存在しない場合は、コンポーネントのコンストラクタを呼び出してデフォルトインスタンスを生成して格納します。
   *
   * @param indexSrc コピー元エンティティのストア内インデックス
   * @param target コピー先の Archetype（target がコピー元のコンポーネントのスーパーセットであることが想定されます）
   * @returns コンポーネントの typeId をキー、対応するコンポーネント値（既存の値またはデフォルトインスタンス）を格納した Map<string, unknown>
   * @remarks
   * - 返される値は元のオブジェクトへの参照であり、このメソッドは深いコピーを行いません。必要に応じて呼び出し側で複製してください。
   * - target に含まれる各コンポーネントは引数なしでインスタンス化可能なコンストラクタであることを前提としています。該当しない場合、インスタンス生成時に例外が発生する可能性があります。
   * - 計算量は target.ctors の長さに比例します。
   */
  public copyEntityTo(indexSrc: ArrayIndex, target: Archetype): Map<ComponentTypeId, unknown> {
    // produce map of component values for components intersection (target must have superset)
    const out = new Map<ComponentTypeId, unknown>();
    for (const c of target.ctors) {
      // find source store for same type
      const sourceStore = this.stores.get(c.typeId);
      if (!sourceStore) {
        // not present: use default
        const defaultInstance = new c();
        out.set(c.typeId, defaultInstance);
      } else {
        const val = sourceStore.get(indexSrc);
        out.set(c.typeId, val);
      }
    }
    return out;
  }

  /**
   * 現在のエンティティ数を返します。
   *
   * `entityIds` 配列の現在の長さに基づいて、アーキタイプに含まれるエンティティの数を取得します。
   *
   * @returns 現在のエンティティ数
   */
  public get size(): number {
    return this.entityIds.length;
  }

  /**
   * エンティティの配列を順に走査し、各要素についてインデックスとエンティティIDを渡してコールバックを呼び出します。
   *
   * @param callback - 各要素に対して呼び出される関数。引数は (index: number, entityId: Entity) で、
   *                   index は配列内の 0 始まりの位置、entityId は該当するエンティティの ID を表します。
   *
   * @remarks
   * - コールバック内でエンティティ配列を変更すると、イテレーションの動作が不定になる可能性があります。
   * - コールバックの戻り値は無視されます（戻り値は不要です）。
   */
  public forEachIndexed(callback: (index: ArrayIndex, entityId: Entity) => void): void {
    for (let i = 0; i < this.entityIds.length; i++) {
      const entityId = this.entityIds[i];
      if (entityId === undefined) {
        throw new Error("Internal error: entityIds inconsistent state");
      }
      callback(i, entityId);
    }
  }
}
