/**
 * Efectos de sonido sintetizados con Web Audio (sin archivos, funcionan offline).
 * Desactivados por defecto; se activan desde Ajustes.
 */
export type SoundName = 'chip' | 'card' | 'flip' | 'win' | 'lose' | 'tick' | 'click' | 'shuffle' | 'turn';

let ctx: AudioContext | null = null;
let enabled = false;
let volume = 0.6;

export function configureSound(on: boolean, vol: number): void {
  enabled = on;
  volume = Math.max(0, Math.min(1, vol));
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(a: AudioContext, t: number, dur: number, freq: number, q: number, gain: number): void {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain * volume;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

function tone(a: AudioContext, t: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain * volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(name: SoundName): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.005;
  switch (name) {
    case 'chip':
      noiseBurst(a, t, 0.05, 3200, 6, 0.5);
      noiseBurst(a, t + 0.04, 0.04, 2600, 8, 0.35);
      break;
    case 'card':
      noiseBurst(a, t, 0.09, 1800, 0.8, 0.35);
      break;
    case 'flip':
      noiseBurst(a, t, 0.06, 2400, 1.2, 0.3);
      break;
    case 'shuffle':
      for (let i = 0; i < 6; i++) noiseBurst(a, t + i * 0.045, 0.05, 1500 + i * 100, 1, 0.25);
      break;
    case 'win':
      tone(a, t, 659.25, 0.18, 0.22, 'triangle');
      tone(a, t + 0.12, 880, 0.28, 0.22, 'triangle');
      break;
    case 'lose':
      tone(a, t, 330, 0.25, 0.12, 'sine');
      break;
    case 'tick':
      noiseBurst(a, t, 0.015, 4000, 10, 0.25);
      break;
    case 'click':
      tone(a, t, 1200, 0.04, 0.06, 'square');
      break;
    case 'turn':
      tone(a, t, 523.25, 0.12, 0.12, 'sine');
      break;
  }
}

export function vibrate(ms: number, on: boolean): void {
  if (!on) return;
  try {
    globalThis.navigator?.vibrate?.(ms);
  } catch {
    /* no soportado */
  }
}
