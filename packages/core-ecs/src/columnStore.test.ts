import { describe, expect, test } from "vite-plus/test";
import { ColumnStore, UnsupportedFieldTypeError } from "./columnStore.js";

type Comp = {
  x: number;
  flag: boolean;
  id: bigint;
  name: number;
};

const schema = {
  x: "f32",
  flag: "bool",
  id: "bi64",
  name: "i32",
} as const;

describe("ColumnStore", () => {
  test("ColumnStore の基本的な set/get と文字列から数値への解析", () => {
    const store = new ColumnStore<Comp>(schema, 4);

    const zero: Comp = {
      x: 1.5,
      flag: true,
      id: 10n,
      name: 42,
    };

    store.set(0, zero);
    const v0 = store.get(0);

    expect(typeof v0.x).toBe("number");
    expect(v0.x).toBe(zero.x);
    expect(typeof v0.flag).toBe("boolean");
    expect(v0.flag).toBe(zero.flag);
    expect(typeof v0.id).toBe("bigint");
    expect(v0.id).toBe(zero.id);
    expect(typeof v0.name).toBe("number");
    expect(v0.name).toBe(zero.name);
  });

  test("ensureCapacity が拡張され、初期容量を超えた set/get", () => {
    const store = new ColumnStore<Comp>(schema, 2);

    const twenty: Comp = {
      x: -3.25,
      flag: false,
      id: 123n,
      name: 7,
    };

    // set at a large index to force growth
    store.set(20, twenty);
    const v = store.get(20);
    expect(v.x).toBe(twenty.x);
    expect(v.flag).toBe(twenty.flag);
    expect(v.id).toBe(twenty.id);
    expect(v.name).toBe(twenty.name);
  });

  test("swapRemove が末尾要素を削除位置にコピーして縮小すること", () => {
    const store = new ColumnStore<Comp>(schema, 4);

    const zero: Comp = {
      x: 0.5,
      flag: true,
      id: 1n,
      name: 1,
    };
    const one: Comp = {
      x: 1.25,
      flag: false,
      id: 2n,
      name: 2,
    };
    const two: Comp = {
      x: 2.125,
      flag: true,
      id: 3n,
      name: 3,
    };

    const defaultComp: Comp = {
      x: 0.0,
      flag: false,
      id: 0n,
      name: 0,
    };

    store.set(0, zero);
    store.set(1, one);
    store.set(2, two);

    // index:1 を削除したので、最後である index:2 の値が 1 にコピーされる
    store.swapRemove(1);
    const after = store.get(1);
    expect(after.x).toBe(two.x);
    expect(after.flag).toBe(two.flag);
    expect(after.id).toBe(two.id);
    expect(after.name).toBe(two.name);

    // 最後の要素を削除しただけなので、コピーなしで縮小する
    store.swapRemove(1);
    // 1 を取得すると、この型のデフォルト値が返る
    const maybe = store.get(1);
    expect(maybe.x).toBe(defaultComp.x);
    expect(maybe.flag).toBe(defaultComp.flag);
    expect(maybe.id).toBe(defaultComp.id);
    expect(maybe.name).toBe(defaultComp.name);
  });

  test("copyFrom が別の ColumnStore から単一要素をコピーすること", () => {
    const a = new ColumnStore<Comp>(schema, 4);
    const b = new ColumnStore<Comp>(schema, 4);

    b.set(0, { x: 9.5, flag: true, id: 999n, name: 77 } as unknown as Comp);
    a.copyFrom(5, b, 0);

    const copied = a.get(5);
    expect(copied.x).toBe(9.5);
    expect(copied.flag).toBe(true);
    expect(copied.id).toBe(999n);
    expect(copied.name).toBe(77);
  });

  test("set がサポートされていない値型に対して UnsupportedFieldTypeError を投げること", () => {
    const store = new ColumnStore<Comp>(schema, 2);
    // object is unsupported by ColumnStore.set
    expect(() => store.set(0, { x: {}, flag: false, id: 1n, name: 0 } as unknown as Comp)).toThrow(
      UnsupportedFieldTypeError,
    );
  });

  test("コンストラクタがサポートされていないスキーマフィールド型に対して例外を投げること", () => {
    // pass an invalid field type to provoke UnsupportedFieldTypeError in constructor
    const badSchema = { bad: "not_a_type" } as unknown;
    expect(() => {
      // biome-ignore lint/suspicious/noExplicitAny: for testing unsupported schema
      new ColumnStore(badSchema as any, 2);
    }).toThrow(UnsupportedFieldTypeError);
  });

  test("範囲外インデックスに対して swapRemove が例外を投げること", () => {
    const store = new ColumnStore<Comp>(schema, 2);
    // empty store, size == 0, removing index 0 should error
    expect(() => store.swapRemove(0)).toThrow();
  });
});
