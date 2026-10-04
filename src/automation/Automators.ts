import * as THREE from 'three';
import { CELL } from '../core/config';
import type { GameState } from '../core/state';
import { AUTOMATORS, type ItemDef } from '../items/catalog';
import { automatorMult, lvl } from '../items/stats';
import type { HaystackGrid } from '../world/HaystackGrid';

const mats = new Map<string, THREE.MeshLambertMaterial>();
function m(color: string): THREE.MeshLambertMaterial {
  let x = mats.get(color);
  if (!x) mats.set(color, (x = new THREE.MeshLambertMaterial({ color, flatShading: true })));
  return x;
}
function b(g: THREE.Object3D, w: number, h: number, d: number, color: string, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

/** Model low-poly tiap jenis otomatisasi. Kepala (untuk animasi makan) diberi nama 'head'. */
function buildVisual(kind: string): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'chicken': {
      b(g, 0.26, 0.24, 0.34, '#f5f2ea', 0, 0.28, 0);
      const head = new THREE.Group();
      head.name = 'head';
      head.position.set(0, 0.42, 0.17);
      b(head, 0.14, 0.16, 0.14, '#f5f2ea', 0, 0, 0);
      b(head, 0.04, 0.07, 0.08, '#d92b2b', 0, 0.1, 0);
      b(head, 0.06, 0.04, 0.07, '#f0b020', 0, -0.01, 0.1);
      g.add(head);
      b(g, 0.03, 0.16, 0.03, '#f0b020', -0.06, 0.08, 0);
      b(g, 0.03, 0.16, 0.03, '#f0b020', 0.06, 0.08, 0);
      break;
    }
    case 'goat':
    case 'cow': {
      const cow = kind === 'cow';
      const s = cow ? 1.5 : 1;
      const body = cow ? '#f4f1ea' : '#cfc6b8';
      b(g, 0.42 * s, 0.38 * s, 0.8 * s, body, 0, 0.62 * s, 0);
      if (cow) {
        b(g, 0.44 * s, 0.2 * s, 0.25 * s, '#2a2a2a', 0, 0.72 * s, 0.1 * s);
        b(g, 0.3 * s, 0.15 * s, 0.2 * s, '#2a2a2a', 0.08 * s, 0.55 * s, -0.25 * s);
      }
      for (const [x, z] of [[-0.14, 0.28], [0.14, 0.28], [-0.14, -0.28], [0.14, -0.28]]) {
        b(g, 0.09 * s, 0.45 * s, 0.09 * s, cow ? '#e8e2d8' : '#a89c8c', x * s, 0.22 * s, z * s);
      }
      const head = new THREE.Group();
      head.name = 'head';
      head.position.set(0, 0.78 * s, 0.45 * s);
      b(head, 0.24 * s, 0.24 * s, 0.3 * s, body, 0, 0, 0.08 * s);
      if (cow) b(head, 0.2 * s, 0.1 * s, 0.08 * s, '#e8a0a0', 0, -0.07 * s, 0.24 * s);
      else {
        b(head, 0.04, 0.16, 0.04, '#7a6a55', -0.07, 0.17, 0);
        b(head, 0.04, 0.16, 0.04, '#7a6a55', 0.07, 0.17, 0);
        b(head, 0.05, 0.1, 0.05, '#ffffff', 0, -0.15, 0.17);
      }
      g.add(head);
      break;
    }
    case 'farmer': {
      b(g, 0.36, 0.5, 0.22, '#3e6db5', 0, 0.85, 0);
      b(g, 0.14, 0.6, 0.16, '#2e4f85', -0.09, 0.3, 0);
      b(g, 0.14, 0.6, 0.16, '#2e4f85', 0.09, 0.3, 0);
      const head = new THREE.Group();
      head.name = 'head';
      head.position.set(0, 1.25, 0);
      b(head, 0.22, 0.24, 0.22, '#e0a878', 0, 0, 0);
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.18, 8), m('#e6c36d'));
      hat.position.y = 0.17;
      head.add(hat);
      g.add(head);
      const fork = b(g, 0.03, 0.03, 1.1, '#8a5a34', 0.25, 0.85, 0.2);
      fork.rotation.x = 0.6;
      break;
    }
    case 'robot': {
      b(g, 0.5, 0.55, 0.4, '#9aa5b1', 0, 0.75, 0);
      b(g, 0.6, 0.25, 0.5, '#5b6670', 0, 0.2, 0);
      const head = new THREE.Group();
      head.name = 'head';
      head.position.set(0, 1.18, 0.02);
      b(head, 0.34, 0.26, 0.3, '#c3ccd5', 0, 0, 0);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0x33e0ff }));
      eye.position.set(0, 0.02, 0.16);
      head.add(eye);
      b(head, 0.02, 0.18, 0.02, '#333333', 0, 0.2, 0);
      g.add(head);
      b(g, 0.1, 0.1, 0.5, '#5b6670', 0.32, 0.75, 0.2);
      b(g, 0.1, 0.1, 0.5, '#5b6670', -0.32, 0.75, 0.2);
      break;
    }
    case 'drone': {
      b(g, 0.5, 0.14, 0.5, '#333a44', 0, 0, 0);
      b(g, 0.3, 0.12, 0.3, '#e2b22a', 0, -0.12, 0);
      for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) {
        b(g, 0.06, 0.06, 0.06, '#222222', x, 0.06, z);
        const rotor = b(g, 0.42, 0.01, 0.05, '#dddddd', x, 0.1, z);
        rotor.name = 'rotor';
      }
      break;
    }
    case 'windmill': {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 9, 6), m('#e8e1d0'));
      tower.position.y = 4.5;
      tower.castShadow = true;
      g.add(tower);
      b(g, 1.6, 1.4, 1.6, '#a33a2e', 0, 9.4, 0);
      const hub = new THREE.Group();
      hub.name = 'blades';
      hub.position.set(0, 9.4, 0.95);
      for (let i = 0; i < 4; i++) {
        const blade = b(hub, 0.5, 4, 0.06, '#f4efe1', 0, 2, 0);
        const arm = new THREE.Group();
        arm.rotation.z = (i * Math.PI) / 2;
        arm.add(blade);
        hub.add(arm);
      }
      g.add(hub);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 8), m('#7d8790'));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(0, 1, 3);
      g.add(pipe);
      break;
    }
    case 'factory': {
      b(g, 6, 4, 5, '#8c6a52', 0, 2, 0);
      b(g, 6.4, 0.4, 5.4, '#4a3a30', 0, 4.2, 0);
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 4, 8), m('#6b5446'));
      chim.position.set(1.8, 6, -1);
      g.add(chim);
      b(g, 2, 2.4, 0.2, '#3a2a20', 0, 1.2, 2.55);
      const smoke = new THREE.Group();
      smoke.name = 'smoke';
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6, flatShading: true }));
        p.position.set(1.8, 8 + i, -1);
        smoke.add(p);
      }
      g.add(smoke);
      // bal jerami hasil
      for (let i = 0; i < 4; i++) b(g, 0.9, 0.6, 0.6, '#d8b25a', -2 + i * 1.1, 0.3, 3.4);
      break;
    }
  }
  return g;
}

interface Entity {
  def: ItemDef;
  obj: THREE.Group;
  angle: number;
  radius: number;
  targetRadius: number;
  dir: number;
  speed: number;
  phase: number;
  scanT: number;
  /** untuk drone: posisi target di atas tumpukan */
  tx: number;
  tz: number;
}

const MAX_VISIBLE: Record<string, number> = { chicken: 10, goat: 8, cow: 6, farmer: 6, robot: 6, drone: 6, windmill: 4, factory: 2 };

export interface HarvestHost {
  grid: HaystackGrid;
  state: GameState;
  /** dipanggil tiap kali otomatisasi mengambil helai */
  onHarvest(n: number, def: ItemDef): void;
}

/** Hewan, pekerja, dan mesin yang mengumpulkan jerami otomatis. */
export class Automators {
  readonly group = new THREE.Group();
  private entities: Entity[] = [];
  private tick = 0;
  private time = 0;

  constructor(private host: HarvestHost, private baseRadius: number, private fenceRadius: number) {}

  /** Samakan jumlah model di dunia dengan jumlah yang dimiliki. */
  sync(): void {
    const s = this.host.state;
    for (const def of AUTOMATORS) {
      const vis = def.auto!.visual;
      const want = Math.min(lvl(s, def.id), MAX_VISIBLE[vis] ?? 4);
      const have = this.entities.filter((e) => e.def.id === def.id);
      for (let i = have.length; i < want; i++) this.spawn(def, i);
    }
  }

  private spawn(def: ItemDef, index: number): void {
    const vis = def.auto!.visual;
    const obj = buildVisual(vis);
    const angle = Math.random() * Math.PI * 2;
    const e: Entity = {
      def, obj, angle,
      radius: this.baseRadius + 2,
      targetRadius: this.baseRadius + 1,
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: vis === 'chicken' ? 0.8 : vis === 'robot' ? 1.4 : vis === 'farmer' ? 1.1 : 0.5,
      phase: Math.random() * 10,
      scanT: 0,
      tx: 0, tz: 0,
    };
    if (vis === 'windmill' || vis === 'factory') {
      const a = (vis === 'windmill' ? 0.3 : 3.6) + index * (vis === 'windmill' ? 1.4 : 0.6);
      const r = vis === 'windmill' ? this.fenceRadius - 6 : this.fenceRadius + 9;
      obj.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      obj.lookAt(0, obj.position.y, 0);
      e.angle = a;
    } else if (vis === 'drone') {
      e.tx = (Math.random() - 0.5) * this.baseRadius;
      e.tz = (Math.random() - 0.5) * this.baseRadius;
      obj.position.set(e.tx, 20, e.tz);
    }
    this.entities.push(e);
    this.group.add(obj);
  }

  /** Radius tepi tumpukan (di dasar) pada sudut tertentu. */
  private edgeRadius(angle: number): number {
    const g = this.host.grid;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    for (let r = this.baseRadius + 2; r > 0.5; r -= CELL) {
      const x = g.cellX(ca * r), z = g.cellZ(sa * r);
      if (g.count(x, 0, z) > 0 || g.count(x, 1, z) > 0) return r;
    }
    return 0.5;
  }

  /** Makan dari dasar tumpukan pada arah `angle`. */
  private takeGround(angle: number, amount: number): number {
    const g = this.host.grid;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    let taken = 0;
    let cols = 0;
    for (let r = this.baseRadius + 2; r > 0; r -= CELL) {
      const x = g.cellX(ca * r), z = g.cellZ(sa * r);
      const before = taken;
      for (let y = 0; y < 4 && taken < amount; y++) {
        if (g.count(x, y, z) > 0) taken += g.takeAt(x, y, z, amount - taken);
      }
      if (taken > before) cols++;
      if (taken >= amount || cols >= 12) break;
    }
    return taken;
  }

  /** Sedot dari puncak kolom di sekitar (wx, wz). */
  private takeTop(wx: number, wz: number, amount: number): number {
    const g = this.host.grid;
    let taken = 0;
    for (let tries = 0; tries < 6 && taken < amount; tries++) {
      const x = g.cellX(wx + (Math.random() - 0.5) * 3 * tries);
      const z = g.cellZ(wz + (Math.random() - 0.5) * 3 * tries);
      let y = g.topY(x, z);
      while (y >= 0 && taken < amount) {
        taken += g.takeAt(x, y, z, amount - taken);
        y--;
      }
    }
    return taken;
  }

  private randomFootprintPoint(): [number, number] {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * this.baseRadius;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  /**
   * Kumpulkan helai untuk `dt` detik. Mengembalikan total helai.
   * @param maxPicks batas jumlah titik ambil per jenis (offline boleh lebih besar)
   */
  harvest(dt: number, maxPicks = 60): number {
    const s = this.host.state;
    const g = this.host.grid;
    let total = 0;
    for (const def of AUTOMATORS) {
      const n = lvl(s, def.id);
      if (!n || g.remaining <= 0) continue;
      const spec = def.auto!;
      const perSec = spec.rate * n * automatorMult(s, def);
      let want = perSec * dt + (s.automatorAcc[def.id] ?? 0);
      let whole = Math.floor(want);
      const frac = want - whole;
      const ents = this.entities.filter((e) => e.def.id === def.id);
      const perPick = Math.max(1, Math.min(g.cap * 24, Math.ceil(whole / 6)));
      let got = 0;
      for (let p = 0; p < maxPicks && whole > 0; p++) {
        const amt = Math.min(perPick, whole);
        let t = 0;
        if (spec.mode === 'ground') {
          const e = ents.length ? ents[Math.floor(Math.random() * ents.length)] : null;
          const ang = e && e.def.auto!.visual !== 'factory' ? e.angle + (Math.random() - 0.5) * 0.25 : Math.random() * Math.PI * 2;
          t = this.takeGround(ang, amt);
        } else {
          const e = ents.length ? ents[Math.floor(Math.random() * ents.length)] : null;
          const [px, pz] = e && e.def.auto!.visual === 'drone' ? [e.obj.position.x, e.obj.position.z] : this.randomFootprintPoint();
          t = this.takeTop(px, pz, amt);
        }
        if (t === 0 && g.remaining <= 0) break;
        got += t;
        whole -= t;
      }
      // sisa yang tidak sempat diambil dibawa ke tick berikutnya (dibatasi)
      s.automatorAcc[def.id] = Math.min(perSec * 2, whole + frac);
      if (got > 0) {
        total += got;
        this.host.onHarvest(got, def);
      }
    }
    return total;
  }

  update(dt: number): void {
    this.time += dt;
    this.tick += dt;
    if (this.tick >= 0.2) {
      this.harvest(this.tick);
      this.tick = 0;
    }
    const g = this.host.grid;
    for (const e of this.entities) {
      const vis = e.def.auto!.visual;
      const o = e.obj;
      e.phase += dt;
      if (vis === 'windmill') {
        const blades = o.getObjectByName('blades');
        if (blades) blades.rotation.z += dt * 1.6;
        continue;
      }
      if (vis === 'factory') {
        const smoke = o.getObjectByName('smoke');
        smoke?.children.forEach((p, i) => {
          p.position.y = 8 + ((this.time * 0.8 + i) % 4);
          p.scale.setScalar(0.6 + ((this.time * 0.8 + i) % 4) * 0.35);
        });
        continue;
      }
      if (vis === 'drone') {
        const dx = e.tx - o.position.x, dz = e.tz - o.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.5) {
          const [x, z] = this.randomFootprintPoint();
          e.tx = x * 0.85;
          e.tz = z * 0.85;
        } else {
          const sp = Math.min(d, 2.5 * dt);
          o.position.x += (dx / d) * sp;
          o.position.z += (dz / d) * sp;
        }
        const top = g.topY(g.cellX(o.position.x), g.cellZ(o.position.z));
        const ty = Math.max(1, (top + 1) * CELL) + 2.2 + Math.sin(e.phase * 2) * 0.2;
        o.position.y += (ty - o.position.y) * Math.min(1, dt * 2);
        o.children.forEach((c) => { if (c.name === 'rotor') c.rotation.y += dt * 40; });
        continue;
      }
      // Pejalan kaki: mengitari tepi tumpukan, sesekali menunduk makan
      e.scanT -= dt;
      if (e.scanT <= 0) {
        e.scanT = 1.2 + Math.random();
        e.targetRadius = this.edgeRadius(e.angle) + (vis === 'cow' ? 1.1 : vis === 'chicken' ? 0.35 : 0.7);
        if (Math.random() < 0.15) e.dir *= -1;
      }
      const eating = Math.sin(e.phase * 0.7) > 0.2;
      if (!eating) e.angle += (e.dir * e.speed * dt) / Math.max(2, e.radius);
      e.radius += (e.targetRadius - e.radius) * Math.min(1, dt * 1.5);
      o.position.set(Math.cos(e.angle) * e.radius, 0, Math.sin(e.angle) * e.radius);
      if (eating) o.lookAt(0, 0, 0);
      else o.lookAt(Math.cos(e.angle + e.dir * 0.3) * e.radius, 0, Math.sin(e.angle + e.dir * 0.3) * e.radius);
      const head = o.getObjectByName('head');
      if (head) head.rotation.x = eating ? 0.5 + Math.sin(e.phase * 12) * 0.25 : 0;
      if (!eating) o.position.y = Math.abs(Math.sin(e.phase * 10)) * 0.04;
    }
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.group.clear();
    this.entities = [];
  }
}
