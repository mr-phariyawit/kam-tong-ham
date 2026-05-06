/**
 * SoundManager — Web Audio API synthesized sounds
 * No external audio files needed. All tones generated via oscillator.
 */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.4;
  }

  _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  _playTone(frequency, duration, type = 'sine', rampDown = true) {
    if (!this.enabled) return;
    try {
      const ctx = this._ensureContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(this.volume, ctx.currentTime);
      if (rampDown) {
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      }
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Silently fail — audio is not critical
    }
  }

  _playNoise(duration, filterFreq) {
    if (!this.enabled) return;
    try {
      const ctx = this._ensureContext();
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq || 3000, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(this.volume * 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(ctx.currentTime);
      source.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  /** Short tick for countdown or timer warning */
  tick() {
    this._playTone(880, 0.08, 'sine');
  }

  /** Countdown final "GO" sound */
  go() {
    this._playTone(523.25, 0.1, 'square');
    setTimeout(() => this._playTone(659.25, 0.1, 'square'), 100);
    setTimeout(() => this._playTone(783.99, 0.2, 'square'), 200);
  }

  /** Kill button pressed */
  kill() {
    this._playTone(220, 0.15, 'sawtooth');
    setTimeout(() => this._playTone(165, 0.3, 'sawtooth'), 100);
  }

  /** Vote cast */
  vote() {
    this._playTone(600, 0.1, 'sine');
  }

  /** Correct guess / success */
  success() {
    this._playTone(523.25, 0.12, 'sine');
    setTimeout(() => this._playTone(659.25, 0.12, 'sine'), 120);
    setTimeout(() => this._playTone(783.99, 0.12, 'sine'), 240);
    setTimeout(() => this._playTone(1046.5, 0.25, 'sine'), 360);
  }

  /** Wrong guess / fail */
  fail() {
    this._playTone(311, 0.2, 'square');
    setTimeout(() => this._playTone(233, 0.4, 'square'), 200);
  }

  /** Buzzer — time's up */
  buzzer() {
    this._playTone(150, 0.5, 'sawtooth');
    this._playNoise(0.3, 1500);
  }

  /** Eliminated sound */
  eliminated() {
    this._playTone(440, 0.1, 'sawtooth');
    setTimeout(() => this._playTone(330, 0.1, 'sawtooth'), 100);
    setTimeout(() => this._playTone(220, 0.1, 'sawtooth'), 200);
    setTimeout(() => this._playTone(110, 0.4, 'sawtooth'), 300);
  }

  /** Confetti / winner celebration */
  celebration() {
    const notes = [523, 587, 659, 698, 784, 880, 988, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this._playTone(freq, 0.15, 'sine'), i * 80);
    });
  }

  /** Button tap feedback */
  tap() {
    this._playTone(1200, 0.03, 'sine');
  }

  /** Toggle sound on/off */
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

window.soundManager = new SoundManager();
