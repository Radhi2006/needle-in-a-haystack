import * as THREE from 'three';

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; spin: number;
  life: number; max: number;
}

/** Serpihan jerami beterbangan (pool InstancedMesh). */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private readonly max = 1200) {
    const geo = new THREE.BoxGeometry(0.015, 0.015, 0.16);
    const mat = new THREE.MeshLambertMaterial({ color: 0xe0bd62 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) {
      this.ps.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, life: 0, max: 1 });
      this.mesh.setMatrixAt(i, this.zero);
    }
  }

  burst(x: number, y: number, z: number, n: number, speed = 2.5, up = 2.5): void {
    n = Math.min(n, 220);
    for (let i = 0; i < n; i++) {
      const p = this.ps[this.next];
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random());
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = up * (0.4 + Math.random());
      p.rx = Math.random() * 6;
      p.ry = Math.random() * 6;
      p.spin = (Math.random() - 0.5) * 16;
      p.max = p.life = 0.6 + Math.random() * 0.8;
    }
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.ps[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      p.vy -= 9 * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vz *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.02, p.y + p.vy * dt);
      p.z += p.vz * dt;
      p.rx += p.spin * dt;
      p.ry += p.spin * 0.7 * dt;
      this.e.set(p.rx, p.ry, 0);
      this.q.setFromEuler(this.e);
      const sc = Math.min(1, (p.life / p.max) * 3);
      this.s.setScalar(sc);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
