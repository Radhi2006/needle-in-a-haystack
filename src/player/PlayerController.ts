import * as THREE from 'three';
import { CELL, GRAVITY } from '../core/config';
import type { Input } from '../core/input';
import type { HaystackGrid } from '../world/HaystackGrid';

export interface MoveParams {
  speedMult: number;
  jumpMult: number;
  hasJetpack: boolean;
  maxFuel: number;
  boundsRadius: number;
}

const HALF_W = 0.3;
const HEIGHT = 1.7;
const EYE = 1.58;
const STEP = 0.56;

/** Kontrol FPP: WASD, lompat, jetpack, kolisi terhadap grid jerami. */
export class PlayerController {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  fuel = 3;
  jetting = false;
  /** Kecepatan horizontal (untuk animasi bob). */
  speed = 0;
  private eyeOffset = 0;
  /** Jeda antar "naik anak tangga" agar dinding curam tidak bisa dipanjat instan. */
  private stepCooldown = 0;

  constructor(private grid: HaystackGrid) {}

  setGrid(grid: HaystackGrid): void {
    this.grid = grid;
  }

  look(dx: number, dy: number, sens: number): void {
    const k = 0.0022 * sens;
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.55, 1.55);
  }

  update(dt: number, input: Input | null, p: MoveParams): void {
    this.rescue();
    this.stepCooldown -= dt;
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    let mx = 0, mz = 0;
    let sprint = false;
    let jumpHeld = false;
    let jumpHit = false;
    if (input) {
      const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
      const r = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      mx = fwdX * f + rightX * r;
      mz = fwdZ * f + rightZ * r;
      const l = Math.hypot(mx, mz);
      if (l > 0) { mx /= l; mz /= l; }
      sprint = input.down('ShiftLeft') || input.down('ShiftRight');
      jumpHeld = input.down('Space');
      jumpHit = input.hit('Space');
    }
    const maxSpeed = 4.6 * p.speedMult * (sprint ? 1.55 : 1);
    const accel = this.onGround ? 14 : 4;
    this.vel.x += (mx * maxSpeed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (mz * maxSpeed - this.vel.z) * Math.min(1, accel * dt);

    if (jumpHit && this.onGround) {
      this.vel.y = 6.4 * p.jumpMult;
      this.onGround = false;
    }
    this.jetting = false;
    if (p.hasJetpack && jumpHeld && !this.onGround && this.fuel > 0 && this.vel.y < 7) {
      this.vel.y += 34 * dt;
      this.fuel = Math.max(0, this.fuel - dt);
      this.jetting = true;
    }
    if (this.onGround) this.fuel = Math.min(p.maxFuel, this.fuel + dt * 0.8);

    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -40) this.vel.y = -40;

    const wasGround = this.onGround;
    this.moveAxis(0, this.vel.x * dt, wasGround);
    this.moveAxis(2, this.vel.z * dt, wasGround);
    this.onGround = false;
    this.moveAxis(1, this.vel.y * dt, wasGround);

    // batas pagar
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > p.boundsRadius) {
      this.pos.x *= p.boundsRadius / r;
      this.pos.z *= p.boundsRadius / r;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.eyeOffset += (0 - this.eyeOffset) * Math.min(1, dt * 12);
  }

  eyeY(): number {
    return this.pos.y + EYE + this.eyeOffset;
  }

  applyCamera(cam: THREE.Camera): void {
    cam.position.set(this.pos.x, this.eyeY(), this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private moveAxis(axis: 0 | 1 | 2, delta: number, canStep: boolean): void {
    if (delta === 0) return;
    const steps = Math.ceil(Math.abs(delta) / 0.2);
    const d = delta / steps;
    const p = this.pos;
    for (let s = 0; s < steps; s++) {
      p.setComponent(axis, p.getComponent(axis) + d);
      if (!this.collides(p.x, p.y, p.z)) continue;
      if (axis !== 1 && canStep && this.stepCooldown <= 0 && !this.collides(p.x, p.y + STEP, p.z)) {
        // naik satu "anak tangga" jerami
        const before = p.y;
        p.y = Math.ceil((p.y + 0.001) / CELL) * CELL;
        if (this.collides(p.x, p.y, p.z)) p.y = before + STEP;
        this.eyeOffset -= p.y - before;
        this.stepCooldown = 0.13;
        canStep = false;
        continue;
      }
      p.setComponent(axis, p.getComponent(axis) - d);
      if (axis === 1) {
        if (d < 0) this.onGround = true;
        this.vel.y = 0;
      } else {
        this.vel.setComponent(axis, 0);
      }
      break;
    }
  }

  collides(px: number, py: number, pz: number): boolean {
    if (py < 0) return true;
    const g = this.grid;
    const x0 = g.cellX(px - HALF_W), x1 = g.cellX(px + HALF_W - 1e-4);
    const y0 = g.cellY(py), y1 = g.cellY(py + HEIGHT - 1e-4);
    const z0 = g.cellZ(pz - HALF_W), z1 = g.cellZ(pz + HALF_W - 1e-4);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) if (y >= 0 && g.isSolid(x, y, z)) return true;
    return false;
  }

  /** Jika jerami runtuh menimpa pemain, dorong ke atas. */
  private rescue(): void {
    if (!this.collides(this.pos.x, this.pos.y, this.pos.z)) return;
    if (this.pos.y < 0) this.pos.y = 0;
    for (let i = 0; i < 80; i++) {
      this.pos.y = Math.floor(this.pos.y / CELL + 1) * CELL;
      if (!this.collides(this.pos.x, this.pos.y, this.pos.z)) break;
    }
    this.vel.y = Math.max(0, this.vel.y);
  }
}
