import * as THREE from 'three';
import { CELL } from '../core/config';
import type { HaystackGrid } from './HaystackGrid';

export interface RayHit {
  /** 'hay' = sel berisi jerami, 'ground' = tanah, 'none' = tidak kena apa-apa. */
  kind: 'hay' | 'ground' | 'none';
  x: number;
  y: number;
  z: number;
  dist: number;
  point: THREE.Vector3;
}

/** Raycast DDA (Amanatides–Woo) menembus grid sel. */
export function raycastGrid(grid: HaystackGrid, origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, out?: RayHit): RayHit {
  const hit: RayHit = out ?? { kind: 'none', x: 0, y: 0, z: 0, dist: maxDist, point: new THREE.Vector3() };
  hit.kind = 'none';
  hit.dist = maxDist;

  const ox = (origin.x - grid.originX) / CELL;
  const oy = origin.y / CELL;
  const oz = (origin.z - grid.originZ) / CELL;
  let ix = Math.floor(ox), iy = Math.floor(oy), iz = Math.floor(oz);
  const dx = dir.x, dy = dir.y, dz = dir.z;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? ix + 1 - ox : ox - ix) * tdx : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? iy + 1 - oy : oy - iy) * tdy : Infinity;
  let tmz = dz !== 0 ? (dz > 0 ? iz + 1 - oz : oz - iz) * tdz : Infinity;
  const maxT = maxDist / CELL;
  let t = 0;

  for (let guard = 0; guard < 4096 && t <= maxT; guard++) {
    if (iy < 0) {
      hit.kind = 'ground';
      break;
    }
    if (grid.count(ix, iy, iz) > 0) {
      hit.kind = 'hay';
      break;
    }
    if (tmx < tmy && tmx < tmz) {
      ix += stepX; t = tmx; tmx += tdx;
    } else if (tmy < tmz) {
      iy += stepY; t = tmy; tmy += tdy;
    } else {
      iz += stepZ; t = tmz; tmz += tdz;
    }
  }
  if (hit.kind !== 'none') {
    if (t > maxT) {
      hit.kind = 'none';
      return hit;
    }
    hit.x = ix; hit.y = iy; hit.z = iz;
    hit.dist = t * CELL;
    hit.point.copy(dir).multiplyScalar(hit.dist).add(origin);
  }
  return hit;
}

/** Jarak sepanjang sinar ke bola, atau Infinity. */
export function raySphere(origin: THREE.Vector3, dir: THREE.Vector3, center: THREE.Vector3, r: number): number {
  const lx = center.x - origin.x, ly = center.y - origin.y, lz = center.z - origin.z;
  const tca = lx * dir.x + ly * dir.y + lz * dir.z;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}
