import { describe, expect, test } from "vite-plus/test";
import { createBabylonRendererBridge } from "../src/index.ts";

describe("createBabylonRendererBridge", () => {
  test("bridge API を生成できる", () => {
    const bridge = createBabylonRendererBridge();
    expect(typeof bridge.setCanvas).toBe("function");
    expect(typeof bridge.onEcsMessage).toBe("function");
    expect(typeof bridge.dispose).toBe("function");
  });

  test("dispose は canvas 未設定でも安全", () => {
    const bridge = createBabylonRendererBridge();
    expect(() => bridge.dispose()).not.toThrow();
  });
});
