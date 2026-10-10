import * as THREE from 'three';
import type { Game } from '../core/Game';
import { compassWord, fmtInt, fmtMoney } from '../core/format';
import { hash32, mulberry32 } from '../core/rng';
import type { Treasure, TreasureKind } from '../core/state';
import { CONSUMABLES, ITEM_BY_ID, type BuffId } from '../items/catalog';
import { lvl, treasureMult } from '../items/stats';
import type { CellPos, HaystackGrid } from '../world/HaystackGrid';
import type { Pickup } from '../world/Pickups';

interface KindDef {
  icon: string;
  name: string;
  /** Bobot peluang muncul saat tumpukan dibuat (legenda selalu tepat satu). */
  weight: number;
  glow: number;
}

export const TREASURE_KINDS: Record<TreasureKind, KindDef> = {
  koin: { icon: '💰', name: 'Kantong Koin', weight: 34, glow: 0xffe9a0 },
  sampah: { icon: '🥾', name: 'Barang Rongsok', weight: 18, glow: 0xd8d0c0 },
  peti: { icon: '🎁', name: 'Peti Kejutan', weight: 22, glow: 0xffb0d0 },
  ramuan: { icon: '🧪', name: 'Botol Misterius', weight: 12, glow: 0xb48cff },
  emas: { icon: '🌟', name: 'Jerami Emas', weight: 10, glow: 0xffcf3f },
  fosil: { icon: '🦴', name: 'Fosil Ayam Purba', weight: 4, glow: 0xffcf3f },
  legenda: { icon: '👑', name: 'Peti Harta Legendaris', weight: 0, glow: 0xff7ad9 },
};

const JUNK: [string, string][] = [
  ['🥾', 'Sepatu bot sebelah'],
  ['🧦', 'Kaus kaki bau'],
  ['📻', 'Radio rusak'],
  ['🩴', 'Sandal jepit putus'],
  ['🥫', 'Kaleng sarden kosong'],
  ['🧸', 'Boneka lusuh'],
  ['📱', 'HP jadul (masih bisa main Snake!)'],
  ['🕶️', 'Kacamata hitam retak'],
  ['🎺', 'Terompet tahun baru'],
];

const BUFFS: [BuffId, string][] = [
  ['speed', '⚡ Ramuan Kecepatan'],
  ['rate', '☕ Kopi Petani'],
  ['money', '🤑 Ramuan Rakus'],
  ['luck', '🌈 Ramuan Hoki'],
];

/** Jumlah harta karun per tumpukan. */
export function treasureCount(level: number, mult = 1): number {
  return Math.round((36 + 8 * level) * mult);
}

/**
 * Sebar harta karun di sel-sel padat secara deterministik dari seed.
 * Harta pertama selalu `legenda` dan ditaruh di separuh bawah tumpukan.
 */
export function generateTreasures(grid: HaystackGrid, seed: number, count: number, needle: CellPos): Treasure[] {
  const rng = mulberry32(seed ^ 0x7ea5e7e);
  const kinds = (Object.keys(TREASURE_KINDS) as TreasureKind[]).filter((k) => TREASURE_KINDS[k].weight > 0);
  const totalW = kinds.reduce((a, k) => a + TREASURE_KINDS[k].weight, 0);
  const pickKind = (): TreasureKind => {
    let r = rng() * totalW;
    for (const k of kinds) {
      r -= TREASURE_KINDS[k].weight;
      if (r <= 0) return k;
    }
    return 'koin';
  };
  const used = new Set<number>([grid.index(needle.x, needle.y, needle.z)]);
  const out: Treasure[] = [];
  for (let attempt = 0; out.length < count && attempt < count * 4000; attempt++) {
    const x = Math.floor(rng() * grid.sx);
    const z = Math.floor(rng() * grid.sz);
    const top = grid.topY(x, z);
    if (top < 2) continue;
    const legend = out.length === 0;
    const y = Math.floor(rng() * (legend ? top * 0.5 : top));
    if (!grid.isSolid(x, y, z)) continue;
    const i = grid.index(x, y, z);
    if (used.has(i)) continue;
    used.add(i);
    out.push({ x, y, z, kind: legend ? 'legenda' : pickKind(), found: false });
  }
  return out;
}

/** Ikon & nama tampilan sebuah harta (barang rongsok dipilih dari posisinya). */
export function treasureLook(t: Treasure): { icon: string; name: string } {
  if (t.kind === 'sampah') {
    const [icon, name] = JUNK[hash32(t.x, t.y, t.z) % JUNK.length];
    return { icon, name };
  }
  const k = TREASURE_KINDS[t.kind];
  return { icon: k.icon, name: k.name };
}

/** Mengurus harta karun di tumpukan: munculkan saat tergali, beri hadiah saat diambil. */
export class TreasureHunt {
  private spawned = new Map<Treasure, Pickup>();
  private tmp = new THREE.Vector3();

  constructor(private game: Game) {}

  get total(): number {
    return this.game.state.treasures.length;
  }

  get found(): number {
    return this.game.state.treasures.filter((t) => t.found).length;
  }

  reset(): void {
    this.spawned.clear();
  }

  /** Nilai dasar hadiah uang: ikut membesar seiring total penghasilan di tumpukan ini. */
  baseValue(): number {
    const s = this.game.state;
    return Math.max(250 * (1 + s.level), s.stats.earned * 0.025) * treasureMult(s);
  }

  /** Dipanggil bersamaan dengan fisika runtuh: harta ikut turun & muncul saat terbuka. */
  tick(): void {
    const g = this.game;
    const grid = g.grid;
    for (const t of g.state.treasures) {
      if (t.found) continue;
      let moved = false;
      while (t.y > 0 && grid.count(t.x, t.y - 1, t.z) < grid.solidMin * 0.5) {
        t.y--;
        moved = true;
      }
      const p = this.spawned.get(t);
      if (p) {
        if (moved) this.worldPos(t, p.pos);
        continue;
      }
      if (grid.isSolid(t.x, t.y, t.z) || !grid.isExposed(t.x, t.y, t.z)) continue;
      this.spawn(t);
    }
  }

  private worldPos(t: Treasure, out: THREE.Vector3): THREE.Vector3 {
    const grid = this.game.grid;
    return out.set(grid.centerX(t.x), grid.centerY(t.y) - 0.2, grid.centerZ(t.z));
  }

  private spawn(t: Treasure): void {
    const g = this.game;
    const look = treasureLook(t);
    const def = TREASURE_KINDS[t.kind];
    const legend = t.kind === 'legenda';
    const p = g.pickups.add({
      pos: this.worldPos(t, this.tmp),
      icon: look.icon,
      label: look.name,
      size: legend ? 0.9 : 0.6,
      glow: def.glow,
      beacon: legend,
      onCollect: () => this.collect(t),
    });
    this.spawned.set(t, p);
    const d = g.eyePos(this.tmp).distanceTo(p.pos);
    if (legend) {
      g.sfx.sparkle();
      g.hud.toast(`👑 ${look.name} terlihat di sisi ${compassWord(p.pos.x, p.pos.z)} tumpukan! Cepat ambil!`, 6000);
    } else if (d < 14) {
      g.hud.toast(`✨ Ada ${look.icon} ${look.name} menyembul dari jerami!`, 2500);
    }
  }

  private collect(t: Treasure): void {
    const g = this.game;
    const s = g.state;
    t.found = true;
    this.spawned.delete(t);
    s.stats.treasures++;
    const base = this.baseValue();
    const look = treasureLook(t);
    const money = (m: number) => {
      s.money += m;
      s.stats.earned += m;
      g.hud.addIncome(m);
      return fmtMoney(m);
    };
    let msg = '';
    switch (t.kind) {
      case 'koin':
        msg = `💰 Kantong Koin! +${money(base * (0.6 + Math.random() * 0.8))}`;
        break;
      case 'sampah':
        msg = `${look.icon} ${look.name}... dijual ke tukang loak: +${money(base * 0.15)}`;
        break;
      case 'peti':
        msg = `🎁 Peti Kejutan berisi ${this.rollChest(1)}!`;
        break;
      case 'ramuan': {
        const [buff, name] = BUFFS[Math.floor(Math.random() * BUFFS.length)];
        s.buffs[buff] = (s.buffs[buff] ?? 0) + 45;
        msg = `🧪 Botol Misterius... ternyata ${name}! (45 dtk)`;
        break;
      }
      case 'emas':
        msg = `🌟 JERAMI EMAS! +${money(base * 5)}`;
        break;
      case 'fosil':
        msg = `🦴 Fosil Ayam Purba! Museum membelinya seharga ${money(base * 10)}`;
        break;
      case 'legenda':
        s.gold += 1;
        msg = `👑 PETI HARTA LEGENDARIS! +1 Jarum Emas 📍, +${money(base * 8)}, dan ${this.rollChest(2)}!`;
        break;
    }
    g.sfx.treasure(t.kind === 'legenda' || t.kind === 'emas' || t.kind === 'fosil');
    g.hud.toast(msg, t.kind === 'legenda' ? 7000 : 4000);
    g.hud.pop(`${look.icon} ${look.name}`, 'crit');
  }

  /**
   * Isi peti acak: beberapa konsumabel yang harganya sepadan dengan penghasilan saat ini.
   * Sesekali (1,5%) berisi Bom Nuklir. Mengembalikan teks isi peti.
   */
  rollChest(rolls: number): string {
    const g = this.game;
    const s = g.state;
    const got: string[] = [];
    for (let r = 0; r < rolls; r++) {
      let id: string;
      let qty: number;
      if (Math.random() < 0.015) {
        id = 'nuklir';
        qty = 1;
      } else {
        const budget = Math.max(6_000, s.stats.earned * 0.04) * treasureMult(s);
        const pool = CONSUMABLES.filter((c) => c.id !== 'nuklir' && c.price <= budget).sort((a, b) => b.price - a.price).slice(0, 6);
        const c = pool[Math.floor(Math.random() * pool.length)];
        id = c.id;
        qty = Math.max(1, Math.min(5, Math.floor((budget / c.price) * (0.2 + Math.random() * 0.4))));
      }
      s.owned[id] = lvl(s, id) + qty;
      if (!s.selectedConsumable || !lvl(s, s.selectedConsumable)) s.selectedConsumable = id;
      const def = ITEM_BY_ID[id];
      got.push(`${def.icon} ${def.name} ×${fmtInt(qty)}${id === 'nuklir' ? ' (JACKPOT!)' : ''}`);
    }
    g.hud.renderConsumable();
    return got.join(', ');
  }

  /** Harta belum ditemukan yang paling dekat ke titik `from`. */
  nearest(from: THREE.Vector3): { dist: number; dx: number; dz: number } | null {
    const grid = this.game.grid;
    let best: { dist: number; dx: number; dz: number } | null = null;
    for (const t of this.game.state.treasures) {
      if (t.found) continue;
      const dx = grid.centerX(t.x) - from.x;
      const dy = grid.centerY(t.y) - from.y;
      const dz = grid.centerZ(t.z) - from.z;
      const dist = Math.hypot(dx, dy, dz);
      if (!best || dist < best.dist) best = { dist, dx, dz };
    }
    return best;
  }
}
