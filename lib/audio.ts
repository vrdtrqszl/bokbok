// Sound design for the BokBok creature world.
//
// Each of the 50 energy blocks has its own "voice" — a stable pitch derived
// from the emotion's id and valence. When a creature is generated, its
// blocks' voices stagger into a quick cascading chatter ("giggle"). The
// character target is playful / Animal-Crossing-villager / cute character
// SFX — short chirpy "boops" rather than long mystical pads.
//
// Per-voice recipe:
//   - triangle + lower-volume square oscillators → woody/poppy edge that
//     sits between sine smoothness and saw harshness, classic chirp tone
//   - fast pitch sweep at attack (~50–80 ms): start ~25–35% below the
//     target frequency and exponential-ramp UP to it, giving every note
//     a "boop!" rising chirp
//   - very fast attack (~12 ms) into exponential decay (no sustain) so
//     each note stays short and snappy
//   - resonant low-pass filter → percussive bonk/quack character
//   - light feedback-delay reverb send (small room, not hall) for a
//     hint of bounce without smearing the cascade
//   - pentatonic-biased pitch table → consonant clusters even when many
//     voices stack
//
// AudioContext is created lazily on first call; browsers require a user
// gesture before audio can play, and our entry points (Generate button /
// energy block clicks) are all click handlers, so resume() succeeds.

import { EMOTIONS, type EmotionKey } from "./emotions";
import type { CreatureBlock } from "./creature";

type AudioContextCtor = typeof AudioContext;
type WindowWithAudio = Window & {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
// Reverb/shimmer chain — created once and reused across all voices.
let reverbInput: DelayNode | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) {
    // Existing ctx — kick off resume synchronously in case the browser
    // suspended it (page lost focus, autoplay policy, etc.). Fire-and-
    // forget; we don't need to wait for the promise.
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }
  const w = window as WindowWithAudio;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  let next: AudioContext;
  try {
    next = new Ctor();
  } catch {
    return null;
  }
  ctx = next;

  masterGain = next.createGain();
  masterGain.gain.value = 0.50;
  masterGain.connect(next.destination);

  // Tight "small room" reverb — feedback delay with a tone control, but
  // shorter delay and less feedback than a hall reverb. Gives the chirpy
  // notes a tiny bounce/space without smearing the cascade.
  const delay = next.createDelay(2.5);
  delay.delayTime.value = 0.085;
  const fb = next.createGain();
  fb.gain.value = 0.28;
  const tone = next.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2800;
  const wet = next.createGain();
  wet.gain.value = 0.22;

  delay.connect(tone);
  tone.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(masterGain);
  reverbInput = delay;

  // CRUCIAL for autoplay policy: kick off resume() synchronously inside
  // the (presumed) user gesture that created the context. The promise it
  // returns can settle later — we don't need to await it because we
  // schedule events with explicit start times relative to currentTime,
  // which the engine handles correctly even while resuming.
  if (next.state === "suspended") {
    next.resume().catch(() => {});
  }
  return next;
}

// Pentatonic-biased scale across two octaves. With many voices stacking,
// pentatonic intervals avoid the dissonant clusters a chromatic scale would
// produce, so even a 10-emotion creature giggles consonantly.
const SCALE_HZ: number[] = [
  220.00, 246.94, 261.63, 293.66, 329.63, 392.00, 440.00,
  493.88, 523.25, 587.33, 659.25, 783.99, 880.00, 987.77,
];

// Stable pitch per emotion: id picks an index, then valence shifts the band
// (positive emotions sound brighter, negative darker, neutral middle).
function pitchFor(key: EmotionKey): number {
  const e = EMOTIONS[key];
  if (!e) return 440;
  const baseIdx = (e.id - 1) % SCALE_HZ.length;
  const valenceShift = e.valence === 1 ? 2 : e.valence === -1 ? -3 : 0;
  const idx = Math.max(0, Math.min(SCALE_HZ.length - 1, baseIdx + valenceShift));
  return SCALE_HZ[idx];
}

type VoiceOptions = {
  /** Seconds-from-now offset for staggered chords. */
  startOffset?: number;
  /** Total note length before release fade is finished. */
  duration?: number;
  /** Peak gain (0..1). Keep low when many voices stack. */
  amp?: number;
};

function playVoice(
  c: AudioContext,
  master: GainNode,
  pitch: number,
  opts: VoiceOptions = {},
): void {
  const { startOffset = 0, duration = 0.26, amp = 0.30 } = opts;
  const t0 = c.currentTime + startOffset;
  const t1 = t0 + duration;

  // Triangle (body) + square (chirpy edge). Square is mixed in lower so
  // it adds a tiny "boop" formant without taking over the tone.
  const oscTri = c.createOscillator();
  oscTri.type = "triangle";

  const oscSqr = c.createOscillator();
  oscSqr.type = "square";

  // Pitch sweep at attack — start ~25–35% below the target and exponential-
  // ramp UP to it over the first 60 ms. This is what makes every note
  // read as "boop!" rather than a pure tone — the rising glide is the
  // signature of Animal-Crossing-style character voices.
  const sweepStart = pitch * (0.65 + Math.random() * 0.10);
  const sweepDur = 0.05 + Math.random() * 0.025;
  oscTri.frequency.setValueAtTime(sweepStart, t0);
  oscTri.frequency.exponentialRampToValueAtTime(pitch, t0 + sweepDur);
  oscSqr.frequency.setValueAtTime(sweepStart, t0);
  oscSqr.frequency.exponentialRampToValueAtTime(pitch, t0 + sweepDur);

  // Mix: triangle full, square ~25%. Sum at the filter's input.
  const mixTri = c.createGain();
  mixTri.gain.value = 1.0;
  const mixSqr = c.createGain();
  mixSqr.gain.value = 0.25;

  // Resonant low-pass — moderate cutoff that tracks pitch, with enough Q
  // for the percussive "bonk/quack" character that gives villager-speech
  // its woody pop.
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1700 + pitch * 1.0;
  filter.Q.value = 4.0;

  // Snappy envelope: 12 ms attack into pure exponential decay — no
  // sustain stage. Each note is short and bouncy, never droning.
  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(amp, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.001, t1);

  // Wire: oscs → mix → filter → env → master, with a small reverb send
  // for tiny-room bounce.
  oscTri.connect(mixTri);
  oscSqr.connect(mixSqr);
  mixTri.connect(filter);
  mixSqr.connect(filter);
  filter.connect(env);
  env.connect(master);
  if (reverbInput) {
    const send = c.createGain();
    send.gain.value = 0.18;
    env.connect(send);
    send.connect(reverbInput);
  }

  oscTri.start(t0);
  oscSqr.start(t0);
  oscTri.stop(t1 + 0.02);
  oscSqr.stop(t1 + 0.02);
}

/**
 * Single energy block "voice" — useful for hover / tap previews on the
 * Energy Blocks gallery if we wire one up later. Synchronous: returns
 * immediately after scheduling.
 */
export function playEnergyBlock(key: EmotionKey): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  playVoice(c, masterGain, pitchFor(key), { duration: 0.32, amp: 0.36 });
}

/**
 * The full "creature giggle" — every block's voice cascading in. Called
 * when a creature is generated on /create (and from the manual canvas's
 * upload path) so the user hears the assembled emotional cluster the
 * moment it comes into being.
 *
 * Synchronous on purpose: the previous async version awaited a context
 * resume between the click handler and voice scheduling, and that
 * microtask boundary can fall outside the user-gesture window in
 * stricter browsers (Safari especially), silently blocking audio.
 * ensureCtx() now kicks off resume() fire-and-forget — the engine
 * resumes while we schedule, and scheduled events with explicit
 * currentTime offsets play correctly once the resume settles.
 */
export function playCreatureGiggle(blocks: CreatureBlock[]): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  if (blocks.length === 0) return;

  // Cap voices so a 12-block creature doesn't turn into a wall of noise.
  // Sample evenly across the block list to keep emotional variety.
  const MAX_VOICES = 10;
  let voices = blocks;
  if (voices.length > MAX_VOICES) {
    const step = voices.length / MAX_VOICES;
    voices = Array.from(
      { length: MAX_VOICES },
      (_, i) => blocks[Math.floor(i * step)],
    );
  }

  // Stagger voices ~65 ms apart with a touch of jitter — quick chatter,
  // never a metronome. Total cascade ≈ 0.5–0.9 s for a typical creature
  // (about the rhythm of an Animal Crossing villager finishing a line).
  voices.forEach((b, i) => {
    const offset = i * 0.065 + Math.random() * 0.025;
    const amp = 0.26 + Math.random() * 0.09;
    const dur = 0.22 + Math.random() * 0.10;
    playVoice(c, masterGain!, pitchFor(b.emotionKey), {
      startOffset: offset,
      duration: dur,
      amp,
    });
  });
}
