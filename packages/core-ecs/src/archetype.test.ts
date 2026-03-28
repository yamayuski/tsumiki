import { describe, expect, test } from "vite-plus/test";
import { Archetype } from "./archetype.js";

// Minimal component constructors for tests
class Position {
  static typeId = "Position";
  static schema = { x: "f32", y: "f32" } as const;
  x: number;
  y: number;
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

class Velocity {
  static typeId = "Velocity";
  static schema = { vx: "f32", vy: "f32" } as const;
  vx: number;
  vy: number;
  constructor(vx = 0, vy = 0) {
    this.vx = vx;
    this.vy = vy;
  }
}

class Tag {
  static typeId = "Tag";
  static schema = { flag: "bool" } as const;
  flag: boolean;
  constructor(flag = false) {
    this.flag = flag;
  }
}

class Identifier {
  static typeId = "Identifier";
  static schema = { id: "bi64" } as const;
  id: bigint;
  constructor(id = 0n) {
    this.id = id;
  }
}

describe("Archetype", () => {
  test("constructor sorts ctors and signature is canonical", () => {
    // supply in unsorted order: Velocity, Position, Tag
    const arch = new Archetype([Velocity, Position, Tag]);
    // sorted alphabetically by typeId: "Position", "Tag", "Velocity"
    expect(arch.signature).toBe("Position|Tag|Velocity");
    const ctors = arch.copyConstructorList();
    expect(ctors.map((c) => c.typeId)).toEqual(["Position", "Tag", "Velocity"]);
  });

  test("addEntity sets provided values and fills defaults; size/indexOf/getComponentAt", () => {
    const arch = new Archetype([Tag, Velocity, Position]);
    const entityId = 42n;
    const provided = new Position(1.5, -2.5);
    const map = new Map<string, unknown>();
    map.set(Position.typeId, provided);
    // addEntity expects Map<string, unknown>
    arch.addEntity(entityId, map);
    expect(arch.size).toBe(1);
    const idx = arch.indexOf(entityId);
    expect(typeof idx).toBe("number");
    // getComponentAt should return provided Position
    const gotPos = arch.getComponentAt(Position, idx as number) as Position;
    expect(gotPos.x).toBe(provided.x);
    expect(gotPos.y).toBe(provided.y);
    // Velocity and Tag should be default instances
    const gotVel = arch.getComponentAt(Velocity, idx as number) as Velocity;
    expect(gotVel.vx).toBe(0);
    expect(gotVel.vy).toBe(0);
    const gotTag = arch.getComponentAt(Tag, idx as number) as Tag;
    expect(gotTag.flag).toBe(false);
  });

  test("removeEntity performs swap-remove and updates indices and stores", () => {
    const arch = new Archetype([Position]);
    const e1 = 1n;
    const e2 = 2n;
    const e3 = 3n;
    // add three entities with distinct positions
    arch.addEntity(e1, new Map([[Position.typeId, new Position(10, 0)]]));
    arch.addEntity(e2, new Map([[Position.typeId, new Position(20, 0)]]));
    arch.addEntity(e3, new Map([[Position.typeId, new Position(30, 0)]]));
    expect(arch.size).toBe(3);
    // remove middle entity e2
    arch.removeEntity(e2);
    expect(arch.size).toBe(2);
    // e2 should be gone
    expect(arch.indexOf(e2)).toBeUndefined();
    // e3 should have moved into e2's slot (index 1)
    const idxE3 = arch.indexOf(e3);
    expect(typeof idxE3).toBe("number");
    const posAtIdx = arch.getComponentAt(Position, idxE3 as number) as Position;
    expect(posAtIdx.x).toBe(30);
    // now remove e3 (which is at index 1)
    arch.removeEntity(e3);
    expect(arch.size).toBe(1);
    // remaining entity should be e1 at index 0
    const idxE1 = arch.indexOf(e1);
    expect(idxE1).toBe(0);
    const posE1 = arch.getComponentAt(Position, 0) as Position;
    expect(posE1.x).toBe(10);
  });

  test("getComponentAt throws when component not in archetype", () => {
    const arch = new Archetype([Position]);
    // Identifier is not part of this archetype
    expect(() => {
      arch.getComponentAt(Identifier, 0);
    }).toThrow();
  });

  test("copyEntityTo copies existing components and supplies defaults for missing ones", () => {
    const src = new Archetype([Position]);
    const target = new Archetype([Position, Velocity]);
    // add entity with a Position only
    src.addEntity(7n, new Map([[Position.typeId, new Position(5, 6)]]));
    const idx = src.indexOf(7n) as number;
    const copied = src.copyEntityTo(idx, target);
    // copied map contains Position from source
    const pos = copied.get(Position.typeId) as Position;
    expect(pos.x).toBe(5);
    expect(pos.y).toBe(6);
    // copied map contains Velocity default instance
    const vel = copied.get(Velocity.typeId) as Velocity;
    expect(vel.vx).toBe(0);
    expect(vel.vy).toBe(0);
  });

  test("forEachIndexed iterates in natural order and provides indices and ids", () => {
    const arch = new Archetype([Tag, Position]);
    arch.addEntity(101n, new Map([[Position.typeId, new Position(1, 1)]]));
    arch.addEntity(202n, new Map([[Position.typeId, new Position(2, 2)]]));
    const seen: Array<{ idx: number; id: bigint }> = [];
    arch.forEachIndexed((index, entityId) => {
      // entityId is whatever was provided; treat as number
      seen.push({ idx: index, id: entityId });
    });
    expect(seen.length).toBe(2);
    expect(seen[0]?.idx).toBe(0);
    expect(seen[1]?.idx).toBe(1);
    expect(seen[0]?.id).toBe(101n);
    expect(seen[1]?.id).toBe(202n);
  });
});
