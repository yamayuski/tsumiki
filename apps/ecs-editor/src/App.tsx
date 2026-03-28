import { useCallback, useEffect, useRef, useState } from "react";
import { ControlBar } from "./components/ControlBar.tsx";
import { EntityInspector } from "./components/EntityInspector.tsx";
import { SystemEditor } from "./components/SystemEditor.tsx";
import type { EntitySnapshot } from "./editorContracts.ts";
import { type RuntimeController, startRuntime } from "./runtime.ts";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<RuntimeController | null>(null);

  const [running, setRunning] = useState(true);
  const [frame, setFrame] = useState(0);
  const [entities, setEntities] = useState<EntitySnapshot[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctrl = startRuntime(canvas, (state) => {
      setRunning(state.running);
      setFrame(state.frame);
      setEntities(state.entities);
    });
    runtimeRef.current = ctrl;

    return () => {
      ctrl.dispose();
      runtimeRef.current = null;
    };
  }, []);

  const handlePlay = useCallback(() => {
    runtimeRef.current?.postEditor({ type: "main.ecs.resume" });
  }, []);

  const handlePause = useCallback(() => {
    runtimeRef.current?.postEditor({ type: "main.ecs.pause" });
  }, []);

  const handleStep = useCallback(() => {
    runtimeRef.current?.postEditor({ type: "main.ecs.step" });
  }, []);

  const handleSetComponent = useCallback(
    (entity: string, componentTypeId: string, values: Record<string, number | boolean>) => {
      runtimeRef.current?.postEditor({
        type: "main.ecs.set_component",
        payload: { entity, componentTypeId, values },
      });
    },
    [],
  );

  const handleApplySystem = useCallback((id: string, code: string) => {
    runtimeRef.current?.postEditor({
      type: "main.ecs.update_system",
      payload: { id, code },
    });
  }, []);

  const handleRemoveSystem = useCallback((id: string) => {
    runtimeRef.current?.postEditor({
      type: "main.ecs.remove_system",
      payload: { id },
    });
  }, []);

  return (
    <div className="flex flex-col h-screen bg-base-100 text-base-content overflow-hidden">
      {/* Top control bar */}
      <ControlBar
        running={running}
        frame={frame}
        onPlay={handlePlay}
        onPause={handlePause}
        onStep={handleStep}
      />

      {/* Main editor layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: 3D viewport */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="p-1 text-xs font-semibold bg-base-200 border-b border-base-300">
            Viewport
          </div>
          <div className="flex-1 bg-base-300 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={800}
              height={450}
              className="max-w-full max-h-full object-contain"
              style={{ display: "block" }}
            />
          </div>
        </div>

        {/* Right panel: split inspector + system editor */}
        <div className="flex flex-col w-80 border-l border-base-300 shrink-0">
          {/* Entity inspector (top half) */}
          <div className="flex-1 border-b border-base-300 overflow-hidden">
            <EntityInspector entities={entities} onSetComponent={handleSetComponent} />
          </div>
          {/* System editor (bottom half) */}
          <div className="flex-1 overflow-hidden">
            <SystemEditor onApply={handleApplySystem} onRemove={handleRemoveSystem} />
          </div>
        </div>
      </div>
    </div>
  );
}
