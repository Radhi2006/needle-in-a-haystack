/** Keyboard + mouse dengan pointer lock. */
export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  leftDown = false;
  leftClicked = false;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.locked && (e.code === 'Space' || e.code === 'Tab')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.leftDown = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.leftDown = true;
        this.leftClicked = true;
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftDown = false;
    });
    document.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.leftDown = false;
        this.keys.clear();
      }
      this.onLockChange?.(this.locked);
    });
  }

  lock(): void {
    const req = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (req && typeof req.catch === 'function') req.catch(() => this.onLockChange?.(false));
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** Ditekan sejak frame sebelumnya. */
  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.leftClicked = false;
  }
}
