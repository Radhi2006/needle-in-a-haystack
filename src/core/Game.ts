import * as THREE from 'three';
import { Automators } from '../automation/Automators';
import { Sfx } from '../audio/sfx';
import { Detection } from '../detection/Detection';
import { Events } from '../events/Events';
import { CONSUMABLES, ITEM_BY_ID, TOOLS, type ConsumableSpec, type ItemDef } from '../items/catalog';
import {
  amountMult, automationRate, bulkPrice, critChance, critMult, jetFuel, jumpMult, lvl,
  moneyMult, ownedTools, reach, speedMult, toolRateMult, treasureMult,
} from '../items/stats';
import { PlayerController } from '../player/PlayerController';
import { ViewModel } from '../player/ViewModel';
import { deleteSave, loadGame, loadSettings, saveGame } from '../save/SaveManager';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { generateTreasures, treasureCount, TreasureHunt } from '../treasure/Treasures';
import { Shop } from '../ui/Shop';
import { ChunkManager } from '../world/ChunkManager';
import { Effects } from '../world/Effects';
import { Environment } from '../world/Environment';
import { createHayMaterial } from '../world/hayMaterial';
import { HaystackGrid } from '../world/HaystackGrid';
import { easeOut } from '../world/Megabombs';
import { NeedleView } from '../world/Needle';
import { Particles } from '../world/Particles';
import { Pickups, type Pickup } from '../world/Pickups';
import { raycastGrid, raySphere, type RayHit } from '../world/raycast';
import { StrawInstances } from '../world/StrawInstances';
import {
  AUTOSAVE_SECONDS, BLAST_MONEY_RATE, CELL, COLLAPSE_HZ, DAY_TIME, DEBUG,
  cellCapacityForLevel, strawsForLevel,
} from './config';
import { compassWord, fmtInt, fmtMoney, fmtShort, fmtTime } from './format';
import { Input } from './input';
import { randomSeed } from './rng';
import { newState, type GameState, type Settings } from './state';

type Phase = 'loading' | 'menu' | 'playing' | 'shop' | 'win';

/** Bom raksasa: dibidik jauh & dijatuhkan dari langit/orbit (bukan dilempar). */
const SKY_KINDS = new Set<ConsumableSpec['kind']>([
  'nuke', 'mirv', 'orbital', 'antimatter', 'blackhole', 'asteroid', 'carpet', 'storm', 'ufo', 'asteroids', 'supernova', 'bigbang',
]);
/** Bom yang tidak dilempar/dijatuhkan sebagai benda: serangannya langsung muncul di titik bidikan. */
const DIRECT_KINDS = new Set<ConsumableSpec['kind']>(['carpet', 'storm', 'ufo', 'asteroids', 'supernova', 'bigbang']);
const DOWN = new THREE.Vector3(0, -1, 0);

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly sfx = new Sfx();
  readonly effects = new Effects();
  readonly particles = new Particles();
  readonly needle = new NeedleView();
  readonly pickups = new Pickups();
  readonly hud: HUD;
  readonly shop: Shop;
  readonly menu: Menu;
  readonly detection: Detection;
  readonly treasures: TreasureHunt;
  readonly events: Events;
  readonly view: ViewModel;
  readonly flashlight: THREE.SpotLight;
  readonly settings: Settings;

  state!: GameState;
  grid!: HaystackGrid;
  player!: PlayerController;
  env: Environment | null = null;
  chunks: ChunkManager | null = null;
  straws: StrawInstances | null = null;
  automators: Automators | null = null;

  phase: Phase = 'loading';
  flashlightOn = false;
  needleCollecting = false;
  baseRadius = 20;

  private hayMaterial = createHayMaterial();
  private hit: RayHit = { kind: 'none', x: 0, y: 0, z: 0, dist: 0, point: new THREE.Vector3() };
  private dir = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private lastTime = performance.now();
  private toolCooldown = 0;
  private collapseAcc = 0;
  private saveTimer = 0;
  private collectT = 0;
  private needleExposed = false;
  private popStraws = 0;
  private popMoney = 0;
  private popCrit = false;
  private popT = 0;
  private hiddenAt = 0;
  private jetSoundT = 0;
  private greeted = false;

  constructor(canvas: HTMLCanvasElement) {
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 900);
    this.scene.add(this.camera);
    this.view = new ViewModel(this.camera);

    this.flashlight = new THREE.SpotLight(0xfff2d0, 0, 30, 0.5, 0.45, 1.2);
    this.flashlight.position.set(0.2, -0.1, 0);
    this.flashlight.target.position.set(0, 0, -5);
    this.flashlight.layers.enable(1);
    this.camera.add(this.flashlight, this.flashlight.target);

    this.scene.add(this.effects.group, this.particles.mesh, this.needle.group);

    this.input = new Input(canvas);
    this.hud = new HUD(this);
    this.shop = new Shop(this);
    this.menu = new Menu(this);
    this.detection = new Detection(this);
    this.treasures = new TreasureHunt(this);
    this.events = new Events(this);
    this.scene.add(this.pickups.group, this.events.group);

    this.input.onLockChange = (locked) => this.onLockChange(locked);
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => this.onGlobalKey(e));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => void this.save());
  }

  // ───────────────────────── siklus hidup ─────────────────────────

  async start(): Promise<void> {
    this.menu.setLoading('Menumpuk jutaan helai jerami...');
    await nextFrame();
    const saved = await loadGame();
    if (saved) {
      this.state = saved;
    } else {
      this.state = this.generateRun(0, randomSeed());
    }
    await this.buildWorld();
    if (saved) this.applyOffline((Date.now() - saved.savedAt) / 1000);
    this.chunks!.buildAll();
    this.menu.setLoading(null);
    this.renderer.setAnimationLoop(() => this.frame());
    if (this.state.won) this.showWin();
    else this.toMenu(!!saved);
  }

  private generateRun(level: number, seed: number, prev?: GameState): GameState {
    const { grid, needle } = HaystackGrid.generate(seed, strawsForLevel(level), cellCapacityForLevel(level));
    const st = newState(level, seed, grid.toData(), needle, prev);
    st.treasures = generateTreasures(grid, seed, treasureCount(level, treasureMult(st)), needle);
    this.applyStartPerks(st, true);
    return st;
  }

  /** Bangun ulang semua objek yang bergantung pada tumpukan. */
  private async buildWorld(): Promise<void> {
    this.chunks?.dispose();
    if (this.chunks) this.scene.remove(this.chunks.group);
    if (this.straws) {
      this.scene.remove(this.straws.mesh);
      this.straws.dispose();
    }
    if (this.env) {
      this.scene.remove(this.env.group);
      this.env.dispose();
    }
    if (this.automators) {
      this.scene.remove(this.automators.group);
      this.automators.dispose();
    }
    this.effects.clearDrone();

    const st = this.state;
    this.grid = new HaystackGrid(st.grid);
    st.grid = this.grid.toData();
    this.baseRadius = ((this.grid.sx - 6) / 2.28) * CELL;
    // save lama belum punya harta karun
    if (!st.treasures) st.treasures = generateTreasures(this.grid, st.seed, treasureCount(st.level, treasureMult(st)), st.needle);
    st.stats.treasures ??= 0;
    this.pickups.clear();
    this.treasures.reset();
    this.events.reset();

    this.env = new Environment(this.scene, this.baseRadius, st.seed);
    this.env.hemi.layers.enable(1);
    this.env.sun.layers.enable(1);
    this.scene.add(this.env.group);

    this.chunks = new ChunkManager(this.grid, this.hayMaterial);
    this.scene.add(this.chunks.group);
    this.straws = new StrawInstances(this.grid, st.seed);
    this.scene.add(this.straws.mesh);

    this.grid.listener = (x, y, z) => {
      this.chunks!.markCell(x, y, z);
      this.straws!.notifyCell(x, y, z);
    };
    this.grid.regionListener = (fx, fz, rc, y0, y1) => {
      this.chunks!.markRegion(fx, fz, rc, y0, y1);
      this.straws!.dirty = true;
    };

    this.automators = new Automators(
      { grid: this.grid, state: st, onHarvest: (n) => this.gain(n, 1, 'auto') },
      this.baseRadius,
      this.env.fenceRadius,
    );
    this.automators.sync();
    this.scene.add(this.automators.group);

    if (this.player) this.player.setGrid(this.grid);
    else this.player = new PlayerController(this.grid);
    const p = st.player;
    if (p.x === 0 && p.y === 0 && p.z === 0) {
      this.player.pos.set(0, 0, this.baseRadius + 6);
      this.player.yaw = 0;
      this.player.pitch = -0.05;
    } else {
      this.player.pos.set(p.x, p.y, p.z);
      this.player.yaw = p.yaw;
      this.player.pitch = p.pitch;
    }
    this.player.vel.set(0, 0, 0);
    this.player.fuel = jetFuel(st);

    this.needle.placeAt(this.grid, st.needle);
    this.needleCollecting = false;
    if (lvl(st, 'drone_scan') && st.drone.scans > 0) this.effects.setDroneZone(st.drone.cx, st.drone.cz, st.drone.radius);

    if (!ITEM_BY_ID[st.selectedTool] || !lvl(st, st.selectedTool)) st.selectedTool = 'tangan';
    this.view.setTool(st.selectedTool);
    this.view.root.traverse((o) => o.layers.set(1));
    this.applySettings();
    this.hud.renderHotbar();
  }

  /** Progres otomatisasi saat game ditutup (maks 1 jam, efisiensi 50%). */
  private applyOffline(seconds: number): void {
    if (seconds < 20 || !this.automators || this.state.won) return;
    const rate = automationRate(this.state);
    if (rate <= 0) return;
    const secs = Math.min(seconds, 3600);
    const before = this.state.stats.collected;
    const moneyBefore = this.state.money;
    this.automators.harvest(secs * 0.5, 50000);
    const got = this.state.stats.collected - before;
    if (got > 0) {
      setTimeout(
        () => this.hud.toast(`🌙 Selama kamu pergi (${fmtTime(secs)}), otomatisasi mengumpulkan ${fmtInt(got)} helai (+${fmtMoney(this.state.money - moneyBefore)})`, 7000),
        600,
      );
    }
  }

  applySettings(): void {
    const q = this.settings.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'low' ? 1 : q === 'medium' ? 1.5 : 2));
    this.straws?.setQuality(q === 'low' ? 5 : q === 'medium' ? 8 : 11, q === 'low' ? 4 : q === 'medium' ? 7 : 11);
    this.env?.setShadows(q !== 'low', q === 'high' ? 4096 : 2048);
    this.renderer.shadowMap.needsUpdate = true;
    this.sfx.setVolume(this.settings.volume);
  }

  private applyStartPerks(st: GameState, runStart: boolean): void {
    if (runStart) {
      const m = lvl(st, 'p_modal');
      if (m > 0) st.money = 1000 * Math.pow(10, m - 1);
    }
    const a = lvl(st, 'p_alat');
    for (let i = 1; i <= a && i < TOOLS.length; i++) {
      st.owned[TOOLS[i].id] = 1;
      if (runStart) st.selectedTool = TOOLS[i].id;
    }
    const ins = ['kompas', 'detektor', 'detektor_pro'].slice(0, lvl(st, 'p_insting'));
    for (const id of ins) st.owned[id] = 1;
  }

  // ───────────────────────── fase & menu ─────────────────────────

  play(): void {
    this.sfx.ensure();
    if (this.state.won) {
      this.showWin();
      return;
    }
    this.input.lock();
  }

  private toMenu(resume: boolean): void {
    this.phase = 'menu';
    this.hud.show(false);
    this.menu.showMain(resume);
  }

  private onLockChange(locked: boolean): void {
    if (locked) {
      this.phase = 'playing';
      this.menu.hideMain();
      this.shop.close();
      this.hud.show(true);
      this.hud.renderHotbar();
      if (!this.greeted && this.state.stats.uses === 0) {
        this.greeted = true;
        this.hud.toast('👋 Dekati tumpukan, lalu klik kiri (tahan) untuk mengambil jerami helai demi helai.', 6000);
        setTimeout(() => this.hud.toast('🛒 Kumpulkan uang lalu tekan B untuk membeli alat yang lebih baik!', 6000), 2500);
      }
    } else if (this.phase === 'playing') {
      this.toMenu(true);
      void this.save();
    } else if (this.phase === 'shop' && !this.shop.isOpen) {
      this.toMenu(true);
    }
  }

  openShop(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'shop';
    this.input.unlock();
    this.shop.open();
    this.sfx.click();
  }

  closeShop(): void {
    if (!this.shop.isOpen) return;
    this.shop.close();
    this.phase = 'shop';
    this.input.lock();
    // jika pointer lock gagal (mis. browser menahan), tampilkan menu
    setTimeout(() => {
      if (!this.input.locked && this.phase === 'shop') this.toMenu(true);
    }, 400);
  }

  private onGlobalKey(e: KeyboardEvent): void {
    if (e.code === 'KeyB' || (e.code === 'Escape' && this.shop.isOpen)) {
      if (this.shop.isOpen) this.closeShop();
      else if (this.phase === 'playing') this.openShop();
    }
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      void this.save();
    } else if (this.hiddenAt) {
      this.applyOffline((Date.now() - this.hiddenAt) / 1000);
      this.hiddenAt = 0;
    }
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private showWin(): void {
    this.phase = 'win';
    this.input.unlock();
    this.hud.show(false);
    this.menu.hideMain();
    const s = this.state;
    this.menu.showWin({
      level: s.level,
      time: s.stats.timePlayed,
      collected: s.stats.collected,
      total: this.grid.initialTotal,
      earned: s.stats.earned,
      reward: 1 + s.level,
      gold: s.gold,
    });
  }

  async prestige(): Promise<void> {
    if (!this.state.won || this.phase === 'loading') return;
    this.sfx.ensure();
    this.menu.hideWin();
    this.phase = 'loading';
    const level = this.state.level + 1;
    this.menu.setLoading(`Menumpuk ${fmtInt(strawsForLevel(level))} helai jerami...`);
    await nextFrame();
    this.state = this.generateRun(level, randomSeed(), this.state);
    await this.buildWorld();
    this.chunks!.buildAll();
    await this.save();
    this.menu.setLoading(null);
    this.toMenu(false);
    this.hud.toast(`🌾 Tumpukan #${level + 1}: ${fmtInt(this.grid.initialTotal)} helai. Semoga beruntung!`, 5000);
  }

  async resetAll(): Promise<void> {
    this.menu.setLoading('Menghapus progres...');
    await deleteSave();
    await nextFrame();
    this.state = this.generateRun(0, randomSeed());
    await this.buildWorld();
    this.chunks!.buildAll();
    await this.save();
    this.menu.setLoading(null);
    this.menu.hideWin();
    this.toMenu(false);
  }

  async save(): Promise<void> {
    if (!this.state || this.phase === 'loading') return;
    const s = this.state;
    s.player = { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, yaw: this.player.yaw, pitch: this.player.pitch };
    await saveGame({ ...s, grid: this.grid.toData(true) });
  }

  // ───────────────────────── aksi pemain ─────────────────────────

  eyePos(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.player.pos.x, this.player.eyeY(), this.player.pos.z);
  }

  selectTool(id: string): void {
    if (!lvl(this.state, id) || ITEM_BY_ID[id]?.category !== 'tool') return;
    if (this.state.selectedTool === id) return;
    this.state.selectedTool = id;
    this.view.setTool(id);
    this.view.root.traverse((o) => o.layers.set(1));
    this.hud.renderHotbar();
    this.sfx.click();
  }

  private cycleTool(dir: number): void {
    const tools = ownedTools(this.state);
    if (tools.length < 2) return;
    const i = tools.findIndex((t) => t.id === this.state.selectedTool);
    this.selectTool(tools[(i + dir + tools.length) % tools.length].id);
  }

  private cycleConsumable(): void {
    const owned = CONSUMABLES.filter((c) => lvl(this.state, c.id) > 0);
    if (!owned.length) {
      this.state.selectedConsumable = null;
      this.hud.renderConsumable();
      return;
    }
    const i = owned.findIndex((c) => c.id === this.state.selectedConsumable);
    this.state.selectedConsumable = owned[(i + 1) % owned.length].id;
    this.hud.renderConsumable();
    this.sfx.click();
  }

  buy(id: string, qty = 1): boolean {
    const def = ITEM_BY_ID[id];
    const s = this.state;
    if (!def) return false;
    const owned = lvl(s, id);
    if (owned >= def.max) return false;
    qty = Math.max(1, Math.min(qty, def.max - owned));
    const price = bulkPrice(def, s, qty);
    const gold = def.category === 'prestige';
    if ((gold ? s.gold : s.money) < price) {
      this.sfx.error();
      this.hud.toast(gold ? 'Jarum Emas tidak cukup 📍' : `Uang tidak cukup (butuh ${fmtMoney(price)})`, 2000);
      return false;
    }
    if (gold) s.gold -= price;
    else s.money -= price;
    s.owned[id] = owned + qty;
    this.sfx.ding();
    this.afterPurchase(def, qty);
    this.shop.render();
    this.hud.renderHotbar();
    this.saveTimer = Math.max(this.saveTimer, AUTOSAVE_SECONDS - 2);
    return true;
  }

  private afterPurchase(def: ItemDef, qty: number): void {
    const s = this.state;
    switch (def.category) {
      case 'tool':
        this.selectTool(def.id);
        this.hud.toast(`${def.icon} ${def.name} siap dipakai!`);
        break;
      case 'automator':
        this.automators?.sync();
        this.hud.toast(`${def.icon} +${qty} ${def.name}`);
        break;
      case 'consumable':
        if (!s.selectedConsumable || !lvl(s, s.selectedConsumable)) s.selectedConsumable = def.id;
        break;
      case 'detector':
        if (def.id === 'nenek') this.hud.toast(this.detection.grandmaHint(), 8000);
        else if (def.id === 'drone_scan') s.drone.timer = 3;
        else this.hud.toast(`${def.icon} ${def.name} aktif!`);
        break;
      case 'upgrade':
        if (def.id === 'jetpack') this.player.fuel = jetFuel(s);
        break;
      case 'prestige':
        this.applyStartPerks(s, false);
        break;
    }
  }

  /** Tambahkan helai yang terkumpul → uang. */
  gain(straws: number, moneyRate: number, source: 'tool' | 'crit' | 'blast' | 'auto'): void {
    if (straws <= 0) return;
    const s = this.state;
    const money = straws * moneyMult(s) * moneyRate;
    s.money += money;
    s.stats.earned += money;
    s.stats.collected += straws;
    s.allTime.collected += straws;
    this.hud.addIncome(money);
    if (source === 'auto') return;
    if (source === 'blast') {
      this.hud.pop(`💥 +${fmtShort(straws)} 🌾 +${fmtMoney(money)}`, 'blast');
      return;
    }
    this.popStraws += straws;
    this.popMoney += money;
    if (source === 'crit') this.popCrit = true;
  }

  private useTool(hit: RayHit): void {
    const s = this.state;
    const def = ITEM_BY_ID[s.selectedTool];
    const t = def.tool!;
    this.toolCooldown = 1 / (t.rate * toolRateMult(s));
    let amount = Math.max(1, Math.round(t.amount * amountMult(s)));
    const crit = Math.random() < critChance(s);
    if (crit) amount *= critMult(s);
    const c = this.tmp2.copy(this.dir).multiplyScalar(Math.min(t.radius, 0.25)).add(hit.point);
    const taken = this.grid.takeSphere(c.x, c.y, c.z, t.radius, amount);
    this.view.use();
    if (taken <= 0) return;
    s.stats.uses++;
    this.gain(taken, 1, crit ? 'crit' : 'tool');
    this.particles.burst(hit.point.x, hit.point.y, hit.point.z, Math.min(40, 2 + Math.ceil(Math.sqrt(taken) * 1.5)), 1.5 + t.radius, 2);
    this.sfx.rustle(Math.min(1, t.radius / 2));
    if (crit) this.sfx.crit();
  }

  private useConsumable(): void {
    const s = this.state;
    const id = s.selectedConsumable;
    if (!id || lvl(s, id) <= 0) {
      this.hud.toast('Tidak ada konsumabel. Beli di toko [B] 💣', 2000);
      this.sfx.error();
      return;
    }
    const def = ITEM_BY_ID[id];
    const c = def.consumable!;
    s.owned[id]--;
    if (c.kind === 'buff') {
      s.buffs[c.buff!] = (s.buffs[c.buff!] ?? 0) + (c.duration ?? 60);
      this.hud.toast(`${def.icon} ${def.name} diminum! (${c.duration} dtk)`);
      this.sfx.ding();
    } else {
      const eye = this.eyePos(new THREE.Vector3());
      const big = SKY_KINDS.has(c.kind);
      // bom raksasa bisa dibidik jauh (dijatuhkan dari langit), bom biasa dilempar
      const hit = raycastGrid(this.grid, eye, this.dir, big ? 220 : 26);
      let to: THREE.Vector3;
      if (hit.kind !== 'none') to = hit.point.clone();
      else if (big) {
        const flat = this.flatDir(new THREE.Vector3());
        to = this.surfacePoint(eye.x + flat.x * 40, eye.z + flat.z * 40);
      } else to = eye.clone().addScaledVector(this.dir, 18);
      to.y = Math.max(0.2, to.y);
      if (c.kind === 'orbital') {
        // tidak ada yang dilempar: satelit langsung membidik
        this.detonate(def, to);
        this.sfx.charge(1.6);
        this.hud.toast('🛰️ Satelit mengunci target... batang tungsten meluncur dari orbit!', 3500);
      } else if (DIRECT_KINDS.has(c.kind)) {
        this.detonate(def, to);
      } else if (c.kind === 'asteroid') {
        const from = to.clone().add(new THREE.Vector3(-260, 430, 150));
        const dur = 5.5;
        this.effects.throwObject(id, from, to, () => this.detonate(def, to), { dur, arc: 0, spin: false });
        this.sfx.whistle(dur, 0.1);
        this.sfx.roar(dur);
        this.hud.toast('🌑 Asteroid raksasa memasuki atmosfer... TIDAK ADA TEMPAT BERSEMBUNYI!', 5000);
      } else if (big) {
        // dijatuhkan dari langit tepat di titik bidikan (rudal MIRV melepas hulu ledak di udara)
        const at = c.kind === 'mirv' ? to.clone().setY(to.y + 55) : to;
        const from = at.clone().add(new THREE.Vector3(-6, 70, 3));
        const dur = 2.6;
        this.effects.throwObject(id, from, at, () => this.detonate(def, at), { dur, arc: 0, spin: false });
        this.sfx.whistle(dur);
        this.hud.toast(`${def.icon} ${def.name} meluncur dari langit... LARI SEKARANG!`, 3500);
      } else {
        const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
        const from = eye.clone().addScaledVector(this.dir, 0.5).addScaledVector(right, 0.3);
        from.y -= 0.2;
        this.effects.throwObject(id, from, to, () => this.detonate(def, to));
        this.sfx.whoosh();
      }
      this.view.use();
    }
    if (lvl(s, id) <= 0) this.cycleConsumable();
    this.hud.renderConsumable();
  }

  private detonate(def: ItemDef, p: THREE.Vector3): void {
    const c = def.consumable!;
    const r = c.radius ?? 1;
    switch (c.kind) {
      case 'blast':
        this.blast(p, r);
        break;
      case 'cluster': {
        this.blast(p, r);
        const n = c.count ?? 6;
        const spread = c.spread ?? 4;
        const from = p.clone().setY(p.y + 0.5);
        const down = new THREE.Vector3(0, -1, 0);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
          const d = spread * (0.45 + Math.random() * 0.55);
          // jatuhkan ke permukaan jerami (atau tanah) di bawah titik sebaran
          const top = new THREE.Vector3(p.x + Math.cos(a) * d, p.y + spread, p.z + Math.sin(a) * d);
          const hit = raycastGrid(this.grid, top, down, top.y + 1);
          const to = hit.kind === 'hay' ? hit.point.clone() : top.clone().setY(0.2);
          this.effects.throwObject('bomblet', from, to, () => this.blast(to, r), {
            dur: 0.35 + Math.random() * 0.35,
            arc: 1.5 + Math.random() * 1.5,
          });
        }
        break;
      }
      case 'drill': {
        // ledakan beruntun lurus ke bawah sampai dasar
        const step = r * 1.1;
        const n = Math.ceil(p.y / step) + 1;
        for (let k = 0; k < n; k++) {
          const q = p.clone().setY(Math.max(0.3, p.y - k * step));
          this.effects.after(k * 0.13, () => this.blast(q, r, k > 0));
        }
        break;
      }
      case 'napalm':
        this.napalmFire(p, r, c.duration ?? 5);
        break;
      case 'nuke':
        this.nukeBlast(p, r);
        break;
      case 'mirv':
        this.mirvStrike(p, c);
        break;
      case 'orbital':
        this.orbitalStrike(p, c);
        break;
      case 'antimatter':
        this.antimatterBlast(p, r);
        break;
      case 'blackhole':
        this.blackHoleBomb(p, r, c.duration ?? 7);
        break;
      case 'asteroid':
        this.asteroidImpact(p, r);
        break;
      case 'carpet':
        this.carpetBomb(p, c);
        break;
      case 'storm':
        this.thunderStorm(p, c);
        break;
      case 'ufo':
        this.ufoAbduction(p, r, c.duration ?? 6);
        break;
      case 'asteroids':
        this.asteroidShower(p, c);
        break;
      case 'supernova':
        this.supernova(p, r);
        break;
      case 'bigbang':
        this.bigBang();
        break;
      case 'fan': {
        const taken = this.grid.takeExposedLayer(p.x, p.y, p.z, r, 0.6);
        this.particles.burst(p.x, p.y + 0.5, p.z, 160, 7, 4);
        this.sfx.whoosh();
        this.gain(taken, BLAST_MONEY_RATE, 'blast');
        break;
      }
    }
  }

  /** Satu ledakan bola radius `r` di `p`. `quiet` = tanpa dorongan pemain (ledakan susulan). Mengembalikan jumlah helai. */
  blast(p: THREE.Vector3, r: number, quiet = false): number {
    const taken = this.grid.takeSphere(p.x, p.y, p.z, r, Infinity);
    this.effects.flash(p, r * 1.6);
    if (r >= 6) this.effects.flash(p, r * 2.4, 0xff6a1a);
    this.particles.burst(p.x, p.y, p.z, Math.min(220, 30 + r * 40), 3 + r * 2, 3 + r);
    this.sfx.boom(r);
    const d = this.eyePos(this.tmp).distanceTo(p);
    this.effects.shake = Math.max(this.effects.shake, Math.max(0, 1 - d / (r * 6)) * Math.min(1, r / 2));
    if (!quiet && d < r + 1.5) this.knockback(p, 6, 5);
    this.gain(taken, BLAST_MONEY_RATE, 'blast');
    return taken;
  }

  /** `quiet` = tanpa toast & tanpa dentuman nuklir penuh (hulu ledak MIRV susulan). */
  private nukeBlast(p: THREE.Vector3, r: number, quiet = false): number {
    // Kawah setengah bola berpusat di tanah tepat di bawah titik jatuh (meratakan dari dasar
    // sampai puncak), plus bola di titik jatuh untuk tumpukan yang lebih tinggi dari radiusnya.
    let taken = this.grid.carveSphere(p.x, 0, p.z, r);
    if (p.y > r * 0.5) taken += this.grid.carveSphere(p.x, p.y, p.z, r * 0.6);
    this.particles.burst(p.x, p.y, p.z, 220, 30, 24);
    if (quiet) this.sfx.boom(14);
    else this.sfx.nuke();
    const d = this.eyePos(this.tmp).distanceTo(p);
    this.effects.nuke(p, Math.max(0.5, Math.min(2, 2.2 - d / (r * 4))), Math.min(7, r / 14));
    this.blindingFlash(p, 120);
    if (d < r * 1.5) this.knockback(p, 26 * (1 - d / (r * 1.5)) + 6, 14);
    // bom raksasa dibayar penuh, tidak dipotong BLAST_MONEY_RATE
    this.gain(taken, 1, 'blast');
    if (!quiet) this.hud.toast(`☢️ KABOOOM! ${fmtInt(taken)} helai jerami lenyap dalam sekejap.`, 5000);
    return taken;
  }

  /** Kilatan layar penuh, lebih terang bila dekat & menghadap ledakan. */
  private blindingFlash(p: THREE.Vector3, falloff: number, tint?: 'violet' | 'cosmic'): void {
    const eye = this.eyePos(this.tmp);
    const d = eye.distanceTo(p);
    const facing = this.tmp2.copy(p).sub(eye).normalize().dot(this.dir);
    this.hud.nukeFlash(Math.max(0.35, Math.min(1, 1.3 - d / falloff)) * (0.6 + 0.4 * Math.max(0, facing)), tint);
  }

  /** Arah hadap pemain di bidang datar (ternormalisasi). */
  private flatDir(out: THREE.Vector3): THREE.Vector3 {
    out.set(this.dir.x, 0, this.dir.z);
    if (out.lengthSq() < 1e-4) out.set(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    return out.normalize();
  }

  /** Titik permukaan jerami (atau tanah) tepat di bawah (x, z). */
  private surfacePoint(x: number, z: number): THREE.Vector3 {
    const top = new THREE.Vector3(x, this.grid.sy * CELL + 2, z);
    const hit = raycastGrid(this.grid, top, DOWN, top.y + 1);
    return hit.kind === 'hay' ? hit.point.clone() : top.setY(0.2);
  }

  /** Rudal MIRV pecah di udara: hulu ledak menyebar & masing-masing jadi ledakan nuklir. */
  private mirvStrike(p: THREE.Vector3, c: ConsumableSpec): void {
    const n = c.count ?? 6;
    const r = c.radius ?? 30;
    const spread = c.spread ?? 70;
    this.effects.flash(p, 14, 0xffe0a0);
    this.sfx.boom(4);
    this.sfx.whistle(1.6, 0.05);
    let total = 0;
    let left = n;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      // satu di tengah, sisanya melingkar
      const a = a0 + (i / Math.max(1, n - 1)) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const d = i === 0 ? 0 : spread * (0.75 + Math.random() * 0.25);
      const to = this.surfacePoint(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
      to.y = Math.max(0.2, to.y);
      this.effects.throwObject('warhead', p, to, () => {
        total += this.nukeBlast(to, r, i > 0);
        if (--left === 0) this.hud.toast(`🚀 ${n} hulu ledak menghantam! ${fmtInt(total)} helai jerami menguap.`, 5000);
      }, { dur: 1.2 + i * 0.22, arc: 4 + Math.random() * 4, spin: false });
    }
  }

  /** Serangan orbital: sinar bidik merah berderet, lalu batang tungsten menghantam satu per satu. */
  private orbitalStrike(p: THREE.Vector3, c: ConsumableSpec): void {
    const n = c.count ?? 9;
    const r = c.radius ?? 24;
    const len = c.spread ?? 240;
    const fwd = this.flatDir(new THREE.Vector3());
    const lock = 1.6;
    const gap = 0.32;
    let total = 0;
    for (let k = 0; k < n; k++) {
      const off = -len / 2 + (k * len) / Math.max(1, n - 1);
      const q = this.surfacePoint(p.x + fwd.x * off, p.z + fwd.z * off);
      const fire = lock + k * gap;
      this.effects.beam(q.x, q.z, 0, 320, 0xff2a2a, 0.35, fire + 0.35, 0.9, true);
      this.effects.after(fire, () => {
        this.effects.throwObject('rod', q.clone().setY(q.y + 300), q, () => {
          total += this.rodImpact(q, r);
          if (k === n - 1) this.hud.toast(`🛰️ Serangan orbital selesai! ${fmtInt(total)} helai jerami lenyap.`, 5000);
        }, { dur: 0.35, arc: 0, spin: false });
      });
    }
  }

  /** Satu batang tungsten: lubang silinder sampai tanah + kawah setengah bola. */
  private rodImpact(q: THREE.Vector3, r: number): number {
    const shaft = r * 0.62;
    const taken = this.grid.carve(q.x, q.z, r, (d) => (d <= shaft ? [0, 1e4] : [0, Math.sqrt(r * r - d * d)]));
    this.effects.beam(q.x, q.z, 0, 260, 0xdfeaff, shaft, 0.9, 0.9);
    this.effects.flash(q, r * 2.6, 0xfff0d0);
    this.effects.flash(q.clone().setY(1), r * 3.2, 0xff8a3a);
    this.effects.shockRing(q.clone().setY(0), r * 3, 1.6);
    this.particles.burst(q.x, q.y, q.z, 160, 22, 26);
    this.sfx.boom(16);
    const d = this.eyePos(this.tmp).distanceTo(q);
    this.effects.shake = Math.max(this.effects.shake, Math.max(0.25, 1.6 - d / 150));
    if (d < r * 1.5) this.knockback(q, 22, 12);
    this.gain(taken, 1, 'blast');
    return taken;
  }

  /** Antimateri: inti mengisap cahaya sebentar, lalu semua jerami dalam bola musnah. */
  private antimatterBlast(p: THREE.Vector3, r: number): void {
    const charge = 1.1;
    this.effects.antimatter(p, r, charge);
    this.sfx.charge(charge);
    this.effects.after(charge, () => {
      const taken = this.grid.carveSphere(p.x, p.y, p.z, r);
      this.sfx.nuke();
      this.blindingFlash(p, 160, 'violet');
      this.effects.shockRing(p.clone().setY(0), r * 1.8, 2.4, 0xd9b8ff);
      this.effects.rumble(1.8);
      if (this.eyePos(this.tmp).distanceTo(p) < r * 1.3) this.knockback(p, 18, 10);
      this.gain(taken, 1, 'blast');
      this.hud.toast(`🔮 ANIHILASI! ${fmtInt(taken)} helai jerami berubah jadi cahaya murni.`, 5000);
    });
  }

  /** Lubang hitam melayang di atas titik jatuh, menyedot jerami makin lama makin luas. */
  private blackHoleBomb(p: THREE.Vector3, r: number, dur: number): void {
    const center = p.clone().setY(p.y + 6);
    let total = 0;
    let prev = 0;
    let ticks = 0;
    const eat = (taken: number) => {
      total += taken;
      this.gain(taken, 1, 'auto');
    };
    this.sfx.drone(dur);
    this.hud.toast('🕳️ Lubang hitam terbuka! Menjauh — dia lapar...', 4000);
    this.effects.blackHole(center, r, dur, (cur) => {
      // tiap tick cukup kulit bola yang baru; sekali per detik sapu penuh untuk jerami yang runtuh ke dalam
      if (ticks++ % 5 === 0) {
        eat(this.grid.carveSphere(center.x, center.y, center.z, cur));
      } else eat(this.grid.carveShell(center.x, center.y, center.z, prev, cur));
      prev = cur;
      this.effects.shake = Math.max(this.effects.shake, 0.35);
      // pemain ikut tertarik bila berada dalam jangkauan
      const pull = this.tmp.copy(center).sub(this.player.pos);
      const d = pull.length();
      if (d < cur * 1.2 && d > 3) this.player.vel.add(pull.normalize().multiplyScalar(3.5 * (1 - d / (cur * 1.2)) + 0.8));
    }, () => {
      eat(this.grid.carveSphere(center.x, center.y, center.z, r));
      this.effects.flash(center, 40, 0xc9a0ff);
      this.effects.shockRing(center.clone().setY(0), r * 1.5, 1.8, 0xc9a0ff);
      this.sfx.boom(18);
      this.effects.rumble(1.2);
      this.hud.pop(`🕳️ +${fmtShort(total)} 🌾 +${fmtMoney(total * moneyMult(this.state))}`, 'blast');
      this.hud.toast(`🕳️ Lubang hitam runtuh. ${fmtInt(total)} helai jerami tertelan selamanya.`, 5000);
    });
  }

  /**
   * Asteroid menghantam: kawah setengah bola raksasa dari tanah.
   * `quiet` = bagian dari hujan asteroid (tanpa toast & dentuman nuklir, didorong hanya bila dekat).
   */
  private asteroidImpact(p: THREE.Vector3, r: number, quiet = false): number {
    const taken = this.grid.carve(p.x, p.z, r, (d) => [0, Math.sqrt(Math.max(0, r * r - d * d))]);
    this.particles.burst(p.x, p.y, p.z, 220, 45, 40);
    if (!quiet) this.sfx.nuke();
    this.sfx.boom(30);
    this.effects.nuke(p.clone().setY(0), 2, Math.min(5.5, r / 35));
    this.effects.shockRing(p.clone().setY(0), r * 2.4, 3.5, 0xffd9a0);
    this.effects.shockRing(p.clone().setY(0), r * 1.3, 2.2);
    const d = this.eyePos(this.tmp).distanceTo(p);
    if (quiet) this.blindingFlash(p, r * 3);
    else this.hud.nukeFlash(1);
    if (!quiet || d < r * 2) this.knockback(p, Math.max(8, 34 * (1 - d / (r * 2))), 18);
    this.gain(taken, 1, quiet ? 'auto' : 'blast');
    if (!quiet) this.hud.toast(`🌑 DAMPAK ASTEROID! ${fmtInt(taken)} helai jerami terhapus dari muka bumi.`, 6000);
    return taken;
  }

  /** Tinggi permukaan jerami (dunia) di (x, z), 0 bila kolomnya kosong. */
  private groundY(x: number, z: number): number {
    return (this.grid.topY(this.grid.cellX(x), this.grid.cellZ(z)) + 1) * CELL;
  }

  /** Pop & toast ringkasan untuk serangan yang uangnya dikumpulkan diam-diam ('auto') selama berlangsung. `#` = jumlah helai. */
  private strikeSummary(icon: string, total: number, rate: number, msg: string): void {
    this.hud.pop(`${icon} +${fmtShort(total)} 🌾 +${fmtMoney(total * moneyMult(this.state) * rate)}`, 'blast');
    this.hud.toast(`${icon} ${msg.replace('#', fmtInt(total))}`, 5000);
  }

  /** Napalm: cipratan api, lalu api menjalar melebar & melahap jerami lapis demi lapis (uang dipotong seperti bom biasa). */
  private napalmFire(p: THREE.Vector3, r: number, dur: number): void {
    const r0 = 2;
    let total = this.grid.carveSphere(p.x, p.y, p.z, r0);
    this.gain(total, BLAST_MONEY_RATE, 'auto');
    this.effects.flash(p, 6, 0xff7a1a);
    this.particles.burst(p.x, p.y, p.z, 90, 6, 5);
    this.sfx.boom(2);
    this.sfx.fire(dur);
    this.effects.napalm(p, r, dur, (x, z) => this.groundY(x, z));
    const step = 0.25;
    const n = Math.round(dur / step);
    let prev = r0;
    for (let k = 1; k <= n; k++) {
      this.effects.after(k * step, () => {
        // radius sama dengan api visual (NapalmFire.radius); sesekali sapu penuh untuk jerami yang runtuh ke dalam
        const cur = r0 + (r - r0) * easeOut(k / n);
        const taken = k % 4 === 0 ? this.grid.carveSphere(p.x, p.y, p.z, cur) : this.grid.carveShell(p.x, p.y, p.z, prev, cur);
        prev = cur;
        total += taken;
        this.gain(taken, BLAST_MONEY_RATE, 'auto');
        if (this.tmp.copy(this.player.pos).sub(p).setY(0).length() < cur * 0.9) this.knockback(p, 4, 3);
        if (k === n) this.strikeSummary('🌋', total, BLAST_MONEY_RATE, 'Api napalm padam. # helai jerami jadi abu.');
      });
    }
  }

  /** Ledakan bom udara (bom karpet): bola penuh, uang 100%, tanpa pop per ledakan. */
  private skyBlast(q: THREE.Vector3, r: number): number {
    const taken = this.grid.carveSphere(q.x, q.y, q.z, r);
    this.effects.flash(q, r * 2.2);
    this.effects.flash(q, r * 3, 0xff6a1a);
    this.particles.burst(q.x, q.y, q.z, 60, 4 + r * 1.5, 4 + r);
    this.sfx.boom(r);
    const d = this.eyePos(this.tmp).distanceTo(q);
    this.effects.shake = Math.max(this.effects.shake, Math.max(0, 1 - d / (r * 8)) * 1.2);
    if (d < r + 2) this.knockback(q, 10, 7);
    this.gain(taken, 1, 'auto');
    return taken;
  }

  /** Pesawat pembom melintas searah bidikan & menjatuhkan bom berderet di sepanjang garis. */
  private carpetBomb(p: THREE.Vector3, c: ConsumableSpec): void {
    const n = c.count ?? 24;
    const r = c.radius ?? 7;
    const len = c.spread ?? 160;
    const fwd = this.flatDir(new THREE.Vector3());
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const alt = this.grid.sy * CELL + 45;
    const margin = 220;
    const speed = 85;
    const at = (off: number, y: number) => new THREE.Vector3(p.x + fwd.x * off, y, p.z + fwd.z * off);
    const flight = (len + margin * 2) / speed;
    this.effects.bomber(at(-len / 2 - margin, alt), at(len / 2 + margin, alt), flight);
    this.sfx.flyby(flight);
    this.hud.toast('🛩️ Pesawat pembom mendekat dari belakangmu... bom karpet dijatuhkan!', 4000);
    // bom dilepas sebelum titik sasaran lalu meluncur maju sambil jatuh
    const lead = 35;
    let total = 0;
    let left = n;
    for (let k = 0; k < n; k++) {
      const off = -len / 2 + (k * len) / Math.max(1, n - 1);
      const jitter = (Math.random() - 0.5) * 12;
      const q = this.surfacePoint(p.x + fwd.x * off + side.x * jitter, p.z + fwd.z * off + side.z * jitter);
      q.y = Math.max(0.2, q.y);
      const drop = at(off - lead, alt - 3).addScaledVector(side, jitter);
      this.effects.after((off - lead + len / 2 + margin) / speed, () => {
        this.effects.throwObject('carpet_bomb', drop, q, () => {
          total += this.skyBlast(q, r);
          if (--left === 0) this.strikeSummary('🛩️', total, 1, 'Bom karpet selesai! # helai jerami rata dengan tanah.');
        }, { dur: 1.4, arc: 0, spin: false });
      });
    }
  }

  /** Awan badai menggantung di atas target & menyambarkan petir acak yang membolongi jerami sampai tanah. */
  private thunderStorm(p: THREE.Vector3, c: ConsumableSpec): void {
    const n = c.count ?? 36;
    const r = c.radius ?? 4.5;
    const spread = c.spread ?? 55;
    const dur = c.duration ?? 6;
    const alt = this.grid.sy * CELL + 40;
    const gather = 1.5;
    const cloud = this.effects.stormCloud(new THREE.Vector3(p.x, alt, p.z), spread, gather + dur);
    this.sfx.roar(gather);
    this.hud.toast('🌩️ Langit menggelap... awan badai berkumpul di atas tumpukan!', 4000);
    let total = 0;
    let left = n;
    for (let k = 0; k < n; k++) {
      this.effects.after(gather + ((k + Math.random()) / n) * dur, () => {
        const a = Math.random() * Math.PI * 2;
        const d = spread * Math.sqrt(Math.random());
        const q = this.surfacePoint(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
        q.y = Math.max(0.2, q.y);
        this.effects.lightning(new THREE.Vector3(q.x + (Math.random() - 0.5) * 20, alt - 4, q.z + (Math.random() - 0.5) * 20), q);
        cloud.flicker(q.x, q.z);
        const taken = this.grid.carve(q.x, q.z, r, () => [0, 1e4]);
        this.effects.flash(q, r * 4, 0xcfe0ff);
        this.particles.burst(q.x, q.y, q.z, 50, 6, 8);
        const dist = this.eyePos(this.tmp).distanceTo(q);
        this.sfx.thunder(Math.max(0.3, Math.min(1, 1.2 - dist / 200)));
        this.effects.shake = Math.max(this.effects.shake, Math.max(0.1, 0.8 - dist / 150));
        if (this.tmp.copy(this.player.pos).sub(q).setY(0).length() < r + 1.5) this.knockback(q, 12, 8);
        total += taken;
        this.gain(taken, 1, 'auto');
        if (--left === 0) this.strikeSummary('🌩️', total, 1, 'Badai reda. # helai jerami tersambar petir.');
      });
    }
  }

  /** Piring terbang menyedot kolom jerami dari puncak sampai tanah. */
  private ufoAbduction(p: THREE.Vector3, r: number, dur: number): void {
    // puncak tertinggi di bawah sinar (beberapa sampel cukup; sisanya disapu bersih di akhir)
    let top = this.groundY(p.x, p.z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      top = Math.max(top, this.groundY(p.x + Math.cos(a) * r * 0.7, p.z + Math.sin(a) * r * 0.7));
    }
    top += 2;
    const hover = new THREE.Vector3(p.x, top + 30, p.z);
    let total = 0;
    this.sfx.ufo(dur + 3.4);
    this.hud.toast('👽 Piring terbang datang... jangan berdiri di bawah sinarnya!', 4000);
    this.effects.ufo(hover, r, dur, (frac) => {
      const level = top * (1 - frac);
      const taken = this.grid.carve(p.x, p.z, r, () => [level, 1e4]);
      total += taken;
      this.gain(taken, 1, 'auto');
      this.effects.shake = Math.max(this.effects.shake, 0.12);
      // pemain di bawah sinar ikut terangkat
      const pl = this.player.pos;
      if ((pl.x - p.x) ** 2 + (pl.z - p.z) ** 2 < r * r && pl.y < hover.y - 12) this.player.vel.y = Math.max(this.player.vel.y, 5);
    }, () => {
      const taken = this.grid.carve(p.x, p.z, r, () => [0, 1e4]);
      total += taken;
      this.gain(taken, 1, 'auto');
      this.strikeSummary('👽', total, 1, 'UFO pergi membawa # helai jerami. Semoga mereka suka.');
    });
  }

  /** Beberapa asteroid menghantam berurutan di sekitar target; yang terakhir tepat di tengah. */
  private asteroidShower(p: THREE.Vector3, c: ConsumableSpec): void {
    const n = c.count ?? 7;
    const r = c.radius ?? 120;
    const spread = c.spread ?? 200;
    const fall = 4.5;
    const gap = 0.85;
    this.sfx.roar(fall + gap * (n - 1));
    this.sfx.whistle(fall, 0.08);
    this.hud.toast('☄️ HUJAN ASTEROID! Langit dipenuhi batu membara...', 5000);
    let total = 0;
    let left = n;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const a = a0 + (i / Math.max(1, n - 1)) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const d = last ? 0 : spread * (0.6 + Math.random() * 0.4);
      const to = this.surfacePoint(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
      to.y = Math.max(0.2, to.y);
      const from = to.clone().add(new THREE.Vector3(-260 + Math.random() * 80, 430, 150 + Math.random() * 80));
      this.effects.after(i * gap, () => {
        this.effects.throwObject('hujan_asteroid', from, to, () => {
          if (i === 0) this.sfx.nuke();
          total += this.asteroidImpact(to, r, true);
          if (--left === 0) this.strikeSummary('☄️', total, 1, 'Hujan asteroid berakhir. # helai jerami terhapus.');
        }, { dur: fall, arc: 0, spin: false });
      });
    }
  }

  /**
   * Pengikisan untuk ledakan bintang yang mengembang (supernova / Big Bang): tiap tick hanya kulit bola yang baru
   * supaya beban terbagi ke banyak frame. Di akhir, jerami yang sempat runtuh ke dalam disapu dengan `span`
   * per cincin selebar `reach / 6` di frame yang berbeda (sapuan penuh tumpukan raksasa bisa ±300 ms).
   */
  private stellarCarve(center: THREE.Vector3, reach: number, span: (d: number) => number[], onTotal: (total: number) => void) {
    let prev = 0;
    let total = 0;
    const eat = (taken: number) => {
      total += taken;
      this.gain(taken, 1, 'auto');
    };
    return {
      tick: (R: number) => {
        if (R <= prev) return;
        eat(this.grid.carveShell(center.x, center.y, center.z, prev, R));
        prev = R;
      },
      end: () => {
        const parts = 6;
        for (let i = 0; i < parts; i++) {
          const a = (reach * i) / parts;
          const b = (reach * (i + 1)) / parts;
          this.effects.after(i * 0.05, () => {
            eat(this.grid.carve(center.x, center.z, b, (d) => (d < a ? null : span(d))));
            if (i === parts - 1) onTotal(total);
          });
        }
      },
    };
  }

  /** Bintang mini membengkak jadi raksasa merah, runtuh, lalu meledak sebagai supernova. */
  private supernova(p: THREE.Vector3, r: number): void {
    const center = new THREE.Vector3(p.x, this.groundY(p.x, p.z) + 45, p.z);
    const charge = 3.4;
    const carve = this.stellarCarve(
      center,
      r,
      (d) => {
        const h = Math.sqrt(Math.max(0, r * r - d * d));
        return [center.y - h, center.y + h];
      },
      (total) => this.strikeSummary('🌟', total, 1, 'SUPERNOVA! # helai jerami menjadi debu bintang.'),
    );
    this.sfx.charge(charge);
    this.sfx.drone(charge);
    this.hud.toast('🌟 Bintang mini menyala di atas tumpukan... ia mulai membengkak!', 4000);
    this.effects.stellar(center, r, {
      charge, expand: 2.4, coreFrom: 0xfff4c0, coreTo: 0xff4a1a, coreSize: 26,
      shell: 0x8fd0ff, halo: 0xffb070, ring: 0xff7ad0, light: 0xfff0d0, stars: 500, motes: false, rainbow: false,
    }, () => {
      this.sfx.nuke();
      this.sfx.boom(40);
      this.blindingFlash(center, 500);
      this.effects.rumble(2.2);
      this.effects.shockRing(center.clone().setY(0), r * 1.3, 3, 0xbfe4ff);
      const d = this.eyePos(this.tmp).distanceTo(center);
      if (d < r * 1.2) this.knockback(center, 30 * (1 - d / (r * 1.2)) + 8, 16);
    }, carve.tick, carve.end);
  }

  /** Big Bang: singularitas di atas pusat tumpukan meledak & menghapus SELURUH tumpukan, sebesar apa pun. */
  private bigBang(): void {
    const center = new THREE.Vector3(0, this.groundY(0, 0) + 30, 0);
    const halfW = (Math.max(this.grid.sx, this.grid.sz) * CELL) / 2;
    const rMax = Math.hypot(halfW, halfW, Math.max(center.y, this.grid.sy * CELL - center.y)) + 2;
    const charge = 4;
    const carve = this.stellarCarve(
      center,
      rMax,
      () => [0, 1e4],
      (total) => this.strikeSummary('🌌', total, 1, 'Alam semesta lahir kembali. # helai jerami kembali ke ketiadaan — tinggal jarumnya!'),
    );
    this.sfx.charge(charge);
    this.sfx.drone(charge);
    this.hud.toast('🌌 Ruang & waktu melengkung... semua cahaya tersedot ke satu titik.', 4500);
    this.effects.stellar(center, rMax, {
      charge, expand: 3.2, coreFrom: 0xffffff, coreTo: 0x9a6bff, coreSize: 9,
      shell: 0xffffff, halo: 0xffffff, ring: 0x9fd8ff, light: 0xffffff, stars: 900, motes: true, rainbow: true,
    }, () => {
      this.sfx.nuke();
      this.sfx.boom(50);
      this.hud.nukeFlash(1, 'cosmic');
      this.effects.rumble(2.6);
      this.effects.shockRing(new THREE.Vector3(0, 0, 0), rMax, 3.5, 0xe0d0ff);
      this.knockback(center, 14, 14);
    }, carve.tick, carve.end);
  }

  private knockback(from: THREE.Vector3, force: number, up: number): void {
    const push = this.tmp.copy(this.player.pos).sub(from).setY(0);
    if (push.lengthSq() < 1e-6) push.set(1, 0, 0);
    push.normalize().multiplyScalar(force);
    this.player.vel.x += push.x;
    this.player.vel.z += push.z;
    this.player.vel.y = Math.max(this.player.vel.y, up);
  }

  /** Mulai animasi mengambil jarum. */
  collectNeedle(source: 'click' | 'magnet'): void {
    if (this.needleCollecting || this.state.won) return;
    this.needleCollecting = true;
    this.collectT = 0;
    this.sfx.sparkle();
    if (source === 'magnet') this.hud.toast('🧲 Magnetmu menarik sesuatu dari dalam jerami...!', 3000);
  }

  private win(): void {
    const s = this.state;
    s.won = true;
    this.needleCollecting = false;
    this.events.reset();
    this.needle.group.visible = false;
    const reward = 1 + s.level;
    s.gold += reward;
    s.allTime.needlesFound++;
    if (s.allTime.bestTime === null || s.stats.timePlayed < s.allTime.bestTime) s.allTime.bestTime = s.stats.timePlayed;
    this.sfx.win();
    void this.save();
    this.showWin();
  }

  // ───────────────────────── loop ─────────────────────────

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (!this.state || this.phase === 'loading') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const s = this.state;
    const playing = this.phase === 'playing' && this.input.locked;

    if (playing) this.handleInput();

    // Pemain
    this.player.update(dt, playing ? this.input : null, {
      speedMult: speedMult(s),
      jumpMult: jumpMult(s),
      hasJetpack: lvl(s, 'jetpack') > 0,
      maxFuel: jetFuel(s),
      boundsRadius: (this.env?.fenceRadius ?? 60) - 0.6,
    });
    if (this.player.jetting) {
      this.jetSoundT -= dt;
      if (this.jetSoundT <= 0) {
        this.jetSoundT = 0.09;
        this.sfx.jet();
        this.particles.burst(this.player.pos.x, this.player.pos.y + 0.6, this.player.pos.z, 1, 0.5, -2);
      }
    }
    this.player.applyCamera(this.camera);
    if (this.effects.shake > 0) {
      const k = this.effects.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
    }
    this.camera.getWorldDirection(this.dir);

    // Fisika runtuh
    this.collapseAcc += dt;
    if (this.collapseAcc >= 1 / COLLAPSE_HZ) {
      this.collapseAcc = 0;
      this.grid.tickCollapse(900);
      this.sinkNeedle();
      this.treasures.tick();
    }

    this.updateNeedle(dt, playing);
    if (!s.won && (this.phase === 'playing' || this.phase === 'shop')) {
      this.events.update(dt);
      const body = this.tmp.copy(this.player.pos);
      body.y += 0.9;
      this.pickups.update(dt, body, Math.max(1.6, this.detection.magnetRange), playing);
    }
    if (!s.won) {
      this.automators?.update(dt);
      this.detection.update(dt);
      s.stats.timePlayed += dt;
    }

    // Buff
    for (const k of Object.keys(s.buffs)) {
      s.buffs[k] -= dt;
      if (s.buffs[k] <= 0) delete s.buffs[k];
    }

    // Pop teks uang (digabung agar tidak spam)
    this.popT -= dt;
    if (this.popT <= 0 && this.popStraws > 0) {
      this.popT = 0.1;
      this.hud.pop(`+${fmtShort(this.popStraws)} 🌾  +${fmtMoney(this.popMoney)}`, this.popCrit ? 'crit' : '');
      this.popStraws = 0;
      this.popMoney = 0;
      this.popCrit = false;
    }

    // Dunia
    s.dayTime = DAY_TIME;
    this.env?.update(dt, s.dayTime);
    this.flashlight.intensity = this.flashlightOn ? 40 : 0;
    this.chunks?.update(this.player.pos.x, this.player.pos.y, this.player.pos.z, 6);
    this.straws?.update(dt, this.player.pos.x, this.player.eyeY(), this.player.pos.z);
    this.particles.update(dt);
    this.effects.update(dt);
    this.view.update(dt, this.player.speed, playing && this.input.leftDown);

    this.renderer.shadowMap.needsUpdate = true;

    this.hud.update(dt);
    this.shop.update(dt);

    this.saveTimer += dt;
    if (this.saveTimer >= AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      void this.save();
    }

    // Render: dunia, lalu alat di tangan di atasnya (tanpa menembus jerami)
    this.renderer.autoClear = true;
    this.camera.layers.set(0);
    this.renderer.render(this.scene, this.camera);
    // background berwarna memaksa clear, jadi dimatikan sementara untuk pass kedua
    const bg = this.scene.background;
    this.scene.background = null;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.camera.layers.set(1);
    this.renderer.shadowMap.needsUpdate = false;
    this.renderer.render(this.scene, this.camera);
    this.camera.layers.set(0);
    this.scene.background = bg;

    this.input.endFrame();
  }

  private handleInput(): void {
    const inp = this.input;
    const s = this.state;
    this.player.look(inp.mouseDX, inp.mouseDY, this.settings.sensitivity);

    const tools = ownedTools(s);
    for (let i = 0; i < 10; i++) {
      if (inp.hit(`Digit${(i + 1) % 10}`) && tools[i]) this.selectTool(tools[i].id);
    }
    if (inp.wheel) this.cycleTool(inp.wheel);
    if (inp.hit('KeyG')) this.useConsumable();
    if (inp.hit('KeyT')) this.cycleConsumable();
    if (inp.hit('KeyF')) {
      if (lvl(s, 'senter')) {
        this.flashlightOn = !this.flashlightOn;
        this.sfx.click();
      } else this.hud.toast('Kamu belum punya Senter 🔦 (beli di toko)', 2000);
    }
    if (inp.hit('KeyX')) this.detection.toggleXray();
    if (inp.hit('KeyP')) this.detection.sonarPing();
    if (inp.hit('KeyM')) this.detection.toggleMute();
    if (DEBUG && inp.hit('KeyK')) {
      s.money += 1_000_000 * (1 + s.level);
      s.gold += 5;
      this.hud.toast('[debug] +uang +5 jarum emas');
    }
    if (DEBUG && inp.hit('KeyE')) this.events.triggerNext();
  }

  /** Jarum ikut turun jika jerami di bawahnya habis. */
  private sinkNeedle(): void {
    const n = this.state.needle;
    let moved = false;
    while (n.y > 0 && this.grid.count(n.x, n.y - 1, n.z) < this.grid.solidMin * 0.5) {
      n.y--;
      moved = true;
    }
    if (moved && !this.needleCollecting) this.needle.placeAt(this.grid, n);
  }

  private updateNeedle(dt: number, playing: boolean): void {
    const s = this.state;
    const n = s.needle;
    const g = this.grid;
    this.needleExposed = !s.won && !g.isSolid(n.x, n.y, n.z) && g.isExposed(n.x, n.y, n.z);

    if (this.needleExposed && !n.revealed) {
      n.revealed = true;
      this.sfx.sparkle();
      const d = this.eyePos(this.tmp).distanceTo(this.needle.world);
      this.hud.toast(
        d < 12 ? '✨ Ada sesuatu yang berkilau di dekatmu...!' : `✨ Sesuatu berkilau terlihat di sisi ${compassWord(this.needle.world.x, this.needle.world.z)} tumpukan!`,
        5000,
      );
    }

    if (this.needleCollecting) {
      this.collectT += dt;
      const target = this.eyePos(this.tmp).addScaledVector(this.dir, 0.4);
      this.needle.flyTowards(target, Math.min(1, this.collectT / 0.8));
      if (this.collectT >= 1) this.win();
      this.hud.setTarget('📍 Jarum ditemukan!', 'needle');
      return;
    }
    if (s.won) {
      this.needle.group.visible = false;
      return;
    }
    this.needle.update(dt, this.needleExposed, DEBUG || this.detection.xrayVisible);

    // Bidikan
    if (!playing) {
      this.effects.setAim(null, 0);
      return;
    }
    const eye = this.eyePos(this.tmp);
    const r = reach(s);
    raycastGrid(g, eye, this.dir, r, this.hit);
    let needleHit = false;
    if (this.needleExposed) {
      const t = raySphere(eye, this.dir, this.needle.world, 0.25);
      if (t <= r && (this.hit.kind !== 'hay' || t <= this.hit.dist + 0.75)) needleHit = true;
    }
    let pick: Pickup | null = null;
    if (!needleHit) {
      const ph = this.pickups.raycast(eye, this.dir, r + 1);
      if (ph && (this.hit.kind !== 'hay' || ph.dist <= this.hit.dist + 0.5)) pick = ph.p;
    }
    const tool = ITEM_BY_ID[s.selectedTool].tool!;
    if (needleHit) {
      this.hud.setTarget('📍 JARUM! Klik untuk mengambil', 'needle');
      this.effects.setAim(null, 0);
      if (this.input.leftClicked) this.collectNeedle('click');
    } else if (pick) {
      this.hud.setTarget(`${pick.opts.icon} ${pick.opts.label} — klik untuk ambil`, 'needle');
      this.effects.setAim(null, 0);
      if (this.input.leftClicked) this.pickups.collect(pick);
    } else if (this.hit.kind === 'hay') {
      this.hud.setTarget(`🌾 ${fmtInt(g.count(this.hit.x, this.hit.y, this.hit.z))} helai`, 'active');
      this.effects.setAim(this.hit.point, tool.radius);
    } else {
      this.hud.setTarget('', '');
      this.effects.setAim(null, 0);
    }

    this.toolCooldown -= dt;
    if (!needleHit && !pick && this.input.leftDown && this.hit.kind === 'hay' && this.toolCooldown <= 0) {
      this.useTool(this.hit);
    }
  }
}
