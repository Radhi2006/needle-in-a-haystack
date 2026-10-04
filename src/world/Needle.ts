import * as THREE from 'three';
import type { CellPos, HaystackGrid } from './HaystackGrid';
import { getGlowTexture } from './textures';
import { hashFloat } from '../core/rng';

/** Tampilan 3D jarum + kilau. Logika "terlihat atau tidak" diatur Game. */
export class NeedleView {
  readonly group = new THREE.Group();
  private needleMats: THREE.MeshStandardMaterial[] = [];
  private sparkle: THREE.Sprite;
  private marker: THREE.Sprite;
  private t = 0;
  /** Posisi dunia jarum saat ini. */
  readonly world = new THREE.Vector3();

  constructor() {
    const steel = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.18, emissive: 0x334455 });
    this.needleMats.push(steel);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0015, 0.14, 6), steel);
    shaft.position.y = -0.01;
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0025, 4, 10), steel);
    eye.position.y = 0.068;
    const needle = new THREE.Group();
    needle.add(shaft, eye);
    needle.rotation.set(1.2, 0.4, 0.3);
    needle.scale.setScalar(1.6);
    this.group.add(needle);

    this.sparkle = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xfff6d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.sparkle.scale.setScalar(0.35);
    this.group.add(this.sparkle);

    // Penanda tembus pandang (sonar / sinar-X / debug)
    this.marker = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x66ffee, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }),
    );
    this.marker.scale.setScalar(0.9);
    this.marker.renderOrder = 999;
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  placeAt(grid: HaystackGrid, cell: CellPos): void {
    // offset kecil deterministik di dalam sel
    const ox = (hashFloat(cell.x, cell.z, 1) - 0.5) * 0.2;
    const oz = (hashFloat(cell.x, cell.z, 2) - 0.5) * 0.2;
    this.world.set(grid.centerX(cell.x) + ox, grid.centerY(cell.y) - 0.12, grid.centerZ(cell.z) + oz);
    this.group.position.copy(this.world);
  }

  /**
   * @param exposed jarum tidak tertutup jerami padat
   * @param xray tampil tembus pandang (sonar, kacamata, debug)
   */
  update(dt: number, exposed: boolean, xray: boolean): void {
    this.t += dt;
    this.group.visible = exposed || xray;
    const tw = 0.5 + 0.5 * Math.sin(this.t * 5.3) * Math.sin(this.t * 2.1 + 1);
    this.sparkle.visible = exposed;
    this.sparkle.scale.setScalar(0.18 + 0.32 * tw);
    (this.sparkle.material as THREE.SpriteMaterial).rotation = this.t * 0.8;
    this.marker.visible = xray;
    this.marker.scale.setScalar(0.7 + 0.25 * Math.sin(this.t * 6));
  }

  /** Animasi terbang ke pemain (magnet). */
  flyTowards(target: THREE.Vector3, t: number): void {
    this.group.position.lerpVectors(this.world, target, t);
    this.group.visible = true;
    this.sparkle.visible = true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.needleMats) m.dispose();
  }
}
