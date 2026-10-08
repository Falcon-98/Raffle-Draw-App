'use client';

/** Tiny synthesized sound effects — no audio files to host. */
let ctx: AudioContext | null = null;

function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  return ctx;
}

/** Browsers only allow audio after a user gesture; call this from any click. */
export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume();
}

export function audioReady() {
  return ctx?.state === 'running';
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const c = ac();
  if (!c || c.state !== 'running') return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

export function tick(progress: number) {
  tone(520 + progress * 500, 0, 0.05, 'triangle', 0.07);
}

export function fanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, i) => tone(n, i * 0.11, 0.35, 'triangle', 0.14));
  [523.25, 659.25, 783.99, 1046.5].forEach((n) => tone(n, 0.5, 1.1, 'sine', 0.06));
}

export function whoosh() {
  tone(180, 0, 0.25, 'sawtooth', 0.03);
}
