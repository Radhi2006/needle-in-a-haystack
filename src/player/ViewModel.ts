import * as THREE from 'three';

const mats = new Map<string, THREE.MeshLambertMaterial>();
function mat(color: string, emissive?: string): THREE.MeshLambertMaterial {
  const key = color + (emissive ?? '');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: emissive ?? '#000000' });
    mats.set(key, m);
  }
  return m;
}

function box(g: THREE.Group, w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function cyl(g: THREE.Group, r: number, len: number, color: string, x = 0, y = 0, z = 0, seg = 6): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat(color));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

const WOOD = '#8a5a34';
const METAL = '#b9c2cc';
const SKIN = '#e0a878';

/** Bangun model alat (dipegang di tangan kanan, ujung kerja mengarah -Z). */
function buildTool(id: string): THREE.Group {
  const g = new THREE.Group();
  const handle = (len: number) => {
    const h = cyl(g, 0.022, len, WOOD, 0, 0, -len / 2 + 0.1);
    h.rotation.x = Math.PI / 2;
    return h;
  };
  switch (id) {
    case 'tangan': {
      box(g, 0.11, 0.11, 0.2, '#3b6fb0', 0, -0.01, 0.1); // lengan baju
      box(g, 0.085, 0.08, 0.2, SKIN, 0, 0, -0.08); // lengan bawah
      box(g, 0.1, 0.055, 0.1, SKIN, 0, 0.005, -0.22); // telapak
      for (let i = 0; i < 4; i++) box(g, 0.02, 0.024, 0.065, SKIN, -0.033 + i * 0.022, 0.012, -0.3);
      box(g, 0.026, 0.026, 0.055, SKIN, -0.058, 0, -0.21); // jempol
      break;
    }
    case 'garpu_kecil': {
      box(g, 0.025, 0.012, 0.22, METAL, 0, 0, -0.05);
      for (const x of [-0.015, 0, 0.015]) box(g, 0.006, 0.006, 0.08, METAL, x, 0, -0.2);
      break;
    }
    case 'garpu_jerami': {
      handle(0.9);
      box(g, 0.14, 0.02, 0.02, METAL, 0, 0, -0.82);
      for (const x of [-0.06, -0.02, 0.02, 0.06]) box(g, 0.012, 0.012, 0.22, METAL, x, 0, -0.94);
      break;
    }
    case 'sekop': {
      handle(0.75);
      const b = box(g, 0.22, 0.02, 0.26, '#7d8790', 0, 0, -0.8);
      b.rotation.x = -0.15;
      break;
    }
    case 'garu': {
      handle(0.95);
      box(g, 0.5, 0.03, 0.04, '#7a5030', 0, 0, -0.9);
      for (let i = 0; i < 9; i++) box(g, 0.012, 0.09, 0.012, METAL, -0.22 + i * 0.055, -0.05, -0.9);
      break;
    }
    case 'sabit': {
      handle(0.4);
      const blade = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 4, 16, Math.PI * 1.1), mat(METAL));
      blade.rotation.x = Math.PI / 2;
      blade.position.set(0.17, 0, -0.33);
      g.add(blade);
      break;
    }
    case 'mesin_potong': {
      handle(0.6);
      box(g, 0.34, 0.14, 0.34, '#c23b30', 0, -0.04, -0.68);
      const motor = box(g, 0.14, 0.1, 0.12, '#333333', 0, 0.08, -0.66);
      motor.userData.shake = true;
      const blade = box(g, 0.32, 0.008, 0.04, METAL, 0, -0.12, -0.68);
      blade.userData.spin = 'y';
      break;
    }
    case 'vakum':
    case 'penyedot': {
      const big = id === 'penyedot';
      const color = big ? '#e2b22a' : '#4a90d9';
      const tube = cyl(g, big ? 0.06 : 0.04, 0.8, color, 0, 0, -0.4, 10);
      tube.rotation.x = Math.PI / 2;
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(big ? 0.13 : 0.08, big ? 0.07 : 0.045, 0.16, 10), mat('#333333'));
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.z = -0.86;
      g.add(nozzle);
      box(g, big ? 0.24 : 0.16, big ? 0.22 : 0.16, 0.22, big ? '#555555' : '#2f6fb0', 0, -0.05, 0.1);
      const fan = box(g, big ? 0.2 : 0.12, 0.01, 0.02, '#999999', 0, 0, -0.95);
      fan.userData.spin = 'z';
      break;
    }
    case 'bor': {
      box(g, 0.16, 0.18, 0.3, '#e0a020', 0, 0, 0);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.6, 8), mat('#8b9399'));
      cone.rotation.x = -Math.PI / 2;
      cone.position.z = -0.45;
      cone.userData.spin = 'cone';
      g.add(cone);
      break;
    }
    case 'combine': {
      box(g, 0.5, 0.25, 0.4, '#3c8c3c', 0, -0.05, -0.1);
      box(g, 0.2, 0.2, 0.18, '#cfe8ff', 0, 0.17, 0);
      const reel = cyl(g, 0.1, 0.7, '#d4a020', 0, -0.05, -0.45, 8);
      reel.rotation.z = Math.PI / 2;
      reel.userData.spin = 'x';
      break;
    }
    case 'lubang_hitam': {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: 0x050008 }));
      core.position.z = -0.45;
      g.add(core);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.03, 6, 32),
        new THREE.MeshBasicMaterial({ color: 0xb36bff, transparent: true, opacity: 0.85 }),
      );
      ring.position.z = -0.45;
      ring.rotation.x = 1.2;
      ring.userData.spin = 'z';
      g.add(ring);
      box(g, 0.08, 0.08, 0.25, '#444444', 0, -0.05, -0.1);
      break;
    }
    default:
      box(g, 0.1, 0.1, 0.3, '#888888');
  }
  return g;
}

/** Alat yang dipegang di layar + animasi ayun/bob. */
export class ViewModel {
  readonly root = new THREE.Group();
  private current: THREE.Group | null = null;
  private currentId = '';
  private swing = 0;
  private bobT = 0;
  private cache = new Map<string, THREE.Group>();

  constructor(camera: THREE.Camera) {
    this.root.scale.setScalar(0.75);
    camera.add(this.root);
  }

  setTool(id: string): void {
    if (id === this.currentId) return;
    if (this.current) this.root.remove(this.current);
    let g = this.cache.get(id);
    if (!g) {
      g = buildTool(id);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = false;
          o.renderOrder = 10;
        }
      });
      this.cache.set(id, g);
    }
    this.current = g;
    this.currentId = id;
    this.root.add(g);
    this.swing = -0.4; // animasi ambil alat
  }

  use(): void {
    this.swing = 1;
  }

  update(dt: number, moveSpeed: number, active: boolean): void {
    this.swing = Math.max(0, this.swing - dt * 6);
    if (this.swing < 0) this.swing = Math.min(0, this.swing + dt * 3);
    this.bobT += dt * (moveSpeed > 0.5 ? moveSpeed * 1.8 : 1);
    const bobAmp = moveSpeed > 0.5 ? 0.012 : 0.004;
    const s = Math.sin(this.swing * Math.PI);
    this.root.position.set(0.26 + Math.cos(this.bobT) * bobAmp, -0.24 + Math.abs(Math.sin(this.bobT)) * bobAmp - s * 0.05, -0.42 - s * 0.12);
    this.root.rotation.set(-s * 0.55, 0.12, s * 0.1);
    if (!this.current) return;
    this.current.traverse((o) => {
      const spin = o.userData.spin as string | undefined;
      if (spin) {
        const sp = (active ? 30 : 3) * dt;
        if (spin === 'y') o.rotation.y += sp;
        else if (spin === 'z') o.rotation.z += sp;
        else if (spin === 'x') o.rotation.x += sp;
        else if (spin === 'cone') o.rotation.y += sp;
      }
      if (o.userData.shake && active) o.position.y = 0.08 + (Math.random() - 0.5) * 0.01;
    });
  }
}
