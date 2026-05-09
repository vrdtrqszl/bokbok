// Sound design for the BokBok creature world.
//
// Each of the 50 energy blocks has its own "voice" — a stable pitch derived
// from the emotion's id and valence. When a creature is generated, its
// blocks' voices stagger into a short cascading chord ("giggle") with the
// brief that the result should feel mystical, jelly-like, and dreamy.
//
// We synthesize entirely with the Web Audio API (no audio files shipped),
// so the soundbank stays in code:
//   - sine + triangle oscillators slightly detuned → jelly chorus
//   - low-pass filter → warmth (removes harsh harmonics)
//   - LFO vibrato → ethereal wobble
//   - feedback delay through a low-pass → dreamy shimmer tail
//   - pentatonic-biased pitch table → consonant clusters even when many
//     voices stack
//
// AudioContext is created lazily on first call; browsers require a user
// gesture before audio can play, and our entry points (Generate button,
// etc.) are all click handlers, so resume() succeeds the first time.

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
  if (ctx) return ctx;
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
  masterGain.gain.value = 0.32;
  masterGain.connect(next.destination);

  // Cheap but pretty "reverb": feedback delay with a tone control. The wet
  // signal feeds back into itself through a low-pass so each repeat is
  // softer and darker than the last → trail decays organically.
  const delay = next.createDelay(2.5);
  delay.delayTime.value = 0.20;
  const fb = next.createGain();
  fb.gain.value = 0.46;
  const tone = next.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2400;
  const wet = next.createGain();
  wet.gain.value = 0.40;

  delay.connect(tone);
  tone.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(masterGain);
  reverbInput = delay;

  return next;
}

async function resumeIfNeeded(): Promise<void> {
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore — browser blocked it */
    }
  }
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
  const { startOffset = 0, duration = 0.95, amp = 0.18 } = opts;
  const t0 = c.currentTime + startOffset;
  const t1 = t0 + duration;

  // Two oscillators, very slightly detuned. Sine for the body, triangle for
  // a touch of upper-harmonic shimmer (still soft compared to saw/square).
  const osc1 = c.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = pitch;

  const osc2 = c.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = pitch * (1 + 0.004 + Math.random() * 0.005); // ~7–15 cents

  // Envelope: soft 80 ms attack, decay to 50% sustain, exponential release.
  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(amp, t0 + 0.08);
  env.gain.exponentialRampToValueAtTime(amp * 0.55, t0 + 0.4);
  env.gain.exponentialRampToValueAtTime(0.001, t1);

  // Pitch-tracking lowpass: keeps low notes warm and high notes from
  // turning shrill, since cutoff scales with fundamental.
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1500 + pitch * 0.6;
  filter.Q.value = 1.2;

  // Vibrato LFO — ~5 Hz with a small pitch deviation. Reads as the dreamy
  // wobble in the brief.
  const lfo = c.createOscillator();
  lfo.frequency.value = 4.2 + Math.random() * 2.4;
  const lfoGain = c.createGain();
  lfoGain.gain.value = pitch * 0.010; // ~10 cents peak deviation
  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);

  // Wire: oscs → filter → env → master, with a parallel send to the global
  // reverb so trails build up organically across stacked voices.
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(env);
  env.connect(master);
  if (reverbInput) {
    const send = c.createGain();
    send.gain.value = 0.55;
    env.connect(send);
    send.connect(reverbInput);
  }

  osc1.start(t0);
  osc2.start(t0);
  lfo.start(t0);
  osc1.stop(t1 + 0.05);
  osc2.stop(t1 + 0.05);
  lfo.stop(t1 + 0.05);
}

/**
 * Single energy block "voice" — useful for hover / tap previews on the
 * Energy Blocks gallery if we wire one up later.
 */
export async function playEnergyBlock(key: EmotionKey): Promise<void> {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  await resumeIfNeeded();
  playVoice(c, masterGain, pitchFor(key), { duration: 1.15, amp: 0.24 });
}

/**
 * The full "creature giggle" — every block's voice cascading in. Called
 * when a creature is generated on /create (and from the manual canvas's
 * upload path) so the user hears the assembled emotional cluster the
 * moment it comes into being.
 */
export async function playCreatureGiggle(
  blocks: CreatureBlock[],
): Promise<void> {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  await resumeIfNeeded();
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

  // Stagger voices ~75 ms apart with a touch of jitter, so the cascade
  // reads as a giggle rather than a metronome.
  voices.forEach((b, i) => {
    const offset = i * 0.075 + Math.random() * 0.04;
    const amp = 0.15 + Math.random() * 0.06;
    const dur = 0.85 + Math.random() * 0.45;
    playVoice(c, masterGain!, pitchFor(b.emotionKey), {
      startOffset: offset,
      duration: dur,
      amp,
    });
  });
}
