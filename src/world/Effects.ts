import * as THREE from 'three';
import { AntimatterBurst, Beam, BlackHole, ShockRing, type Fx } from './Megabombs';
import { MushroomCloud } from './Nuke';
import { Bomber, Lightning, NapalmFire, StellarBurst, StormCloud, Ufo, type StellarOpts } from './Superbombs';
import { getGlowTexture } from './textures';

const NUKE_LIGHT = 0xffa860;

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
  private fx: Fx[] = [];
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
    this.nukeLight = new THREE.PointLight(NUKE_LIGHT, 0, 420, 0.4);
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
    const glow = (color: number, size: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sp.scale.setScalar(size);
      return sp;
    };
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
      case 'napalm': {
        // tabung napalm oranye bersirip kecil
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 10), lambert(0xd8641e));
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10), lambert(0x222222));
        const spark = fuse();
        spark.position.y = 0.4;
        spark.scale.setScalar(0.5);
        g.add(body, band, spark);
        return g;
      }
      case 'carpet_bomb': {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.6, 4, 10), lambert(0x3b4230));
        g.add(body);
        for (let i = 0; i < 4; i++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.6), lambert(0x22261c));
          fin.rotation.y = (i * Math.PI) / 2;
          fin.position.y = 1.1;
          fin.translateZ(0.4);
          g.add(fin);
        }
        return g;
      }
      case 'nuklir':
      case 'hidrogen':
      case 'kobalt':
      case 'mirv': {
        // bom bersirip, moncong menghadap bawah (nuklir kuning-hitam, hidrogen putih-merah, rudal MIRV putih-abu besar,
        // kobalt hijau-hitam raksasa)
        const [bodyCol, bandCol, size] =
          kind === 'hidrogen' ? [0xf1efe8, 0xb3261e, 1.9]
          : kind === 'mirv' ? [0xdfe3e8, 0x39404a, 2.4]
          : kind === 'kobalt' ? [0x3f7d3a, 0x161a14, 3.2]
          : [0xf2c230, 0x1c1c1c, 1];
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.3, 6, 16), lambert(bodyCol));
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 16), lambert(bandCol));
        g.add(body, band);
        for (let i = 0; i < 4; i++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.5), lambert(bandCol));
          fin.rotation.y = (i * Math.PI) / 2;
          fin.position.y = 0.95;
          fin.translateZ(0.38);
          g.add(fin);
        }
        g.scale.setScalar(size);
        return g;
      }
      case 'warhead': {
        // hulu ledak MIRV: kerucut gelap dengan jejak api supaya kelihatan dari jauh
        const g = new THREE.Group();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 12), lambert(0x30343a));
        cone.rotation.x = Math.PI;
        const trail = glow(0xff9a3a, 4);
        trail.position.y = 0.8;
        g.add(cone, trail);
        return g;
      }
      case 'rod': {
        // batang tungsten dari orbit, membara karena gesekan atmosfer
        const g = new THREE.Group();
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9, 10), new THREE.MeshLambertMaterial({ color: 0xb8c0c8, emissive: 0xff7a30, emissiveIntensity: 0.6 }));
        const heat = glow(0xffe0b0, 7);
        heat.position.y = -4;
        g.add(rod, heat);
        return g;
      }
      case 'antimateri': {
        const g = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), new THREE.MeshLambertMaterial({ color: 0x2a1840, emissive: 0x9a5cff, emissiveIntensity: 0.9, flatShading: true }));
        g.add(shell, glow(0xc28cff, 5));
        return g;
      }
      case 'lubang_hitam_bom': {
        const g = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 12), new THREE.MeshBasicMaterial({ color: 0x050008 }));
        g.add(glow(0x7a3cff, 4.5), ball);
        return g;
      }
      case 'asteroid':
      case 'hujan_asteroid': {
        // batu raksasa membara dengan ekor api; tanpa kabut karena datang dari sangat jauh
        const g = new THREE.Group();
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(11, 1),
          new THREE.MeshLambertMaterial({ color: 0x4a3326, emissive: 0xff4a10, emissiveIntensity: 0.55, flatShading: true, fog: false }),
        );
        const fire = glow(0xff7a2a, 55);
        const tail = glow(0xffb060, 40);
        tail.position.set(14, 22, -7);
        g.add(tail, fire, rock);
        return g;
      }
      case 'meteor': {
        const g = new THREE.Group();
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.55, 0),
          new THREE.MeshLambertMaterial({ color: 0x4a2a1a, emissive: 0xff4a10, emissiveIntensity: 0.8 }),
        );
        const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xff7a2a, blending: THREE.AdditiveBlending, depthWrite: false }));
        fire.scale.setScalar(4);
        g.add(rock, fire);
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

  /** Awan jamur nuklir di `pos`. `rumble` = kekuatan guncangan kamera (0..2), `scale` = ukuran awan. */
  nuke(pos: THREE.Vector3, rumble: number, scale = 1): void {
    const cloud = new MushroomCloud(pos, scale);
    this.nukes.push(cloud);
    this.group.add(cloud.group);
    this.rumbleT = 0;
    this.rumbleAmp = rumble;
    this.shake = Math.max(this.shake, rumble * 1.4);
  }

  private addFx<T extends Fx>(f: T): T {
    this.fx.push(f);
    this.group.add(f.group);
    return f;
  }

  /** Pilar cahaya vertikal di (x,z) dari y0 ke y1. `pulse` = sinar bidik yang berkedip. */
  beam(x: number, z: number, y0: number, y1: number, color: number, width: number, dur: number, peak = 0.8, pulse = false): void {
    this.addFx(new Beam(x, z, y0, y1, color, width, dur, peak, pulse));
  }

  /** Cincin gelombang kejut di tanah. */
  shockRing(pos: THREE.Vector3, radius: number, dur: number, color?: number): void {
    this.addFx(new ShockRing(pos.x, Math.max(0, pos.y), pos.z, radius, dur, color));
  }

  /** Ledakan antimateri; bola pemusnah mencapai radius penuh `charge` detik setelah dipanggil. */
  antimatter(pos: THREE.Vector3, radius: number, charge: number): void {
    this.addFx(new AntimatterBurst(pos, radius, charge));
  }

  /** Lubang hitam yang menyedot: `onTick(r)` berkala selama `grow` detik, lalu `onEnd()`. */
  blackHole(pos: THREE.Vector3, maxR: number, grow: number, onTick: (r: number) => void, onEnd: () => void): void {
    this.addFx(new BlackHole(pos, maxR, grow, onTick, onEnd));
  }

  /** Lautan api napalm yang menjalar; `ground(x,z)` = tinggi permukaan jerami. */
  napalm(pos: THREE.Vector3, maxR: number, dur: number, ground: (x: number, z: number) => number): void {
    this.addFx(new NapalmFire(pos, maxR, dur, ground));
  }

  /** Pesawat pembom terbang lurus dari `from` ke `to`. */
  bomber(from: THREE.Vector3, to: THREE.Vector3, dur: number): void {
    this.addFx(new Bomber(from, to, dur));
  }

  /** Awan badai gelap; panggil `flicker()` pada hasilnya setiap petir menyambar. */
  stormCloud(pos: THREE.Vector3, radius: number, dur: number): StormCloud {
    return this.addFx(new StormCloud(pos, radius, dur));
  }

  /** Sambaran petir dari `top` ke `bottom`. */
  lightning(top: THREE.Vector3, bottom: THREE.Vector3): void {
    this.addFx(new Lightning(top, bottom));
  }

  /** Piring terbang dengan sinar penculik (lihat Ufo). */
  ufo(hover: THREE.Vector3, r: number, dur: number, onTick: (frac: number) => void, onEnd: () => void): void {
    this.addFx(new Ufo(hover, r, dur, onTick, onEnd));
  }

  /** Supernova / Big Bang (lihat StellarBurst). */
  stellar(pos: THREE.Vector3, r: number, opts: StellarOpts, onBurst: () => void, onTick: (R: number) => void, onEnd: () => void): void {
    this.addFx(new StellarBurst(pos, r, opts, onBurst, onTick, onEnd));
  }

  /** Gemuruh panjang (guncangan kamera) tanpa awan jamur. */
  rumble(amp: number): void {
    this.rumbleAmp = this.rumbleT >= 0 ? Math.max(amp, this.rumbleAmp) : amp;
    this.rumbleT = 0;
    this.shake = Math.max(this.shake, amp * 1.4);
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
    let lightColor = NUKE_LIGHT;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.update(dt);
      if (f.lightLevel) {
        const l = f.lightLevel();
        if (l > light) {
          light = l;
          lightColor = f.lightColor ?? NUKE_LIGHT;
          this.nukeLight.position.copy(f.group.position);
        }
      }
      if (f.done) {
        this.group.remove(f.group);
        f.dispose();
        this.fx.splice(i, 1);
      }
    }
    for (let i = this.nukes.length - 1; i >= 0; i--) {
      const n = this.nukes[i];
      n.update(dt);
      const l = n.lightLevel();
      if (l > light) {
        light = l;
        lightColor = NUKE_LIGHT;
        this.nukeLight.position.copy(n.firePos);
      }
      if (n.done) {
        this.group.remove(n.group);
        n.dispose();
        this.nukes.splice(i, 1);
      }
    }
    this.nukeLight.intensity = light * 9;
    this.nukeLight.color.setHex(lightColor);

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
