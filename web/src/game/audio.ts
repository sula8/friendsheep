/**
 * Game audio. Real generated samples (music + key SFX) play through WebAudio
 * buffers for punch and zero-latency triggering, with procedural synthesis as a
 * graceful fallback for anything not yet loaded plus the fast-varying bleats.
 */

/** Sample keys that map to generated MP3 assets. */
export type SampleKey =
  | "music"
  | "thunk"
  | "pop"
  | "powerup"
  | "eliminate"
  | "fanfare";

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private buffers: Partial<Record<SampleKey, AudioBuffer>> = {};
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicNode: GainNode | null = null;

  // procedural music fallback
  private musicTimer: number | null = null;
  private musicStep = 0;

  muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.34;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call from a user gesture to unlock iOS Safari audio. */
  unlock(): void {
    this.ensure();
  }

  /** Fetch + decode the generated MP3 assets. Safe to call repeatedly. */
  async loadSamples(urls: Partial<Record<SampleKey, string>>): Promise<void> {
    const ctx = this.ensure();
    if (!ctx) return;
    const entries = Object.entries(urls) as [SampleKey, string][];
    await Promise.all(
      entries.map(async ([key, url]) => {
        if (!url || this.buffers[key]) return;
        try {
          const res = await fetch(url);
          const arr = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          this.buffers[key] = buf;
          if (key === "music" && this.musicTimer !== null) {
            // upgrade the procedural loop to the real track seamlessly
            this.stopMusic();
            this.startMusic();
          }
        } catch {
          // keep procedural fallback for this key
        }
      }),
    );
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  private playBuffer(
    key: SampleKey,
    vol: number,
    rate = 1,
  ): boolean {
    const ctx = this.ensure();
    const buf = this.buffers[key];
    if (!ctx || !buf || !this.sfxGain) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.start();
    return true;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    bend = 0,
    target?: GainNode,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (bend !== 0) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, freq + bend),
        ctx.currentTime + dur,
      );
    }
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(target ?? this.sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private noise(dur: number, vol: number, freq: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const size = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.sfxGain);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  // --- fast, always-procedural (huge variation, low cost) ---

  bleat(): void {
    const base = 180 + Math.random() * 160;
    this.tone(base, 0.18, "sawtooth", 0.22, -base * 0.4);
    setTimeout(() => this.tone(base * 1.1, 0.12, "square", 0.1, -40), 70);
  }

  charge(): void {
    this.tone(120, 0.25, "sawtooth", 0.07, 200);
  }

  dash(): void {
    this.noise(0.18, 0.22, 600);
  }

  countdown(): void {
    this.tone(440, 0.12, "square", 0.18);
  }

  buy(): void {
    if (this.playBuffer("powerup", 0.5, 1.25)) return;
    this.tone(660, 0.08, "square", 0.2);
    setTimeout(() => this.tone(990, 0.12, "square", 0.2), 80);
  }

  // --- sample-backed (with procedural fallback) ---

  thunk(power: number): void {
    const rate = 1.15 - power * 0.35 + (Math.random() * 0.1 - 0.05);
    if (this.playBuffer("thunk", 0.55 + power * 0.4, rate)) return;
    this.noise(0.12, 0.4 + power * 0.3, 140);
    this.tone(90, 0.18, "square", 0.3 + power * 0.2, -50);
  }

  pop(): void {
    const rate = 0.92 + Math.random() * 0.2;
    if (this.playBuffer("pop", 0.7, rate)) return;
    this.tone(420, 0.1, "sine", 0.3, 500);
    setTimeout(() => this.tone(900, 0.08, "sine", 0.18, -400), 60);
  }

  powerup(): void {
    if (this.playBuffer("powerup", 0.65)) return;
    this.tone(520, 0.08, "triangle", 0.25, 200);
    setTimeout(() => this.tone(780, 0.1, "triangle", 0.25, 300), 70);
    setTimeout(() => this.tone(1040, 0.12, "triangle", 0.2, 200), 150);
  }

  farmer(): void {
    this.tone(70, 0.3, "sawtooth", 0.22, 30);
  }

  eliminate(): void {
    if (this.playBuffer("eliminate", 0.7)) return;
    this.tone(300, 0.4, "sawtooth", 0.3, -260);
  }

  fanfare(): void {
    if (this.playBuffer("fanfare", 0.8)) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.25, "square", 0.22), i * 120),
    );
  }

  // --- music ---

  startMusic(): void {
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;
    // Prefer the real generated loop.
    const buf = this.buffers.music;
    if (buf) {
      if (this.musicSrc) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const node = ctx.createGain();
      node.gain.value = 1;
      src.connect(node);
      node.connect(this.musicGain);
      src.start();
      this.musicSrc = src;
      this.musicNode = node;
      return;
    }
    // Procedural fallback loop until the track loads.
    if (this.musicTimer !== null) return;
    const notes = [98, 98, 147, 110, 98, 98, 131, 123];
    this.musicStep = 0;
    const tick = (): void => {
      const n = notes[this.musicStep % notes.length];
      this.tone(n, 0.22, "triangle", 0.5, 0, this.musicGain ?? undefined);
      if (this.musicStep % 2 === 0) this.noise(0.04, 0.06, 4000);
      this.musicStep++;
    };
    this.musicTimer = window.setInterval(tick, 230);
  }

  stopMusic(): void {
    if (this.musicSrc) {
      try {
        this.musicSrc.stop();
      } catch {
        // already stopped
      }
      this.musicSrc.disconnect();
      this.musicNode?.disconnect();
      this.musicSrc = null;
      this.musicNode = null;
    }
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const audio = new GameAudio();
