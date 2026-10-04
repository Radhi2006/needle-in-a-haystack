import { fmtInt, fmtMoney, fmtShort } from '../core/format';
import type { Game } from '../core/Game';
import { CATEGORY_LABEL, ITEMS, type Category, type ItemDef } from '../items/catalog';
import { automatorMult, bulkPrice, lvl } from '../items/stats';

const $ = (id: string) => document.getElementById(id)!;
const TABS: Category[] = ['tool', 'detector', 'upgrade', 'automator', 'consumable', 'prestige'];

export class Shop {
  isOpen = false;
  private tab: Category = 'tool';
  private refreshT = 0;

  constructor(private game: Game) {
    $('shop-close').addEventListener('click', () => this.game.closeShop());
    $('shop-tabs').addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (!t) return;
      this.tab = t.dataset.tab as Category;
      this.game.sfx.click();
      this.render();
    });
    const grid = $('shop-grid');
    grid.addEventListener('click', (e) => this.onClick(e, false));
    grid.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onClick(e, true);
    });
  }

  private onClick(e: MouseEvent, ten: boolean): void {
    const btn = (e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
    if (!btn) return;
    const id = btn.dataset.id!;
    const act = btn.dataset.act!;
    if (act === 'equip') {
      this.game.selectTool(id);
      this.render();
      return;
    }
    let qty = Number(btn.dataset.qty ?? 1);
    if ((ten || e.shiftKey) && qty === 1) {
      const def = ITEMS.find((i) => i.id === id)!;
      if (def.category === 'automator' || def.category === 'consumable') qty = 10;
    }
    this.game.buy(id, qty);
  }

  open(): void {
    this.isOpen = true;
    $('shop').classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.isOpen = false;
    $('shop').classList.add('hidden');
  }

  render(): void {
    $('shop-tabs').innerHTML = TABS.map(
      (t) => `<button class="tab ${t === this.tab ? 'on' : ''}" data-tab="${t}">${CATEGORY_LABEL[t]}</button>`,
    ).join('');
    const items = ITEMS.filter((i) => i.category === this.tab);
    $('shop-grid').innerHTML = items.map((d) => this.card(d)).join('');
    this.updateWallet();
  }

  private updateWallet(): void {
    const s = this.game.state;
    $('shop-money').textContent = fmtMoney(s.money);
    $('shop-gold').textContent = `📍 ${fmtInt(s.gold)} Jarum Emas`;
  }

  private card(d: ItemDef): string {
    const s = this.game.state;
    const owned = lvl(s, d.id);
    const gold = d.category === 'prestige';
    const wallet = gold ? s.gold : s.money;
    const fmtP = (p: number) => (gold ? `📍 ${fmtInt(p)}` : fmtMoney(p));
    const maxed = owned >= d.max;
    let lvlText = '';
    let stats = '';
    let btns = '';
    const buyBtn = (qty: number, label?: string) => {
      const p = bulkPrice(d, s, qty);
      return `<button class="btn buy ${gold ? 'gold' : ''} ${wallet >= p ? '' : 'cant'}" data-act="buy" data-id="${d.id}" data-qty="${qty}">${label ?? 'Beli'} ${fmtP(p)}</button>`;
    };

    switch (d.category) {
      case 'tool': {
        const t = d.tool!;
        stats = `🌾 ${fmtShort(t.amount)} helai/ambil · ${t.rate}×/dtk · area ${String(t.radius).replace('.', ',')} m`;
        if (owned) {
          const sel = s.selectedTool === d.id;
          btns = `<button class="btn" data-act="equip" data-id="${d.id}" ${sel ? 'disabled' : ''}>${sel ? '✓ Dipakai' : 'Pakai'}</button>`;
        } else btns = buyBtn(1);
        break;
      }
      case 'detector':
        if (d.id === 'nenek') {
          lvlText = owned ? `Sudah bertanya ${owned}×` : '';
          btns = buyBtn(1, 'Tanya');
        } else btns = owned ? `<button class="btn" disabled>✓ Dimiliki</button>` : buyBtn(1);
        break;
      case 'upgrade':
      case 'prestige':
        lvlText = d.max > 1 ? `Level ${owned}/${d.max}` : '';
        btns = maxed ? `<button class="btn" disabled>${d.max > 1 ? 'MAKS' : '✓ Dimiliki'}</button>` : buyBtn(1);
        break;
      case 'automator': {
        const a = d.auto!;
        const each = a.rate * automatorMult(s, d);
        lvlText = `Dimiliki: ${fmtInt(owned)}`;
        stats = `🌾 ${fmtShort(each)} helai/dtk per unit${owned ? ` · total ${fmtShort(each * owned)}/dtk` : ''}`;
        btns = buyBtn(1) + buyBtn(10, '×10');
        break;
      }
      case 'consumable':
        lvlText = `Punya: ${fmtInt(owned)}`;
        btns = buyBtn(1) + buyBtn(10, '×10');
        break;
    }
    const cls = ['card', owned ? 'owned' : '', d.category === 'tool' && s.selectedTool === d.id ? 'selected' : ''].join(' ');
    return `<div class="${cls}">
      <div class="card-head"><div class="card-icon">${d.icon}</div><div><div class="card-name">${d.name}</div><div class="card-lvl">${lvlText}</div></div></div>
      <div class="card-desc">${d.desc}</div>
      ${stats ? `<div class="card-stats">${stats}</div>` : ''}
      <div class="card-btns">${btns}</div>
    </div>`;
  }

  /** Perbarui status mampu-beli tanpa render ulang penuh. */
  update(dt: number): void {
    if (!this.isOpen) return;
    this.refreshT -= dt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.25;
    this.updateWallet();
    const s = this.game.state;
    document.querySelectorAll<HTMLButtonElement>('#shop-grid button[data-act="buy"]').forEach((b) => {
      const d = ITEMS.find((i) => i.id === b.dataset.id)!;
      const p = bulkPrice(d, s, Number(b.dataset.qty ?? 1));
      b.classList.toggle('cant', (d.category === 'prestige' ? s.gold : s.money) < p);
    });
  }
}
