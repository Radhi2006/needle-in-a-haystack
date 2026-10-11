import * as THREE from 'three';
import { additive, clamp01, disposeTree, easeOut, glowSprite, type Fx } from './Megabombs';
import { getGlowTexture, getSmokeTexture } from './textures';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Sprite asap/jerami (blending normal), untuk awan badai & serpihan. */
const smokeSprite = (color: number) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map: getSmokeTexture(), color, transparent: true, opacity: 0, depthWrite: false, fog: false }));

/** Sprite api (blending aditif, tekstur glow tajam). */
const flameSprite = (color: number) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false }));

/**
 * Lautan api napalm: lidah api & asap yang menjalar melebar di permukaan jerami selama `dur` detik
 * sampai radius `maxR`, lalu padam. `ground(x, z)` memberi tinggi permukaan (dunia) supaya api menempel di jerami.
 */
export class NapalmFire implements Fx {
  readonly group = new THREE.Group();
  readonly lightColor = 0xff7a2a;
  private t = 0;
  private flames: { s: THREE.Sprite; life: number; age: number; size: number }[] = [];
  private smoke: { s: THREE.Sprite; life: number; age: number; size: number; vy: number }[] = [];
  private core: THREE.Sprite;

  constructor(
    private readonly origin: THREE.Vector3,
    private readonly maxR: number,
    private readonly dur: number,
    private readonly ground: (x: number, z: number) => number,
  ) {
    this.core = glowSprite(0xff8a3a);
    this.core.position.copy(origin);
    this.group.add(this.core);
    for (let i = 0; i < 90; i++) {
      const s = flameSprite(i % 3 === 0 ? 0xffd25a : i % 3 === 1 ? 0xff7a1a : 0xff4a10);
      this.group.add(s);
      this.flames.push({ s, life: 0, age: 1, size: 1 });
    }
    for (let i = 0; i < 30; i++) {
      const s = smokeSprite(0x2b2420);
      this.group.add(s);
      this.smoke.push({ s, life: 0, age: 1, size: 1, vy: 0 });
    }
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.dur + 2.5;
  }

  /** Radius api saat ini (m). */
  get radius(): number {
    return 2 + (this.maxR - 2) * easeOut(this.t / this.dur);
  }

  private place(s: THREE.Sprite, R: number, edge: boolean): void {
    const a = Math.random() * Math.PI * 2;
    // sebagian besar api di garis depan yang menjalar, sisanya membara di dalam
    const d = edge ? R * rand(0.75, 1) : R * Math.sqrt(Math.random());
    const x = this.origin.x + Math.cos(a) * d;
    const z = this.origin.z + Math.sin(a) * d;
    s.position.set(x, this.ground(x, z) + 0.3, z);
  }

  update(dt: number): void {
    this.t += dt;
    const R = this.radius;
    const burning = this.t < this.dur;
    const out = burning ? 1 : clamp01(1 - (this.t - this.dur) / 1.5);
    for (const f of this.flames) {
      f.age += dt;
      if (f.age >= f.life) {
        f.age = 0;
        f.life = rand(0.35, 0.9);
        f.size = rand(1.5, 3.5) * (0.6 + R / this.maxR);
        this.place(f.s, R, Math.random() < 0.65);
      }
      const k = f.age / f.life;
      f.s.position.y += dt * 2.2;
      f.s.scale.set(f.size * (1 - k * 0.5), f.size * (1.4 - k * 0.6), 1);
      f.s.material.opacity = Math.sin(k * Math.PI) * 0.9 * out;
    }
    for (const m of this.smoke) {
      m.age += dt;
      if (m.age >= m.life && out > 0.2) {
        m.age = 0;
        m.life = rand(1.8, 3.2);
        m.size = rand(4, 8);
        m.vy = rand(2.5, 5);
        this.place(m.s, R, false);
      }
      const k = clamp01(m.age / m.life);
      m.s.position.y += dt * m.vy;
      m.s.scale.setScalar(m.size * (1 + k * 1.5));
      m.s.material.opacity = Math.sin(k * Math.PI) * 0.55 * out;
    }
    this.core.scale.setScalar(R * 1.6 * (0.9 + 0.1 * Math.sin(this.t * 17)));
    this.core.material.opacity = 0.35 * out;
  }

  lightLevel(): number {
    return (this.t < this.dur ? 0.35 : 0.35 * clamp01(1 - (this.t - this.dur) / 1.5)) * (0.85 + 0.15 * Math.sin(this.t * 23));
  }

  dispose(): void {
    disposeTree(this.group);
    this.group.clear();
  }
}

/** Pesawat pembom yang melintas lurus dari `from` ke `to` dalam `dur` detik. */
export class Bomber implements Fx {
  readonly group = new THREE.Group();
  private t = 0;
  private lights: THREE.Sprite[] = [];

  constructor(private readonly from: THREE.Vector3, private readonly to: THREE.Vector3, private readonly dur: number) {
    const metal = new THREE.MeshLambertMaterial({ color: 0x59606b, fog: false });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2c3138, fog: false });
    // dibangun menghadap +Z lalu diputar ke arah terbang
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 16, 6, 14), metal);
    body.rotation.x = Math.PI / 2;
    const wings = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5, 5.5), metal);
    wings.position.set(0, -0.3, 0.5);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(11, 0.35, 2.6), metal);
    tail.position.set(0, 0.4, -8.5);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.5, 3), dark);
    fin.position.set(0, 2.6, -8.6);
    this.group.add(body, wings, tail, fin);
    for (const x of [-11, -5.5, 5.5, 11]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 4, 10), dark);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(x, -1.1, 1.2);
      const exhaust = glowSprite(0xffb070);
      exhaust.position.set(x, -1.1, -1.4);
      exhaust.scale.setScalar(3.5);
      exhaust.material.opacity = 0.7;
      this.group.add(eng, exhaust);
    }
    for (const [x, c] of [[-17, 0xff3030], [17, 0x30ff60]] as const) {
      const l = glowSprite(c);
      l.position.set(x, -0.3, 0.5);
      this.group.add(l);
      this.lights.push(l);
    }
    const dir = this.to.clone().sub(this.from);
    this.group.rotation.y = Math.atan2(dir.x, dir.z);
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.dur;
  }

  update(dt: number): void {
    this.t += dt;
    this.group.position.lerpVectors(this.from, this.to, clamp01(this.t / this.dur));
    const blink = Math.sin(this.t * 9) > 0.6 ? 1 : 0.15;
    for (const l of this.lights) {
      l.scale.setScalar(2.5);
      l.material.opacity = blink;
    }
  }

  dispose(): void {
    disposeTree(this.group);
    this.group.clear();
  }
}

/** Awan badai gelap selebar `radius` m yang menggantung di `pos` selama `dur` detik dan berkilat saat petir menyambar. */
export class StormCloud implements Fx {
  readonly group = new THREE.Group();
  readonly lightColor = 0xbfd8ff;
  private t = 0;
  private puffs: { s: THREE.Sprite; size: number; spin: number; base: THREE.Color }[] = [];
  private readonly lit = new THREE.Color(0xdde8ff);
  private glow: THREE.Sprite;
  private flashT = 1;

  constructor(pos: THREE.Vector3, private readonly radius: number, private readonly dur: number) {
    this.group.position.copy(pos);
    for (let i = 0; i < 70; i++) {
      const s = smokeSprite(i % 4 === 0 ? 0x5a6170 : 0x30343e);
      const a = Math.random() * Math.PI * 2;
      const d = radius * 1.15 * Math.sqrt(Math.random());
      s.position.set(Math.cos(a) * d, rand(-5, 6), Math.sin(a) * d);
      const size = rand(28, 50);
      this.group.add(s);
      this.puffs.push({ s, size, spin: rand(-0.15, 0.15), base: s.material.color.clone() });
    }
    this.glow = glowSprite(0xa8c8ff);
    this.glow.position.y = -6;
    this.group.add(this.glow);
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.dur + 2;
  }

  /** Kilatan cahaya di dalam awan (dipanggil tiap petir menyambar). */
  flicker(x: number, z: number): void {
    this.flashT = 0;
    this.glow.position.x = x - this.group.position.x;
    this.glow.position.z = z - this.group.position.z;
  }

  update(dt: number): void {
    this.t += dt;
    this.flashT += dt;
    const vis = clamp01(this.t / 1.2) * clamp01(1 - (this.t - this.dur) / 2);
    const flash = Math.max(0, 1 - this.flashT / 0.25);
    for (const p of this.puffs) {
      p.s.material.rotation += dt * p.spin;
      p.s.scale.setScalar(p.size * (0.7 + 0.3 * vis));
      p.s.material.opacity = 0.88 * vis;
      p.s.material.color.copy(p.base).lerp(this.lit, flash * 0.7);
    }
    this.glow.scale.setScalar(this.radius * 1.4);
    this.glow.material.opacity = flash * 0.9;
  }

  lightLevel(): number {
    return 0.6 * Math.max(0, 1 - this.flashT / 0.25);
  }

  dispose(): void {
    disposeTree(this.group);
    this.group.clear();
  }
}

/** Satu sambaran petir zig-zag dari `top` ke `bottom` (+ cabang), berkedip ±0,45 detik. */
export class Lightning implements Fx {
  readonly group = new THREE.Group();
  private t = 0;
  private mats: THREE.MeshBasicMaterial[] = [];
  private impact: THREE.Sprite;

  constructor(top: THREE.Vector3, bottom: THREE.Vector3) {
    const main = this.jagged(top, bottom, 14, 7);
    this.bolt(main, 0.3, 1.4);
    // cabang-cabang kecil dari titik acak di sepanjang sambaran
    for (let i = 0; i < 3; i++) {
      const from = main[2 + Math.floor(Math.random() * (main.length - 5))];
      const end = from.clone().add(new THREE.Vector3(rand(-18, 18), -rand(10, 25), rand(-18, 18)));
      this.bolt(this.jagged(from, end, 6, 4), 0.15, 0.7);
    }
    this.impact = glowSprite(0xdfeaff);
    this.impact.position.copy(bottom);
    this.impact.scale.setScalar(26);
    this.group.add(this.impact);
    this.update(0);
  }

  private jagged(a: THREE.Vector3, b: THREE.Vector3, n: number, jitter: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      if (i > 0 && i < n) p.add(new THREE.Vector3(rand(-jitter, jitter), rand(-jitter, jitter) * 0.3, rand(-jitter, jitter)));
      pts.push(p);
    }
    return pts;
  }

  private bolt(pts: THREE.Vector3[], core: number, glow: number): void {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
    const segs = pts.length * 4;
    for (const [r, color] of [[glow, 0x7aa8ff], [core, 0xffffff]] as const) {
      const m = additive(color);
      this.mats.push(m);
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 5), m));
    }
  }

  get done(): boolean {
    return this.t >= 0.45;
  }

  update(dt: number): void {
    this.t += dt;
    // kedip 3× lalu hilang
    const strobe = this.t < 0.06 || (this.t > 0.12 && this.t < 0.18) || (this.t > 0.26 && this.t < 0.34) ? 1 : 0.15;
    const fade = 1 - this.t / 0.45;
    for (const m of this.mats) m.opacity = strobe * fade;
    this.impact.material.opacity = strobe * fade;
  }

  dispose(): void {
    disposeTree(this.group);
    this.group.clear();
  }
}

/**
 * Piring terbang: datang dari jauh, melayang di `hover` sambil menyorotkan sinar penculik selebar `r` m ke tanah
 * selama `dur` detik (`onTick(frac)` tiap 0,2 dtk, frac 0..1), lalu `onEnd()` dan melesat pergi.
 */
export class Ufo implements Fx {
  readonly group = new THREE.Group();
  readonly lightColor = 0x7dff9a;
  private saucer = new THREE.Group();
  private beam: THREE.Mesh;
  private beamInner: THREE.Mesh;
  private ringLights: THREE.Sprite[] = [];
  private debris: { s: THREE.Sprite; a: number; d: number; y: number; v: number }[] = [];
  private t = 0;
  private tickT = 0;
  private ended = false;
  private readonly arrive = 1.8;
  private readonly leave = 1.6;
  private readonly start: THREE.Vector3;

  constructor(
    private readonly hover: THREE.Vector3,
    private readonly r: number,
    private readonly dur: number,
    private readonly onTick: (frac: number) => void,
    private readonly onEnd: () => void,
  ) {
    this.start = hover.clone().add(new THREE.Vector3(-260, 90, 160));
    const hull = new THREE.Mesh(
      new THREE.SphereGeometry(10, 36, 14),
      new THREE.MeshLambertMaterial({ color: 0xa9b3bf, emissive: 0x1d2630, fog: false }),
    );
    hull.scale.y = 0.2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(10, 0.7, 8, 40), new THREE.MeshLambertMaterial({ color: 0x6b7480, fog: false }));
    rim.rotation.x = Math.PI / 2;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x9ff7ff, emissive: 0x2a8a90, transparent: true, opacity: 0.8, fog: false }),
    );
    dome.position.y = 1.4;
    const under = glowSprite(0x9dffb4);
    under.position.y = -2.2;
    under.scale.setScalar(14);
    this.saucer.add(hull, rim, dome, under);
    for (let i = 0; i < 14; i++) {
      const l = glowSprite(i % 2 ? 0xfff27a : 0x7affd0);
      const a = (i / 14) * Math.PI * 2;
      l.position.set(Math.cos(a) * 10.4, 0, Math.sin(a) * 10.4);
      l.scale.setScalar(2.4);
      this.saucer.add(l);
      this.ringLights.push(l);
    }
    // sinar kerucut: atas sempit di bawah piring, bawah selebar radius sedot
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 1, 1, 48, 1, true), additive(0x7dff9a, THREE.DoubleSide));
    this.beamInner = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.6, 1, 32, 1, true), additive(0xe8fff0, THREE.DoubleSide));
    this.group.add(this.beam, this.beamInner, this.saucer);
    const smoke = getSmokeTexture();
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: i % 3 ? 0xe0bd62 : 0xc39a45, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      this.group.add(s);
      this.debris.push({ s, a: Math.random() * Math.PI * 2, d: Math.random(), y: Math.random(), v: rand(0.25, 0.5) });
    }
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.arrive + this.dur + this.leave;
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    const h0 = this.arrive;
    const h1 = this.arrive + this.dur;
    const pos = this.saucer.position;
    if (t < h0) {
      pos.lerpVectors(this.start, this.hover, easeOut(t / h0));
    } else if (t < h1) {
      pos.copy(this.hover);
      pos.y += Math.sin(t * 2.2) * 0.8;
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = 0.2;
        this.onTick(clamp01((t - h0) / this.dur));
      }
    } else {
      if (!this.ended) {
        this.ended = true;
        this.onEnd();
      }
      const k = (t - h1) / this.leave;
      pos.copy(this.hover).add(new THREE.Vector3(160 * k * k, 220 * k * k, -90 * k * k));
    }
    this.saucer.rotation.y += dt * 1.8;
    this.ringLights.forEach((l, i) => (l.material.opacity = 0.5 + 0.5 * Math.sin(t * 8 + i * 0.9)));

    const beamOn = t > h0 - 0.2 && t < h1 + 0.2 ? clamp01(Math.min(t - (h0 - 0.2), h1 + 0.2 - t) / 0.4) : 0;
    const top = pos.y - 2;
    const H = Math.max(1, top);
    for (const [m, w, peak] of [[this.beam, this.r, 0.22], [this.beamInner, this.r, 0.16]] as const) {
      m.visible = beamOn > 0;
      m.position.set(pos.x, top / 2, pos.z);
      m.scale.set(w, H, w);
      (m.material as THREE.MeshBasicMaterial).opacity = peak * beamOn * (0.8 + 0.2 * Math.sin(t * 13));
    }
    // jerami beterbangan spiral ke atas di dalam sinar
    for (const d of this.debris) {
      d.y += dt * d.v;
      if (d.y > 1) {
        d.y = 0;
        d.a = Math.random() * Math.PI * 2;
        d.d = Math.random();
      }
      d.a += dt * 1.5;
      const rad = this.r * (0.22 + 0.78 * (1 - d.y)) * d.d;
      d.s.position.set(pos.x + Math.cos(d.a) * rad, d.y * top, pos.z + Math.sin(d.a) * rad);
      d.s.scale.setScalar(1.2 + this.r * 0.06);
      d.s.material.opacity = 0.85 * beamOn * clamp01(d.y * 6) * clamp01((1 - d.y) * 6);
    }
  }

  lightLevel(): number {
    const t = this.t;
    return t > this.arrive && t < this.arrive + this.dur ? 0.3 : 0;
  }

  dispose(): void {
    disposeTree(this.group);
    this.group.clear();
  }
}

export interface StellarOpts {
  /** Lama fase mengisi (bintang membengkak / singularitas menyedot cahaya), detik. */
  charge: number;
  /** Lama bola ledakan mengembang sampai radius penuh, detik. */
  expand: number;
  /** Warna inti di awal & di akhir fase mengisi (mis. kuning → merah raksasa). */
  coreFrom: number;
  coreTo: number;
  /** Ukuran inti maksimum saat mengisi (m). */
  coreSize: number;
  shell: number;
  halo: number;
  ring: number;
  light: number;
  /** Jumlah bintang yang terlempar keluar. */
  stars: number;
  /** Partikel cahaya tersedot ke inti saat mengisi. */
  motes: boolean;
  /** Warna bola ledakan berputar seperti pelangi (Big Bang). */
  rainbow: boolean;
}

/**
 * Ledakan bintang (supernova / Big Bang): inti membengkak lalu runtuh selama `charge` detik,
 * kemudian bola cahaya mengembang sampai radius `r` dalam `expand` detik. `onTick(R)` dipanggil tiap 0,12 dtk
 * selama mengembang dengan radius saat ini, `onBurst()` saat meledak, `onEnd()` begitu radius penuh tercapai.
 */
export class StellarBurst implements Fx {
  readonly group = new THREE.Group();
  readonly lightColor: number;
  private t = 0;
  private tickT = 0;
  private burst = false;
  private ended = false;
  private core: THREE.Sprite;
  private corona: THREE.Sprite;
  private halo: THREE.Sprite;
  private shell: THREE.Mesh;
  private ring: THREE.Mesh;
  private stars: THREE.Points | null = null;
  private starDirs: Float32Array | null = null;
  private motes: { s: THREE.Sprite; a: number; b: number; f: number }[] = [];
  private cFrom: THREE.Color;
  private cTo: THREE.Color;

  constructor(
    pos: THREE.Vector3,
    private readonly r: number,
    private readonly o: StellarOpts,
    private readonly onBurst: () => void,
    private readonly onTick: (R: number) => void,
    private readonly onEnd: () => void,
  ) {
    this.lightColor = o.light;
    this.group.position.copy(pos);
    this.cFrom = new THREE.Color(o.coreFrom);
    this.cTo = new THREE.Color(o.coreTo);
    this.corona = glowSprite(o.coreTo);
    this.core = glowSprite(o.coreFrom);
    this.halo = glowSprite(o.halo);
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(1, 56, 28), additive(o.shell, THREE.DoubleSide));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 1, 128), additive(o.ring, THREE.DoubleSide));
    this.ring.rotation.set(-Math.PI / 2 + 0.35, 0, 0.2);
    this.group.add(this.halo, this.shell, this.ring, this.corona, this.core);
    if (o.stars > 0) {
      const n = o.stars;
      const posArr = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      this.starDirs = new Float32Array(n * 4);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const z = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - z * z);
        this.starDirs.set([Math.cos(a) * s, z, Math.sin(a) * s, rand(0.5, 1.35)], i * 4);
        c.setHSL(o.rainbow ? Math.random() : rand(0.55, 0.7), 0.8, rand(0.6, 0.9));
        col.set([c.r, c.g, c.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      this.stars.frustumCulled = false;
      this.group.add(this.stars);
    }
    if (o.motes) {
      for (let i = 0; i < 50; i++) {
        const s = glowSprite(i % 2 ? 0xffffff : o.coreTo);
        this.group.add(s);
        this.motes.push({ s, a: Math.random() * Math.PI * 2, b: Math.acos(Math.random() * 2 - 1), f: Math.random() });
      }
    }
    this.update(0);
  }

  get done(): boolean {
    return this.t >= this.o.charge + this.o.expand + 4.5;
  }

  private radiusAt(u: number): number {
    return this.r * easeOut(u / this.o.expand);
  }

  update(dt: number): void {
    this.t += dt;
    const { charge, expand, coreSize } = this.o;
    const t = this.t;
    const shellMat = this.shell.material as THREE.MeshBasicMaterial;
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    if (t < charge) {
      const k = t / charge;
      // membengkak sampai 80% waktu, lalu runtuh jadi titik yang sangat terang
      const swell = k < 0.8 ? easeOut(k / 0.8) : 1 - easeOut((k - 0.8) / 0.2) * 0.96;
      const pulse = 1 + 0.08 * Math.sin(t * (6 + 30 * k));
      this.core.scale.setScalar(Math.max(0.5, coreSize * swell * pulse));
      this.core.material.color.copy(this.cFrom).lerp(this.cTo, clamp01(k / 0.8));
      if (k >= 0.8) this.core.material.color.lerp(new THREE.Color(0xffffff), (k - 0.8) / 0.2);
      this.core.material.opacity = 1;
      this.corona.scale.setScalar(Math.max(0.5, coreSize * 2.2 * swell * (1 + 0.15 * Math.sin(t * 9))));
      this.corona.material.opacity = 0.55;
      this.halo.scale.setScalar(coreSize * 5 * swell + 1);
      this.halo.material.opacity = 0.25 * swell;
      for (const m of this.motes) {
        const d = coreSize * 4 * (1 - ((k * 2 + m.f) % 1));
        m.s.position.set(Math.sin(m.b) * Math.cos(m.a) * d, Math.cos(m.b) * d, Math.sin(m.b) * Math.sin(m.a) * d);
        m.s.scale.setScalar(2 + 3 * m.f);
        m.s.material.opacity = 0.9;
      }
      shellMat.opacity = 0;
      ringMat.opacity = 0;
      return;
    }
    if (!this.burst) {
      this.burst = true;
      for (const m of this.motes) m.s.visible = false;
      this.onBurst();
    }
    const u = t - charge;
    const R = this.radiusAt(u);
    if (u <= expand) {
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = 0.12;
        this.onTick(R);
      }
    } else if (!this.ended) {
      this.ended = true;
      this.onTick(this.r);
      this.onEnd();
    }
    const fade = clamp01(1 - (u - expand * 0.6) / 4);
    this.shell.scale.setScalar(Math.max(0.01, R));
    shellMat.opacity = 0.3 * fade;
    if (this.o.rainbow) shellMat.color.setHSL((t * 0.25) % 1, 0.85, 0.6);
    this.ring.scale.setScalar(Math.max(0.01, R * 1.35));
    this.ring.rotation.z += dt * 0.2;
    ringMat.opacity = 0.55 * fade;
    this.core.scale.setScalar(this.r * 0.8 * (1 - clamp01(u / 1.4)) + 0.01);
    this.core.material.color.setHex(0xffffff);
    this.core.material.opacity = clamp01(1 - u / 1.4);
    this.corona.scale.setScalar(this.r * 1.4 * easeOut(u / 0.6));
    this.corona.material.opacity = 0.7 * clamp01(1 - u / 2);
    this.halo.scale.setScalar(R * 2.6 + 1);
    this.halo.material.opacity = 0.75 * fade;
    if (this.stars && this.starDirs) {
      const arr = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
      const a = arr.array as Float32Array;
      const sd = this.starDirs;
      const reach = this.r * 1.3 * easeOut(u / (expand + 1.5));
      for (let i = 0, n = a.length / 3; i < n; i++) {
        const d = reach * sd[i * 4 + 3];
        a[i * 3] = sd[i * 4] * d;
        a[i * 3 + 1] = sd[i * 4 + 1] * d;
        a[i * 3 + 2] = sd[i * 4 + 2] * d;
      }
      arr.needsUpdate = true;
      (this.stars.material as THREE.PointsMaterial).opacity = fade;
    }
  }

  lightLevel(): number {
    const u = this.t - this.o.charge;
    if (u < 0) return 0.2 + 0.4 * (this.t / this.o.charge);
    return clamp01(1 - (u - this.o.expand * 0.5) / 3);
  }

  dispose(): void {
    disposeTree(this.group);
    this.group.clear();
  }
}
