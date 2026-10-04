/** Efek suara sintetis via WebAudio — tanpa file aset. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private lastRustle = 0;

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Harus dipanggil dari gestur pengguna (klik). */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseBurst(freq: number, q: number, peak: number, decay: number, type: BiquadFilterType = 'bandpass'): void {
    if (!this.ctx || !this.noise || !this.master) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.005, decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, decay + 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, delay = 0, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.005, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Suara kresek jerami. intensity 0..1 */
  rustle(intensity = 0.5): void {
    const now = performance.now();
    if (now - this.lastRustle < 45) return;
    this.lastRustle = now;
    this.noiseBurst(2200 + Math.random() * 1800, 0.9, 0.12 + intensity * 0.25, 0.06 + intensity * 0.12);
  }

  beep(strength: number): void {
    this.tone(880 + strength * 700, 0.06, 'square', 0.06);
  }

  boom(size: number): void {
    this.noiseBurst(500, 0.5, Math.min(0.9, 0.3 + size * 0.12), 0.5 + size * 0.15, 'lowpass');
    this.tone(90, 0.4 + size * 0.1, 'sine', 0.5, 0, 35);
  }

  whoosh(): void {
    this.noiseBurst(900, 0.6, 0.3, 0.6, 'lowpass');
  }

  ding(): void {
    this.tone(988, 0.12, 'triangle', 0.18);
    this.tone(1319, 0.2, 'triangle', 0.15, 0.07);
  }

  error(): void {
    this.tone(160, 0.15, 'sawtooth', 0.08);
  }

  click(): void {
    this.tone(1200, 0.03, 'triangle', 0.06);
  }

  sparkle(): void {
    for (let i = 0; i < 5; i++) this.tone(1800 + i * 320, 0.12, 'sine', 0.06, i * 0.06);
  }

  sonar(): void {
    this.tone(1400, 1.2, 'sine', 0.25, 0, 700);
  }

  crit(): void {
    this.tone(1568, 0.08, 'triangle', 0.12);
    this.tone(2093, 0.15, 'triangle', 0.1, 0.05);
  }

  win(): void {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((n, i) => this.tone(n, 0.35, 'triangle', 0.2, i * 0.11));
  }

  jet(): void {
    this.noiseBurst(400, 0.4, 0.05, 0.08, 'lowpass');
  }
}
