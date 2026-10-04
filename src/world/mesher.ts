import * as THREE from 'three';
import { CELL, CHUNK, ISO } from '../core/config';
import { hashFloat } from '../core/rng';
import type { HaystackGrid } from './HaystackGrid';

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

const S = CHUNK + 2; // sampel per sumbu
const D = CHUNK + 1; // kubus per sumbu
const field = new Float32Array(S * S * S);
const vidx = new Int32Array(D * D * D);

// Sudut kubus: bit0 = x, bit1 = y, bit2 = z
const EDGES: [number, number][] = [];
for (let i = 0; i < 8; i++) {
  for (const bit of [1, 2, 4]) {
    if (!(i & bit)) EDGES.push([i, i | bit]);
  }
}

const HAY_COLORS = ['#dcb45c', '#e6c36d', '#cfa449', '#d9ba6a', '#c39a45'].map((h) => new THREE.Color(h));

/**
 * Surface nets: ubah kepadatan sel jadi permukaan halus.
 * Sampel berada di pusat sel; chunk (cx,cy,cz) memiliki semua edge yang
 * berawal di titik sampel [c*CHUNK, c*CHUNK+CHUNK), sehingga antar-chunk tidak ada celah.
 */
export function meshChunk(grid: HaystackGrid, cx: number, cy: number, cz: number): MeshData | null {
  const x0 = cx * CHUNK - 1;
  const y0 = cy * CHUNK - 1;
  const z0 = cz * CHUNK - 1;

  let anyIn = false;
  let anyOut = false;
  for (let k = 0; k < S; k++) {
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const v = grid.density(x0 + i, y0 + j, z0 + k) - ISO;
        field[i + S * (j + S * k)] = v;
        if (v > 0) anyIn = true;
        else anyOut = true;
      }
    }
  }
  if (!anyIn || !anyOut) return null;

  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  vidx.fill(-1);

  const v = new Float32Array(8);
  let count = 0;
  for (let k = 0; k < D; k++) {
    for (let j = 0; j < D; j++) {
      for (let i = 0; i < D; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const val = field[i + (c & 1) + S * (j + ((c >> 1) & 1) + S * (k + ((c >> 2) & 1)))];
          v[c] = val;
          if (val > 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        let px = 0, py = 0, pz = 0, n = 0;
        for (const [a, b] of EDGES) {
          const va = v[a], vb = v[b];
          if (va > 0 === vb > 0) continue;
          const t = va / (va - vb);
          px += (a & 1) + t * ((b & 1) - (a & 1));
          py += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
          pz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
          n++;
        }
        px /= n; py /= n; pz /= n;

        // normal = -gradien kepadatan (mengarah keluar tumpukan)
        let gx = v[1] + v[3] + v[5] + v[7] - v[0] - v[2] - v[4] - v[6];
        let gy = v[2] + v[3] + v[6] + v[7] - v[0] - v[1] - v[4] - v[5];
        let gz = v[4] + v[5] + v[6] + v[7] - v[0] - v[1] - v[2] - v[3];
        const gl = Math.hypot(gx, gy, gz) || 1;
        gx /= -gl; gy /= -gl; gz /= -gl;

        const gxI = x0 + i, gyI = y0 + j, gzI = z0 + k;
        const wx = grid.originX + (gxI + 0.5 + px) * CELL;
        const wy = (gyI + 0.5 + py) * CELL;
        const wz = grid.originZ + (gzI + 0.5 + pz) * CELL;
        pos.push(wx, wy, wz);
        nrm.push(gx, gy, gz);

        const h = hashFloat(gxI, gyI, gzI, 77);
        const base = HAY_COLORS[Math.floor(h * HAY_COLORS.length)];
        const shade = (0.82 + 0.18 * Math.min(1, wy / 1.2)) * (0.92 + 0.16 * hashFloat(gxI, gyI, gzI, 78));
        col.push(base.r * shade, base.g * shade, base.b * shade);

        vidx[i + D * (j + D * k)] = count++;
      }
    }
  }

  // Quad untuk setiap edge sampel yang melintasi permukaan.
  for (let k = 1; k <= CHUNK; k++) {
    for (let j = 1; j <= CHUNK; j++) {
      for (let i = 1; i <= CHUNK; i++) {
        const p = [i, j, k];
        const v0 = field[i + S * (j + S * k)];
        for (let a = 0; a < 3; a++) {
          const q = [i, j, k];
          q[a]++;
          const v1 = field[q[0] + S * (q[1] + S * q[2])];
          if (v0 > 0 === v1 > 0) continue;
          const b = (a + 1) % 3;
          const c = (a + 2) % 3;
          const cube = (db: number, dc: number) => {
            const r = [p[0], p[1], p[2]];
            r[b] -= db;
            r[c] -= dc;
            return vidx[r[0] + D * (r[1] + D * r[2])];
          };
          const c0 = cube(0, 0), c1 = cube(1, 0), c2 = cube(1, 1), c3 = cube(0, 1);
          if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
          if (v0 > 0) idx.push(c0, c1, c2, c0, c2, c3);
          else idx.push(c0, c2, c1, c0, c3, c2);
        }
      }
    }
  }
  if (!idx.length) return null;

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    colors: new Float32Array(col),
    indices: new Uint32Array(idx),
  };
}
