import * as THREE from 'three';
import { getEmojiTexture, getGlowTexture } from './textures';

export interface PickupOpts {
  pos: THREE.Vector3;
  icon: string;
  /** Nama yang tampil saat dibidik. */
  label: string;
  size?: number;
  glow?: number;
  /** Pilar cahaya tinggi supaya terlihat dari jauh. */
  beacon?: boolean;
  /** Ikon kecil di atasnya (mis. parasut), bisa disembunyikan lewat `top.visible`. */
  topIcon?: string;
  /** Hilang sendiri setelah sekian detik. */
  ttl?: number;
  onCollect: () => void;
  /** Perilaku per frame (jatuh, berlari, ...). Kembalikan true untuk menghapus tanpa diambil. */
  tick?: (p: Pickup, dt: number) => boolean | void;
}

export class Pickup {
  readonly group = new THREE.Group();
  readonly pos: THREE.Vector3;
  readonly top: THREE.Sprite | null = null;
  collectable = true;
  /** Ketinggian mengambang (dipakai untuk animasi naik-turun). */
  bob = 0.25;
  t = Math.random() * 10;
  ttl: number;
  readonly icon: THREE.Sprite;
  private glow: THREE.Sprite;
  private beam: THREE.Mesh | null = null;

  constructor(readonly opts: PickupOpts) {
    this.pos = opts.pos.clone();
    this.ttl = opts.ttl ?? Infinity;
    const size = opts.size ?? 0.7;
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getGlowTexture(), color: opts.glow ?? 0xffe9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.glow.scale.setScalar(size * 2.2);
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: getEmojiTexture(opts.icon), transparent: true, depthWrite: false }));
    this.icon.scale.setScalar(size);
    this.group.add(this.glow, this.icon);
    if (opts.topIcon) {
      this.top = new THREE.Sprite(new THREE.SpriteMaterial({ map: getEmojiTexture(opts.topIcon), transparent: true, depthWrite: false }));
      this.top.scale.setScalar(size * 1.6);
      this.top.position.y = size * 1.3;
      this.group.add(this.top);
    }
    if (opts.beacon) {
      this.beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 50, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: opts.glow ?? 0xffe9a0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.beam.position.y = 25;
      this.group.add(this.beam);
    }
    this.group.position.copy(this.pos);
  }

  update(dt: number): void {
    this.t += dt;
    this.group.position.copy(this.pos);
    this.icon.position.y = this.bob + Math.sin(this.t * 2.6) * 0.08;
    this.glow.position.y = this.icon.position.y;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.55 + 0.35 * Math.sin(this.t * 4.1);
    (this.glow.material as THREE.SpriteMaterial).rotation = this.t * 0.6;
    if (this.beam) (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.08 * Math.sin(this.t * 3);
    // memudar di 3 detik terakhir
    if (this.ttl < 3) this.group.visible = Math.sin(this.ttl * 18) > -0.2;
  }

  /** Posisi tengah ikon di dunia. */
  center(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.pos).setY(this.pos.y + this.icon.position.y);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Sprite) o.material.dispose();
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

/** Benda melayang yang bisa diambil dengan mendekat / mengklik: harta karun, paket udara, kambing emas. */
export class Pickups {
  readonly group = new THREE.Group();
  readonly list: Pickup[] = [];
  private tmp = new THREE.Vector3();

  add(opts: PickupOpts): Pickup {
    const p = new Pickup(opts);
    this.list.push(p);
    this.group.add(p.group);
    return p;
  }

  remove(p: Pickup): void {
    const i = this.list.indexOf(p);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.group.remove(p.group);
    p.dispose();
  }

  collect(p: Pickup): void {
    if (!this.list.includes(p) || !p.collectable) return;
    this.remove(p);
    p.opts.onCollect();
  }

  /** `body` = titik tengah badan pemain; diambil otomatis bila jaraknya ≤ `range`. */
  update(dt: number, body: THREE.Vector3, range: number, canCollect: boolean): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.opts.tick?.(p, dt)) {
        this.remove(p);
        continue;
      }
      p.ttl -= dt;
      if (p.ttl <= 0) {
        this.remove(p);
        continue;
      }
      p.update(dt);
      if (canCollect && p.collectable && p.center(this.tmp).distanceTo(body) <= range) this.collect(p);
    }
  }

  /** Pickup terdekat yang dilewati sinar bidikan (dalam jarak `maxDist`). */
  raycast(eye: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { p: Pickup; dist: number } | null {
    let best: { p: Pickup; dist: number } | null = null;
    for (const p of this.list) {
      if (!p.collectable) continue;
      const c = p.center(this.tmp).sub(eye);
      const t = c.dot(dir);
      if (t < 0 || t > maxDist) continue;
      const r = p.icon.scale.x * 0.6;
      if (c.lengthSq() - t * t > r * r) continue;
      if (!best || t < best.dist) best = { p, dist: t };
    }
    return best;
  }

  clear(): void {
    for (const p of [...this.list]) this.remove(p);
  }
}
