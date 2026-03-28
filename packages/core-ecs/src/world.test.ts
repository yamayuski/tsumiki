import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import type { ComponentConstructor } from "./types.js";
import { World } from "./world.js";

/**
 * テスト用コンポーネント定義
 * 各コンポーネントは static typeId を持つことを期待される。
 */
class Position {
  static readonly typeId = "Position";
  static schema = { x: "f32", y: "f32" } as const;
  constructor(
    public x = 0,
    public y = 0,
  ) {}
}
class Velocity {
  static readonly typeId = "Velocity";
  static schema = { vx: "f32", vy: "f32" } as const;
  constructor(
    public vx = 0,
    public vy = 0,
  ) {}
}
class Health {
  static readonly typeId = "Health";
  static schema = { hp: "f32" } as const;
  constructor(public hp = 100) {}
}

describe("World", () => {
  // エンティティIDは bigint 型であることを期待する
  test("エンティティ生成: createEntity が bigint を返し一意であること", () => {
    const w = new World();
    const e1 = w.createEntity();
    const e2 = w.createEntity();
    expect(typeof e1).toBe("bigint");
    expect(typeof e2).toBe("bigint");
    expect(e1).not.toBe(e2);
  });

  // addEntityWithComponents と getComponent の基本動作
  test("addEntityWithComponents と getComponent の基本", () => {
    const w = new World();
    const e = w.createEntity();
    const comps = new Map<ComponentConstructor, unknown>();
    comps.set(Position, new Position(5, 7));
    comps.set(Health, new Health(80));
    w.addEntityWithComponents(e, comps);

    const p = w.getComponent(e, Position);
    const h = w.getComponent(e, Health);
    const v = w.getComponent(e, Velocity);

    expect(p).toBeDefined();
    if (p) {
      expect(p.x).toBe(5);
      expect(p.y).toBe(7);
    }
    expect(h).toBeDefined();
    if (h) {
      expect(h.hp).toBe(80);
    }
    // 未設定のコンポーネントは undefined を返す
    expect(v).toBeUndefined();
  });

  // addComponent による追加・上書き、エンティティが未登録でも追加できること
  test("addComponent: 未登録エンティティへの追加および上書きの確認", () => {
    const w = new World();
    const e = w.createEntity();

    // 最初は何もないので addComponent は新規アーキタイプに追加する
    w.addComponent(e, Position, new Position(1, 2));
    let p = w.getComponent(e, Position);
    expect(p).toBeDefined();
    if (p) {
      expect(p.x).toBe(1);
      expect(p.y).toBe(2);
    }

    // 同じ型を addComponent で上書き
    w.addComponent(e, Position, new Position(9, 9));
    p = w.getComponent(e, Position);
    expect(p).toBeDefined();
    if (p) {
      expect(p.x).toBe(9);
      expect(p.y).toBe(9);
    }

    // 別のコンポーネントを追加して両方保持されること
    w.addComponent(e, Velocity, new Velocity(3, 4));
    const v = w.getComponent(e, Velocity);
    expect(v).toBeDefined();
    if (v) {
      expect(v.vx).toBe(3);
      expect(v.vy).toBe(4);
    }
    // Position も引き続き存在
    p = w.getComponent(e, Position);
    expect(p).toBeDefined();
    if (p) {
      expect(p.x).toBe(9);
    }
  });

  // removeComponent による削除とアーキタイプ移動の確認
  test("removeComponent: コンポーネント削除後に他のコンポーネントが保持されること", () => {
    const w = new World();
    const e = w.createEntity();
    const comps = new Map<ComponentConstructor, unknown>([
      [Position, new Position(10, 20)],
      [Velocity, new Velocity(1, 2)],
      [Health, new Health(50)],
    ]);
    w.addEntityWithComponents(e, comps);

    // Health を削除
    w.removeComponent(e, Health);
    const hAfter = w.getComponent(e, Health);
    const pAfter = w.getComponent(e, Position);
    const vAfter = w.getComponent(e, Velocity);

    expect(hAfter).toBeUndefined();
    expect(pAfter).toBeDefined();
    if (pAfter) {
      expect(pAfter.x).toBe(10);
      expect(pAfter.y).toBe(20);
    }
    expect(vAfter).toBeDefined();
    if (vAfter) {
      expect(vAfter.vx).toBe(1);
    }
  });

  // destroyEntity による完全削除
  test("destroyEntity: 破棄後は getComponent が undefined となり query に出ないこと", () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, Position, new Position(2, 3));
    // 破棄
    w.destroyEntity(e);
    const p = w.getComponent(e, Position);
    expect(p).toBeUndefined();

    // query しても出てこない
    const res = w.query(Position);
    expect(res.length).toBe(0);
  });

  // query が引数で指定したコンストラクタの順序に従って components を返すこと
  test("query: コンストラクタの順序に従って components が格納されること", () => {
    const w = new World();
    const e1 = w.createEntity();
    const e2 = w.createEntity();

    w.addEntityWithComponents(
      e1,
      new Map<ComponentConstructor, unknown>([
        [Position, new Position(1, 1)],
        [Velocity, new Velocity(5, 5)],
      ]),
    );

    w.addEntityWithComponents(
      e2,
      new Map<ComponentConstructor, unknown>([
        [Position, new Position(2, 2)],
        [Velocity, new Velocity(6, 6)],
      ]),
    );

    // クエリの引数順を入れ替えてみる
    const res1 = w.query(Position, Velocity);
    const res2 = w.query(Velocity, Position);

    // 両方とも2件返る
    expect(res1.length).toBe(2);
    expect(res2.length).toBe(2);

    // res1 の components[0] が Position, components[1] が Velocity
    for (const r of res1) {
      const comps = r.components;
      const pos = comps[0];
      const vel = comps[1];
      expectTypeOf(pos).toEqualTypeOf<Position>();
      expectTypeOf(vel).toEqualTypeOf<Velocity>();
    }

    // res2 の components[0] が Velocity, components[1] が Position
    for (const r of res2) {
      const comps = r.components;
      const vel = comps[0];
      const pos = comps[1];
      expectTypeOf(vel).toEqualTypeOf<Velocity>();
      expectTypeOf(pos).toEqualTypeOf<Position>();
    }
  });
});
