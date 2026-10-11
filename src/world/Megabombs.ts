import * as THREE from 'three';
import { getSmokeTexture, getSoftGlowTexture } from './textures';

/** Efek sementara yang dianimasikan oleh Effects.update. */
export interface Fx {
  readonly group: THREE.Object3D;
  readonly done: boolean;
  update(dt: number): void;
  dispose(): void;
  /** Efek yang memancarkan cahaya ke sekitar: intensitas (0..1) & warnanya. */
  lightLevel?(): number;
  readonly lightColor?: number;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    } else if (o instanceof THREE.Sprite) o.material.dispose();
    else if (o instanceof THREE.Points) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

export const additive = (color: number, side: THREE.Side = THREE.FrontSide) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side, fog: false });

export const glowSprite = (color: number, blending: THREE.Blending = THREE.AdditiveBlending) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map: getSoftGlowTexture(), color, blending, transparent: true, depthWrite: false, fog: false }));

/** Pilar cahaya vertikal (sinar bidik satelit, jejak batang tungsten). */
export class Beam implements Fx {
  readonly group: THREE.Mesh;
  private t = 0;

  constructor(x: number, z: number, y0: number, y1: number, color: number, private width: number, private dur: number, private peak = 0.8, private pulse = false) {
    this.group = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), additive(color, THREE.DoubleSide));
    this.group.position.set(x, (y0 + y1) / 2, z);
    this.group.scale.set(width, y1 - y0, width);
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.dur;
  }

  update(dt: number): void {
    this.t += dt;
    const k = this.t / this.dur;
    const m = this.group.material as THREE.MeshBasicMaterial;
    if (this.pulse) {
      // sinar bidik: berkedip makin cepat menjelang tembakan
      m.opacity = this.peak * clamp01(this.t / 0.2) * (0.55 + 0.45 * Math.sin(this.t * (8 + 30 * k)));
    } else {
      m.opacity = this.peak * (1 - k) * (1 - k);
      const w = this.width * (0.4 + 0.6 * easeOut(k * 4));
      this.group.scale.x = this.group.scale.z = w;
    }
  }

  dispose(): void {
    disposeTree(this.group);
  }
}

/** Cincin gelombang kejut di permukaan tanah yang mengembang & memudar. */
export class ShockRing implements Fx {
  readonly group: THREE.Mesh;
  private t = 0;

  constructor(x: number, y: number, z: number, private radius: number, private dur: number, color = 0xfff0d2) {
    this.group = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 96), additive(color, THREE.DoubleSide));
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.set(x, y + 0.2, z);
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.dur;
  }

  update(dt: number): void {
    this.t += dt;
    const k = clamp01(this.t / this.dur);
    this.group.scale.setScalar(Math.max(0.01, this.radius * easeOut(k)));
    (this.group.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
  }

  dispose(): void {
    disposeTree(this.group);
  }
}

/**
 * Ledakan antimateri: inti ungu berdenyut mengisap cahaya (`charge` detik),
 * lalu bola pemusnah putih-ungu mengembang sampai radius penuh dan memudar.
 */
export class AntimatterBurst implements Fx {
  readonly group = new THREE.Group();
  readonly duration: number;
  readonly lightColor = 0xb07aff;
  private t = 0;
  private core: THREE.Sprite;
  private halo: THREE.Sprite;
  private shell: THREE.Mesh;
  private grid: THREE.Mesh;
  private motes: { s: THREE.Sprite; a: number; b: number; f: number }[] = [];

  constructor(pos: THREE.Vector3, private readonly r: number, private readonly charge = 1) {
    this.duration = charge + 4;
    this.group.position.copy(pos);
    this.core = glowSprite(0xd6a8ff);
    this.halo = glowSprite(0x8a4dff);
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), additive(0xb98aff, THREE.DoubleSide));
    this.grid = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), additive(0xf0e0ff));
    (this.grid.material as THREE.MeshBasicMaterial).wireframe = true;
    this.group.add(this.halo, this.shell, this.grid, this.core);
    // partikel cahaya yang tersedot ke inti saat mengisi daya
    for (let i = 0; i < 40; i++) {
      const s = glowSprite(i % 2 ? 0xe4c8ff : 0x9d6bff);
      this.group.add(s);
      this.motes.push({ s, a: Math.random() * Math.PI * 2, b: Math.acos(Math.random() * 2 - 1), f: Math.random() });
    }
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.duration;
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const ch = this.charge;
    const r = this.r;
    if (t < ch) {
      const k = t / ch;
      const pulse = 1 + 0.25 * Math.sin(t * (10 + 40 * k));
      this.core.scale.setScalar((3 + 6 * k) * pulse);
      this.core.material.opacity = 0.6 + 0.4 * k;
      this.halo.scale.setScalar(r * 0.25 * (1 - k * 0.7));
      this.halo.material.opacity = 0.5 * k;
      for (const m of this.motes) {
        const d = r * 0.35 * (1 - ((k + m.f) % 1));
        m.s.position.set(Math.sin(m.b) * Math.cos(m.a) * d, Math.cos(m.b) * d, Math.sin(m.b) * Math.sin(m.a) * d);
        m.s.scale.setScalar(1.5 + 2 * m.f);
        m.s.material.opacity = 0.9;
      }
      (this.shell.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.grid.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    for (const m of this.motes) m.s.visible = false;
    const u = t - ch;
    const grow = easeOut(u / 0.7);
    const fade = clamp01(1 - (u - 0.5) / 3.3);
    this.shell.scale.setScalar(Math.max(0.01, r * grow));
    (this.shell.material as THREE.MeshBasicMaterial).opacity = 0.32 * fade;
    this.grid.scale.setScalar(Math.max(0.01, r * grow * 1.01));
    this.grid.rotation.y += dt * 0.3;
    (this.grid.material as THREE.MeshBasicMaterial).opacity = 0.35 * fade * fade;
    this.core.scale.setScalar(r * 0.9 * (1 - clamp01(u / 1.2)) + 0.01);
    this.core.material.opacity = clamp01(1 - u / 1.2);
    this.halo.scale.setScalar(r * 2.8 * grow);
    this.halo.material.opacity = 0.9 * clamp01(1 - u / 2.5);
  }

  /** Intensitas cahaya ungu (0..1). */
  lightLevel(): number {
    const u = this.t - this.charge;
    if (u < 0) return 0.25 * (this.t / this.charge);
    return Math.max(0, 1 - u / 2.5);
  }

  dispose(): void {
    disposeTree(this.group);
    this.group.clear();
  }
}

/**
 * Lubang hitam: inti hitam, piringan akresi berputar, halo lensa, dan serpihan jerami
 * yang berputar spiral ke dalam. Radius isap membesar selama `grow` detik lalu runtuh.
 * `onTick(r)` dipanggil berkala dengan radius isap saat ini, `onEnd()` saat runtuh.
 */
export class BlackHole implements Fx {
  readonly group = new THREE.Group();
  private t = 0;
  private tickT = 0;
  private ended = false;
  private core: THREE.Mesh;
  private disk: THREE.Mesh;
  private disk2: THREE.Mesh;
  private halo: THREE.Sprite;
  private debris: { s: THREE.Sprite; a: number; f: number; h: number; speed: number }[] = [];
  private readonly collapse = 0.8;

  constructor(
    pos: THREE.Vector3,
    private readonly maxR: number,
    private readonly grow: number,
    private readonly onTick: (r: number) => void,
    private readonly onEnd: () => void,
  ) {
    this.group.position.copy(pos);
    this.halo = glowSprite(0x7a3cff);
    this.core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
    this.disk = new THREE.Mesh(new THREE.RingGeometry(1.25, 3.4, 96, 1), new THREE.MeshBasicMaterial({
      map: diskTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    this.disk.rotation.x = -Math.PI / 2 + 0.32;
    this.disk2 = new THREE.Mesh(this.disk.geometry.clone(), (this.disk.material as THREE.Material).clone());
    this.disk2.rotation.x = 0.25;
    this.group.add(this.halo, this.disk, this.disk2, this.core);
    const smoke = getSmokeTexture();
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: i % 3 ? 0xe0bd62 : 0xc39a45, transparent: true, depthWrite: false, fog: false }));
      this.group.add(s);
      this.debris.push({ s, a: Math.random() * Math.PI * 2, f: Math.random(), h: Math.random() * 2 - 1, speed: 0.15 + Math.random() * 0.2 });
    }
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.grow + this.collapse + 0.6;
  }

  /** Radius isap saat ini (m). */
  get radius(): number {
    const k = clamp01(this.t / this.grow);
    return this.maxR * (0.08 + 0.92 * k * k * (3 - 2 * k));
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const R = this.radius;
    if (t <= this.grow) {
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = 0.2;
        this.onTick(R);
      }
    } else if (!this.ended) {
      this.ended = true;
      this.onEnd();
    }
    // inti runtuh di akhir
    const life = t <= this.grow ? 1 : clamp01(1 - (t - this.grow) / this.collapse);
    const coreR = Math.max(0.01, (2 + R * 0.06) * life);
    this.core.scale.setScalar(coreR);
    this.disk.scale.setScalar(coreR * 1.6);
    this.disk2.scale.setScalar(coreR * 1.25);
    this.disk.rotation.z += dt * 2.4;
    this.disk2.rotation.z -= dt * 1.7;
    (this.disk.material as THREE.MeshBasicMaterial).opacity = life;
    (this.disk2.material as THREE.MeshBasicMaterial).opacity = 0.55 * life;
    this.halo.scale.setScalar(coreR * 9);
    this.halo.material.opacity = 0.75 * life;

    // serpihan jerami berputar spiral ke dalam
    for (const d of this.debris) {
      d.f -= dt * d.speed;
      if (d.f <= 0.04) {
        d.f = 1;
        d.a = Math.random() * Math.PI * 2;
        d.h = Math.random() * 2 - 1;
      }
      d.a += dt * (0.6 + 3.2 * (1 - d.f));
      const rad = coreR * 1.2 + (R - coreR * 1.2) * d.f;
      d.s.position.set(Math.cos(d.a) * rad, d.h * rad * 0.45 * d.f, Math.sin(d.a) * rad);
      d.s.scale.setScalar((1 + R * 0.05) * (0.3 + 0.7 * d.f));
      d.s.material.opacity = 0.85 * clamp01(d.f * 4) * clamp01((1 - d.f) * 8) * life;
    }
  }

  dispose(): void {
    disposeTree(this.group);
    this.group.clear();
  }
}

let diskTex: THREE.Texture | null = null;

/** Tekstur piringan akresi: garis-garis melingkar oranye → ungu, terang di sisi dalam. */
function diskTexture(): THREE.Texture {
  if (diskTex) return diskTex;
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(n / 2, n / 2, n * 0.18, n / 2, n / 2, n / 2);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.25, 'rgba(255,170,60,0.95)');
  grad.addColorStop(0.6, 'rgba(190,60,160,0.6)');
  grad.addColorStop(1, 'rgba(80,20,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  // guratan spiral
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.35})`;
    g.lineWidth = 1 + Math.random() * 3;
    const r = n * (0.2 + Math.random() * 0.3);
    const a = Math.random() * Math.PI * 2;
    g.beginPath();
    g.arc(n / 2, n / 2, r, a, a + 0.6 + Math.random() * 2);
    g.stroke();
  }
  diskTex = new THREE.CanvasTexture(c);
  diskTex.colorSpace = THREE.SRGBColorSpace;
  return diskTex;
}
