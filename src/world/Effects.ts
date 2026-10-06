import * as THREE from 'three';
import { MushroomCloud } from './Nuke';
import { getGlowTexture } from './textures';

interface Projectile {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  spin: boolean;
  onArrive: () => void;
}

export interface ThrowOpts {
  dur?: number;
  arc?: number;
  /** false = jatuh lurus tanpa berputar (mis. bom nuklir). */
  spin?: boolean;
}

interface Flash {
  sprite: THREE.Sprite;
  t: number;
  dur: number;
  size: number;
}

/** Efek visual sementara: proyektil, kilatan ledakan, gelombang sonar, zona drone, penanda bidikan. */
export class Effects {
  readonly group = new THREE.Group();
  readonly aim: THREE.Mesh;
  private projectiles: Projectile[] = [];
  private flashes: Flash[] = [];
  private sonar: THREE.Mesh;
  private sonarT = -1;
  private sonarMax = 14;
  private droneZone: THREE.Mesh;
  private droneTarget = new THREE.Vector3();
  private droneRadius = 0;
  private timers: { t: number; fn: () => void }[] = [];
  private nukes: MushroomCloud[] = [];
  private nukeLight: THREE.PointLight;
  private rumbleT = -1;
  private rumbleAmp = 0;
  shake = 0;

  constructor() {
    this.aim = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.08, depthWrite: false, wireframe: true }),
    );
    this.aim.visible = false;
    this.group.add(this.aim);

    this.sonar = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x55ffee, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, wireframe: true }),
    );
    this.sonar.visible = false;
    this.group.add(this.sonar);

    this.droneZone = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 60, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.droneZone.visible = false;
    this.group.add(this.droneZone);

    // Selalu ada di scene (intensitas 0) supaya shader tidak dikompilasi ulang saat nuklir meledak.
    this.nukeLight = new THREE.PointLight(0xffa860, 0, 140, 0.4);
    this.group.add(this.nukeLight);
  }

  setAim(pos: THREE.Vector3 | null, radius: number): void {
    if (!pos || radius < 0.55) {
      this.aim.visible = false;
      return;
    }
    this.aim.visible = true;
    this.aim.position.copy(pos);
    this.aim.scale.setScalar(radius);
  }

  private projectileMesh(kind: string): THREE.Object3D {
    const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
    const fuse = () => {
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffaa33, blending: THREE.AdditiveBlending, depthWrite: false }));
      spark.scale.setScalar(0.3);
      return spark;
    };
    switch (kind) {
      case 'kipas':
        return new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 16), lambert(0x4aa0e0));
      case 'dinamit':
      case 'petasan': {
        const g = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), lambert(0xc8302a));
        const spark = fuse();
        spark.position.y = 0.18;
        g.add(stick, spark);
        return g;
      }
      case 'granat':
        return new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), lambert(0x4d5e2a));
      case 'bom_cluster':
        return new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), lambert(0x6a6f78));
      case 'bomblet':
        return new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lambert(0x2a2a2a));
      case 'bom_penembus': {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 10), lambert(0x4b5320));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 10), lambert(0x2a2a2a));
        tip.position.y = 0.4;
        g.add(body, tip);
        return g;
      }
      case 'termobarik': {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), lambert(0xb5471f));
        const spark = fuse();
        spark.scale.setScalar(0.6);
        g.add(body, spark);
        return g;
      }
      case 'nuklir': {
        // bom kuning-hitam dengan sirip, moncong menghadap bawah
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.3, 6, 16), lambert(0xf2c230));
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 16), lambert(0x1c1c1c));
        g.add(body, band);
        for (let i = 0; i < 4; i++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.5), lambert(0x1c1c1c));
          fin.rotation.y = (i * Math.PI) / 2;
          fin.position.y = 0.95;
          fin.translateZ(0.38);
          g.add(fin);
        }
        return g;
      }
      default:
        return new THREE.Mesh(
          new THREE.SphereGeometry(kind === 'bom_raksasa' ? 0.35 : 0.18, 12, 8),
          lambert(kind === 'bom_raksasa' ? 0x3a7a2a : 0x222222),
        );
    }
  }

  throwObject(kind: string, from: THREE.Vector3, to: THREE.Vector3, onArrive: () => void, opts: ThrowOpts = {}): void {
    const mesh = this.projectileMesh(kind);
    mesh.position.copy(from);
    this.group.add(mesh);
    const dist = from.distanceTo(to);
    this.projectiles.push({
      mesh, from: from.clone(), to: to.clone(), t: 0,
      dur: opts.dur ?? Math.max(0.25, dist / 18),
      arc: opts.arc ?? Math.min(3, dist * 0.15),
      spin: opts.spin ?? true,
      onArrive,
    });
  }

  /** Jalankan `fn` setelah `delay` detik (ikut jam efek, bukan setTimeout). */
  after(delay: number, fn: () => void): void {
    this.timers.push({ t: delay, fn });
  }

  /** Awan jamur nuklir di `pos`. `rumble` = kekuatan guncangan kamera (0..2). */
  nuke(pos: THREE.Vector3, rumble: number): void {
    const cloud = new MushroomCloud(pos);
    this.nukes.push(cloud);
    this.group.add(cloud.group);
    this.rumbleT = 0;
    this.rumbleAmp = rumble;
    this.shake = Math.max(this.shake, rumble * 1.4);
  }

  flash(pos: THREE.Vector3, size: number, color = 0xffb347): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getGlowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    sprite.position.copy(pos);
    this.group.add(sprite);
    this.flashes.push({ sprite, t: 0, dur: 0.6, size });
  }

  sonarPing(pos: THREE.Vector3, range: number): void {
    this.sonarT = 0;
    this.sonarMax = range;
    this.sonar.position.copy(pos);
    this.sonar.visible = true;
  }

  setDroneZone(x: number, z: number, radius: number): void {
    this.droneTarget.set(x, 30, z);
    this.droneRadius = radius;
    if (!this.droneZone.visible) {
      this.droneZone.position.copy(this.droneTarget);
      this.droneZone.scale.set(radius, 1, radius);
    }
    this.droneZone.visible = radius > 0;
  }

  update(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * p.arc;
      if (p.spin) {
        p.mesh.rotation.x += dt * 8;
        p.mesh.rotation.z += dt * 5;
      } else {
        p.mesh.rotation.y += dt * 1.5;
      }
      if (k >= 1) {
        this.group.remove(p.mesh);
        p.mesh.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          } else if (o instanceof THREE.Sprite) o.material.dispose();
        });
        this.projectiles.splice(i, 1);
        p.onArrive();
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / f.dur;
      f.sprite.scale.setScalar(f.size * (0.5 + k * 1.5));
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) {
        this.group.remove(f.sprite);
        f.sprite.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    if (this.sonarT >= 0) {
      this.sonarT += dt;
      const k = this.sonarT / 1.1;
      this.sonar.scale.setScalar(Math.max(0.01, k * this.sonarMax));
      (this.sonar.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k);
      if (k >= 1) {
        this.sonarT = -1;
        this.sonar.visible = false;
      }
    }
    if (this.droneZone.visible) {
      this.droneZone.position.lerp(this.droneTarget, Math.min(1, dt * 1.5));
      const s = this.droneZone.scale.x + (this.droneRadius - this.droneZone.scale.x) * Math.min(1, dt * 1.5);
      this.droneZone.scale.set(s, 1, s);
      (this.droneZone.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(performance.now() * 0.003) * 0.04;
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }

    let light = 0;
    for (let i = this.nukes.length - 1; i >= 0; i--) {
      const n = this.nukes[i];
      n.update(dt);
      const l = n.lightLevel();
      if (l > light) {
        light = l;
        this.nukeLight.position.copy(n.firePos);
      }
      if (n.done) {
        this.group.remove(n.group);
        n.dispose();
        this.nukes.splice(i, 1);
      }
    }
    this.nukeLight.intensity = light * 9;

    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.rumbleT >= 0) {
      // gemuruh panjang setelah ledakan nuklir
      this.rumbleT += dt;
      this.shake = Math.max(this.shake, this.rumbleAmp * Math.exp(-this.rumbleT / 2.2));
      if (this.rumbleT > 9) this.rumbleT = -1;
    }
  }

  clearDrone(): void {
    this.droneZone.visible = false;
    this.droneRadius = 0;
  }
}
