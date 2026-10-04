import { CELL, ISO } from '../core/config';
import { hash32, mulberry32, valueNoise3 } from '../core/rng';

export type CellListener = (x: number, y: number, z: number) => void;

export interface GridData {
  sx: number;
  sy: number;
  sz: number;
  cap: number;
  counts: Uint8Array;
  initialTotal: number;
  remaining: number;
}

export interface CellPos {
  x: number;
  y: number;
  z: number;
}

const DX = [1, -1, 0, 0];
const DZ = [0, 0, 1, -1];
/** Eksponen profil tinggi tumpukan: makin besar makin "kubah". */
const PROFILE_POW = 2.4;
const HEIGHT_RATIO = 0.55;

/**
 * Tumpukan jerami sebagai grid 3D berisi JUMLAH HELAI per sel (Uint8).
 * Posisi tiap helai tidak disimpan — cukup hitungannya, sehingga
 * puluhan juta helai muat dalam beberapa ratus KB.
 *
 * Index: x + sx*z + sx*sz*y (satu kolom XZ = langkah `layer` per y).
 */
export class HaystackGrid {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly layer: number;
  /** Helai per sel "penuh". */
  readonly cap: number;
  readonly counts: Uint8Array;
  readonly originX: number;
  readonly originZ: number;
  /** Minimal helai agar sel dianggap padat (permukaan/kolisi). */
  readonly solidMin: number;
  readonly initialTotal: number;
  remaining: number;
  listener: CellListener | null = null;

  private active = new Set<number>();
  private tickNo = 0;
  private readonly slideMin: number;
  private readonly slideEmpty: number;

  constructor(d: GridData) {
    this.sx = d.sx;
    this.sy = d.sy;
    this.sz = d.sz;
    this.layer = d.sx * d.sz;
    this.cap = d.cap;
    this.counts = d.counts;
    this.initialTotal = d.initialTotal;
    this.remaining = d.remaining;
    this.originX = (-d.sx * CELL) / 2;
    this.originZ = (-d.sz * CELL) / 2;
    this.solidMin = Math.max(1, Math.ceil(d.cap * ISO));
    this.slideMin = Math.ceil(d.cap * 0.5);
    this.slideEmpty = Math.ceil(d.cap * 0.2);
  }

  /**
   * Buat tumpukan baru berisi TEPAT `target` helai, plus posisi jarum
   * (acak dari seed, di bagian dalam tumpukan).
   */
  static generate(seed: number, target: number, capGoal: number): { grid: HaystackGrid; needle: CellPos } {
    const cellsNeeded = target / capGoal;
    // Volume profil h(r) = H(1-(r/R)^p) = PI R^2 H * p/(p+2), dengan H = ratio*R
    const volFactor = Math.PI * HEIGHT_RATIO * (PROFILE_POW / (PROFILE_POW + 2));
    const R = Math.cbrt(cellsNeeded / volFactor);
    const H = R * HEIGHT_RATIO;
    const sx = Math.ceil(R * 2 * 1.14) + 6;
    const sz = sx;
    const sy = Math.ceil(H * 1.12) + 8;
    const cx = sx / 2;
    const cz = sz / 2;
    const layer = sx * sz;

    // Tinggi tiap kolom (dalam sel), dengan noise agar tidak bulat sempurna.
    const heights = new Float32Array(layer);
    let fracSum = 0;
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        const ang = Math.atan2(dz, dx);
        const nR = valueNoise3(Math.cos(ang) * 2.2, Math.sin(ang) * 2.2, 0.5, seed);
        const n1 = valueNoise3(dx * 0.05, 1.7, dz * 0.05, seed + 11);
        const n2 = valueNoise3(dx * 0.22, 4.3, dz * 0.22, seed + 23);
        const Rl = R * (1 + 0.07 * nR);
        const Hl = H * (1 + 0.06 * n1);
        const r = Math.sqrt(dx * dx + dz * dz) / Rl;
        if (r >= 1) continue;
        let h = Hl * (1 - Math.pow(r, PROFILE_POW)) + 0.7 * n2 * (1 - r);
        h = Math.max(0, Math.min(sy - 2, h));
        heights[x + sx * z] = h;
        fracSum += h;
      }
    }

    const scale = target / fracSum;
    const counts = new Uint8Array(layer * sy);
    let total = 0;
    for (let col = 0; col < layer; col++) {
      const h = heights[col];
      if (h <= 0) continue;
      const top = Math.ceil(h);
      for (let y = 0; y < top; y++) {
        const f = Math.min(1, h - y);
        const c = Math.min(255, Math.floor(f * scale));
        counts[col + y * layer] = c;
        total += c;
      }
    }

    // Bagikan sisa pembulatan supaya totalnya pas `target`.
    let rem = target - total;
    const N = counts.length;
    let stride = 7919;
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    while (gcd(stride, N) !== 1) stride += 2;
    let i = hash32(seed, 99) % N;
    for (let guard = 0; rem > 0 && guard < N * 2; guard++) {
      if (counts[i] > 0 && counts[i] < 255) {
        counts[i]++;
        rem--;
      }
      i = (i + stride) % N;
    }
    total = target - rem;

    const grid = new HaystackGrid({
      sx, sy, sz,
      // floor: sel "penuh" hasil generasi bernilai >= cap, jadi tumpukan awal stabil.
      cap: Math.max(1, Math.min(250, Math.floor(scale))),
      counts,
      initialTotal: total,
      remaining: total,
    });

    // Jarum: seragam terhadap volume (rejection sampling berdasar tinggi kolom),
    // minimal ~2 m di bawah permukaan dan tidak di pinggir.
    const rng = mulberry32(seed ^ 0x5eed1e);
    const maxH = H * 1.1;
    let needle: CellPos = { x: Math.floor(cx), y: 0, z: Math.floor(cz) };
    for (let attempt = 0; attempt < 200000; attempt++) {
      const x = Math.floor(rng() * sx);
      const z = Math.floor(rng() * sz);
      const h = heights[x + sx * z];
      const dx = x + 0.5 - cx;
      const dz = z + 0.5 - cz;
      if (Math.sqrt(dx * dx + dz * dz) > R * 0.85) continue;
      if (h < 6) continue;
      if (rng() > h / maxH) continue;
      const y = Math.floor(rng() * (h - 4));
      needle = { x, y, z };
      break;
    }
    return { grid, needle };
  }

  toData(copy = false): GridData {
    return {
      sx: this.sx,
      sy: this.sy,
      sz: this.sz,
      cap: this.cap,
      counts: copy ? this.counts.slice() : this.counts,
      initialTotal: this.initialTotal,
      remaining: this.remaining,
    };
  }

  index(x: number, y: number, z: number): number {
    return x + this.sx * z + this.layer * y;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  count(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    return this.counts[this.index(x, y, z)];
  }

  /** Kepadatan 0..1. Di bawah tanah dianggap penuh. */
  density(x: number, y: number, z: number): number {
    if (y < 0) return 1;
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz || y >= this.sy) return 0;
    const c = this.counts[x + this.sx * z + this.layer * y];
    return c >= this.cap ? 1 : c / this.cap;
  }

  isSolid(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz || y >= this.sy) return false;
    return this.counts[x + this.sx * z + this.layer * y] >= this.solidMin;
  }

  /** Sel terbuka = punya tetangga yang tidak padat (bisa terlihat). */
  isExposed(x: number, y: number, z: number): boolean {
    return (
      !this.isSolid(x + 1, y, z) ||
      !this.isSolid(x - 1, y, z) ||
      !this.isSolid(x, y + 1, z) ||
      !this.isSolid(x, y - 1, z) ||
      !this.isSolid(x, y, z + 1) ||
      !this.isSolid(x, y, z - 1)
    );
  }

  cellX(wx: number): number {
    return Math.floor((wx - this.originX) / CELL);
  }
  cellY(wy: number): number {
    return Math.floor(wy / CELL);
  }
  cellZ(wz: number): number {
    return Math.floor((wz - this.originZ) / CELL);
  }
  centerX(x: number): number {
    return this.originX + (x + 0.5) * CELL;
  }
  centerY(y: number): number {
    return (y + 0.5) * CELL;
  }
  centerZ(z: number): number {
    return this.originZ + (z + 0.5) * CELL;
  }

  /** Sel tertinggi berisi helai di kolom (x,z), atau -1. */
  topY(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return -1;
    const col = x + this.sx * z;
    for (let y = this.sy - 1; y >= 0; y--) {
      if (this.counts[col + y * this.layer]) return y;
    }
    return -1;
  }

  /** Ambil hingga `n` helai dari satu sel. */
  takeAt(x: number, y: number, z: number, n: number): number {
    if (!this.inBounds(x, y, z) || n <= 0) return 0;
    const i = this.index(x, y, z);
    const c = this.counts[i];
    const m = Math.min(c, n);
    if (!m) return 0;
    this.counts[i] = c - m;
    this.remaining -= m;
    this.listener?.(x, y, z);
    this.wake(x, z);
    return m;
  }

  /**
   * Ambil hingga `maxAmount` helai dari sel-sel dalam bola, mulai dari yang
   * paling dekat ke pusat (sehingga terbentuk lubang/kawah).
   */
  takeSphere(wx: number, wy: number, wz: number, radius: number, maxAmount: number): number {
    const fx = (wx - this.originX) / CELL - 0.5;
    const fy = wy / CELL - 0.5;
    const fz = (wz - this.originZ) / CELL - 0.5;
    const rc = radius / CELL + 0.5;
    const rc2 = rc * rc;
    const x0 = Math.max(0, Math.floor(fx - rc)), x1 = Math.min(this.sx - 1, Math.ceil(fx + rc));
    const y0 = Math.max(0, Math.floor(fy - rc)), y1 = Math.min(this.sy - 1, Math.ceil(fy + rc));
    const z0 = Math.max(0, Math.floor(fz - rc)), z1 = Math.min(this.sz - 1, Math.ceil(fz + rc));
    const cand: number[] = [];
    const dist: number[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const i = x + this.sx * z + this.layer * y;
          if (!this.counts[i]) continue;
          const d2 = (x - fx) ** 2 + (y - fy) ** 2 + (z - fz) ** 2;
          if (d2 <= rc2) {
            cand.push(i);
            dist.push(d2);
          }
        }
      }
    }
    if (!cand.length) return 0;
    const order = cand.map((_, k) => k);
    if (Number.isFinite(maxAmount)) order.sort((a, b) => dist[a] - dist[b]);
    let left = maxAmount;
    let taken = 0;
    for (const k of order) {
      const i = cand[k];
      const c = this.counts[i];
      const m = Math.min(c, left);
      this.counts[i] = c - m;
      taken += m;
      left -= m;
      const y = Math.floor(i / this.layer);
      const r = i - y * this.layer;
      const z = Math.floor(r / this.sx);
      const x = r - z * this.sx;
      this.listener?.(x, y, z);
      this.wake(x, z);
      if (left <= 0) break;
    }
    this.remaining -= taken;
    return taken;
  }

  /** Ambil sebagian (`fraction`) helai dari sel-sel yang terbuka dalam radius (efek kipas). */
  takeExposedLayer(wx: number, wy: number, wz: number, radius: number, fraction: number): number {
    const fx = (wx - this.originX) / CELL - 0.5;
    const fy = wy / CELL - 0.5;
    const fz = (wz - this.originZ) / CELL - 0.5;
    const rc = radius / CELL;
    const rc2 = rc * rc;
    const hits: number[] = [];
    for (let y = Math.max(0, Math.floor(fy - rc)); y <= Math.min(this.sy - 1, Math.ceil(fy + rc)); y++) {
      for (let z = Math.max(0, Math.floor(fz - rc)); z <= Math.min(this.sz - 1, Math.ceil(fz + rc)); z++) {
        for (let x = Math.max(0, Math.floor(fx - rc)); x <= Math.min(this.sx - 1, Math.ceil(fx + rc)); x++) {
          if ((x - fx) ** 2 + (y - fy) ** 2 + (z - fz) ** 2 > rc2) continue;
          if (!this.counts[this.index(x, y, z)]) continue;
          if (this.isExposed(x, y, z)) hits.push(x, y, z);
        }
      }
    }
    let taken = 0;
    for (let k = 0; k < hits.length; k += 3) {
      const c = this.count(hits[k], hits[k + 1], hits[k + 2]);
      taken += this.takeAt(hits[k], hits[k + 1], hits[k + 2], Math.max(1, Math.ceil(c * fraction)));
    }
    return taken;
  }

  /** Tandai kolom (dan tetangganya) untuk dicek fisika runtuhnya. */
  wake(x: number, z: number): void {
    this.active.add(x + this.sx * z);
    if (x + 1 < this.sx) this.active.add(x + 1 + this.sx * z);
    if (x > 0) this.active.add(x - 1 + this.sx * z);
    if (z + 1 < this.sz) this.active.add(x + this.sx * (z + 1));
    if (z > 0) this.active.add(x + this.sx * (z - 1));
  }

  get activeColumns(): number {
    return this.active.size;
  }

  /**
   * Satu langkah fisika runtuh: helai jatuh ke sel di bawahnya jika masih ada ruang,
   * dan dinding yang terlalu curam (> ~2:1) meluncur ke samping-bawah.
   * Total helai tidak pernah berubah oleh fungsi ini.
   */
  tickCollapse(maxColumns = 800): number {
    if (!this.active.size) return 0;
    this.tickNo++;
    const cols: number[] = [];
    for (const c of this.active) {
      cols.push(c);
      if (cols.length >= maxColumns) break;
    }
    let moved = 0;
    for (const col of cols) {
      this.active.delete(col);
      if (this.settleColumn(col)) moved++;
    }
    return moved;
  }

  private settleColumn(col: number): boolean {
    const { counts, layer, cap, sx, sz, sy } = this;
    const x = col % sx;
    const z = (col - x) / sx;
    let movedAny = false;
    for (let y = 1; y < sy; y++) {
      const i = col + y * layer;
      const c = counts[i];
      if (!c) continue;
      const b = i - layer;
      const below = counts[b];
      if (below < cap) {
        const m = Math.min(c, cap - below);
        counts[i] = c - m;
        counts[b] = below + m;
        this.listener?.(x, y, z);
        this.listener?.(x, y - 1, z);
        movedAny = true;
        continue;
      }
      if (c < this.slideMin || y < 2) continue;
      const start = (x + z + y + this.tickNo) & 3;
      for (let k = 0; k < 4; k++) {
        const d = (start + k) & 3;
        const nx = x + DX[d];
        const nz = z + DZ[d];
        if (nx < 0 || nz < 0 || nx >= sx || nz >= sz) continue;
        const si = nx + sx * nz + y * layer;
        const di = si - layer;
        const dd = di - layer;
        if (counts[si] < this.slideEmpty && counts[di] < this.slideEmpty && counts[dd] < this.slideEmpty) {
          const m = Math.max(1, Math.floor(c / 3));
          counts[i] = c - m;
          counts[di] += m;
          this.listener?.(x, y, z);
          this.listener?.(nx, y - 1, nz);
          this.active.add(nx + sx * nz);
          movedAny = true;
          break;
        }
      }
    }
    if (movedAny) this.wake(x, z);
    return movedAny;
  }

  /** Jumlahkan ulang semua sel (untuk tes / validasi). */
  sumCounts(): number {
    let s = 0;
    for (let i = 0; i < this.counts.length; i++) s += this.counts[i];
    return s;
  }

  /** Radius terjauh (meter) dari pusat yang masih ada jerami di lapisan dasar. */
  footprintRadius(): number {
    let best = 0;
    for (let z = 0; z < this.sz; z++) {
      for (let x = 0; x < this.sx; x++) {
        if (!this.counts[x + this.sx * z]) continue;
        const r = Math.hypot(this.centerX(x), this.centerZ(z));
        if (r > best) best = r;
      }
    }
    return best;
  }
}
