import { useState } from "react";
import type { EntitySnapshot } from "../editorContracts.ts";

interface EntityInspectorProps {
  entities: EntitySnapshot[];
  onSetComponent: (
    entity: string,
    componentTypeId: string,
    values: Record<string, number | boolean>,
  ) => void;
}

interface FieldEditorProps {
  entity: string;
  componentTypeId: string;
  field: string;
  value: number | boolean;
  onChange: (
    entity: string,
    componentTypeId: string,
    field: string,
    value: number | boolean,
  ) => void;
}

function FieldEditor({ entity, componentTypeId, field, value, onChange }: FieldEditorProps) {
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    if (typeof value === "boolean") {
      onChange(entity, componentTypeId, field, draft === "true");
    } else {
      const num = Number.parseFloat(draft);
      if (!Number.isNaN(num)) {
        onChange(entity, componentTypeId, field, num);
      }
    }
  };

  if (typeof value === "boolean") {
    return (
      <input
        type="checkbox"
        className="checkbox checkbox-xs"
        checked={value}
        onChange={(e) => onChange(entity, componentTypeId, field, e.target.checked)}
      />
    );
  }

  return (
    <input
      type="number"
      className="input input-xs input-bordered w-24 font-mono"
      value={draft}
      step="0.01"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}

export function EntityInspector({ entities, onSetComponent }: EntityInspectorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingValues, setPendingValues] = useState<
    Record<string, Record<string, Record<string, number | boolean>>>
  >({});

  const handleFieldChange = (
    entity: string,
    componentTypeId: string,
    field: string,
    value: number | boolean,
  ) => {
    // Accumulate all fields for that component and call onSetComponent
    const entitySnapshot = entities.find((e) => e.entity === entity);
    if (!entitySnapshot) return;
    const comp = entitySnapshot.components.find((c) => c.typeId === componentTypeId);
    if (!comp) return;

    const updated = { ...comp.fields, [field]: value };
    // Update local pending
    setPendingValues((prev) => ({
      ...prev,
      [entity]: {
        ...prev[entity],
        [componentTypeId]: updated,
      },
    }));
    onSetComponent(entity, componentTypeId, updated);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-2 font-semibold text-sm bg-base-200 border-b border-base-300">
        Entities ({entities.length})
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Entity list */}
        <div className="w-28 border-r border-base-300 overflow-y-auto">
          {entities.map((e) => (
            <button
              key={e.entity}
              type="button"
              className={`w-full text-left px-2 py-1 text-xs font-mono hover:bg-base-200 truncate ${
                selected === e.entity ? "bg-primary text-primary-content" : ""
              }`}
              onClick={() => setSelected(e.entity)}
            >
              #{e.entity}
            </button>
          ))}
        </div>
        {/* Component inspector */}
        <div className="flex-1 overflow-y-auto p-2">
          {selected === null ? (
            <p className="text-xs text-base-content/50">Select an entity</p>
          ) : (
            (() => {
              const entity = entities.find((e) => e.entity === selected);
              if (!entity) return null;
              return entity.components.map((comp) => (
                <div key={comp.typeId} className="mb-3">
                  <div className="text-xs font-semibold mb-1 text-accent">{comp.typeId}</div>
                  <div className="flex flex-col gap-1">
                    {Object.entries(comp.fields).map(([field, val]) => {
                      const pendingVal = pendingValues[selected]?.[comp.typeId]?.[field] ?? val;
                      return (
                        <div key={field} className="flex items-center gap-2">
                          <span className="text-xs font-mono w-10 shrink-0">{field}</span>
                          <FieldEditor
                            entity={selected}
                            componentTypeId={comp.typeId}
                            field={field}
                            value={pendingVal}
                            onChange={handleFieldChange}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      </div>
    </div>
  );
}
