import { SAVE_VERSION } from './config';
import type { GridData } from '../world/HaystackGrid';
import type { CellPos } from '../world/HaystackGrid';

export interface RunStats {
  /** Helai yang dikumpulkan di tumpukan ini (pemain + otomatisasi). */
  collected: number;
  earned: number;
  timePlayed: number;
  uses: number;
}

export interface GameState {
  version: number;
  level: number;
  seed: number;
  money: number;
  /** Mata uang prestige. */
  gold: number;
  owned: Record<string, number>;
  selectedTool: string;
  selectedConsumable: string | null;
  /** Sisa detik buff aktif. */
  buffs: Record<string, number>;
  stats: RunStats;
  allTime: { collected: number; needlesFound: number; bestTime: number | null };
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  needle: CellPos & { revealed: boolean };
  won: boolean;
  drone: { radius: number; cx: number; cz: number; timer: number; scans: number };
  automatorAcc: Record<string, number>;
  dayTime: number;
  grid: GridData;
  savedAt: number;
}

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  sensitivity: number;
  volume: number;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  sensitivity: 1,
  volume: 0.7,
  showFps: false,
};

export function emptyStats(): RunStats {
  return { collected: 0, earned: 0, timePlayed: 0, uses: 0 };
}

export function newState(level: number, seed: number, grid: GridData, needle: CellPos, prev?: GameState): GameState {
  const owned: Record<string, number> = { tangan: 1 };
  if (prev) {
    for (const [id, lv] of Object.entries(prev.owned)) if (id.startsWith('p_')) owned[id] = lv;
  }
  return {
    version: SAVE_VERSION,
    level,
    seed,
    money: 0,
    gold: prev?.gold ?? 0,
    owned,
    selectedTool: 'tangan',
    selectedConsumable: null,
    buffs: {},
    stats: emptyStats(),
    allTime: prev?.allTime ?? { collected: 0, needlesFound: 0, bestTime: null },
    player: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
    needle: { ...needle, revealed: false },
    won: false,
    drone: { radius: 0, cx: 0, cz: 0, timer: 5, scans: 0 },
    automatorAcc: {},
    dayTime: 0.08,
    grid,
    savedAt: Date.now(),
  };
}
