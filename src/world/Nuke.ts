import * as THREE from 'three';
import { getSmokeTexture, getSoftGlowTexture } from './textures';

type Part = 'cap' | 'dome' | 'stem' | 'dust' | 'ring';

interface Puff {
  sprite: THREE.Sprite;
  part: Part;
  /** Sudut keliling. */
  a: number;
  /** Sudut penampang torus (cap) atau posisi vertikal 0..1 (stem). */
  b: number;
  /** Faktor jarak dari pusat 0..1. */
  f: number;
  size: number;
  spin: number;
}

const HOT = new THREE.Color(0xfff4c8);
const FIRE = new THREE.Color(0xff8c2e);
const EMBER = new THREE.Color(0xb2401c);
const SMOKE = new THREE.Color(0x6e5d50);
const DUST = new THREE.Color(0xc8a66e);
const VAPOR = new THREE.Color(0xf5f3ee);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);

/** heat 1 = putih panas → oranye → bara → 0 = asap. */
function heatColor(heat: number, out: THREE.Color): THREE.Color {
  const h = clamp01(heat);
  if (h > 0.66) return out.copy(FIRE).lerp(HOT, (h - 0.66) / 0.34);
  if (h > 0.33) return out.copy(EMBER).lerp(FIRE, (h - 0.33) / 0.33);
  return out.copy(SMOKE).lerp(EMBER, h / 0.33);
}

/**
 * Awan jamur nuklir: kilatan, bola api naik, batang asap, kepala jamur
 * yang menggulung (vortex torus), cincin kondensasi, debu di tanah, dan gelombang kejut.
 * Semua dianimasikan secara parametrik dari waktu `t`.
 */
export class MushroomCloud {
  readonly group = new THREE.Group();
  readonly duration = 12;
  t = 0;
  /** Posisi bola api saat ini (untuk cahaya). */
  readonly firePos = new THREE.Vector3();
  private puffs: Puff[] = [];
  private fireball: THREE.Sprite;
  private underGlow: THREE.Sprite;
  private flash: THREE.Sprite;
  private shockDome: THREE.Mesh;
  private shockRing: THREE.Mesh;
  private col = new THREE.Color();

  constructor(private readonly origin: THREE.Vector3, private readonly s = 1) {
    this.group.position.set(origin.x, 0, origin.z);
    const smoke = getSmokeTexture();
    const glow = getSoftGlowTexture();
    const add = (part: Part, n: number) => {
      for (let i = 0; i < n; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, transparent: true, depthWrite: false, opacity: 0 }));
        sprite.material.rotation = Math.random() * Math.PI * 2;
        this.group.add(sprite);
        this.puffs.push({
          sprite, part,
          a: (i / n) * Math.PI * 2 + Math.random() * 0.5,
          b: Math.random() * Math.PI * 2,
          f: Math.random(),
          size: 0.7 + Math.random() * 0.6,
          spin: (Math.random() - 0.5) * 0.4,
        });
      }
    };
    add('dust', 44);
    add('stem', 46);
    add('ring', 26);
    add('cap', 90);
    add('dome', 34);

    const glowSprite = (color: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      this.group.add(sp);
      return sp;
    };
    this.underGlow = glowSprite(0xff6a1a);
    this.fireball = glowSprite(0xffd27a);
    this.flash = glowSprite(0xffffff);

    this.shockDome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.shockRing = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 72),
      new THREE.MeshBasicMaterial({ color: 0xfff0d2, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.shockRing.rotation.x = -Math.PI / 2;
    this.shockRing.position.y = 0.15;
    this.group.add(this.shockDome, this.shockRing);
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.duration;
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const s = this.s;
    const by = this.origin.y;

    // Ketinggian & ukuran kepala jamur
    const rise = 1 - Math.exp(-t / 2.1);
    const capY = by + 4 * s + 44 * s * rise;
    const capR = s * (3 + 11 * easeOut(t / 4.5));
    const capr = s * (2 + 5.5 * easeOut(t / 3.5));
    const roll = t * 0.55;
    const fadeOut = clamp01((this.duration - t) / 4);
    const fadeIn = clamp01(t / 0.25);
    this.firePos.set(this.origin.x, capY, this.origin.z);

    for (const p of this.puffs) {
      const m = p.sprite.material;
      m.rotation += p.spin * dt;
      let x = 0, y = 0, z = 0, size = 1, alpha = 0;
      switch (p.part) {
        case 'cap': {
          const b = p.b - roll;
          const f = 0.35 + 0.65 * p.f;
          const rad = capR * (0.15 + 0.85 * p.f) + capr * f * Math.cos(b);
          x = Math.cos(p.a) * rad;
          z = Math.sin(p.a) * rad;
          y = capY + capr * f * Math.sin(b) * 0.7;
          size = capr * 1.7 * p.size;
          const heat = 1.25 - t / 3.2 - Math.sin(b) * 0.22 + (1 - p.f) * 0.35;
          heatColor(heat, this.col);
          alpha = 0.95 * fadeIn * fadeOut;
          break;
        }
        case 'dome': {
          // mengisi bagian atas tengah kepala jamur supaya tidak berlubang
          const rad = capR * 0.85 * Math.sqrt(p.f);
          x = Math.cos(p.a) * rad;
          z = Math.sin(p.a) * rad;
          y = capY + capr * (0.35 + 0.45 * (1 - p.f * p.f));
          size = capr * 1.6 * p.size;
          heatColor(1.05 - t / 3 - 0.15 * p.f, this.col);
          alpha = 0.95 * fadeIn * fadeOut;
          break;
        }
        case 'stem': {
          const v = (p.b / (Math.PI * 2) + t * 0.16) % 1;
          const grow = easeOut(t / 1.4);
          const top = (capY - by) * 0.94;
          const r = s * (2.6 + 3 * Math.pow(1 - v, 5) + 4 * Math.pow(v, 6)) * (0.4 + 0.6 * grow);
          x = Math.cos(p.a) * r * p.f;
          z = Math.sin(p.a) * r * p.f;
          y = by + v * top * grow;
          size = s * (4 + 3 * v) * p.size * (0.5 + 0.5 * grow);
          const heat = 1.1 - t / 2.6 + v * 0.35;
          heatColor(heat, this.col).lerp(DUST, clamp01(0.6 - v * 2) * clamp01(t / 2));
          alpha = 0.88 * fadeIn * fadeOut * Math.min(1, v * 6, (1 - v) * 5);
          break;
        }
        case 'dust': {
          const spread = 24 * s * (1 - Math.exp(-t / 1.1));
          const rad = spread * (0.55 + 0.45 * p.f);
          x = Math.cos(p.a) * rad;
          z = Math.sin(p.a) * rad;
          y = s * (0.6 + p.size * 1.8 * easeOut(t / 2));
          size = s * (2.5 + 5 * easeOut(t / 3)) * p.size;
          this.col.copy(DUST).lerp(SMOKE, clamp01(t / 8) * 0.5);
          alpha = 0.75 * fadeIn * fadeOut;
          break;
        }
        case 'ring': {
          // cincin kondensasi (awan Wilson) yang muncul sebentar di sekitar batang
          const k = (t - 0.7) / 3.2;
          const rad = s * (5 + 5 * easeOut(k)) * (0.9 + 0.2 * p.f);
          x = Math.cos(p.a) * rad;
          z = Math.sin(p.a) * rad;
          y = by + (capY - by) * 0.55;
          size = s * 3.2 * p.size;
          this.col.copy(VAPOR);
          alpha = k > 0 && k < 1 ? Math.sin(k * Math.PI) * 0.6 : 0;
          break;
        }
      }
      p.sprite.position.set(x, y, z);
      p.sprite.scale.setScalar(size);
      m.color.copy(this.col);
      m.opacity = alpha;
      p.sprite.visible = alpha > 0.01;
    }

    // Bola api di pusat kepala jamur, makin redup saat mendingin
    const fb = clamp01(1 - (t - 0.6) / 3.2);
    this.fireball.position.set(0, capY, 0);
    this.fireball.scale.setScalar(s * (8 + 26 * clamp01(t / 0.3)) * (0.45 + 0.55 * fb));
    this.fireball.material.opacity = fb;
    this.underGlow.position.set(0, capY - capr * 0.4, 0);
    this.underGlow.scale.setScalar(capR * 2.8);
    this.underGlow.material.opacity = 0.75 * clamp01(1 - t / 7) * fadeIn;

    // Kilatan putih menyilaukan di detik pertama
    const fl = clamp01(1 - t / 0.7);
    this.flash.position.set(0, by + 3 * s, 0);
    this.flash.scale.setScalar(s * 90 * (0.6 + 0.4 * fl));
    this.flash.material.opacity = fl * fl;

    // Gelombang kejut: kubah bening + cincin di tanah
    const dk = clamp01(t / 0.9);
    this.shockDome.scale.setScalar(Math.max(0.01, s * 34 * easeOut(dk)));
    (this.shockDome.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - dk);
    const rk = clamp01(t / 2);
    this.shockRing.scale.setScalar(Math.max(0.01, s * 60 * easeOut(rk)));
    (this.shockRing.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - rk);
  }

  /** Intensitas cahaya oranye yang menyinari sekitar (0..1). */
  lightLevel(): number {
    const t = this.t;
    if (t < 0.08) return t / 0.08;
    return Math.max(0, Math.exp(-(t - 0.08) / 0.5) * 0.7 + 0.3 * (1 - t / 6));
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      } else if (o instanceof THREE.Sprite) {
        o.material.dispose();
      }
    });
    this.group.clear();
  }
}
