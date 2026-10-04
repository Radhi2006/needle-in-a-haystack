import * as THREE from 'three';
import { CELL } from '../core/config';
import { compassWord, fmtDec } from '../core/format';
import { lvl } from '../items/stats';
import type { Game } from '../core/Game';

const XRAY_RANGE = 7;
const SONAR_RANGE = 14;

/** Semua alat deteksi jarum: kompas, detektor logam, magnet, sonar, drone, sinar-X, termal. */
export class Detection {
  /** Sudut panah kompas relatif terhadap arah pandang (derajat, searah jarum jam). */
  compassDeg = 0;
  /** 0..1 kekuatan sinyal detektor logam (0 = di luar jangkauan). */
  signal = 0;
  /** Perkiraan jarak dari detektor pro (meter) atau null. */
  approxDist: number | null = null;
  muted = false;
  xrayOn = false;
  sonarCooldown = 0;
  sonarReveal = 0;
  private beepT = 0;
  private t = 0;
  private distNoise = 0;
  private tmp = new THREE.Vector3();

  constructor(private game: Game) {}

  has(id: string): boolean {
    return lvl(this.game.state, id) > 0;
  }

  get detectorRange(): number {
    return this.has('detektor_pro') ? 16 : this.has('detektor') ? 8 : 0;
  }

  get magnetRange(): number {
    return this.has('magnet_besar') ? 4 : this.has('magnet_kecil') ? 1.5 : 0;
  }

  /** Jarum boleh ditampilkan tembus pandang saat ini? */
  get xrayVisible(): boolean {
    if (this.sonarReveal > 0) return true;
    if (!this.xrayOn || !this.has('sinar_x')) return false;
    return this.game.eyePos(this.tmp).distanceTo(this.game.needle.world) <= XRAY_RANGE;
  }

  toggleXray(): void {
    if (!this.has('sinar_x')) {
      this.game.hud.toast('Kamu belum punya Kacamata Sinar-X 🥽');
      return;
    }
    this.xrayOn = !this.xrayOn;
    this.game.hud.toast(this.xrayOn ? '🥽 Sinar-X AKTIF' : '🥽 Sinar-X mati');
  }

  toggleMute(): void {
    if (!this.detectorRange) return;
    this.muted = !this.muted;
    this.game.hud.toast(this.muted ? '🔇 Bunyi detektor dimatikan' : '🔊 Bunyi detektor dinyalakan');
  }

  sonarPing(): void {
    if (!this.has('sonar')) {
      this.game.hud.toast('Kamu belum punya Sonar Ping 🔊');
      return;
    }
    if (this.sonarCooldown > 0) {
      this.game.hud.toast(`Sonar masih mengisi ulang (${Math.ceil(this.sonarCooldown)} dtk)`);
      this.game.sfx.error();
      return;
    }
    this.sonarCooldown = 30;
    const eye = this.game.eyePos(this.tmp);
    this.game.effects.sonarPing(eye, SONAR_RANGE);
    this.game.sfx.sonar();
    const d = eye.distanceTo(this.game.needle.world);
    if (d <= SONAR_RANGE) {
      this.sonarReveal = 4;
      this.game.hud.toast(`📍 Sonar menangkap logam ${fmtDec(d)} m dari kamu!`);
    } else {
      this.game.hud.toast('Sonar: tidak ada logam dalam 14 m.');
    }
  }

  update(dt: number): void {
    const g = this.game;
    this.t += dt;
    this.sonarCooldown = Math.max(0, this.sonarCooldown - dt);
    this.sonarReveal = Math.max(0, this.sonarReveal - dt);
    if (g.state.won || g.needleCollecting) return;

    const eye = g.eyePos(this.tmp);
    const n = g.needle.world;
    const d = eye.distanceTo(n);

    // Kompas
    if (this.has('kompas')) {
      const yawT = Math.atan2(-(n.x - eye.x), -(n.z - eye.z));
      let rel = yawT - g.player.yaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const wobble = Math.sin(this.t * 1.3) * 22 + Math.sin(this.t * 3.7 + 1) * 9;
      this.compassDeg = (-rel * 180) / Math.PI + wobble;
    }

    // Detektor logam
    const range = this.detectorRange;
    if (range > 0 && d <= range) {
      this.signal = 1 - d / range;
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.beepT = 0.07 + 1.1 * (1 - this.signal);
        if (!this.muted) g.sfx.beep(this.signal);
      }
      if (this.has('detektor_pro')) {
        this.distNoise += (Math.sin(this.t * 0.9) * 0.08 - this.distNoise) * Math.min(1, dt);
        this.approxDist = d * (1 + this.distNoise);
      } else this.approxDist = null;
    } else {
      this.signal = 0;
      this.approxDist = null;
    }

    // Magnet
    const mr = this.magnetRange;
    if (mr > 0) {
      const center = g.player.pos.clone();
      center.y += 0.9;
      if (center.distanceTo(n) <= mr) g.collectNeedle('magnet');
    }

    // Drone pemindai
    if (this.has('drone_scan')) {
      const dr = g.state.drone;
      dr.timer -= dt;
      if (dr.timer <= 0) {
        dr.timer = 45;
        dr.radius = dr.scans === 0 ? 16 : Math.max(1.5, dr.radius * 0.55);
        dr.scans++;
        const a = Math.random() * Math.PI * 2;
        const off = Math.random() * dr.radius * 0.6;
        dr.cx = n.x + Math.cos(a) * off;
        dr.cz = n.z + Math.sin(a) * off;
        g.effects.setDroneZone(dr.cx, dr.cz, dr.radius);
        g.hud.toast(`🛸 Drone: jarum berada dalam pilar cahaya (radius ${fmtDec(dr.radius)} m)`);
        g.sfx.ding();
      }
    }
  }

  /** Teks untuk peta termal. */
  thermalText(): string | null {
    if (!this.has('termal')) return null;
    const n = this.game.needle.world;
    const h = Math.round(n.y * 2) / 2;
    return `🌡️ Jarum: sisi ${compassWord(n.x, n.z)}, ${Math.hypot(n.x, n.z).toFixed(0)} m dari tengah, tinggi ±${fmtDec(h)} m`;
  }

  /** Petunjuk acak dari nenek. */
  grandmaHint(): string {
    const n = this.game.needle.world;
    const r = Math.random();
    const dirs = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
    if (r < 0.15) {
      const jokes = [
        '"Dulu kakekmu juga cari jarum di jerami... yang ketemu malah nenek."',
        '"Sudah makan belum, Nak? Cari jarum itu butuh tenaga."',
        '"Jarum itu seperti jodoh. Datang saat tidak dicari."',
        '"Nenek lupa tadi mau bilang apa."',
      ];
      return `👵 Nenek: ${jokes[Math.floor(Math.random() * jokes.length)]}`;
    }
    if (r < 0.5) {
      const truthful = Math.random() < 0.8;
      const dir = truthful ? compassWord(n.x, n.z) : dirs[Math.floor(Math.random() * dirs.length)];
      return `👵 Nenek: "Nenek rasa jarumnya di sisi ${dir} tumpukan."`;
    }
    if (r < 0.75) {
      const h = Math.max(0, n.y + (Math.random() < 0.8 ? 0 : (Math.random() - 0.5) * 6));
      return `👵 Nenek: "Kira-kira ${h.toFixed(0)} meter dari tanah, Nak."`;
    }
    const dist = Math.hypot(n.x, n.z) + (Math.random() - 0.5) * 3 * CELL * 4;
    return `👵 Nenek: "Sekitar ${Math.max(0, dist).toFixed(0)} meter dari tengah tumpukan."`;
  }
}
