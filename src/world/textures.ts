import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

let glowTex: THREE.Texture | null = null;

/** Tekstur titik cahaya radial (untuk kilau jarum, ledakan, dsb). */
export function getGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,230,0.85)');
  grad.addColorStop(0.5, 'rgba(255,240,180,0.25)');
  grad.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // garis bintang
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(64, 4); g.lineTo(64, 124);
  g.moveTo(4, 64); g.lineTo(124, 64);
  g.stroke();
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let smokeTex: THREE.Texture | null = null;

/** Gumpalan asap putih lembut (diwarnai lewat warna sprite) untuk awan jamur. */
export function getSmokeTexture(): THREE.Texture {
  if (smokeTex) return smokeTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(777);
  // banyak gumpalan kecil bertumpuk → tepi bergelombang seperti kembang kol
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.7) * size * 0.26;
    const x = size / 2 + Math.cos(a) * d;
    const y = size / 2 + Math.sin(a) * d;
    const r = size * (0.1 + rnd() * 0.16);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const sh = Math.floor(205 + rnd() * 50);
    grad.addColorStop(0, `rgba(${sh},${sh},${sh},0.9)`);
    grad.addColorStop(0.6, `rgba(${sh},${sh},${sh},0.55)`);
    grad.addColorStop(1, `rgba(${sh},${sh},${sh},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  // pudarkan ke tepi supaya tidak ada sudut kotak
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size / 2);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, size, size);
  smokeTex = new THREE.CanvasTexture(c);
  smokeTex.colorSpace = THREE.SRGBColorSpace;
  return smokeTex;
}

let softGlowTex: THREE.Texture | null = null;

/** Cahaya radial lembut tanpa garis bintang (bola api). */
export function getSoftGlowTexture(): THREE.Texture {
  if (softGlowTex) return softGlowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.65, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  softGlowTex = new THREE.CanvasTexture(c);
  softGlowTex.colorSpace = THREE.SRGBColorSpace;
  return softGlowTex;
}

/** Tekstur teks sederhana untuk papan nama. */
export function makeTextTexture(text: string, bg: string, fg: string, w = 256, h = 96): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg;
  g.font = `bold ${Math.floor(h * 0.45)}px Fredoka, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const emojiTex = new Map<string, THREE.Texture>();

/** Emoji digambar ke kanvas (ikon harta karun, paket udara, kambing emas). */
export function getEmojiTexture(icon: string): THREE.Texture {
  const cached = emojiTex.get(icon);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '100px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  emojiTex.set(icon, t);
  return t;
}

let streakTex: THREE.Texture | null = null;

/** Garis-garis angin miring (dililitkan ke corong puting beliung agar putarannya terlihat). */
export function getStreakTexture(): THREE.Texture {
  if (streakTex) return streakTex;
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(4242);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 30 + rnd() * 90;
    const a = 0.15 + rnd() * 0.5;
    g.strokeStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    g.lineWidth = 1 + rnd() * 4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y - len * 0.18);
    g.stroke();
  }
  streakTex = new THREE.CanvasTexture(c);
  streakTex.wrapS = streakTex.wrapT = THREE.RepeatWrapping;
  streakTex.colorSpace = THREE.SRGBColorSpace;
  return streakTex;
}
