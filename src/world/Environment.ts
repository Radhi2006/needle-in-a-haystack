import * as THREE from 'three';
import { mulberry32, valueNoise3 } from '../core/rng';
import { makeTextTexture } from './textures';

const SKY_DAY = new THREE.Color('#8fcbea');
const SKY_SUNSET = new THREE.Color('#f2a66b');
const SKY_NIGHT = new THREE.Color('#0d1b33');
const tmpC = new THREE.Color();

function lambert(color: THREE.ColorRepresentation, flat = true) {
  return new THREE.MeshLambertMaterial({ color, flatShading: flat });
}

/** Tanah, pagar, gudang, pohon, awan, langit & cahaya siang/malam. */
export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fenceRadius: number;
  private clouds: THREE.Group[] = [];
  private stars: THREE.Points;

  constructor(private scene: THREE.Scene, haystackRadius: number, seed: number) {
    const rnd = mulberry32(seed ^ 0xe7e7);
    this.fenceRadius = haystackRadius + 16;
    const worldR = Math.max(170, this.fenceRadius + 90);

    // Tanah rendah-poli dengan warna rumput bervariasi
    const ground = new THREE.PlaneGeometry(worldR * 2, worldR * 2, 140, 140);
    ground.rotateX(-Math.PI / 2);
    const gpos = ground.attributes.position as THREE.BufferAttribute;
    const gcol: number[] = [];
    const grassA = new THREE.Color('#6fa84a'), grassB = new THREE.Color('#8dbb55'), dirt = new THREE.Color('#a98a5a');
    for (let i = 0; i < gpos.count; i++) {
      const x = gpos.getX(i), z = gpos.getZ(i);
      const r = Math.hypot(x, z);
      if (r > this.fenceRadius + 12) {
        gpos.setY(i, Math.max(0, (r - this.fenceRadius - 12) * 0.04) * (1 + valueNoise3(x * 0.03, 0, z * 0.03, seed)) * 2);
      }
      const n = valueNoise3(x * 0.08, 3, z * 0.08, seed) * 0.5 + 0.5;
      tmpC.copy(grassA).lerp(grassB, n);
      if (r < haystackRadius + 3) tmpC.lerp(dirt, Math.min(1, (haystackRadius + 3 - r) / 3) * 0.75);
      gcol.push(tmpC.r, tmpC.g, tmpC.b);
    }
    ground.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    ground.computeVertexNormals();
    const groundMesh = new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ vertexColors: true }));
    groundMesh.receiveShadow = true;
    this.group.add(groundMesh);

    const ring = new THREE.RingGeometry(0, haystackRadius + 4, 64, 8);
    ring.rotateX(-Math.PI / 2);
    const rpos = ring.attributes.position as THREE.BufferAttribute;
    const rcol: number[] = [];
    for (let i = 0; i < rpos.count; i++) {
      const x = rpos.getX(i), z = rpos.getZ(i);
      const r = Math.hypot(x, z);
      const n = valueNoise3(x * 0.3, 5, z * 0.3, seed) * 0.5 + 0.5;
      tmpC.copy(dirt).lerp(new THREE.Color('#c2a46c'), n);
      const edge = Math.min(1, Math.max(0, (r - haystackRadius) / 4));
      tmpC.lerp(grassA, edge);
      rcol.push(tmpC.r, tmpC.g, tmpC.b);
    }
    ring.setAttribute('color', new THREE.Float32BufferAttribute(rcol, 3));
    const ringMesh = new THREE.Mesh(
      ring,
      new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    ringMesh.position.y = 0.005;
    ringMesh.receiveShadow = true;
    this.group.add(ringMesh);

    this.buildFence(rnd);
    this.buildBarn();
    this.buildShopStall();
    this.buildTrees(rnd, worldR);
    this.buildBales(rnd);
    this.buildClouds(rnd);

    // Bintang malam
    const starGeo = new THREE.BufferGeometry();
    const sp: number[] = [];
    for (let i = 0; i < 700; i++) {
      const u = rnd() * Math.PI * 2;
      const v = rnd() * 0.45 * Math.PI;
      const r = 400;
      sp.push(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r + 20, Math.sin(u) * Math.cos(v) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.group.add(this.stars);

    // Cahaya
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b5a3a, 1.3);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    this.sun.castShadow = true;
    const ext = haystackRadius + 8;
    const cam = this.sun.shadow.camera;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
    cam.near = 1; cam.far = 400;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.group.add(this.sun, this.sun.target);

    scene.fog = new THREE.Fog(SKY_DAY.clone(), 70, worldR * 1.4);
    scene.background = SKY_DAY.clone();
  }

  setShadows(enabled: boolean, size: number): void {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  /** dayTime 0..1 (0 = pagi, 0.25 = siang, 0.5 = sore, 0.75 = tengah malam). */
  update(dt: number, dayTime: number): void {
    const ang = dayTime * Math.PI * 2;
    const elev = Math.sin(ang + 0.35); // >0 siang
    const dayAmt = THREE.MathUtils.smoothstep(elev, -0.15, 0.35);
    const sunset = Math.max(0, 1 - Math.abs(elev) / 0.3) * (elev > -0.2 ? 1 : 0);

    const sky = tmpC.copy(SKY_NIGHT).lerp(SKY_DAY, dayAmt).lerp(SKY_SUNSET, sunset * 0.55);
    (this.scene.background as THREE.Color).copy(sky);
    this.scene.fog!.color.copy(sky);

    const d = 120;
    const se = Math.max(0.12, elev);
    this.sun.position.set(Math.cos(ang) * d, se * d, Math.sin(ang) * d * 0.6 + 30);
    this.sun.intensity = 0.15 + 2.1 * dayAmt;
    this.sun.color.setRGB(1, 0.85 + 0.15 * dayAmt - sunset * 0.2, 0.7 + 0.3 * dayAmt - sunset * 0.3);
    this.hemi.intensity = 0.45 + 0.9 * dayAmt;
    this.hemi.color.setRGB(0.55 + 0.25 * dayAmt, 0.62 + 0.28 * dayAmt, 0.85 + 0.15 * dayAmt);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - dayAmt * 1.6);

    for (const c of this.clouds) {
      c.position.x += dt * (c.userData.speed as number);
      if (c.position.x > 260) c.position.x = -260;
    }
  }

  private buildFence(rnd: () => number): void {
    const R = this.fenceRadius;
    const wood = lambert('#8a5a34');
    const woodDark = lambert('#6e4527');
    const n = Math.floor((Math.PI * 2 * R) / 2.6);
    const postGeo = new THREE.BoxGeometry(0.16, 1.3, 0.16);
    const posts = new THREE.InstancedMesh(postGeo, woodDark, n);
    const railGeo = new THREE.BoxGeometry(0.08, 0.12, 2.65);
    const rails = new THREE.InstancedMesh(railGeo, wood, n * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const tilt = (rnd() - 0.5) * 0.08;
      q.setFromAxisAngle(up, -a);
      m.compose(new THREE.Vector3(Math.cos(a) * R, 0.65, Math.sin(a) * R), q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt)), new THREE.Vector3(1, 1, 1));
      posts.setMatrixAt(i, m);
      const am = a + Math.PI / n;
      const rq = new THREE.Quaternion().setFromAxisAngle(up, -am);
      for (let k = 0; k < 2; k++) {
        m.compose(new THREE.Vector3(Math.cos(am) * R, 0.45 + k * 0.5, Math.sin(am) * R), rq, new THREE.Vector3(1, 1, 1));
        rails.setMatrixAt(i * 2 + k, m);
      }
    }
    posts.castShadow = rails.castShadow = true;
    this.group.add(posts, rails);
  }

  private buildBarn(): void {
    const g = new THREE.Group();
    const red = lambert('#b23b2e');
    const white = lambert('#f1ead8');
    const roof = lambert('#5b4636');
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 12), red);
    body.position.y = 2.5;
    const shape = new THREE.Shape();
    shape.moveTo(-5, 0); shape.lineTo(0, 3.6); shape.lineTo(5, 0); shape.lineTo(-5, 0);
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 12.6, bevelEnabled: false });
    roofGeo.translate(0, 0, -6.3);
    const roofMesh = new THREE.Mesh(roofGeo, roof);
    roofMesh.position.y = 5;
    const door = new THREE.Mesh(new THREE.BoxGeometry(4, 3.8, 0.2), white);
    door.position.set(0, 1.9, 6.05);
    const x1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5.2, 0.22), white);
    x1.position.set(0, 1.9, 6.1);
    x1.rotation.z = 0.8;
    const x2 = x1.clone();
    x2.rotation.z = -0.8;
    const doorInner = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.4, 0.1), red);
    doorInner.position.set(0, 1.9, 6.12);
    g.add(body, roofMesh, door, doorInner, x1, x2);
    g.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    const a = -2.4;
    const r = this.fenceRadius + 14;
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.lookAt(0, 0, 0);
    this.group.add(g);
  }

  private buildShopStall(): void {
    const g = new THREE.Group();
    const wood = lambert('#9b6a3c');
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.2), wood);
    counter.position.y = 0.55;
    for (const sx of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 0.15), wood);
      post.position.set(sx, 1.3, -0.5);
      g.add(post);
    }
    // atap belang
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 1.8), lambert(i % 2 ? '#f4efe1' : '#d9473b'));
      s.position.set(-1.375 + i * 0.55, 2.65, 0);
      s.rotation.x = 0.25;
      g.add(s);
    }
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.8),
      new THREE.MeshBasicMaterial({ map: makeTextTexture('TOKO  [B]', '#3b2a1a', '#ffd76a') }),
    );
    sign.position.set(0, 2.15, 0.52);
    g.add(counter, sign);
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    const r = this.fenceRadius - 4;
    const a = Math.PI / 2 + 0.35;
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.lookAt(0, 0, 0);
    this.group.add(g);
  }

  private buildTrees(rnd: () => number, worldR: number): void {
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6);
    const leafGeo = new THREE.IcosahedronGeometry(1.8, 0);
    const pineGeo = new THREE.ConeGeometry(1.6, 4.2, 7);
    const trunkMat = lambert('#6b4428');
    const leafMats = ['#4c8a3c', '#5f9c45', '#3e7a3a'].map((c) => lambert(c));
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2;
      const r = this.fenceRadius + 10 + rnd() * (worldR - this.fenceRadius - 25);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.2;
      const pine = rnd() < 0.45;
      const leaf = new THREE.Mesh(pine ? pineGeo : leafGeo, leafMats[Math.floor(rnd() * 3)]);
      leaf.position.y = pine ? 4 : 3.4;
      leaf.rotation.y = rnd() * 6;
      t.add(trunk, leaf);
      const s = 0.8 + rnd() * 0.9;
      t.scale.setScalar(s);
      t.position.set(x, Math.max(0, (r - this.fenceRadius - 12) * 0.04) * 1.2, z);
      t.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = r < this.fenceRadius + 30; });
      this.group.add(t);
    }
  }

  private buildBales(rnd: () => number): void {
    const geo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12);
    geo.rotateZ(Math.PI / 2);
    const mat = lambert('#d8b25a');
    const a0 = -2.4;
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(geo, mat);
      const a = a0 + (rnd() - 0.5) * 0.35;
      const r = this.fenceRadius + 5 + rnd() * 5;
      b.position.set(Math.cos(a) * r, 0.75 + (i > 4 ? 1.4 : 0), Math.sin(a) * r);
      b.rotation.y = rnd() * 3;
      b.castShadow = true;
      this.group.add(b);
    }
  }

  private buildClouds(rnd: () => number): void {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666, flatShading: true, fog: false });
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      const parts = 3 + Math.floor(rnd() * 4);
      for (let k = 0; k < parts; k++) {
        const p = new THREE.Mesh(geo, mat);
        p.scale.set(5 + rnd() * 6, 3 + rnd() * 3, 4 + rnd() * 4);
        p.position.set(k * 5 - parts * 2.5, rnd() * 2, (rnd() - 0.5) * 4);
        c.add(p);
      }
      c.position.set((rnd() - 0.5) * 500, 70 + rnd() * 40, (rnd() - 0.5) * 500);
      c.userData.speed = 1 + rnd() * 2;
      this.clouds.push(c);
      this.group.add(c);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
      }
    });
    this.group.clear();
  }
}
