import { useCallback, useRef, useState } from "react";

/** A reversible operation that can be executed and undone. */
export interface Command {
  execute(): void;
  undo(): void;
}

/**
 * Maintains an undo/redo history of Commands.
 *
 * Uses refs for the history array and current index so that `execute`, `undo`,
 * and `redo` are stable callback references.  A version counter (`setVersion`)
 * is used only to trigger re-renders so that `canUndo` / `canRedo` reflect the
 * latest state.
 */
export function useCommandHistory() {
  const historyRef = useRef<Command[]>([]);
  const indexRef = useRef(-1);
  const [, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const canUndo = indexRef.current >= 0;
  const canRedo = indexRef.current < historyRef.current.length - 1;

  /** Execute a command and push it onto the history stack. */
  const execute = useCallback(
    (command: Command) => {
      command.execute();
      // Discard any redo branch
      historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
      historyRef.current.push(command);
      indexRef.current = historyRef.current.length - 1;
      bump();
    },
    [bump],
  );

  /** Undo the most recent command. */
  const undo = useCallback(() => {
    if (indexRef.current < 0) return;
    historyRef.current[indexRef.current]?.undo();
    indexRef.current -= 1;
    bump();
  }, [bump]);

  /** Redo the next command in the history. */
  const redo = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    historyRef.current[indexRef.current]?.execute();
    bump();
  }, [bump]);

  return { execute, undo, redo, canUndo, canRedo };
}
