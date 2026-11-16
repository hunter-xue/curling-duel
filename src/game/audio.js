/**
 * 极简程序化音效：撞击"嗒"声 + 出手"嗖"声。
 * 首次用户交互时才创建 AudioContext（浏览器自动播放策略）。
 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.lastClack = 0;
    this.muted = false;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return !!this.ctx && !this.muted && this.ctx.state === 'running';
  }

  /** @param {number} impact 撞击强度（相对速度） */
  clack(impact = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastClack < 0.028) return;
    this.lastClack = now;

    const v = Math.min(1, Math.max(0.08, impact / 8));
    const gain = ctx.createGain();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1500 + v * 900;
    band.Q.value = 0.8;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(820 + v * 520, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.085);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.045 + v * 0.095, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    osc.connect(band).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** 出手时短促的气声 */
  whoosh() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const len = Math.floor(ctx.sampleRate * 0.22);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.4);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(600, now);
    band.frequency.exponentialRampToValueAtTime(2200, now + 0.18);
    band.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.value = 0.06;

    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(now);
  }

  /** 掉台时低沉的一声 */
  thud() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.28);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }
}
