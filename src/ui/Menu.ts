import { fmtInt, fmtMoney, fmtTime } from '../core/format';
import type { Game } from '../core/Game';
import { saveSettings } from '../save/SaveManager';

const $ = (id: string) => document.getElementById(id)!;

export interface WinInfo {
  level: number;
  time: number;
  collected: number;
  total: number;
  earned: number;
  reward: number;
  gold: number;
}

/** Menu utama / jeda, pengaturan, layar menang, layar muat. */
export class Menu {
  constructor(private game: Game) {
    $('btn-play').addEventListener('click', () => this.game.play());
    $('btn-settings').addEventListener('click', () => this.togglePanel('settings'));
    $('btn-help').addEventListener('click', () => this.togglePanel('help'));
    $('btn-prestige').addEventListener('click', () => void this.game.prestige());
    $('btn-reset').addEventListener('click', () => {
      if (confirm('Hapus SEMUA progres termasuk Jarum Emas? Tidak bisa dibatalkan.')) void this.game.resetAll();
    });

    const st = game.settings;
    const q = $('set-quality') as HTMLSelectElement;
    const sens = $('set-sens') as HTMLInputElement;
    const vol = $('set-vol') as HTMLInputElement;
    const fps = $('set-fps') as HTMLInputElement;
    q.value = st.quality;
    sens.value = String(st.sensitivity);
    vol.value = String(st.volume);
    fps.checked = st.showFps;
    const sync = () => {
      $('set-sens-val').textContent = `(${Number(sens.value).toFixed(1)})`;
      $('set-vol-val').textContent = `(${Math.round(Number(vol.value) * 100)}%)`;
    };
    sync();
    const apply = () => {
      st.quality = q.value as typeof st.quality;
      st.sensitivity = Number(sens.value);
      st.volume = Number(vol.value);
      st.showFps = fps.checked;
      sync();
      saveSettings(st);
      this.game.applySettings();
    };
    for (const el of [q, sens, vol, fps]) el.addEventListener('input', apply);
  }

  private togglePanel(id: 'settings' | 'help'): void {
    const other = id === 'settings' ? 'help' : 'settings';
    $(other).classList.add('hidden');
    $(id).classList.toggle('hidden');
    this.game.sfx.click();
  }

  showMain(resume: boolean): void {
    const s = this.game.state;
    $('menu').classList.remove('hidden');
    $('btn-play').textContent = resume ? '▶ Lanjutkan' : '▶ Main';
    $('menu-sub').textContent = `Temukan 1 jarum di antara ${fmtInt(this.game.grid.initialTotal)} helai jerami.`;
    const lines = [
      `Tumpukan #${s.level + 1} · sisa ${fmtInt(this.game.grid.remaining)} helai · ${fmtMoney(s.money)}`,
    ];
    if (s.allTime.needlesFound > 0) {
      lines.push(`📍 Jarum ditemukan: ${s.allTime.needlesFound} · Jarum Emas: ${fmtInt(s.gold)}`);
    }
    $('menu-stats').innerHTML = lines.join('<br/>');
  }

  hideMain(): void {
    $('menu').classList.add('hidden');
    $('settings').classList.add('hidden');
    $('help').classList.add('hidden');
  }

  showWin(w: WinInfo): void {
    $('win').classList.remove('hidden');
    const pct = ((w.collected / w.total) * 100).toFixed(2);
    $('win-stats').innerHTML = `
      <span>Tumpukan</span><b>#${w.level + 1}</b>
      <span>Waktu</span><b>${fmtTime(w.time)}</b>
      <span>Helai dikumpulkan</span><b>${fmtInt(w.collected)}</b>
      <span>Bagian tumpukan</span><b>${pct}%</b>
      <span>Total uang didapat</span><b>${fmtMoney(w.earned)}</b>`;
    $('win-reward').textContent = `+${w.reward} Jarum Emas 📍 (total ${fmtInt(w.gold)})`;
  }

  hideWin(): void {
    $('win').classList.add('hidden');
  }

  setLoading(text: string | null): void {
    $('loading').classList.toggle('hidden', text === null);
    if (text) $('loading-text').textContent = text;
  }
}
