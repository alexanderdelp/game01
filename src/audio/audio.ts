/** Prozedurale Musik und Klänge per Web Audio (keine Audiodateien, keine Lizenzfragen). */
import { load, save } from '../game/save';

export const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

export type Mood = 'day' | 'night' | 'cyber';

/** Tonleiter (MIDI-Noten über zwei Oktaven) je Stimmung. */
export function scaleFor(mood: Mood, root = 60): number[] {
  const steps = mood === 'night' ? [0, 3, 5, 7, 10] : mood === 'cyber' ? [0, 2, 3, 7, 8] : [0, 2, 4, 7, 9];
  return [...steps.map((s) => root + s), ...steps.map((s) => root + 12 + s)];
}

/** Akkordfolge (Grundtöne relativ) je Stimmung: 4 Takte. */
export function progression(mood: Mood): number[] {
  return mood === 'day' ? [0, 9, 5, 7] : mood === 'night' ? [0, 8, 5, 7] : [0, 3, 8, 7];
}

type Sfx = 'hit' | 'hurt' | 'pickup' | 'levelup' | 'quest' | 'attack' | 'open' | 'cast';

class AudioEngine {
  enabled = load<boolean>('audio') ?? true;
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private mood: Mood = 'day';
  private nextNote = 0;
  private step = 0;
  private timer?: ReturnType<typeof setInterval>;
  private melody = 7;

  /** Muss nach einer Nutzeraktion aufgerufen werden (Browser-Regel für Audio). */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.18;
      this.musicGain.connect(this.master);
    }
    void this.ctx.resume();
    if (!this.timer) {
      this.nextNote = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 100);
    }
  }

  toggle(): void {
    this.enabled = !this.enabled;
    save('audio', this.enabled);
    if (!this.enabled) {
      if (this.timer) clearInterval(this.timer);
      this.timer = undefined;
      void this.ctx?.suspend();
    } else {
      this.unlock();
    }
  }

  setMood(m: Mood): void {
    this.mood = m;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, slide = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private noise(start: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g).connect(this.master!);
    src.start(start);
  }

  /** Sechzehntel-Raster vorausplanen: Bass je Viertel, Melodie als Zufallsweg auf der Tonleiter. */
  private schedule(): void {
    if (!this.ctx || !this.musicGain || !this.enabled) return;
    const spb = this.mood === 'night' ? 0.75 : 0.6; // Sekunden pro Schlag
    const scale = scaleFor(this.mood);
    const prog = progression(this.mood);
    while (this.nextNote < this.ctx.currentTime + 0.4) {
      const bar = Math.floor(this.step / 8) % prog.length;
      const root = 48 + prog[bar];
      const t = this.nextNote;
      if (this.step % 2 === 0) this.tone(midiToFreq(root), t, spb * 0.9, 'triangle', 0.5, this.musicGain);
      if (this.step % 8 === 4) this.tone(midiToFreq(root + 7), t, spb * 0.6, 'triangle', 0.3, this.musicGain);
      if (Math.random() < (this.mood === 'night' ? 0.35 : 0.55)) {
        this.melody = Math.max(0, Math.min(scale.length - 1, this.melody + Math.floor(Math.random() * 5) - 2));
        this.tone(midiToFreq(scale[this.melody] + 12), t, spb * (Math.random() < 0.3 ? 1.4 : 0.7), this.mood === 'cyber' ? 'sawtooth' : 'square', 0.12, this.musicGain);
      }
      this.nextNote += spb / 2;
      this.step++;
    }
  }

  sfx(name: Sfx): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const m = this.master;
    switch (name) {
      case 'attack':
        this.noise(t, 0.08, 0.15);
        break;
      case 'hit':
        this.tone(220, t, 0.12, 'square', 0.25, m, 0.5);
        this.noise(t, 0.05, 0.2);
        break;
      case 'hurt':
        this.tone(160, t, 0.25, 'sawtooth', 0.3, m, 0.4);
        break;
      case 'pickup':
        this.tone(880, t, 0.08, 'square', 0.15, m);
        this.tone(1320, t + 0.07, 0.1, 'square', 0.15, m);
        break;
      case 'cast':
        this.tone(660, t, 0.3, 'sawtooth', 0.12, m, 2.2);
        this.tone(990, t + 0.05, 0.25, 'triangle', 0.15, m, 1.6);
        break;
      case 'open':
        [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.06, 0.15, 'triangle', 0.25, m));
        break;
      case 'quest':
        [587, 740, 880, 1175].forEach((f, i) => this.tone(f, t + i * 0.08, 0.2, 'square', 0.15, m));
        break;
      case 'levelup':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, t + i * 0.09, 0.35, 'square', 0.18, m));
        break;
    }
  }
}

export const audio = new AudioEngine();
