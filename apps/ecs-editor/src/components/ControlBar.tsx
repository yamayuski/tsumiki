interface ControlBarProps {
  running: boolean;
  frame: number;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function ControlBar({
  running,
  frame,
  onPlay,
  onPause,
  onStep,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ControlBarProps) {
  return (
    <div className="navbar bg-base-200 border-b border-base-300 px-4 gap-2">
      <div className="flex-1">
        <span className="text-lg font-bold">ECS Editor</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          ↪ Redo
        </button>
        <div className="divider divider-horizontal mx-0" />
        <span className="badge badge-neutral font-mono">Frame {frame}</span>
        {running ? (
          <button type="button" className="btn btn-sm btn-warning" onClick={onPause}>
            ⏸ Pause
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-success" onClick={onPlay}>
            ▶ Play
          </button>
        )}
        <button type="button" className="btn btn-sm btn-info" onClick={onStep} disabled={running}>
          ⏭ Step
        </button>
      </div>
    </div>
  );
}
