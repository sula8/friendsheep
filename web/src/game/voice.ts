/**
 * Opt-in "BAAA" voice charge. Detects a sustained loud-ish vocalization via RMS
 * in a mid frequency band — NOT speech recognition — so it's robust and low
 * latency. Always paired with a button fallback in the UI.
 */
export class VoiceCharge {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private raf = 0;
  private threshold = 0.12;
  private sustain = 0;
  active = false;

  onCharge: (on: boolean) => void = () => {};
  onLevel: (level: number) => void = () => {};

  async enable(): Promise<boolean> {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      await this.ctx.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.7;
      src.connect(filter);
      filter.connect(this.analyser);
      this.data = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      this.active = true;
      this.tick();
      return true;
    } catch {
      this.active = false;
      return false;
    }
  }

  /** Quick calibration: sets threshold a bit above current noise floor. */
  calibrate(): void {
    if (!this.analyser || !this.data) return;
    this.analyser.getByteTimeDomainData(this.data);
    this.threshold = Math.max(0.1, this.rms() + 0.08);
  }

  private rms(): number {
    if (!this.data) return 0;
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.data.length);
  }

  private tick = (): void => {
    if (!this.analyser || !this.data) return;
    this.analyser.getByteTimeDomainData(this.data);
    const level = this.rms();
    this.onLevel(Math.min(1, level / 0.4));
    const loud = level > this.threshold;
    // require a tiny minimum sustain so chatter doesn't false-trigger
    if (loud) this.sustain = Math.min(1, this.sustain + 0.2);
    else this.sustain = Math.max(0, this.sustain - 0.15);
    this.onCharge(this.sustain > 0.3);
    this.raf = requestAnimationFrame(this.tick);
  };

  disable(): void {
    cancelAnimationFrame(this.raf);
    this.active = false;
    this.onCharge(false);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.stream = null;
  }
}
