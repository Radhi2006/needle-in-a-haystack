import * as THREE from 'three';
import { Automators } from '../automation/Automators';
import { Sfx } from '../audio/sfx';
import { Detection } from '../detection/Detection';
import { CONSUMABLES, ITEM_BY_ID, TOOLS, type ItemDef } from '../items/catalog';
import {
  amountMult, automationRate, bulkPrice, critChance, critMult, jetFuel, jumpMult, lvl,
  moneyMult, ownedTools, reach, speedMult, toolRateMult,
} from '../items/stats';
import { PlayerController } from '../player/PlayerController';
import { ViewModel } from '../player/ViewModel';
import { deleteSave, loadGame, loadSettings, saveGame } from '../save/SaveManager';
import { HUD } from '../ui/HUD';
import { Menu } from '../ui/Menu';
import { Shop } from '../ui/Shop';
import { ChunkManager } from '../world/ChunkManager';
import { Effects } from '../world/Effects';
import { Environment } from '../world/Environment';
import { createHayMaterial } from '../world/hayMaterial';
import { HaystackGrid } from '../world/HaystackGrid';
import { NeedleView } from '../world/Needle';
import { Particles } from '../world/Particles';
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
  readonly hud: HUD;
  readonly shop: Shop;
  readonly menu: Menu;
  readonly detection: Detection;
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
      const hit = raycastGrid(this.grid, eye, this.dir, 26);
      const to = hit.kind !== 'none' ? hit.point.clone() : eye.clone().addScaledVector(this.dir, 18);
      to.y = Math.max(0.2, to.y);
      if (c.kind === 'nuke') {
        // dijatuhkan dari langit tepat di titik bidikan
        const from = to.clone().add(new THREE.Vector3(-6, 70, 3));
        const dur = 2.6;
        this.effects.throwObject(id, from, to, () => this.detonate(def, to), { dur, arc: 0, spin: false });
        this.sfx.whistle(dur);
        this.hud.toast('☢️ Bom nuklir meluncur dari langit... LARI SEKARANG!', 3500);
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
      case 'nuke':
        this.nukeBlast(p, r);
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

  /** Satu ledakan bola radius `r` di `p`. `quiet` = tanpa dorongan pemain (ledakan susulan). */
  private blast(p: THREE.Vector3, r: number, quiet = false): void {
    const taken = this.grid.takeSphere(p.x, p.y, p.z, r, Infinity);
    this.effects.flash(p, r * 1.6);
    if (r >= 6) this.effects.flash(p, r * 2.4, 0xff6a1a);
    this.particles.burst(p.x, p.y, p.z, Math.min(220, 30 + r * 40), 3 + r * 2, 3 + r);
    this.sfx.boom(r);
    const d = this.eyePos(this.tmp).distanceTo(p);
    this.effects.shake = Math.max(this.effects.shake, Math.max(0, 1 - d / (r * 6)) * Math.min(1, r / 2));
    if (!quiet && d < r + 1.5) this.knockback(p, 6, 5);
    this.gain(taken, BLAST_MONEY_RATE, 'blast');
  }

  private nukeBlast(p: THREE.Vector3, r: number): void {
    const taken = this.grid.takeSphere(p.x, p.y, p.z, r, Infinity);
    this.particles.burst(p.x, p.y, p.z, 220, 18, 14);
    this.sfx.nuke();
    const eye = this.eyePos(this.tmp);
    const d = eye.distanceTo(p);
    this.effects.nuke(p, Math.max(0.5, Math.min(2, 2.2 - d / 60)));
    // kilatan layar, lebih terang bila menghadap ledakan
    const facing = this.tmp2.copy(p).sub(eye).normalize().dot(this.dir);
    this.hud.nukeFlash(Math.max(0.35, Math.min(1, 1.3 - d / 120)) * (0.6 + 0.4 * Math.max(0, facing)));
    if (d < r * 2.5) this.knockback(p, 22 * (1 - d / (r * 2.5)) + 6, 12);
    this.gain(taken, BLAST_MONEY_RATE, 'blast');
    this.hud.toast(`☢️ KABOOOM! ${fmtInt(taken)} helai jerami lenyap dalam sekejap.`, 5000);
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
    }

    this.updateNeedle(dt, playing);
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
    const tool = ITEM_BY_ID[s.selectedTool].tool!;
    if (needleHit) {
      this.hud.setTarget('📍 JARUM! Klik untuk mengambil', 'needle');
      this.effects.setAim(null, 0);
      if (this.input.leftClicked) this.collectNeedle('click');
    } else if (this.hit.kind === 'hay') {
      this.hud.setTarget(`🌾 ${fmtInt(g.count(this.hit.x, this.hit.y, this.hit.z))} helai`, 'active');
      this.effects.setAim(this.hit.point, tool.radius);
    } else {
      this.hud.setTarget('', '');
      this.effects.setAim(null, 0);
    }

    this.toolCooldown -= dt;
    if (!needleHit && this.input.leftDown && this.hit.kind === 'hay' && this.toolCooldown <= 0) {
      this.useTool(this.hit);
    }
  }
}
