/** Ukuran satu sel grid tumpukan (meter). */
export const CELL = 0.5;
/** Ukuran chunk mesh (dalam sel per sumbu). */
export const CHUNK = 16;
/** Ambang kepadatan (0..1) sebuah sel dianggap padat: ikut dirender sebagai permukaan & bisa diinjak. */
export const ISO = 0.35;

export const BASE_STRAWS = 10_000_000;
export const LEVEL_STRAW_GROWTH = 1.5;

export const GRAVITY = 20;
export const COLLAPSE_HZ = 15;
export const DAY_LENGTH = 600;
export const AUTOSAVE_SECONDS = 15;
/** Uang dari ledakan/kipas hanya sebagian (sisanya hancur). */
export const BLAST_MONEY_RATE = 0.5;

export const SAVE_KEY = 'nih-save-v1';
export const SAVE_VERSION = 1;
export const SETTINGS_KEY = 'nih-settings-v1';

export const DEBUG =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

/** Jumlah helai total untuk tumpukan ke-`level` (0 = tumpukan pertama). */
export function strawsForLevel(level: number): number {
  return Math.round(BASE_STRAWS * Math.pow(LEVEL_STRAW_GROWTH, level));
}

/**
 * Target helai per sel penuh. Naik pelan tiap level supaya tumpukan
 * raksasa di level tinggi tidak membuat grid terlalu besar.
 */
export function cellCapacityForLevel(level: number): number {
  return Math.min(230, Math.round(100 * Math.pow(1.2, level)));
}
