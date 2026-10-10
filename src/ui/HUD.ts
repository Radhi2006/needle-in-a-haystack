import { Vector3 } from 'three';
import { compassWord, fmtDec, fmtInt, fmtMoney, fmtShort } from '../core/format';
import type { Game } from '../core/Game';
import { CONSUMABLES, ITEM_BY_ID } from '../items/catalog';
import { automationRate, jetFuel, lvl, ownedTools } from '../items/stats';

const $ = (id: string) => document.getElementById(id)!;

const BUFF_LABEL: Record<string, string> = {
  speed: '⚡ Kecepatan',
  rate: '☕ Kopi Petani',
  money: '🤑 Uang ×2',
  luck: '🌈 Hoki',
  golden: '🌟 Jam Emas ×3',
  diskon: '🛒 Diskon 50%',
};

export class HUD {
  private root = $('hud');
  private textT = 0;
  private incomeBuckets: number[] = [0, 0, 0, 0, 0];
  private incomeT = 0;
  private incomeRate = 0;
  private lastPop = 0;
  private fpsFrames = 0;
  private fpsT = 0;
  private tmp = new Vector3();

  constructor(private game: Game) {}

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  /** Kilatan putih menyilaukan satu layar penuh (ledakan nuklir). strength 0..1 */
  nukeFlash(strength: number): void {
    const el = $('nuke-flash');
    el.style.setProperty('--peak', strength.toFixed(2));
    el.classList.remove('on');
    void el.offsetWidth; // paksa reflow agar animasi bisa diulang
    el.classList.add('on');
  }

  /** Spanduk event acak di atas layar. `icon` null = sembunyikan. */
  setEvent(icon: string | null, title = '', desc = '', frac = 0): void {
    const el = $('event-banner');
    el.classList.toggle('hidden', !icon);
    if (!icon) return;
    if ($('ev-icon').textContent !== icon) $('ev-icon').textContent = icon;
    if ($('ev-title').textContent !== title) $('ev-title').textContent = title;
    if ($('ev-desc').textContent !== desc) $('ev-desc').textContent = desc;
    ($('ev-bar') as HTMLElement).style.width = `${frac * 100}%`;
  }

  addIncome(money: number): void {
    this.incomeBuckets[this.incomeBuckets.length - 1] += money;
  }

  toast(msg: string, ms = 3500): void {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 5) box.firstElementChild!.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 450);
    }, ms);
  }

  pop(text: string, cls = ''): void {
    const now = performance.now();
    if (now - this.lastPop < 60 && !cls) return;
    this.lastPop = now;
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.style.marginLeft = `${(Math.random() - 0.5) * 60}px`;
    $('pops').appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  setTarget(text: string, mode: '' | 'active' | 'needle'): void {
    const t = $('target-info');
    if (t.textContent !== text) t.textContent = text;
    const ch = $('crosshair');
    ch.classList.toggle('active', mode === 'active');
    ch.classList.toggle('needle', mode === 'needle');
  }

  renderHotbar(): void {
    const s = this.game.state;
    const tools = ownedTools(s);
    const bar = $('hotbar');
    bar.innerHTML = '';
    tools.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'slot' + (t.id === s.selectedTool ? ' sel' : '');
      el.innerHTML = `<span class="k">${i < 9 ? i + 1 : i === 9 ? 0 : ''}</span>${t.icon}`;
      if (t.id === s.selectedTool) {
        const name = document.createElement('div');
        name.className = 'slot-name';
        name.textContent = t.name;
        el.appendChild(name);
      }
      bar.appendChild(el);
    });
    this.renderConsumable();
  }

  renderConsumable(): void {
    const s = this.game.state;
    const box = $('consumable');
    const id = s.selectedConsumable;
    const def = id ? ITEM_BY_ID[id] : null;
    const kinds = CONSUMABLES.filter((c) => lvl(s, c.id) > 0).length;
    if (!def || lvl(s, def.id) <= 0) {
      box.innerHTML = `<span class="ci">🎒</span><span class="dim">Tidak ada<br/>konsumabel</span>`;
      return;
    }
    box.innerHTML = `<span class="ci">${def.icon}</span><span><b>${def.name}</b> ×${fmtInt(lvl(s, def.id))}<br/><span class="dim">[G] pakai${kinds > 1 ? ' · [T] ganti' : ''}</span></span>`;
  }

  update(dt: number): void {
    const g = this.game;
    const s = g.state;
    const det = g.detection;

    // FPS
    this.fpsFrames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      $('fps').textContent = g.settings.showFps ? `${Math.round(this.fpsFrames / this.fpsT)} FPS` : '';
      this.fpsFrames = 0;
      this.fpsT = 0;
    }

    // Penghasilan rata-rata 5 detik
    this.incomeT += dt;
    if (this.incomeT >= 1) {
      this.incomeT -= 1;
      this.incomeRate = this.incomeBuckets.reduce((a, b) => a + b, 0) / this.incomeBuckets.length;
      this.incomeBuckets.shift();
      this.incomeBuckets.push(0);
    }

    // Kompas tiap frame (halus)
    const compass = $('d-compass');
    const hasCompass = lvl(s, 'kompas') > 0;
    compass.classList.toggle('hidden', !hasCompass);
    if (hasCompass) $('d-compass-arrow').style.transform = `rotate(${det.compassDeg - 90}deg)`;

    this.textT -= dt;
    if (this.textT > 0) return;
    this.textT = 0.1;

    const grid = g.grid;
    $('hs-level').textContent = `🌾 Tumpukan #${s.level + 1}`;
    $('hs-remaining').textContent = fmtInt(grid.remaining);
    $('hs-total').textContent = fmtInt(grid.initialTotal);
    ($('hs-bar') as HTMLElement).style.width = `${(1 - grid.remaining / grid.initialTotal) * 100}%`;
    $('hs-collected').textContent = fmtInt(s.stats.collected);
    $('hs-money').textContent = fmtMoney(s.money);
    $('hs-income').textContent = `${fmtMoney(this.incomeRate)}/dtk`;
    const ar = automationRate(s);
    $('hs-auto-row').classList.toggle('hidden', ar <= 0);
    $('hs-auto').textContent = `${fmtShort(ar)} helai/dtk`;
    $('hs-gold-row').classList.toggle('hidden', s.gold <= 0 && lvl(s, 'p_warisan') === 0);
    $('hs-gold').textContent = fmtInt(s.gold);
    $('hs-treasure').textContent = `${g.treasures.found}/${g.treasures.total}`;
    $('golden-vignette').classList.toggle('on', (s.buffs.golden ?? 0) > 0);

    // Detektor
    const range = det.detectorRange;
    $('d-detector').classList.toggle('hidden', range <= 0);
    if (range > 0) {
      ($('d-signal') as HTMLElement).style.width = `${det.signal * 100}%`;
      $('d-mute').textContent = det.muted ? '🔇' : '';
      $('d-dist').textContent =
        det.signal <= 0 ? `tidak ada sinyal (${range} m)` : det.approxDist != null ? `± ${fmtDec(det.approxDist)} m` : `sinyal ${Math.round(det.signal * 100)}%`;
    }

    const thermal = det.thermalText();
    $('d-thermal').classList.toggle('hidden', !thermal);
    if (thermal) $('d-thermal').textContent = thermal;

    // Status alat aktif (sonar, sinar-x, magnet, drone, senter)
    const lines: string[] = [];
    if (lvl(s, 'sonar')) lines.push(det.sonarCooldown > 0 ? `🔊 Sonar: ${Math.ceil(det.sonarCooldown)} dtk` : '🔊 Sonar siap [P]');
    if (lvl(s, 'sinar_x')) lines.push(`🥽 Sinar-X: ${det.xrayOn ? 'AKTIF' : 'mati'} [X]`);
    if (det.magnetRange) lines.push(`🧲 Magnet aktif (${fmtDec(det.magnetRange)} m)`);
    if (lvl(s, 'drone_scan')) lines.push(s.drone.scans ? `🛸 Zona r ${fmtDec(s.drone.radius)} m · scan ${Math.ceil(s.drone.timer)} dtk` : `🛸 Drone memindai... ${Math.ceil(s.drone.timer)} dtk`);
    if (lvl(s, 'peta_harta')) {
      const near = g.treasures.nearest(g.eyePos(this.tmp));
      lines.push(near ? `🗺️ Harta terdekat: ${fmtDec(near.dist)} m · ${compassWord(near.dx, near.dz)}` : '🗺️ Semua harta sudah ditemukan!');
    }
    if (lvl(s, 'senter')) lines.push(`🔦 Senter: ${g.flashlightOn ? 'nyala' : 'mati'} [F]`);
    const tools = $('d-tools');
    tools.classList.toggle('hidden', !lines.length);
    tools.innerHTML = lines.join('<br/>');

    // Jetpack
    const hasJet = lvl(s, 'jetpack') > 0;
    $('d-fuel').classList.toggle('hidden', !hasJet);
    if (hasJet) ($('d-fuel-bar') as HTMLElement).style.width = `${(g.player.fuel / jetFuel(s)) * 100}%`;

    // Buff
    const buffs = Object.entries(s.buffs).filter(([, t]) => t > 0);
    $('d-buffs').innerHTML = buffs.map(([b, t]) => `<div class="buff">${BUFF_LABEL[b] ?? b} · ${Math.ceil(t)} dtk</div>`).join('');
  }
}
