// Sound design for the BokBok creature world.
//
// Each of the 50 energy blocks belongs to one of 8 colour groups (see
// EMOTION_COLOR_GROUP), and EVERY GROUP has its own voice character. So
// "happiness" / "joy" / "thrill" all sound bouncy-yellow, while "sadness"
// / "depression" / "loneliness" all sound sinking-blue — distinct from
// each other but kin within a group. Pitch is still per-emotion (id +
// valence picks a pentatonic note) so individual blocks within a group
// are still distinguishable.
//
// Each "voice" plays one or more "syllables" — a chirpy little burst with
// an optional pitch-step into the next syllable, so groups that talk
// across multiple notes (yellow "boo-DEE!", purple "ooh-aww", orange
// "bup-bup-bup") read as actual chatter rather than a single tone.
//
// Per-syllable recipe (params vary by group):
//   - oscA + lower-volume oscB → woody/poppy edge
//   - fast pitch sweep at attack: start fraction-of-target → ramp to
//     target over a few tens of ms (direction can be UP for chirpy or
//     DOWN for sighing)
//   - very fast attack into exponential decay (no sustain stage)
//   - resonant low-pass that tracks pitch
//   - light feedback-delay reverb send (per-group send level)
//
// AudioContext is created lazily on first call; browsers require a user
// gesture before audio can play, and our entry points (Generate button /
// energy block clicks) are all click handlers, so resume() succeeds.

import {
  EMOTIONS,
  EMOTION_COLOR_GROUP,
  type EmotionColorGroup,
  type EmotionKey,
} from "./emotions";
import type { CreatureBlock } from "./creature";

type AudioContextCtor = typeof AudioContext;
type WindowWithAudio = Window & {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
// Reverb chain — created once and reused.
let reverbInput: DelayNode | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) {
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

  // Tight "small room" reverb — feedback delay with a tone control.
  // Per-voice reverb send levels live in the group style table.
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

  // Resume synchronously — the gesture window matters here.
  if (next.state === "suspended") {
    next.resume().catch(() => {});
  }
  return next;
}

// Pentatonic-biased scale across two octaves. Pentatonic intervals avoid
// dissonant clusters when many voices stack, so even a 10-block giggle
// stays consonant.
const SCALE_HZ: number[] = [
  220.00, 246.94, 261.63, 293.66, 329.63, 392.00, 440.00,
  493.88, 523.25, 587.33, 659.25, 783.99, 880.00, 987.77,
];

// Stable pitch per emotion: id picks an index, valence shifts the band
// (positive emotions sound brighter, negative darker, neutral middle).
function pitchFor(key: EmotionKey): number {
  const e = EMOTIONS[key];
  if (!e) return 440;
  const baseIdx = (e.id - 1) % SCALE_HZ.length;
  const valenceShift = e.valence === 1 ? 2 : e.valence === -1 ? -3 : 0;
  const idx = Math.max(0, Math.min(SCALE_HZ.length - 1, baseIdx + valenceShift));
  return SCALE_HZ[idx];
}

// Convert a semitone offset to a frequency-multiplier ratio.
const semi = (s: number) => Math.pow(2, s / 12);

// Group-specific voice recipe — tuned toward "baby cooing + birds
// chirping": every group lives mostly in triangle/sine territory (no
// buzzy square/saw except a tiny mix in red), pitches sit higher than
// pure-talking territory, and most groups fire multi-syllable trills.
type GroupStyle = {
  oscA: OscillatorType;
  oscB: OscillatorType;
  /** Mix of oscB relative to oscA (oscA is fixed at 1.0). */
  oscBMix: number;
  /** oscB detune in cents (used when oscA === oscB — chorus). */
  oscBDetuneCents: number;
  /**
   * Octave shift on the base scale pitch. +1 lifts the group an octave
   * (bird register), 0 keeps it at the scale, -1 drops it (low-coo).
   * Lets us separate groups by register without changing the per-emotion
   * pitch identity.
   */
  octaveShift: number;
  /** Pitch sweep: start at target × sweepRatio. <1 = up, >1 = down. */
  sweepRatio: number;
  /** Sweep duration (s). */
  sweepDur: number;
  /** Filter cutoff base + pitch × pitchMult (Hz). */
  filterBase: number;
  filterPitchMult: number;
  filterQ: number;
  /** Envelope attack (s). */
  attack: number;
  /** Per-syllable duration (s). */
  syllableDur: number;
  /** Semitone offsets for each syllable, length = syllable count. */
  syllableSteps: number[];
  /** Spacing between syllable starts (s). */
  syllableSpacing: number;
  /** Reverb send (0..1). */
  reverbSend: number;
  /** Vibrato LFO frequency (Hz). 0 disables. */
  vibratoHz: number;
  /** Vibrato peak deviation in cents. */
  vibratoCents: number;
};

// Each group's "personality." Aim:
//   - bird-trill brightness for high-energy groups (yellow / mint / orange)
//   - baby-coo softness for emotional groups (purple / green / blue)
//   - clear separation between groups (registers + syllable patterns +
//     waveforms), but related groups stay sonically akin
//   - no buzzy square/saw except a small mix in red where it earns the
//     "intense" character; everything else triangle/sine
const GROUP_STYLES: Record<EmotionColorGroup, GroupStyle> = {
  // 🟡 bright/expanding — happy bird trill ("dee-DEE-DEEE!")
  yellow: {
    oscA: "triangle", oscB: "sine", oscBMix: 0.45, oscBDetuneCents: 0,
    octaveShift: +1,
    sweepRatio: 0.72, sweepDur: 0.030,
    filterBase: 2400, filterPitchMult: 1.0, filterQ: 1.8,
    attack: 0.010,
    syllableDur: 0.115, syllableSteps: [0, +2, +4], syllableSpacing: 0.075,
    reverbSend: 0.20,
    vibratoHz: 7, vibratoCents: 8,
  },
  // 🟢 stable/recovery — content baby coo ("mm-mmm")
  green: {
    oscA: "sine", oscB: "triangle", oscBMix: 0.35, oscBDetuneCents: 0,
    octaveShift: 0,
    sweepRatio: 0.88, sweepDur: 0.10,
    filterBase: 1300, filterPitchMult: 0.70, filterQ: 0.9,
    attack: 0.055,
    syllableDur: 0.32, syllableSteps: [0, -2], syllableSpacing: 0.165,
    reverbSend: 0.34,
    vibratoHz: 4.5, vibratoCents: 6,
  },
  // 🔴 intense — sharp little chirp ("ya-YEH!")
  red: {
    oscA: "triangle", oscB: "square", oscBMix: 0.18, oscBDetuneCents: 0,
    octaveShift: 0,
    sweepRatio: 0.55, sweepDur: 0.030,
    filterBase: 1600, filterPitchMult: 1.40, filterQ: 3.5,
    attack: 0.006,
    syllableDur: 0.14, syllableSteps: [0, +3], syllableSpacing: 0.070,
    reverbSend: 0.10,
    vibratoHz: 0, vibratoCents: 0,
  },
  // 🔵 sinking — soft low whoo ("ohh…")
  blue: {
    oscA: "sine", oscB: "triangle", oscBMix: 0.35, oscBDetuneCents: 0,
    octaveShift: -1,
    sweepRatio: 1.45, sweepDur: 0.20,
    filterBase: 900, filterPitchMult: 0.55, filterQ: 0.8,
    attack: 0.035,
    syllableDur: 0.50, syllableSteps: [0], syllableSpacing: 0,
    reverbSend: 0.46,
    vibratoHz: 3.5, vibratoCents: 7,
  },
  // 🟣 complex/deep — wistful baby warble ("ooh-aww-eee")
  purple: {
    oscA: "triangle", oscB: "triangle", oscBMix: 0.55, oscBDetuneCents: 12,
    octaveShift: 0,
    sweepRatio: 1.15, sweepDur: 0.085,
    filterBase: 1300, filterPitchMult: 0.85, filterQ: 1.4,
    attack: 0.030,
    syllableDur: 0.22, syllableSteps: [0, -2, -4], syllableSpacing: 0.115,
    reverbSend: 0.40,
    vibratoHz: 5, vibratoCents: 9,
  },
  // 🟠 tension/anxiety — fluttery rapid trill ("tip-tip-tip-tip")
  orange: {
    oscA: "triangle", oscB: "sine", oscBMix: 0.40, oscBDetuneCents: 0,
    octaveShift: +1,
    sweepRatio: 0.85, sweepDur: 0.020,
    filterBase: 2000, filterPitchMult: 0.9, filterQ: 2.2,
    attack: 0.007,
    syllableDur: 0.075, syllableSteps: [0, +1, 0, -1, 0], syllableSpacing: 0.055,
    reverbSend: 0.22,
    vibratoHz: 9, vibratoCents: 6,
  },
  // ⚫ apathy — quiet sigh ("mmf")
  grey: {
    oscA: "sine", oscB: "sine", oscBMix: 0.0, oscBDetuneCents: 0,
    octaveShift: -1,
    sweepRatio: 0.95, sweepDur: 0.15,
    filterBase: 700, filterPitchMult: 0.40, filterQ: 0.6,
    attack: 0.055,
    syllableDur: 0.28, syllableSteps: [0], syllableSpacing: 0,
    reverbSend: 0.14,
    vibratoHz: 0, vibratoCents: 0,
  },
  // 🌿 cognitive/clear — bright tweet ("tee-WEET!")
  mint: {
    oscA: "triangle", oscB: "sine", oscBMix: 0.40, oscBDetuneCents: 0,
    octaveShift: +1,
    sweepRatio: 0.78, sweepDur: 0.035,
    filterBase: 2600, filterPitchMult: 1.10, filterQ: 2.0,
    attack: 0.009,
    syllableDur: 0.13, syllableSteps: [0, +5], syllableSpacing: 0.070,
    reverbSend: 0.18,
    vibratoHz: 6, vibratoCents: 7,
  },
};

function styleFor(key: EmotionKey): GroupStyle {
  const group = EMOTION_COLOR_GROUP[key] ?? "mint";
  return GROUP_STYLES[group];
}

type SyllableOptions = {
  startOffset: number;
  amp: number;
};

// Schedules ONE chirp at a single pitch with the given group style.
function playSyllable(
  c: AudioContext,
  master: GainNode,
  pitch: number,
  style: GroupStyle,
  opts: SyllableOptions,
): void {
  const { startOffset, amp } = opts;
  const t0 = c.currentTime + startOffset;
  const t1 = t0 + style.syllableDur;

  // Apply per-group octave shift to the base pitch — lifts birds up,
  // sinks lows down, while keeping each emotion's place in the scale.
  const targetPitch = pitch * Math.pow(2, style.octaveShift);

  // Two oscillators — second is mixed in lower for a slight color edge.
  // If oscA === oscB, oscB is detuned for a chorus-y double.
  const oscA = c.createOscillator();
  oscA.type = style.oscA;

  const oscB = c.createOscillator();
  oscB.type = style.oscB;
  if (style.oscA === style.oscB && style.oscBDetuneCents !== 0) {
    oscB.detune.value = style.oscBDetuneCents;
  }

  // Pitch sweep — start at sweepRatio × target, ramp to target over sweepDur.
  // sweepRatio < 1 = upward chirp, > 1 = downward sigh.
  const sweepStart = targetPitch * style.sweepRatio;
  oscA.frequency.setValueAtTime(sweepStart, t0);
  oscA.frequency.exponentialRampToValueAtTime(targetPitch, t0 + style.sweepDur);
  oscB.frequency.setValueAtTime(sweepStart, t0);
  oscB.frequency.exponentialRampToValueAtTime(targetPitch, t0 + style.sweepDur);

  // Optional vibrato — small LFO modulating both oscillators' frequency
  // for trill / coo character. Skipped (no nodes created) when off.
  let lfo: OscillatorNode | null = null;
  if (style.vibratoHz > 0 && style.vibratoCents > 0) {
    lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = style.vibratoHz;
    const lfoGain = c.createGain();
    // Convert cents → Hz: peak deviation is target × (2^(cents/1200) − 1)
    lfoGain.gain.value =
      targetPitch * (Math.pow(2, style.vibratoCents / 1200) - 1);
    lfo.connect(lfoGain);
    lfoGain.connect(oscA.frequency);
    lfoGain.connect(oscB.frequency);
  }

  const mixA = c.createGain();
  mixA.gain.value = 1.0;
  const mixB = c.createGain();
  mixB.gain.value = style.oscBMix;

  // Pitch-tracking resonant lowpass — uses target pitch (post-shift) so the
  // brightness scales with the actual register the voice plays in.
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value =
    style.filterBase + targetPitch * style.filterPitchMult;
  filter.Q.value = style.filterQ;

  // Snappy envelope: short attack then exponential decay (no sustain).
  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(amp, t0 + style.attack);
  env.gain.exponentialRampToValueAtTime(0.001, t1);

  oscA.connect(mixA);
  oscB.connect(mixB);
  mixA.connect(filter);
  mixB.connect(filter);
  filter.connect(env);
  env.connect(master);
  if (reverbInput && style.reverbSend > 0) {
    const send = c.createGain();
    send.gain.value = style.reverbSend;
    env.connect(send);
    send.connect(reverbInput);
  }

  oscA.start(t0);
  oscB.start(t0);
  if (lfo) lfo.start(t0);
  oscA.stop(t1 + 0.02);
  oscB.stop(t1 + 0.02);
  if (lfo) lfo.stop(t1 + 0.02);
}

type VoiceOptions = {
  startOffset?: number;
  /** Peak amp for syllables. */
  amp?: number;
};

// One emotion's full "voice" — fires every syllable in the group's pattern.
function playVoice(
  c: AudioContext,
  master: GainNode,
  basePitch: number,
  style: GroupStyle,
  opts: VoiceOptions = {},
): void {
  const { startOffset = 0, amp = 0.32 } = opts;
  for (let i = 0; i < style.syllableSteps.length; i++) {
    const stepPitch = basePitch * semi(style.syllableSteps[i]);
    const offset = startOffset + i * style.syllableSpacing;
    // Slight per-syllable amp falloff so trailing syllables feel softer.
    const sylAmp = amp * (i === 0 ? 1.0 : 0.85);
    playSyllable(c, master, stepPitch, style, {
      startOffset: offset,
      amp: sylAmp,
    });
  }
}

/** Returns the total time (s) one full voice takes for a given style. */
function voiceTotalDur(style: GroupStyle): number {
  const lastStart = (style.syllableSteps.length - 1) * style.syllableSpacing;
  return lastStart + style.syllableDur;
}

/**
 * Single energy block "voice" — fires the group's syllable pattern.
 * Wired to /energy-blocks tile clicks AND the main-page ambient chatter
 * (which calls this with a small amp for distant creatures and a loud
 * amp for the focused one).
 */
export function playEnergyBlock(key: EmotionKey, amp = 0.36): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  playVoice(c, masterGain, pitchFor(key), styleFor(key), { amp });
}

/**
 * Force-create + resume the AudioContext. Call from a user gesture (e.g.
 * the first pointerdown on the main page) so subsequent timer-driven
 * audio (ambient chatter) can fire without being blocked by autoplay
 * policy. Returns true if the context is now alive.
 */
export function unlockAudio(): boolean {
  const c = ensureCtx();
  return !!c;
}

/**
 * The full "creature giggle" — every block's voice cascading in.
 * Synchronous so the user-gesture window stays valid for autoplay policy.
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

  // Stagger: each next voice starts ~70% through the previous voice's
  // total duration plus a little jitter — overlapping enough to feel like
  // a babbling chorus, separated enough that you can pick out chirps.
  let cursor = 0;
  voices.forEach((b, i) => {
    const style = styleFor(b.emotionKey);
    const offset = cursor + Math.random() * 0.025;
    const amp = 0.26 + Math.random() * 0.10;
    playVoice(c, masterGain!, pitchFor(b.emotionKey), style, {
      startOffset: offset,
      amp,
    });
    // Advance the cursor by ~70% of this voice's total duration so the
    // next voice overlaps the tail of this one.
    cursor += voiceTotalDur(style) * 0.55;
    // Tiny safety nudge so we never get exact zero spacing.
    if (i === 0) cursor = Math.max(cursor, 0.06);
  });
}
