const nf = new Intl.NumberFormat('id-ID');
const nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

const UNITS: [number, string][] = [
  [1e15, 'Kd'],
  [1e12, 'T'],
  [1e9, 'M'],
  [1e6, 'jt'],
];

/** 1234567 → "1.234.567" */
export function fmtInt(n: number): string {
  return nf.format(Math.floor(n));
}

/** Angka ringkas ala Indonesia: 12.500.000 → "12,5 jt". Di bawah sejuta ditulis penuh. */
export function fmtShort(n: number): string {
  const abs = Math.abs(n);
  for (const [v, s] of UNITS) {
    if (abs >= v) return `${nf2.format(n / v)} ${s}`;
  }
  return fmtInt(n);
}

export function fmtMoney(n: number): string {
  return `Rp ${fmtShort(n)}`;
}

export function fmtTime(sec: number): string {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} jam ${m} mnt`;
  if (m > 0) return `${m} mnt ${s} dtk`;
  return `${s} dtk`;
}

/** Desimal dengan koma: 5.5 → "5,5" */
export function fmtDec(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

const DIRS = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];

/** Arah mata angin dari vektor XZ (utara = -Z). */
export function compassWord(dx: number, dz: number): string {
  const ang = Math.atan2(dx, -dz); // 0 = utara, +PI/2 = timur
  const idx = Math.round(((ang / (Math.PI * 2)) * 8 + 8)) % 8;
  return DIRS[idx];
}
