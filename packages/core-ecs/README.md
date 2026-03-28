# Sekai ECS - Pure TypeScript Entity-Component-System for gaming

このディレクトリ内の実装は、Archetype ベースの簡易
ECS（Entity-Component-System）です。
実装は実用的かつシンプルに保ちつつ、アーキタイプ（同一コンポーネント構成）ごとの列指向ストレージを採用しています。

主なコンポーネント:

- `World` :
  エンティティの生成・破棄、コンポーネントの追加/削除、クエリを提供するコアオブジェクト。
- `Archetype` : 特定のコンポーネント集合を持つエンティティ群と、それに対応する
  `ColumnStore` を管理する単位。
- `ColumnStore` : コンポーネントのフィールドを `TypedArray`
  ベースで列ストレージとして保持する低レベルストア。

## 実装上の要点

- エンティティ ID は `bigint`（`1n` から増加）で一意に管理される。型は
  `ecs/entity.ts` の `Entity`。
- コンポーネント型は
  `ComponentConstructor`（コンストラクタ関数）で表現され、`typeId: string` と
  `schema` を持つことを前提とする。
- アーキタイプはコンポーネントの `typeId`
  をソートして結合した文字列（`Signature`）で一意に識別される。
- コンポーネントの保存は `ColumnStore` による SoA（Structure of
  Arrays）風実装で、型に応じた `TypedArray` を使用してメモリを効率化している。
- コンポーネントの追加/削除は、必要に応じてエンティティを別のアーキタイプへ移動（コピー
  & remove）することで実現される。

## API（主要メソッド）

### World

- `createEntity(): Entity` — 新しいエンティティ ID を生成して返す。
- `addEntityWithComponents(entity, components: Map<ComponentConstructor, unknown>)`
  —
  指定したエンティティに複数のコンポーネントを一度に追加する（新規登録や既存アーキタイプへの追加に使用）。
- `addComponent(entity, ctor, value)` —
  単一コンポーネントを追加（既存のアーキタイプから移動することがある）。
- `removeComponent(entity, ctor)` —
  指定コンポーネントをエンティティから削除し、ターゲットのアーキタイプへ移動する。
- `destroyEntity(entity)` — エンティティをワールドから削除する。
- `query(...ctors)` —
  指定したコンポーネントコンストラクタ群を持つ全エンティティを検索し、エンティティとコンポーネントのタプルを返す。
- `getComponent(entity, ctor)` —
  指定エンティティが持つコンポーネントインスタンスを取得する（存在しない場合は
  `undefined`）。

### Archetype

- `new Archetype(ctors)` —
  コンポーネントコンストラクタ配列からアーキタイプを初期化する。内部で各コンポーネントに対応する
  `ColumnStore` を生成する。
- `addEntity(entity, componentValues: Map<string, unknown>)` —
  アーキタイプにエンティティを追加する。
- `removeEntity(entity)` — アーキタイプからエンティティを削除（swap-remove
  を使用）する。
- `getComponentAt(ctor, index)` —
  指定インデックスに格納されたコンポーネントインスタンスを返す。
- `copyEntityTo(indexSrc, targetArchetype)` —
  別アーキタイプへ値をマップするための `Map<typeId, value>` を生成する。

### ColumnStore

- 内部的にフィールドごとに `TypedArray` を保持し、`set(index, value)` /
  `get(index)` / `swapRemove(index)` / `copyFrom(...)`
  等の低レベル操作を提供する。
- サポートするフィールド型は `ecs/types.ts` の `FieldType`
  に列挙されており、`f16,f32,f64,i8,i16,i32,u8,u16,u32,u8c,bi64,biu64,bool`
  を対応する `TypedArray` にマッピングする。

## 使用例

簡単なワークフロー:

### 1. World を作成する

```ts
import { World } from "./world.ts";

const world = new World();
const e = world.createEntity();
```

### 2. コンポーネント定義（コンストラクタに `typeId` と `schema` を付与）

```ts
class Position {
  x = 0;
  y = 0;
  static typeId = "Position";
  static schema = { x: "f32", y: "f32" } as const;
}

class Velocity {
  vx = 0;
  vy = 0;
  static typeId = "Velocity";
  static schema = { vx: "f32", vy: "f32" } as const;
}
```

### 3. エンティティにコンポーネントを追加する

```ts
const components = new Map();
components.set(Position, new Position());
components.set(Velocity, new Velocity());
world.addEntityWithComponents(e, components);
```

### 4. クエリで走査する

```ts
const results = world.query(Position, Velocity);
for (const r of results) {
  const pos = r.components[0] as Position;
  const vel = r.components[1] as Velocity;
  // 更新処理など
}
```

## 実装上の注意点・制約

- 実装はシングルスレッドを前提としている。並列での安全性は保証しない。
- コンポーネントのコンストラクタは引数なしでインスタンス化できることを前提としている（デフォルト値の補完のため）。
- `ColumnStore` は number と BigInt
  系の配列を混在させることを許容しない。リサイズ時の不一致は
  `UnsupportedFieldTypeError` を投げる。
- `World.query`
  はアーキタイプ全体を走査する実装であり、クエリキャッシュやインクリメンタル更新による最適化は現状組み込まれていない。
