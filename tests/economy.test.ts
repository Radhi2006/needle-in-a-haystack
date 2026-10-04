import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_BY_ID } from '../src/items/catalog';
import { bulkPrice, moneyMult, priceOf } from '../src/items/stats';
import { newState } from '../src/core/state';
import { HaystackGrid } from '../src/world/HaystackGrid';
import { compassWord, fmtShort } from '../src/core/format';

function state() {
  const { grid, needle } = HaystackGrid.generate(1, 100_000, 100);
  return newState(0, 1, grid.toData(), needle);
}

describe('katalog', () => {
  it('punya banyak item dengan id unik', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(50);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('setiap kategori khusus punya spesifikasinya', () => {
    for (const i of ITEMS) {
      if (i.category === 'tool') expect(i.tool).toBeDefined();
      if (i.category === 'automator') expect(i.auto).toBeDefined();
      if (i.category === 'consumable') expect(i.consumable).toBeDefined();
    }
  });
});

describe('harga', () => {
  it('naik eksponensial sesuai level', () => {
    const s = state();
    const ayam = ITEM_BY_ID.ayam;
    expect(priceOf(ayam, s)).toBe(100);
    s.owned.ayam = 2;
    expect(priceOf(ayam, s)).toBe(Math.round(100 * 1.15 ** 2));
  });

  it('beli borongan = jumlah harga satuan berurutan', () => {
    const s = state();
    const def = ITEM_BY_ID.kambing;
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += Math.round(def.price * def.growth ** i);
    expect(bulkPrice(def, s, 10)).toBe(sum);
  });

  it('konsumabel harga tetap dan didiskon prestige', () => {
    const s = state();
    const bom = ITEM_BY_ID.bom;
    s.owned.bom = 50;
    expect(priceOf(bom, s)).toBe(4000);
    s.owned.p_hemat = 2;
    expect(priceOf(bom, s)).toBe(Math.round(4000 * 0.7));
  });

  it('pengali uang menggabungkan upgrade, prestige, dan buff', () => {
    const s = state();
    expect(moneyMult(s)).toBe(1);
    s.owned.dompet = 4;
    s.owned.p_warisan = 2;
    s.buffs.money = 10;
    expect(moneyMult(s)).toBeCloseTo(2 * 2 * 2);
  });
});

describe('format', () => {
  it('angka ringkas Indonesia', () => {
    expect(fmtShort(999_999)).toBe('999.999');
    expect(fmtShort(12_500_000)).toBe('12,5 jt');
    expect(fmtShort(3_000_000_000)).toBe('3 M');
  });

  it('arah mata angin (utara = -Z)', () => {
    expect(compassWord(0, -1)).toBe('Utara');
    expect(compassWord(1, 0)).toBe('Timur');
    expect(compassWord(0, 1)).toBe('Selatan');
    expect(compassWord(-1, 0)).toBe('Barat');
  });
});
