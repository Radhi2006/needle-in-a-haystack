import * as THREE from 'three';
import { CELL } from '../core/config';
import { hashFloat } from '../core/rng';
import type { HaystackGrid } from './HaystackGrid';

const STRAW_COLORS = ['#e8c76a', '#d9b04f', '#f0d68a', '#c99a3c', '#b8a05a', '#e2bd5e'].map((h) => new THREE.Color(h));

/**
 * Helai jerami individual (InstancedMesh) untuk sel yang terbuka di sekitar pemain.
 * Posisi tiap helai dihitung deterministik dari hash(sel, nomor helai) —
 * jadi helai ke-n di sel yang sama selalu muncul di tempat yang sama.
 */
export class StrawInstances {
  readonly mesh: THREE.InstancedMesh;
  private readonly max: number;
  private lastX = Infinity;
  private lastY = Infinity;
  private lastZ = Infinity;
  private timer = 0;
  dirty = true;
  radius = 8;
  perCell = 8;

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(private grid: HaystackGrid, private seed: number, max = 60000) {
    this.max = max;
    const geo = new THREE.CylinderGeometry(0.0065, 0.005, 1, 4, 1, true);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    // setColorAt sekali untuk membuat buffer warna
    this.mesh.setColorAt(0, STRAW_COLORS[0]);
  }

  setQuality(radius: number, perCell: number): void {
    this.radius = radius;
    this.perCell = perCell;
    this.dirty = true;
  }

  /** Dipanggil saat sebuah sel berubah; hanya perlu rebuild jika dekat pemain. */
  notifyCell(x: number, y: number, z: number): void {
    if (this.dirty) return;
    const g = this.grid;
    const dx = g.centerX(x) - this.lastX;
    const dy = g.centerY(y) - this.lastY;
    const dz = g.centerZ(z) - this.lastZ;
    const r = this.radius + 1;
    if (dx * dx + dy * dy + dz * dz < r * r) this.dirty = true;
  }

  update(dt: number, px: number, py: number, pz: number): void {
    this.timer -= dt;
    const moved = (px - this.lastX) ** 2 + (py - this.lastY) ** 2 + (pz - this.lastZ) ** 2 > 1.0;
    if ((!this.dirty && !moved) || this.timer > 0) return;
    this.timer = 0.12;
    this.rebuild(px, py, pz);
  }

  private rebuild(px: number, py: number, pz: number): void {
    this.dirty = false;
    this.lastX = px;
    this.lastY = py;
    this.lastZ = pz;
    const g = this.grid;
    const R = this.radius;
    const rc = Math.ceil(R / CELL);
    const cx = g.cellX(px), cy = g.cellY(py), cz = g.cellZ(pz);
    const x0 = Math.max(0, cx - rc), x1 = Math.min(g.sx - 1, cx + rc);
    const y0 = Math.max(0, cy - rc), y1 = Math.min(g.sy - 1, cy + rc);
    const z0 = Math.max(0, cz - rc), z1 = Math.min(g.sz - 1, cz + rc);
    const mesh = this.mesh;
    const color = new THREE.Color();
    let n = 0;
    const R2 = R * R;

    outer: for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const c = g.counts[g.index(x, y, z)];
          if (!c) continue;
          const wx = g.centerX(x), wy = g.centerY(y), wz = g.centerZ(z);
          const d2 = (wx - px) ** 2 + (wy - py) ** 2 + (wz - pz) ** 2;
          if (d2 > R2) continue;
          const loose = c < g.solidMin;
          if (!loose && !g.isExposed(x, y, z)) continue;
          // Makin jauh makin jarang
          const fall = 1 - Math.max(0, (Math.sqrt(d2) / R - 0.55) / 0.45);
          let k = loose ? Math.min(c, 14) : Math.min(c, Math.ceil(this.perCell * fall));
          const cellId = g.index(x, y, z);
          for (let s = 0; s < k; s++) {
            if (n >= this.max) break outer;
            const h1 = hashFloat(cellId, s, this.seed, 1);
            const h2 = hashFloat(cellId, s, this.seed, 2);
            const h3 = hashFloat(cellId, s, this.seed, 3);
            const h4 = hashFloat(cellId, s, this.seed, 4);
            const h5 = hashFloat(cellId, s, this.seed, 5);
            this.p.set(wx + (h1 - 0.5) * CELL * 1.25, wy + (h2 - 0.5) * CELL * 1.1, wz + (h3 - 0.5) * CELL * 1.25);
            // kebanyakan rebah, sebagian kecil miring tegak
            const pitch = h5 < 0.15 ? (h4 - 0.5) * 2.6 : (h4 - 0.5) * 0.9;
            this.e.set(pitch, h1 * Math.PI * 2 + h2 * 3, (h3 - 0.5) * 0.6);
            this.q.setFromEuler(this.e);
            const len = 0.22 + h2 * 0.38;
            this.s.set(1, 1, len);
            this.m.compose(this.p, this.q, this.s);
            mesh.setMatrixAt(n, this.m);
            color.copy(STRAW_COLORS[Math.floor(h5 * STRAW_COLORS.length)]).multiplyScalar(0.85 + h4 * 0.3);
            mesh.setColorAt(n, color);
            n++;
          }
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
