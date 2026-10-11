import * as THREE from 'three';
import { CELL, CHUNK } from '../core/config';
import type { HaystackGrid } from './HaystackGrid';
import { meshChunk } from './mesher';

/** Mengelola mesh permukaan per chunk 16³ sel; hanya chunk "kotor" yang di-mesh ulang. */
export class ChunkManager {
  readonly group = new THREE.Group();
  private meshes = new Map<number, THREE.Mesh>();
  private dirty = new Set<number>();
  private readonly ncx: number;
  private readonly ncy: number;
  private readonly ncz: number;

  constructor(private grid: HaystackGrid, private material: THREE.Material) {
    this.ncx = Math.ceil(grid.sx / CHUNK);
    this.ncy = Math.ceil(grid.sy / CHUNK);
    this.ncz = Math.ceil(grid.sz / CHUNK);
    for (let i = 0; i < this.ncx * this.ncy * this.ncz; i++) this.dirty.add(i);
  }

  /** Sel (x,y,z) berubah → tandai chunk yang memakai sampel tersebut. */
  markCell(x: number, y: number, z: number): void {
    const ax = Math.max(0, Math.floor((x - 1) / CHUNK)), bx = Math.min(this.ncx - 1, Math.floor((x + 1) / CHUNK));
    const ay = Math.max(0, Math.floor((y - 1) / CHUNK)), by = Math.min(this.ncy - 1, Math.floor((y + 1) / CHUNK));
    const az = Math.max(0, Math.floor((z - 1) / CHUNK)), bz = Math.min(this.ncz - 1, Math.floor((z + 1) / CHUNK));
    for (let cz = az; cz <= bz; cz++)
      for (let cy = ay; cy <= by; cy++)
        for (let cx = ax; cx <= bx; cx++) this.dirty.add(cx + this.ncx * (cy + this.ncy * cz));
  }

  /** Tandai semua chunk yang bersinggungan dengan silinder sel (pusat fx,fz; radius rc; y0..y1). */
  markRegion(fx: number, fz: number, rc: number, y0: number, y1: number): void {
    const ax = Math.max(0, Math.floor((fx - rc - 1) / CHUNK)), bx = Math.min(this.ncx - 1, Math.floor((fx + rc + 1) / CHUNK));
    const az = Math.max(0, Math.floor((fz - rc - 1) / CHUNK)), bz = Math.min(this.ncz - 1, Math.floor((fz + rc + 1) / CHUNK));
    const ay = Math.max(0, Math.floor((y0 - 1) / CHUNK)), by = Math.min(this.ncy - 1, Math.floor((y1 + 1) / CHUNK));
    const r = rc + 1;
    for (let cz = az; cz <= bz; cz++) {
      for (let cx = ax; cx <= bx; cx++) {
        // titik terdekat kotak chunk ke pusat
        const nx = Math.max(cx * CHUNK, Math.min(fx, cx * CHUNK + CHUNK));
        const nz = Math.max(cz * CHUNK, Math.min(fz, cz * CHUNK + CHUNK));
        if ((nx - fx) ** 2 + (nz - fz) ** 2 > r * r) continue;
        for (let cy = ay; cy <= by; cy++) this.dirty.add(cx + this.ncx * (cy + this.ncy * cz));
      }
    }
  }

  get pending(): number {
    return this.dirty.size;
  }

  /** Mesh ulang chunk kotor, terdekat ke pemain dulu, dibatasi anggaran waktu (ms). */
  update(px: number, py: number, pz: number, budgetMs: number): void {
    if (!this.dirty.size) return;
    const t0 = performance.now();
    const keys = [...this.dirty];
    // Urutkan terdekat dulu. Jarak (dibulatkan) & indeks dipadatkan ke satu angka supaya bisa
    // memakai sort numerik bawaan Float64Array — tetap cepat walau puluhan ribu chunk kotor (ledakan raksasa).
    const n = keys.length;
    const order = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const key = keys[i];
      const cx = key % this.ncx;
      const cy = Math.floor(key / this.ncx) % this.ncy;
      const cz = Math.floor(key / (this.ncx * this.ncy));
      const wx = this.grid.originX + (cx + 0.5) * CHUNK * CELL;
      const wy = (cy + 0.5) * CHUNK * CELL;
      const wz = this.grid.originZ + (cz + 0.5) * CHUNK * CELL;
      order[i] = Math.floor((wx - px) ** 2 + (wy - py) ** 2 + (wz - pz) ** 2) * n + i;
    }
    order.sort();
    for (let j = 0; j < n; j++) {
      const key = keys[order[j] % n];
      this.build(key);
      this.dirty.delete(key);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  buildAll(): void {
    for (const key of this.dirty) this.build(key);
    this.dirty.clear();
  }

  private build(key: number): void {
    const cx = key % this.ncx;
    const cy = Math.floor(key / this.ncx) % this.ncy;
    const cz = Math.floor(key / (this.ncx * this.ncy));
    const data = meshChunk(this.grid, cx, cy, cz);
    const old = this.meshes.get(key);
    if (!data) {
      if (old) {
        this.group.remove(old);
        old.geometry.dispose();
        this.meshes.delete(key);
      }
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    if (old) {
      old.geometry.dispose();
      old.geometry = geo;
    } else {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.meshes.set(key, mesh);
      this.group.add(mesh);
    }
  }

  dispose(): void {
    for (const m of this.meshes.values()) m.geometry.dispose();
    this.meshes.clear();
    this.group.clear();
  }
}
