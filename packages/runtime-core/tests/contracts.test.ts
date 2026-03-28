import { describe, expect, test } from "vite-plus/test";
import { isEcsToRendererMessage, isMainToEcsMessage, type MainToEcsMessage } from "../src/index.js";

describe("runtime-core contracts", () => {
  test("isMainToEcsMessage が有効メッセージを判定できる", () => {
    const m: MainToEcsMessage = {
      type: "main.ecs.tick",
      payload: {
        frame: 42,
        deltaMs: 16.67,
      },
    };

    expect(isMainToEcsMessage(m)).toBe(true);
  });

  test("isMainToEcsMessage が無効メッセージを拒否する", () => {
    const m = {
      type: "main.ecs.unknown",
      payload: {},
    };

    expect(isMainToEcsMessage(m)).toBe(false);
  });

  test("isEcsToRendererMessage が差分メッセージを判定できる", () => {
    const m = {
      type: "ecs.renderer.diff",
      payload: {
        frame: 1,
        commands: [
          {
            op: "upsert",
            entityId: 1n,
            transform: { x: 1, y: 2, z: 3 },
          },
        ],
      },
    };

    expect(isEcsToRendererMessage(m)).toBe(true);
  });
});
