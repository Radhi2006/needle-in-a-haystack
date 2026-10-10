import * as THREE from 'three';
import type { Game } from '../core/Game';
import { BLAST_MONEY_RATE, CELL } from '../core/config';
import { compassWord, fmtInt, fmtMoney } from '../core/format';
import { eventIntervalMult, moneyMult } from '../items/stats';
import type { Pickup } from '../world/Pickups';
import { Tornado } from '../world/Tornado';

export type EventId = 'golden' | 'meteor' | 'tornado' | 'airdrop' | 'merchant' | 'goat';

interface EventDef {
  id: EventId;
  icon: string;
  name: string;
  /** Teks pengumuman saat event dimulai. */
  intro: string;
  duration: number;
  weight: number;
}

export const EVENTS: EventDef[] = [
  { id: 'golden', icon: '🌟', name: 'Jam Emas', intro: 'Semua jerami bernilai 3× lipat selama 30 detik! Gas terus!', duration: 30, weight: 20 },
  { id: 'meteor', icon: '☄️', name: 'Hujan Meteor', intro: 'Meteor berjatuhan ke tumpukan! Gratis ledakan — tapi awas kepala!', duration: 20, weight: 20 },
  { id: 'tornado', icon: '🌪️', name: 'Angin Puting Beliung', intro: 'Puting beliung menyapu tumpukan dan menerbangkan jerami (jadi uang)! Jangan terlalu dekat...', duration: 26, weight: 18 },
  { id: 'airdrop', icon: '🪂', name: 'Paket Udara', intro: 'Pesawat menjatuhkan paket berisi barang langka di dekatmu. Ikuti pilar cahaya!', duration: 90, weight: 18 },
  { id: 'merchant', icon: '🛒', name: 'Pedagang Keliling', intro: 'Semua konsumabel DISKON 50% selama 60 detik! Tekan [B] untuk belanja.', duration: 60, weight: 12 },
  { id: 'goat', icon: '🐐', name: 'Kambing Emas Kabur', intro: 'Kambing Emas lepas dari kandang! Kejar dan tangkap dia sebelum melompati pagar!', duration: 45, weight: 14 },
];

const FIRST_DELAY = 120;

interface Active {
  def: EventDef;
  t: number;
  dur: number;
  spawnT: number;
  /** Jumlah helai/uang yang didapat selama event (meteor & puting beliung). */
  haul: number;
  money: number;
  tornado?: Tornado;
  waypoint?: THREE.Vector3;
  waypointT?: number;
  lifted?: boolean;
  pickup?: Pickup;
  collected?: boolean;
}

/** Event acak yang muncul tiap beberapa menit supaya permainan tidak monoton. */
export class Events {
  readonly group = new THREE.Group();
  /** Detik sampai event berikutnya. */
  timer = FIRST_DELAY;
  active: Active | null = null;
  private debugNext = 0;
  private tmp = new THREE.Vector3();

  constructor(private game: Game) {}

  reset(): void {
    this.finish(true);
    this.timer = FIRST_DELAY;
  }

  /** Mulai event (acak berbobot, atau `id` tertentu). */
  trigger(id?: EventId): void {
    this.finish(true);
    let def: EventDef;
    if (id) def = EVENTS.find((e) => e.id === id)!;
    else {
      const total = EVENTS.reduce((a, e) => a + e.weight, 0);
      let r = Math.random() * total;
      def = EVENTS[EVENTS.length - 1];
      for (const e of EVENTS) {
        r -= e.weight;
        if (r <= 0) {
          def = e;
          break;
        }
      }
    }
    this.start(def);
  }

  /** Debug: jalankan event berikutnya secara berurutan. */
  triggerNext(): void {
    this.trigger(EVENTS[this.debugNext++ % EVENTS.length].id);
  }

  update(dt: number): void {
    const a = this.active;
    if (!a) {
      this.timer -= dt;
      if (this.timer <= 0) this.trigger();
      return;
    }
    a.t += dt;
    switch (a.def.id) {
      case 'meteor':
        this.updateMeteor(a, dt);
        break;
      case 'tornado':
        this.updateTornado(a, dt);
        break;
    }
    const left = a.dur - a.t;
    // paket / kambing hilang tanpa diambil = gagal
    if (a.pickup && !a.collected && (left <= 0 || !this.game.pickups.list.includes(a.pickup))) {
      this.game.hud.toast(
        a.def.id === 'goat' ? '🐐 Kambing Emas melompati pagar dan menghilang... Lain kali lebih cepat!' : '🪂 Paket udara keburu diambil petani tetangga 😢',
        4000,
      );
      this.finish();
      return;
    }
    this.game.hud.setEvent(a.def.icon, a.def.name, this.statusText(a), Math.max(0, left / a.dur));
    if (left <= 0 || a.collected) this.finish();
  }

  private statusText(a: Active): string {
    switch (a.def.id) {
      case 'golden':
        return 'Uang ×3 dari semua jerami';
      case 'merchant':
        return 'Konsumabel −50% · tekan [B]';
      case 'meteor':
      case 'tornado':
        return a.haul ? `${fmtInt(a.haul)} helai · +${fmtMoney(a.money)}` : a.def.id === 'meteor' ? 'Meteor mendekat...' : 'Angin mulai berputar...';
      case 'airdrop':
      case 'goat': {
        if (!a.pickup) return '';
        const eye = this.game.eyePos(this.tmp);
        const d = Math.hypot(a.pickup.pos.x - eye.x, a.pickup.pos.z - eye.z);
        const dir = compassWord(a.pickup.pos.x - eye.x, a.pickup.pos.z - eye.z);
        return `${Math.round(d)} m ke arah ${dir}`;
      }
    }
    return '';
  }

  private start(def: EventDef): void {
    const g = this.game;
    const s = g.state;
    const a: Active = { def, t: 0, dur: def.duration, spawnT: 1.5, haul: 0, money: 0 };
    this.active = a;
    g.sfx.fanfare();
    g.hud.toast(`${def.icon} EVENT: ${def.name}! ${def.intro}`, 6000);
    switch (def.id) {
      case 'golden':
        s.buffs.golden = Math.max(s.buffs.golden ?? 0, def.duration);
        break;
      case 'merchant':
        s.buffs.diskon = Math.max(s.buffs.diskon ?? 0, def.duration);
        if (g.shop.isOpen) g.shop.render();
        break;
      case 'tornado': {
        // muncul di sisi tumpukan tempat pemain berada supaya terlihat datang
        const ang = Math.atan2(g.player.pos.z, g.player.pos.x) + (Math.random() - 0.5) * 1.4;
        const r = g.baseRadius + 6;
        a.tornado = new Tornado(new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r));
        this.group.add(a.tornado.group);
        a.waypoint = this.randomOnStack(0.7);
        a.waypointT = 5;
        break;
      }
      case 'airdrop':
        a.pickup = this.spawnAirdrop();
        break;
      case 'goat':
        a.pickup = this.spawnGoat();
        break;
    }
  }

  /** Akhiri event aktif. `silent` = tanpa ringkasan (reset/prestige). */
  private finish(silent = false): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    const g = this.game;
    this.timer = (140 + Math.random() * 100) * eventIntervalMult(g.state);
    if (a.tornado) {
      this.group.remove(a.tornado.group);
      a.tornado.dispose();
    }
    if (a.pickup) g.pickups.remove(a.pickup);
    if (a.def.id === 'merchant') {
      delete g.state.buffs.diskon;
      if (g.shop.isOpen) g.shop.render();
    }
    g.hud.setEvent(null);
    if (silent) return;
    if ((a.def.id === 'meteor' || a.def.id === 'tornado') && a.haul > 0) {
      g.hud.toast(`${a.def.icon} ${a.def.name} selesai: ${fmtInt(a.haul)} helai jerami (+${fmtMoney(a.money)})`, 5000);
    }
  }

  // ───────────────────────── tiap event ─────────────────────────

  /** Titik acak di permukaan tumpukan dalam `frac` × radius tumpukan. */
  private randomOnStack(frac: number): THREE.Vector3 {
    const g = this.game;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * g.baseRadius * frac;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return new THREE.Vector3(x, this.surfaceY(x, z), z);
  }

  /** Ketinggian permukaan jerami (atau tanah) di titik dunia (x, z). */
  surfaceY(x: number, z: number): number {
    const grid = this.game.grid;
    const top = grid.topY(grid.cellX(x), grid.cellZ(z));
    return top < 0 ? 0 : (top + 1) * CELL;
  }

  private updateMeteor(a: Active, dt: number): void {
    const g = this.game;
    a.spawnT -= dt;
    if (a.spawnT > 0 || a.t > a.dur - 2) return;
    a.spawnT = 0.7 + Math.random() * 0.6;
    let to: THREE.Vector3;
    if (Math.random() < 0.2) {
      // sesekali jatuh dekat pemain supaya menegangkan
      const p = g.player.pos;
      const ang = Math.random() * Math.PI * 2;
      const d = 3 + Math.random() * 6;
      to = new THREE.Vector3(p.x + Math.cos(ang) * d, 0, p.z + Math.sin(ang) * d);
      to.y = this.surfaceY(to.x, to.z);
    } else to = this.randomOnStack(0.95);
    to.y = Math.max(0.2, to.y - 0.3);
    const from = to.clone().add(new THREE.Vector3(-18 + Math.random() * 8, 55, 10 + Math.random() * 8));
    const r = 1.0 + Math.random() * 1.0;
    const dur = 1.3 + Math.random() * 0.4;
    g.effects.throwObject('meteor', from, to, () => {
      const taken = g.blast(to, r);
      a.haul += taken;
      a.money += taken * moneyMult(g.state) * BLAST_MONEY_RATE;
    }, { dur, arc: 0 });
    g.sfx.whistle(dur, 0.035);
  }

  private updateTornado(a: Active, dt: number): void {
    const g = this.game;
    const tor = a.tornado!;
    const fadeIn = Math.min(1, a.t / 2);
    const fadeOut = Math.min(1, (a.dur - a.t) / 2.5);
    tor.strength = Math.max(0, Math.min(fadeIn, fadeOut));

    // berkelana di atas tumpukan, ganti tujuan tiap beberapa detik
    a.waypointT! -= dt;
    if (a.waypointT! <= 0 || tor.pos.distanceTo(a.waypoint!) < 2) {
      a.waypoint = this.randomOnStack(0.75);
      a.waypointT = 4 + Math.random() * 3;
    }
    const dir = this.tmp.copy(a.waypoint!).sub(tor.pos).setY(0);
    if (dir.lengthSq() > 1e-4) dir.normalize();
    tor.pos.addScaledVector(dir, 3.4 * dt);
    tor.pos.y = 0;
    tor.update(dt);

    // sedot jerami di kaki corong
    a.spawnT -= dt;
    if (a.spawnT <= 0 && tor.strength > 0.5) {
      a.spawnT = 0.12;
      const y = this.surfaceY(tor.pos.x, tor.pos.z);
      const max = Math.max(400, g.grid.initialTotal * 0.00008);
      const taken = y > 0 ? g.grid.takeSphere(tor.pos.x, y - 0.6, tor.pos.z, 2.6, max) : 0;
      if (taken > 0) {
        g.gain(taken, BLAST_MONEY_RATE, 'auto');
        a.haul += taken;
        a.money += taken * moneyMult(g.state) * BLAST_MONEY_RATE;
        g.particles.burst(tor.pos.x, y, tor.pos.z, 14, 5, 9);
      }
      if (Math.random() < 0.25) g.sfx.wind(tor.strength);
    }

    // pemain yang terlalu dekat ikut terangkat & berputar
    const p = g.player;
    const dx = p.pos.x - tor.pos.x;
    const dz = p.pos.z - tor.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.6 && tor.strength > 0.5 && p.pos.y < 24) {
      p.vel.y = Math.max(p.vel.y, 11);
      p.vel.x += (-dz / (d || 1)) * 30 * dt;
      p.vel.z += (dx / (d || 1)) * 30 * dt;
      if (!a.lifted) {
        a.lifted = true;
        g.hud.toast('🌪️ WUUUSSHH! Kamu ikut terbawa angin!', 2500);
      }
    }
  }

  private spawnAirdrop(): Pickup {
    const g = this.game;
    const p = g.player.pos;
    const fence = (g.env?.fenceRadius ?? 60) - 4;
    const ang = Math.random() * Math.PI * 2;
    const d = 9 + Math.random() * 8;
    let x = p.x + Math.cos(ang) * d;
    let z = p.z + Math.sin(ang) * d;
    const r = Math.hypot(x, z);
    if (r > fence) {
      x *= fence / r;
      z *= fence / r;
    }
    const a = this.active!;
    const pk = g.pickups.add({
      pos: new THREE.Vector3(x, this.surfaceY(x, z) + 45, z),
      icon: '📦',
      topIcon: '🪂',
      label: 'Paket Udara',
      size: 1.2,
      glow: 0x7fd8ff,
      beacon: true,
      ttl: a.dur + 0.5,
      onCollect: () => {
        a.collected = true;
        const base = g.treasures.baseValue() * 3;
        g.state.money += base;
        g.state.stats.earned += base;
        g.hud.addIncome(base);
        g.sfx.treasure(true);
        g.hud.toast(`📦 Paket Udara dibuka: +${fmtMoney(base)} dan ${g.treasures.rollChest(2)}!`, 6000);
      },
      tick: (pk, dt) => {
        const ground = this.surfaceY(pk.pos.x, pk.pos.z);
        if (pk.pos.y > ground + 0.05) {
          const falling = pk.pos.y - ground > 1;
          pk.pos.y = Math.max(ground, pk.pos.y - (falling ? 5.5 : 3) * dt);
          pk.pos.x += Math.sin(pk.t * 1.4) * 0.6 * dt;
          if (pk.pos.y <= ground && !pk.collectable) {
            g.sfx.boom(0.4);
            g.particles.burst(pk.pos.x, ground + 0.2, pk.pos.z, 30, 3, 3);
          }
        }
        const landed = pk.pos.y <= ground + 0.05;
        pk.collectable = landed;
        pk.bob = landed ? 0.6 : 0;
        if (pk.top) pk.top.visible = !landed;
      },
    });
    pk.collectable = false;
    return pk;
  }

  private spawnGoat(): Pickup {
    const g = this.game;
    const rMin = g.baseRadius + 2;
    const rMax = (g.env?.fenceRadius ?? 60) - 2;
    let ang = Math.random() * Math.PI * 2;
    const r0 = (rMin + rMax) / 2;
    let heading = ang + Math.PI / 2;
    let bleatT = 0;
    const a = this.active!;
    g.hud.toast(`🐐✨ Kambing Emas terlihat di sisi ${compassWord(Math.cos(ang), Math.sin(ang))} — di luar tumpukan, dekat pagar!`, 5000);
    return g.pickups.add({
      pos: new THREE.Vector3(Math.cos(ang) * r0, 0, Math.sin(ang) * r0),
      icon: '🐐',
      label: 'Kambing Emas',
      size: 1.1,
      glow: 0xffcf3f,
      beacon: true,
      ttl: a.dur + 0.5,
      onCollect: () => {
        a.collected = true;
        const m = g.treasures.baseValue() * 6;
        g.state.money += m;
        g.state.stats.earned += m;
        g.hud.addIncome(m);
        g.sfx.treasure(true);
        g.hud.toast(`🐐 Kambing Emas tertangkap! Pemiliknya memberi hadiah ${fmtMoney(m)} + ${g.treasures.rollChest(1)}`, 6000);
      },
      tick: (pk, dt) => {
        const p = g.player.pos;
        const dx = pk.pos.x - p.x;
        const dz = pk.pos.z - p.z;
        const dist = Math.hypot(dx, dz);
        const flee = dist < 9;
        if (flee) {
          // kabur menjauhi pemain, sedikit zig-zag
          const away = Math.atan2(dz, dx) + Math.sin(pk.t * 3) * 0.5;
          heading += Math.atan2(Math.sin(away - heading), Math.cos(away - heading)) * Math.min(1, dt * 5);
          bleatT -= dt;
          if (bleatT <= 0) {
            bleatT = 1.5 + Math.random();
            g.sfx.bleat();
          }
        } else heading += (Math.random() - 0.5) * dt * 3;
        const speed = flee ? 5.2 : 2;
        pk.pos.x += Math.cos(heading) * speed * dt;
        pk.pos.z += Math.sin(heading) * speed * dt;
        // tetap di cincin antara tumpukan dan pagar
        const r = Math.hypot(pk.pos.x, pk.pos.z);
        ang = Math.atan2(pk.pos.z, pk.pos.x);
        const rc = Math.max(rMin, Math.min(rMax, r));
        if (rc !== r) {
          pk.pos.x = Math.cos(ang) * rc;
          pk.pos.z = Math.sin(ang) * rc;
          // meluncur menyusuri pagar / tepi tumpukan
          heading = ang + (Math.sin(heading - ang) >= 0 ? Math.PI / 2 : -Math.PI / 2);
        }
        pk.pos.y = Math.max(0, this.surfaceY(pk.pos.x, pk.pos.z));
        pk.bob = 0.6 + Math.abs(Math.sin(pk.t * (flee ? 11 : 6))) * 0.35;
      },
    });
  }
}
