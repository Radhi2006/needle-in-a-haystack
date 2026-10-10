import type { GameState } from '../core/state';
import { ITEM_BY_ID, TOOLS, type ItemDef } from './catalog';

export const lvl = (s: GameState, id: string): number => s.owned[id] ?? 0;
export const buffOn = (s: GameState, id: string): boolean => (s.buffs[id] ?? 0) > 0;

export function moneyMult(s: GameState): number {
  return (1 + 0.25 * lvl(s, 'dompet')) * (1 + 0.5 * lvl(s, 'p_warisan')) * (buffOn(s, 'money') ? 2 : 1) * (buffOn(s, 'golden') ? 3 : 1);
}

export function toolRateMult(s: GameState): number {
  return (1 + 0.1 * lvl(s, 'sarung')) * (1 + 0.2 * lvl(s, 'p_sarung')) * (buffOn(s, 'rate') ? 2 : 1);
}

export function amountMult(s: GameState): number {
  return 1 + 0.15 * lvl(s, 'otot');
}

export function reach(s: GameState): number {
  const t = ITEM_BY_ID[s.selectedTool]?.tool;
  return 3 + 0.5 * lvl(s, 'lengan') + (t ? t.radius * 0.6 : 0);
}

export function speedMult(s: GameState): number {
  return (1 + 0.1 * lvl(s, 'sepatu')) * (buffOn(s, 'speed') ? 1.6 : 1);
}

export function jumpMult(s: GameState): number {
  return 1 + 0.12 * lvl(s, 'pegas');
}

export function critChance(s: GameState): number {
  return Math.min(0.9, 0.02 * lvl(s, 'hoki') + (buffOn(s, 'luck') ? 0.3 : 0));
}

export function critMult(s: GameState): number {
  return buffOn(s, 'luck') ? 10 : 5;
}

export function jetFuel(s: GameState): number {
  return 3 + lvl(s, 'tangki');
}

/** Pengali jeda antar event acak (lebih kecil = lebih sering). */
export function eventIntervalMult(s: GameState): number {
  return Math.pow(0.85, lvl(s, 'jimat'));
}

/** Pengali jumlah & isi harta karun dari prestige. */
export function treasureMult(s: GameState): number {
  return 1 + 0.25 * lvl(s, 'p_pemburu');
}

export function automatorMult(s: GameState, def: ItemDef): number {
  const kind = def.auto?.kind;
  const base = kind === 'animal' ? 1 + lvl(s, 'pakan') : 1 + lvl(s, 'oli');
  return base * (1 + 0.25 * lvl(s, 'p_peternakan'));
}

/** Total helai/detik dari semua otomatisasi. */
export function automationRate(s: GameState): number {
  let r = 0;
  for (const [id, n] of Object.entries(s.owned)) {
    const def = ITEM_BY_ID[id];
    if (def?.auto && n > 0) r += def.auto.rate * n * automatorMult(s, def);
  }
  return r;
}

/** Harga untuk membeli 1 lagi (level/unit berikutnya). */
export function priceOf(def: ItemDef, s: GameState): number {
  const owned = lvl(s, def.id);
  if (def.category === 'consumable') {
    return Math.round(def.price * (1 - 0.15 * lvl(s, 'p_hemat')) * (buffOn(s, 'diskon') ? 0.5 : 1));
  }
  return Math.round(def.price * Math.pow(def.growth, owned));
}

/** Harga untuk membeli `qty` sekaligus. */
export function bulkPrice(def: ItemDef, s: GameState, qty: number): number {
  if (def.category === 'consumable') return priceOf(def, s) * qty;
  const owned = lvl(s, def.id);
  let total = 0;
  for (let i = 0; i < qty; i++) total += Math.round(def.price * Math.pow(def.growth, owned + i));
  return total;
}

export function ownedTools(s: GameState): ItemDef[] {
  return TOOLS.filter((t) => lvl(s, t.id) > 0);
}
