/** Hash integer 32-bit deterministik dari hingga 4 input. */
export function hash32(a: number, b = 0, c = 0, d = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d);
  h ^= Math.imul((b | 0) ^ 0x5bd1e995, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= Math.imul((c | 0) ^ 0x68e31da4, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= Math.imul((d | 0) ^ 0x1b56c4e9, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash → float [0, 1). */
export function hashFloat(a: number, b = 0, c = 0, d = 0): number {
  return hash32(a, b, c, d) / 4294967296;
}

/** PRNG kecil & cepat dengan seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Value noise 3D halus, keluaran kira-kira [-1, 1]. */
export function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const n = (dx: number, dy: number, dz: number) => hashFloat(ix + dx, iy + dy, iz + dz, seed) * 2 - 1;
  const x00 = lerp(n(0, 0, 0), n(1, 0, 0), ux);
  const x10 = lerp(n(0, 1, 0), n(1, 1, 0), ux);
  const x01 = lerp(n(0, 0, 1), n(1, 0, 1), ux);
  const x11 = lerp(n(0, 1, 1), n(1, 1, 1), ux);
  return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
}
