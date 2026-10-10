import * as THREE from 'three';
import { getSmokeTexture, getStreakTexture } from './textures';

const RINGS = 9;
const HEIGHT = 26;

/** Corong puting beliung: cincin-cincin bertumpuk yang berputar dan meliuk, plus debu di kakinya. */
export class Tornado {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  /** 0..1 untuk muncul / menghilang. */
  strength = 0;
  private rings: THREE.Mesh[] = [];
  private dust: THREE.Sprite[] = [];
  private t = 0;

  constructor(pos: THREE.Vector3) {
    this.pos.copy(pos);
    const tex = getStreakTexture();
    for (let i = 0; i < RINGS; i++) {
      const k0 = i / RINGS;
      const k1 = (i + 1) / RINGS;
      const r0 = 0.6 + Math.pow(k0, 1.6) * 7;
      const r1 = 0.6 + Math.pow(k1, 1.6) * 7;
      const h = HEIGHT / RINGS;
      const map = tex.clone();
      map.repeat.set(2 + i * 0.3, 1);
      map.needsUpdate = true;
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(r1, r0, h * 1.15, 28, 1, true),
        new THREE.MeshBasicMaterial({
          color: i < 3 ? 0x7d6a4c : 0x9d968a,
          map,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.position.y = h * (i + 0.5);
      this.rings.push(ring);
      this.group.add(ring);
    }
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: getSmokeTexture(), color: 0xc9b48a, transparent: true, opacity: 0, depthWrite: false }),
      );
      this.dust.push(s);
      this.group.add(s);
    }
    this.group.position.copy(this.pos);
  }

  update(dt: number): void {
    this.t += dt;
    this.group.position.copy(this.pos);
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const k = i / RINGS;
      // meliuk seperti ular: tiap cincin bergeser mengikuti gelombang
      ring.position.x = Math.sin(this.t * 1.3 + k * 3.2) * k * 2.2;
      ring.position.z = Math.cos(this.t * 1.1 + k * 2.7) * k * 1.6;
      ring.rotation.y -= dt * (7 - k * 3);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = this.strength * (0.85 - k * 0.3);
      mat.map!.offset.y += dt * 0.4;
    }
    for (let i = 0; i < this.dust.length; i++) {
      const s = this.dust[i];
      const a = this.t * 2.4 + (i / this.dust.length) * Math.PI * 2;
      const r = 2.2 + Math.sin(this.t * 3 + i) * 0.6;
      s.position.set(Math.cos(a) * r, 0.8 + (i % 3) * 0.6, Math.sin(a) * r);
      s.scale.setScalar(3 + (i % 2));
      (s.material as THREE.SpriteMaterial).opacity = this.strength * 0.75;
      (s.material as THREE.SpriteMaterial).rotation = a;
    }
  }

  dispose(): void {
    for (const r of this.rings) {
      r.geometry.dispose();
      const m = r.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
    }
    for (const s of this.dust) s.material.dispose();
  }
}
