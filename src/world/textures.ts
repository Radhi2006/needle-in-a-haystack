import * as THREE from 'three';

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
