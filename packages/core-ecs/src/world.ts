import { Archetype } from "./archetype.js";
import type { Entity } from "./entity.js";
import type { ComponentConstructor, Signature } from "./types.js";

/**
 * World クラス
 *
 * ECS（エンティティ・コンポーネント・システム）におけるエンティティとコンポーネントの管理を提供します。
 * 内部では「アーキタイプ（Archetype）」を使用して、同一のコンポーネント構成を持つエンティティ群をまとめて格納します。
 *
 * 主な特徴:
 * - エンティティは bigint の ID（1n からインクリメント）で管理されます。
 * - コンポーネントの型識別は各 ComponentConstructor の `typeId`（文字列）によって行われます。
 * - アーキタイプはコンポーネントの型識別子をソートしたシグネチャ（'|' 区切り）で一意に決定され、既存のアーキタイプがあれば再利用されます。
 * - エンティティにコンポーネントを追加・削除するときは、必要に応じてエンティティを別のアーキタイプへ移動（コピーと削除）します。
 *
 * 実装上の注意点:
 * - アーキタイプのシグネチャは ctor.typeId をソートして結合して作成されるため、ctor 配列の順序はシグネチャに影響しません。
 * - addComponent/removeComponent の操作はエンティティを別アーキタイプへコピーしてから元を削除することで実現されます。コピー処理の結果としてコンポーネントの値は新しいアーキタイプの期待する型セットに合わせて選択されます。
 * - query の戻り値中の components は呼び出し時に指定した ctor の順序に従って格納されます。
 *
 * 例:
 * - 新規エンティティ作成 -> addEntityWithComponents で複数コンポーネントを追加 -> query で対象エンティティを取得 -> getComponent で個別取得
 *
 * @remarks
 * World はシングルスレッド想定のデータ構造です。並列アクセスやトランザクション的な原子性を要求する用途では、上位レイヤで同期制御を行ってください。
 */
export class World {
  /**
   * 次に割り当てるエンティティIDを保持する増分カウンタ。
   *
   * - Entity 型を使って一意のエンティティ識別子を生成します（初期値は 1n）。
   * - 新しいエンティティ生成時に現在値を返し、その後モノトニックにインクリメントされることを想定しています。
   * - 内部実装用の private フィールドのため、直接操作せずエンティティ生成用の公開 API を介して更新してください。
   *
   * @private
   * @type {Entity}
   * @default 1n
   */
  private nextEntityId: Entity = 1n;

  /**
   * エンティティID (bigint) をキーに、該当エンティティが属する Archetype を保持するマップです。
   *
   * - キー: エンティティの一意な識別子 (bigint)
   * - 値: エンティティの現在の Archetype インスタンス
   *
   * 使用上の注意:
   * - 存在しないエンティティを問い合わせると undefined が返ります。
   * - コンポーネントの追加・削除に伴い、対応するエントリを必ず更新（set/delete）してください。
   * - イテレーション中にマップを変更すると反復の安全性が損なわれる可能性があるため注意が必要です。
   * - スレッドセーフではないため、並列操作が想定される場合は外部で同期制御を行ってください。
   *
   * @private
   * @remarks このフィールドは内部状態の管理用であり、外部から直接操作せずワールドの公開API経由で扱うことを推奨します。
   */
  private readonly entityArchetype: Map<Entity, Archetype>;

  /**
   * Archetypeの署名文字列から対応するArchetypeインスタンスを高速に検索するためのマップ。
   *
   * @remarks
   * - キーはコンポーネント識別子を安定した順序で結合した「署名」文字列（例: "Position|Velocity|Health"）で、
   *   同じ組み合わせのコンポーネントに対して一意に対応します。
   * - このマップは署名をキーにして既存のArchetypeを再利用することで、アーキタイプの重複作成を防ぎます。
   * - ワールド内でのエンティティ作成・削除や、エンティティのコンポーネント構成変更（アーキタイプ間の移行）時に参照されます。
   * - 内部実装のため外部から直接操作しないでください。シリアライズの対象ではありません。
   *
   * @example
   * // 署名の例: "Transform|Renderable"
   *
   * @internal
   */
  private readonly archetypeBySignature: Map<Signature, Archetype>;

  /**
   * World のコンストラクタ。内部データ構造を初期化します。
   *
   * - entityArchetype: Entity をキーにしてそのエンティティが属する Archetype を保持する Map（空で初期化）。
   * - archetypeBySignature: コンポーネントの署名（文字列）をキーにして対応する Archetype を保持する Map（空で初期化）。
   *
   * これらのマップは、エンティティごとの所属アーキタイプの追跡と、署名からアーキタイプを検索・再利用するために用いられます。
   *
   * @remarks
   * コンストラクタ実行時点ではどちらの Map も空です。エンティティやアーキタイプが追加されることで内容が構築されます。
   */
  constructor() {
    this.entityArchetype = new Map<Entity, Archetype>();
    this.archetypeBySignature = new Map<Signature, Archetype>();
  }

  /**
   * 新しいエンティティIDを生成して返します。
   *
   * このメソッドは内部の nextEntityId を現在の値からインクリメントし、
   * 生成された一意のエンティティIDを返すことで、同一 World インスタンス内での
   * エンティティIDの一意性を保証します。
   *
   * @returns 生成されたエンティティのID（Entity 型）
   */
  createEntity(): Entity {
    const id = this.nextEntityId++;
    return id;
  }

  /**
   * 指定されたコンポーネントコンストラクタ群に対応する Archetype を取得します。
   * 既に同一のコンポーネント構成を持つ Archetype が存在する場合はそれを返し、
   * 存在しない場合は新たに作成して内部マップに登録してから返します。
   *
   * 処理の流れ:
   * - 引数の配列は変更されないようにコピーされ、各要素の typeId によってソートされます。
   * - ソート済みの typeId を '|' で連結してシグネチャ文字列を作成します。
   * - そのシグネチャをキーにして既存の Archetype を探索し、見つかればそれを返します。
   * - 見つからなければ新しい Archetype を作成し、シグネチャをキーにしてマップに登録して返します。
   *
   * 注意:
   * - 各コンポーネントコンストラクタは安定した一意の `typeId` プロパティを持つことが前提です。
   * - 引数の配列の順序は結果に影響しません（内部でソートされるため）。
   * - シグネチャは単純に '|' で結合された文字列なので、重複する typeId があると期待しない挙動になる可能性があります。
   *
   * @param ctors コンポーネントのコンストラクタ配列。各コンストラクタは `typeId: string` を持つことが期待されます。配列自体は変更されません。
   * @returns 指定されたコンポーネント構成に対応する既存または新規の Archetype。
   */
  private getOrCreateArchetype(ctors: ReadonlyArray<ComponentConstructor>): Archetype {
    const tmp = ctors.slice().sort((a, b) => a.typeId.localeCompare(b.typeId));
    const sig = tmp.map((c) => c.typeId).join("|");
    const existing = this.archetypeBySignature.get(sig);
    if (existing) {
      return existing;
    }
    const archetype = new Archetype(tmp);
    this.archetypeBySignature.set(sig, archetype);
    return archetype;
  }

  /**
   * 指定したエンティティに複数のコンポーネントを追加し、それらに対応するアーキタイプを取得または作成して登録します。
   *
   * 処理の流れ:
   * 1. 引数 components のキー（ComponentConstructor）からコンポーネントのコンストラクタ群を抽出し、対応するアーキタイプを取得または生成します。
   * 2. components の各エントリを、コンポーネントの typeId をキーとする Map<string, unknown> に変換します。
   * 3. 変換したマップをアーキタイプに渡してエンティティを追加し、内部の entityArchetype マップを更新します。
   *
   * @param entity 追加対象のエンティティ
   * @param components ComponentConstructor をキー、該当するコンポーネントインスタンスを値とする Map
   *
   * @remarks
   * - ComponentConstructor は `typeId` プロパティを持つことが前提です。
   * - 同一エンティティを再度追加する場合の動作（上書きや重複防止など）は呼び出し元の責任で管理してください。
   * - 戻り値はありません。内部状態（アーキタイプ及び entityArchetype）が更新されます。
   */
  public addEntityWithComponents(
    entity: Entity,
    components: Map<ComponentConstructor, unknown>,
  ): void {
    // determine target ctors
    const ctors = Array.from(components.keys());
    const archetype = this.getOrCreateArchetype(ctors);
    // prepare map typeId->value
    const mapValues = new Map<string, unknown>();
    for (const [k, v] of components.entries()) {
      mapValues.set(k.typeId, v);
    }
    archetype.addEntity(entity, mapValues);
    this.entityArchetype.set(entity, archetype);
  }

  // add a single component to existing entity (move to new archetype)
  /**
   * エンティティにコンポーネントを追加または更新します。
   *
   * 概要：
   * - 指定したエンティティに対してコンポーネント（ctor）を追加し、その値を value で設定します。
   * - エンティティがまだどのアーキタイプにも属していない場合は、新しいアーキタイプを作成して追加します。
   * - 追加するコンポーネントの型が既にエンティティに存在する場合は重複して追加せず、値を上書きします。
   * - 必要に応じてエンティティを現在のアーキタイプから目的のアーキタイプへ移動し、コンポーネント値は内部的にコピーされます。
   * - 最終的に this.entityArchetype マップを更新して、エンティティの所属アーキタイプを保持します。
   *
   * 型パラメータ：
   * @template T - 追加するコンポーネントの型
   *
   * パラメータ：
   * @param entity - コンポーネントを追加する対象のエンティティ
   * @param ctor - コンポーネントのコンストラクタ（内部で ctor.typeId をキーとして使用）
   * @param value - 追加するコンポーネントの値
   *
   * 例外：
   * @throws Error - 内部でエンティティのインデックスが見つからない場合（"Entity index missing"）
   *
   * 副作用：
   * - アーキタイプの作成・取得（getOrCreateArchetype）を行う可能性があります。
   * - 必要に応じてエンティティを別のアーキタイプへ移動し、現在のアーキタイプから削除、目的アーキタイプへ追加します。
   * - コンポーネント値は Map（キーは ctor.typeId）として格納されます。
   *
   * 備考：
   * - 実装上、同一アーキタイプであっても内部的に値のコピーとエンティティの再追加を行うことで更新を実現します。
   */
  public addComponent<T>(entity: Entity, ctor: ComponentConstructor<T>, value: T): void {
    const current = this.entityArchetype.get(entity);
    const curCtors: Array<ComponentConstructor> = current ? current.copyConstructorList() : [];
    // if entity not present in any archetype, treat curCtors empty
    // create new list with ctor if not present
    if (!curCtors.find((c) => c.typeId === ctor.typeId)) {
      curCtors.push(ctor);
    }
    const target = this.getOrCreateArchetype(curCtors);
    if (!current) {
      // simply add
      const mapValues = new Map<ComponentConstructor, unknown>();
      mapValues.set(ctor, value);
      target.addEntity(entity, new Map<string, unknown>([[ctor.typeId, value]]));
      this.entityArchetype.set(entity, target);
      return;
    }
    // need to move entity from current to target
    if (current.signature === target.signature) {
      // same archetype, just set value
      const idx = current.indexOf(entity);
      if (idx === undefined) {
        throw new Error("Entity index missing");
      }
      // We can't directly set to ColumnStore in current impl; instead copy out existing map and overwrite
      const values = current.copyEntityTo(idx, target);
      values.set(ctor.typeId, value);
      // remove from current and add to target
      current.removeEntity(entity);
      target.addEntity(entity, values);
      this.entityArchetype.set(entity, target);
      return;
    } else {
      // different archetype: copy values across
      const idx = current.indexOf(entity);
      if (idx === undefined) {
        throw new Error("Entity index missing");
      }
      const values = current.copyEntityTo(idx, target);
      values.set(ctor.typeId, value);
      current.removeEntity(entity);
      target.addEntity(entity, values);
      this.entityArchetype.set(entity, target);
      return;
    }
  }

  /**
   * 指定したエンティティから与えられたコンポーネント型を削除します。
   *
   * 操作の流れ:
   * 1. エンティティが現在属しているアーキタイプを取得する。存在しなければ何もしない。
   * 2. 指定したコンポーネント型 (ctor.typeId) が現在のアーキタイプに含まれていなければ何もしない。
   * 3. 削除後に該当するコンポーネント一覧を持つ（ターゲット）アーキタイプを取得または作成する。
   * 4. 現在のアーキタイプ内のエンティティの位置を特定し、その値をターゲットのコンポーネントレイアウトに合わせてコピーする。
   * 5. 元のアーキタイプからエンティティを削除し、ターゲットにエンティティとコピーした値を追加する。
   * 6. エンティティ -> アーキタイプのマッピングをターゲットに更新する。
   *
   * 注意事項:
   * - 指定したコンポーネントがエンティティに存在しない場合は副作用は発生しません。
   * - ctor は ComponentConstructor<T> であり、ctor.typeId を利用して型同一性を判定します。
   * - コピー処理はターゲットのコンポーネント順に合わせて行われるため、削除されたコンポーネントの値は結果に含まれません。
   *
   * パフォーマンス:
   * - 実行時間は現在のアーキタイプのコンポーネント数およびエンティティの値のコピー量に依存します（概ね線形）。
   *
   * @param entity 削除対象のエンティティ
   * @param ctor 削除するコンポーネントのコンストラクタ（型識別子は ctor.typeId による）
   * @returns void
   */
  public removeComponent<T>(entity: Entity, ctor: ComponentConstructor<T>): void {
    const current = this.entityArchetype.get(entity);
    if (!current) {
      return;
    }
    // if not present, do nothing
    if (!current.containsTypeId(ctor.typeId)) {
      return;
    }
    // create new ctors list without this ctor
    const newCtors = current.copyConstructorList().filter((c) => c.typeId !== ctor.typeId);
    const target = this.getOrCreateArchetype(newCtors);
    const idx = current.indexOf(entity);
    if (idx === undefined) {
      return;
    }
    const values = current.copyEntityTo(idx, target);
    // removing means values will not include ctor, but copyEntityTo produced values for target ctors only
    current.removeEntity(entity);
    target.addEntity(entity, values);
    this.entityArchetype.set(entity, target);
  }

  /**
   * 指定したエンティティをワールドから破棄します。
   *
   * エンティティが所属しているアーキタイプからエンティティを削除し、
   * 内部の entityArchetype マップからそのエンティティのエントリを削除します。
   * エンティティがワールドに存在しない（マップに登録されていない）場合は何もしません。
   *
   * @param entity 破棄するエンティティ
   * @returns なし
   *
   * @remarks
   * - 実際のコンポーネントデータの解放やその他のクリーンアップ処理は、`current.removeEntity` の実装に依存します。
   * - 破棄後、そのエンティティ識別子は無効扱いとなるため、再利用する場合は再登録や初期化が必要です。
   * - マップ参照とアーキタイプ内削除のコストに依存しますが、想定としては定数時間操作 (O(1)) です。
   */
  public destroyEntity(entity: Entity): void {
    const current = this.entityArchetype.get(entity);
    if (!current) {
      return;
    }
    current.removeEntity(entity);
    this.entityArchetype.delete(entity);
  }

  /**
   * 指定したコンポーネントコンストラクタ群を持つ全エンティティを検索して返すクエリ関数。
   *
   * 指定したコンポーネント型をすべて含むアーキタイプを走査し、
   * 各エンティティに対してそのコンポーネントインスタンスをコンストラクタの順序に従ったタプルとして返します。
   *
   * @typeParam Ts - 検索対象とするコンポーネントコンストラクタの型リスト。
   *
   * @param ctors - 検索に使用するコンポーネントコンストラクタを可変長引数で指定します。戻り値の components フィールドはこの引数の順序に対応します。
   *
   * @returns 読み取り専用の結果配列。各要素は以下を含みます：
   *  - entity: マッチしたエンティティ
   *  - components: 指定した ctors に対応するコンポーネントインスタンスのタプル（InstanceType<Ts[number]> に準拠）
   *
   * @remarks
   * - 内部的には各コンストラクタの typeId を用いてアーキタイプをフィルタし、該当アーキタイプの全エンティティからコンポーネントを取得します。
   * - components の要素順は渡した ctors の順序に厳密に従いますが、結果配列の並び順（アーキタイプやエンティティの走査順）は保証されません。
   * - 実行コストは登録されているアーキタイプ数と各アーキタイプ内のエンティティ数に依存します（全アーキタイプの走査が発生します）。
   */
  public query<Ts extends ReadonlyArray<ComponentConstructor>>(
    ...ctors: Ts
  ): ReadonlyArray<{
    entity: Entity;
    components: { [K in keyof Ts]: InstanceType<Ts[K]> };
  }> {
    const sigSet = ctors.map((c) => c.typeId).sort();
    const out: Array<{
      entity: Entity;
      components: { [K in keyof Ts]: InstanceType<Ts[K]> };
    }> = [];
    for (const archetype of Array.from(this.archetypeBySignature.values())) {
      const hasAll = sigSet.every((s) => archetype.containsTypeId(s));
      if (!hasAll) {
        continue;
      }
      archetype.forEachIndexed((index, entity) => {
        const components = {} as unknown as {
          [K in keyof Ts]: InstanceType<Ts[K]>;
        };
        // fill comps in order of ctors param
        for (let i = 0; i < ctors.length; i++) {
          const ctor = ctors[i];
          if (!ctor) {
            continue;
          }
          const comp = archetype.getComponentAt(
            ctor as ComponentConstructor<InstanceType<typeof ctor>>,
            index,
          );
          (components as unknown as Record<string, unknown>)[i.toString()] = comp;
        }
        out.push({ entity, components });
      });
    }
    return out;
  }

  /**
   * 指定したエンティティから型 T のコンポーネントインスタンスを取得します。
   *
   * エンティティが現在どのアーキタイプにも属していない場合、または
   * 指定したコンポーネント型がそのアーキタイプに存在しない場合、
   * もしくはエンティティのインデックスが解決できない場合は undefined を返します。
   *
   * @typeParam T - 取得するコンポーネントの型
   * @param entity - コンポーネントを取得したいエンティティ
   * @param ctor - 目的のコンポーネントを表すコンストラクタ（typeId を持つこと）
   * @returns 指定したエンティティが持つ型 T のコンポーネントインスタンス、存在しない場合は undefined
   *
   * @remarks
   * 実装はエンティティからアーキタイプを取得し、エンティティのインデックスを解決した上で
   * 当該アーキタイプに指定の typeId が含まれていれば該当インデックスのコンポーネントを返します。
   * 副作用はなく、見つからなければ安全に undefined を返すことが期待されます。
   */
  public getComponent<T>(entity: Entity, ctor: ComponentConstructor<T>): T | undefined {
    const current = this.entityArchetype.get(entity);
    if (!current) {
      return;
    }
    const idx = current.indexOf(entity);
    if (idx === undefined) {
      return;
    }
    if (!current.containsTypeId(ctor.typeId)) {
      return undefined;
    }
    return current.getComponentAt(ctor, idx);
  }
}
