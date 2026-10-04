import * as THREE from 'three';
import { getGlowTexture } from './textures';

interface Projectile {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  onArrive: () => void;
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

  throwObject(kind: string, from: THREE.Vector3, to: THREE.Vector3, onArrive: () => void): void {
    let mesh: THREE.Object3D;
    if (kind === 'kipas') {
      mesh = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 16), new THREE.MeshLambertMaterial({ color: 0x4aa0e0 }));
    } else if (kind === 'dinamit' || kind === 'petasan') {
      const g = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0xc8302a }));
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xffaa33, blending: THREE.AdditiveBlending, depthWrite: false }));
      spark.scale.setScalar(0.3);
      spark.position.y = 0.18;
      g.add(stick, spark);
      mesh = g;
    } else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(kind === 'bom_raksasa' ? 0.35 : 0.18, 12, 8), new THREE.MeshLambertMaterial({ color: kind === 'bom_raksasa' ? 0x3a7a2a : 0x222222 }));
    }
    mesh.position.copy(from);
    this.group.add(mesh);
    const dist = from.distanceTo(to);
    this.projectiles.push({ mesh, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.25, dist / 18), arc: Math.min(3, dist * 0.15), onArrive });
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
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.z += dt * 5;
      if (k >= 1) {
        this.group.remove(p.mesh);
        p.mesh.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
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
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  clearDrone(): void {
    this.droneZone.visible = false;
    this.droneRadius = 0;
  }
}
