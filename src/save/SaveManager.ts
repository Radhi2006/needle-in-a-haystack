import { del, get, set } from 'idb-keyval';
import { SAVE_KEY, SAVE_VERSION, SETTINGS_KEY } from '../core/config';
import { DEFAULT_SETTINGS, type GameState, type Settings } from '../core/state';

/** Simpan progres ke IndexedDB (grid Uint8Array disimpan apa adanya, tanpa server). */
export async function saveGame(state: GameState): Promise<boolean> {
  try {
    await set(SAVE_KEY, { ...state, savedAt: Date.now() });
    return true;
  } catch (e) {
    console.warn('Gagal menyimpan', e);
    return false;
  }
}

export async function loadGame(): Promise<GameState | null> {
  try {
    const s = (await get(SAVE_KEY)) as GameState | undefined;
    if (!s || s.version !== SAVE_VERSION || !(s.grid?.counts instanceof Uint8Array)) return null;
    return s;
  } catch (e) {
    console.warn('Gagal memuat', e);
    return null;
  }
}

export async function deleteSave(): Promise<void> {
  try {
    await del(SAVE_KEY);
  } catch {
    /* abaikan */
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* abaikan */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* abaikan */
  }
}
