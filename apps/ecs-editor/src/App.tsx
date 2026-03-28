import { useCallback, useEffect, useRef, useState } from "react";
import { ControlBar } from "./components/ControlBar.tsx";
import { EntityInspector } from "./components/EntityInspector.tsx";
import { type SystemEditorHandle, SystemEditor } from "./components/SystemEditor.tsx";
import type { EntitySnapshot } from "./editorContracts.ts";
import { type Command, useCommandHistory } from "./hooks/useCommandHistory.ts";
import { type RuntimeController, startRuntime } from "./runtime.ts";

/** Tracks the last-applied transpiled + source code per system id. */
interface AppliedSystem {
  transpiled: string;
  source: string;
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<RuntimeController | null>(null);
  const systemEditorRef = useRef<SystemEditorHandle | null>(null);

  /**
   * A ref that always holds the latest entity snapshots.
   * Used by handleSetComponent to look up previous component values without
   * making the callback depend on the `entities` state (which changes every tick).
   */
  const entitiesRef = useRef<EntitySnapshot[]>([]);

  /**
   * Tracks the last-applied transpiled + source code for each system so that
   * undo/redo can re-apply or remove prior versions.
   */
  const appliedSystemsRef = useRef<Map<string, AppliedSystem>>(new Map());

  const [running, setRunning] = useState(true);
  const [frame, setFrame] = useState(0);
  const [entities, setEntities] = useState<EntitySnapshot[]>([]);

  const { execute, undo, redo, canUndo, canRedo } = useCommandHistory();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctrl = startRuntime(canvas, (state) => {
      setRunning(state.running);
      setFrame(state.frame);
      setEntities(state.entities);
      entitiesRef.current = state.entities;
    });
    runtimeRef.current = ctrl;

    return () => {
      ctrl.dispose();
      runtimeRef.current = null;
    };
  }, []);

  // Global keyboard shortcuts: Ctrl+Z = Undo, Ctrl+Y / Ctrl+Shift+Z = Redo.
  // We skip the handler when the Monaco editor is focused to avoid interfering
  // with its own internal undo/redo.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Element;
      if (target.closest(".monaco-editor")) return;

      const withMod = e.ctrlKey || e.metaKey;
      if (withMod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (withMod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

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
    (entity: string, componentTypeId: string, nextValues: Record<string, number | boolean>) => {
      // Capture the current component values from the latest snapshot so that
      // the undo operation can restore them precisely.
      const entitySnapshot = entitiesRef.current.find((e) => e.entity === entity);
      const comp = entitySnapshot?.components.find((c) => c.typeId === componentTypeId);
      const prevValues: Record<string, number | boolean> = comp ? { ...comp.fields } : {};

      const cmd: Command = {
        execute: () =>
          runtimeRef.current?.postEditor({
            type: "main.ecs.set_component",
            payload: { entity, componentTypeId, values: nextValues },
          }),
        undo: () =>
          runtimeRef.current?.postEditor({
            type: "main.ecs.set_component",
            payload: { entity, componentTypeId, values: prevValues },
          }),
      };
      execute(cmd);
    },
    [execute],
  );

  const handleApplySystem = useCallback(
    (id: string, transpiledCode: string, sourceCode: string) => {
      // Capture whatever was previously applied so that undo can revert.
      const prevApplied = appliedSystemsRef.current.get(id);

      const cmd: Command = {
        execute: () => {
          runtimeRef.current?.postEditor({
            type: "main.ecs.update_system",
            payload: { id, code: transpiledCode },
          });
          appliedSystemsRef.current.set(id, { transpiled: transpiledCode, source: sourceCode });
          // Keep the SystemEditor UI in sync on redo.
          systemEditorRef.current?.setSource(id, sourceCode);
        },
        undo: () => {
          if (prevApplied === undefined) {
            // First-ever apply: undo = remove the system from the worker.
            runtimeRef.current?.postEditor({
              type: "main.ecs.remove_system",
              payload: { id },
            });
            appliedSystemsRef.current.delete(id);
          } else {
            // Revert to the previously applied version.
            runtimeRef.current?.postEditor({
              type: "main.ecs.update_system",
              payload: { id, code: prevApplied.transpiled },
            });
            appliedSystemsRef.current.set(id, prevApplied);
            systemEditorRef.current?.setSource(id, prevApplied.source);
          }
        },
      };
      execute(cmd);
    },
    [execute],
  );

  const handleRemoveSystem = useCallback(
    (id: string, sourceCode: string) => {
      // Snapshot the last-applied code so undo can restore it to the worker.
      const lastApplied = appliedSystemsRef.current.get(id);

      const cmd: Command = {
        execute: () => {
          runtimeRef.current?.postEditor({
            type: "main.ecs.remove_system",
            payload: { id },
          });
          appliedSystemsRef.current.delete(id);
          // Ensure the tab is removed on redo as well (it may already be gone on
          // the first execution because SystemEditor removes it after calling onRemove).
          systemEditorRef.current?.removeEntry(id);
        },
        undo: () => {
          if (lastApplied) {
            runtimeRef.current?.postEditor({
              type: "main.ecs.update_system",
              payload: { id, code: lastApplied.transpiled },
            });
            appliedSystemsRef.current.set(id, lastApplied);
          }
          systemEditorRef.current?.restoreEntry(id, sourceCode);
        },
      };
      execute(cmd);
    },
    [execute],
  );

  return (
    <div className="flex flex-col h-screen bg-base-100 text-base-content overflow-hidden">
      {/* Top control bar */}
      <ControlBar
        running={running}
        frame={frame}
        onPlay={handlePlay}
        onPause={handlePause}
        onStep={handleStep}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
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
            <SystemEditor
              ref={systemEditorRef}
              onApply={handleApplySystem}
              onRemove={handleRemoveSystem}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
