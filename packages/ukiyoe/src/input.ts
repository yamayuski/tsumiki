/**
 * Input Management
 */

export class InputManager {
  private keys = new Map<string, boolean>();
  private mousePosition = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.setupKeyboardListeners();
    this.setupMouseListeners(canvas);
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys.set(e.code, true);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.set(e.code, false);
    });
  }

  private setupMouseListeners(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousemove', (e) => {
      this.mousePosition.x = e.clientX;
      this.mousePosition.y = e.clientY;
    });
  }

  isKeyPressed(code: string): boolean {
    return this.keys.get(code) ?? false;
  }

  getMousePosition(): { x: number; y: number } {
    return { ...this.mousePosition };
  }
}
