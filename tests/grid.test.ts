import { describe, expect, it } from 'vitest';
import { HaystackGrid } from '../src/world/HaystackGrid';
import { BASE_STRAWS, cellCapacityForLevel, strawsForLevel } from '../src/core/config';

describe('HaystackGrid.generate', () => {
  it('menghasilkan tepat 10 juta helai di level 0', () => {
    const { grid } = HaystackGrid.generate(12345, BASE_STRAWS, cellCapacityForLevel(0));
    expect(grid.initialTotal).toBe(BASE_STRAWS);
    expect(grid.remaining).toBe(BASE_STRAWS);
    expect(grid.sumCounts()).toBe(BASE_STRAWS);
  });

  it('tepat sesuai target untuk level prestige', () => {
    const target = strawsForLevel(3);
    const { grid } = HaystackGrid.generate(777, target, cellCapacityForLevel(3));
    expect(grid.sumCounts()).toBe(target);
  });

  it('deterministik untuk seed yang sama', () => {
    const a = HaystackGrid.generate(42, 1_000_000, 100);
    const b = HaystackGrid.generate(42, 1_000_000, 100);
    expect(a.needle).toEqual(b.needle);
    expect(a.grid.counts).toEqual(b.grid.counts);
  });

  it('jarum berada di dalam tumpukan', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { grid, needle } = HaystackGrid.generate(seed, 2_000_000, 100);
      expect(grid.inBounds(needle.x, needle.y, needle.z)).toBe(true);
      expect(grid.count(needle.x, needle.y, needle.z)).toBeGreaterThan(0);
      // ada jerami di atasnya (tersembunyi)
      expect(grid.topY(needle.x, needle.z)).toBeGreaterThan(needle.y);
    }
  });

  it('tumpukan awal stabil (tidak runtuh sendiri saat disentuh)', () => {
    const { grid } = HaystackGrid.generate(9, 1_000_000, 100);
    for (let z = 0; z < grid.sz; z += 3) for (let x = 0; x < grid.sx; x += 3) grid.wake(x, z);
    let moves = 0;
    for (let i = 0; i < 50; i++) moves += grid.tickCollapse(100000);
    // boleh ada sedikit penyesuaian tepi, tapi tidak runtuh massal
    expect(moves).toBeLessThan(grid.sx * grid.sz * 0.05);
  });
});

describe('mengambil helai', () => {
  it('takeAt mengurangi tepat sejumlah yang diminta', () => {
    const { grid, needle } = HaystackGrid.generate(5, 1_000_000, 100);
    const before = grid.count(needle.x, needle.y, needle.z);
    const got = grid.takeAt(needle.x, needle.y, needle.z, 1);
    expect(got).toBe(1);
    expect(grid.count(needle.x, needle.y, needle.z)).toBe(before - 1);
    expect(grid.remaining).toBe(1_000_000 - 1);
    expect(grid.sumCounts()).toBe(grid.remaining);
  });

  it('takeSphere terbatas oleh maxAmount dan konsisten dengan remaining', () => {
    const { grid } = HaystackGrid.generate(5, 1_000_000, 100);
    const top = grid.topY(grid.sx >> 1, grid.sz >> 1);
    const wy = grid.centerY(top);
    const got = grid.takeSphere(0, wy, 0, 1.5, 750);
    expect(got).toBe(750);
    expect(grid.sumCounts()).toBe(grid.remaining);
    const all = grid.takeSphere(0, wy, 0, 1.0, Infinity);
    expect(all).toBeGreaterThan(0);
    expect(grid.sumCounts()).toBe(grid.remaining);
  });

  it('fisika runtuh tidak mengubah total helai', () => {
    const { grid } = HaystackGrid.generate(8, 1_000_000, 100);
    // gali lubang di dasar samping supaya bagian atas runtuh
    const cx = grid.sx >> 1;
    for (let x = cx - 3; x <= cx + 3; x++) {
      for (let y = 0; y < 4; y++) grid.takeAt(x, y, grid.sz >> 1, 255);
    }
    const total = grid.remaining;
    expect(grid.sumCounts()).toBe(total);
    let guard = 0;
    while (grid.tickCollapse(5000) > 0 && guard++ < 5000) {
      /* sampai stabil */
    }
    expect(guard).toBeLessThan(5000);
    expect(grid.sumCounts()).toBe(total);
    // lubang di dasar sudah terisi lagi oleh jerami yang jatuh
    expect(grid.count(cx, 0, grid.sz >> 1)).toBeGreaterThan(0);
  });
});

describe('HaystackGrid.carve (ledakan raksasa)', () => {
  it('carveSphere mengosongkan bola, sama dengan takeSphere tanpa batas, & total tetap konsisten', () => {
    const a = HaystackGrid.generate(5, 2_000_000, 100).grid;
    const b = HaystackGrid.generate(5, 2_000_000, 100).grid;
    const regions: number[] = [];
    a.regionListener = (_fx, _fz, rc) => regions.push(rc);
    const taken = a.carveSphere(1, 0, -2, 6);
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBe(b.takeSphere(1, 0, -2, 6, Infinity));
    expect(a.counts).toEqual(b.counts);
    expect(a.remaining).toBe(a.initialTotal - taken);
    expect(a.sumCounts()).toBe(a.remaining);
    expect(regions.length).toBe(1);
  });

  it('carveShell setelah bola kecil = satu bola besar (lubang hitam yang membesar)', () => {
    const a = HaystackGrid.generate(6, 2_000_000, 100).grid;
    const b = HaystackGrid.generate(6, 2_000_000, 100).grid;
    const t = a.carveSphere(2, 3, 1, 2.5) + a.carveShell(2, 3, 1, 2.5, 5) + a.carveShell(2, 3, 1, 5, 7);
    expect(t).toBe(b.carveSphere(2, 3, 1, 7));
    expect(a.counts).toEqual(b.counts);
  });

  it('kawah raksasa melebihi ukuran grid tetap aman & menghapus semuanya', () => {
    const { grid } = HaystackGrid.generate(8, 1_000_000, 100);
    const taken = grid.carve(0, 0, 500, () => [0, 1e4]);
    expect(taken).toBe(grid.initialTotal);
    expect(grid.sumCounts()).toBe(0);
  });
});
