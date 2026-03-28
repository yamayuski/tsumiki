import MonacoEditor from "@monaco-editor/react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { transform } from "sucrase";

const DEFAULT_SYSTEM_CODE = `// User-defined ECS System (TypeScript)
// The default export must be a System instance.
// Available globals: World, ECSEngine (passed as parameters)
//
// Example: a system that logs entity count each tick
export default {
  update(world: { query: (...args: unknown[]) => unknown[] }, _dt: number) {
    // Count entities via a dummy query — replace with real component queries
    const all = world.query();
    console.log(\`[UserSystem] tick, entities: \${all.length}\`);
  },
};
`;

/**
 * Imperative handle exposed via ref so that the parent component (App) can
 * synchronise the SystemEditor UI when undo/redo operations are performed.
 */
export interface SystemEditorHandle {
  /** Update an entry's source code and mark it as applied (used for undo/redo of apply). */
  setSource(id: string, source: string): void;
  /** Add or restore an entry (used for undo of remove). */
  restoreEntry(id: string, source: string): void;
  /** Remove an entry (used for redo of remove). */
  removeEntry(id: string): void;
}

interface SystemEditorProps {
  onApply: (id: string, transpiledCode: string, sourceCode: string) => void;
  onRemove: (id: string, sourceCode: string) => void;
}

interface UserSystemEntry {
  id: string;
  source: string;
  applied: boolean;
  error: string | null;
}

let idCounter = 1;

function newEntry(): UserSystemEntry {
  return {
    id: `user-system-${idCounter++}`,
    source: DEFAULT_SYSTEM_CODE,
    applied: false,
    error: null,
  };
}

export const SystemEditor = forwardRef<SystemEditorHandle, SystemEditorProps>(function SystemEditor(
  { onApply, onRemove },
  ref,
) {
  const [systems, setSystems] = useState<UserSystemEntry[]>([newEntry()]);
  const [selectedId, setSelectedId] = useState<string>(systems[0]!.id);
  const editorRef = useRef<
    Parameters<NonNullable<Parameters<typeof MonacoEditor>[0]["onMount"]>>[0] | null
  >(null);

  const selected = systems.find((s) => s.id === selectedId);

  // Keep a ref so that imperative handle callbacks always read the latest id.
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useImperativeHandle(
    ref,
    () => ({
      /** Set the source of an entry and mark it as applied (used on undo/redo of apply). */
      setSource(id: string, source: string) {
        setSystems((prev) =>
          prev.map((s) => (s.id === id ? { ...s, source, applied: true, error: null } : s)),
        );
        // If this entry is currently open in Monaco, push the value directly so
        // that the uncontrolled editor reflects the change immediately.
        if (selectedIdRef.current === id && editorRef.current) {
          editorRef.current.setValue(source);
        }
      },
      /** Add or restore an entry in the tab bar (used on undo of remove). */
      restoreEntry(id: string, source: string) {
        setSystems((prev) => {
          if (prev.find((s) => s.id === id)) {
            return prev.map((s) =>
              s.id === id ? { ...s, source, applied: true, error: null } : s,
            );
          }
          return [...prev, { id, source, applied: true, error: null }];
        });
        setSelectedId(id);
      },
      /** Remove an entry from the tab bar (used on redo of remove). */
      removeEntry(id: string) {
        setSystems((prev) => {
          const next = prev.filter((s) => s.id !== id);
          if (selectedIdRef.current === id && next.length > 0) {
            setSelectedId(next[0]!.id);
          }
          return next;
        });
      },
    }),
    [],
  );

  const updateSource = (source: string) => {
    setSystems((prev) =>
      prev.map((s) => (s.id === selectedId ? { ...s, source, applied: false, error: null } : s)),
    );
  };

  const applySystem = (id: string) => {
    const entry = systems.find((s) => s.id === id);
    if (!entry) return;

    try {
      // Strip TypeScript type annotations using sucrase
      const result = transform(entry.source, {
        transforms: ["typescript"],
        disableESTransforms: true,
      });

      // Wrap the transpiled code so that the worker can evaluate it and get the
      // default export.  We use a Function constructor pattern:
      // new Function("World", "ECSEngine", <body>) must return a System.
      const wrapped = `
const __exports = {};
${result.code.replace(/\bexport\s+default\b/, "__exports.default =")}
return __exports.default;
`;

      onApply(id, wrapped, entry.source);
      setSystems((prev) =>
        prev.map((s) => (s.id === id ? { ...s, applied: true, error: null } : s)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSystems((prev) =>
        prev.map((s) => (s.id === id ? { ...s, applied: false, error: msg } : s)),
      );
    }
  };

  const addSystem = () => {
    const entry = newEntry();
    setSystems((prev) => [...prev, entry]);
    setSelectedId(entry.id);
  };

  const removeSystem = (id: string) => {
    const entry = systems.find((s) => s.id === id);
    onRemove(id, entry?.source ?? "");
    setSystems((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (selectedId === id && next.length > 0) {
        setSelectedId(next[0]!.id);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 p-2 bg-base-200 border-b border-base-300">
        <span className="font-semibold text-sm">Systems</span>
        <button type="button" className="btn btn-xs btn-primary ml-auto" onClick={addSystem}>
          + Add
        </button>
      </div>

      {/* System tabs */}
      <div className="flex gap-1 px-2 pt-1 bg-base-100 overflow-x-auto border-b border-base-300">
        {systems.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-t text-xs cursor-pointer select-none ${
              s.id === selectedId ? "bg-base-300 font-semibold" : "hover:bg-base-200"
            }`}
            onClick={() => setSelectedId(s.id)}
          >
            <span className={s.error ? "text-error" : s.applied ? "text-success" : ""}>{s.id}</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs p-0 h-4 min-h-0 leading-none"
              onClick={(e) => {
                e.stopPropagation();
                removeSystem(s.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Editor area */}
      {selected && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 min-h-0">
            <MonacoEditor
              height="100%"
              language="typescript"
              value={selected.source}
              onChange={(v) => updateSource(v ?? "")}
              onMount={(editor) => {
                editorRef.current = editor;
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
              theme="vs-dark"
            />
          </div>
          <div className="flex items-center gap-2 p-2 bg-base-200 border-t border-base-300">
            {selected.error && (
              <span className="text-error text-xs flex-1 truncate" title={selected.error}>
                ⚠ {selected.error}
              </span>
            )}
            {!selected.error && selected.applied && (
              <span className="text-success text-xs flex-1">✓ Applied</span>
            )}
            {!selected.error && !selected.applied && (
              <span className="text-base-content/50 text-xs flex-1">Unsaved changes</span>
            )}
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => applySystem(selected.id)}
            >
              Apply (Ctrl+S)
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
