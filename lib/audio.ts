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
// Always-on secondary output that bypasses the mute. Used by per-page
// click handlers that should fire regardless of the global Sound Off
// state (e.g. clicking an energy block tile or a BokBokpedia creature
// — "you pressed it, you should hear it"). Voices routed here connect
// straight to destination through alwaysOnGain, which is held at
// UNMUTED_GAIN forever and never ramped by setAudioMuted().
let alwaysOnGain: GainNode | null = null;
// Reverb chain — created once and reused.
let reverbInput: DelayNode | null = null;

// ---- Global mute state ------------------------------------------------
// The Sound On/Off toggle (top-right of the main viewport) flips this.
// We persist it in localStorage so the preference survives reloads, and
// drive masterGain.gain on toggle to mute everything (one-shot block
// voices, ambient chatter, creature giggle) with a tiny ramp to avoid
// clicks. Subscribers receive the new state synchronously after a flip.
const MUTE_STORAGE_KEY = "bokbok:audio-muted";
const UNMUTED_GAIN = 0.50;
let muted = false;
const muteListeners = new Set<(m: boolean) => void>();

function readStoredMute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeStoredMute(m: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, m ? "1" : "0");
  } catch {
    // Ignore storage errors (private mode etc.) — in-memory state still works.
  }
}
// Hydrate from localStorage at module load so the very first ensureCtx()
// already creates masterGain at the correct volume.
if (typeof window !== "undefined") {
  muted = readStoredMute();
}

export function getAudioMuted(): boolean {
  return muted;
}

export function setAudioMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  writeStoredMute(next);
  if (masterGain && ctx) {
    // Short ramp to the target gain to avoid a "click" on instant cut.
    const t = ctx.currentTime;
    const g = masterGain.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(next ? 0 : UNMUTED_GAIN, t + 0.05);
    } catch {
      g.value = next ? 0 : UNMUTED_GAIN;
    }
  }
  muteListeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      // Listener failures don't propagate.
    }
  });
}

/** Subscribe to mute-state changes. Returns an unsubscribe function. */
export function subscribeAudioMuted(cb: (muted: boolean) => void): () => void {
  muteListeners.add(cb);
  return () => {
    muteListeners.delete(cb);
  };
}

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
  // Honor any pre-existing mute preference at context creation. If the
  // user toggled "sound off" before unlocking audio (or refreshed with
  // mute saved), the very first voice should still respect it.
  masterGain.gain.value = muted ? 0 : UNMUTED_GAIN;
  masterGain.connect(next.destination);

  // Always-on output path — same headline volume, never muted.
  alwaysOnGain = next.createGain();
  alwaysOnGain.gain.value = UNMUTED_GAIN;
  alwaysOnGain.connect(next.destination);

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

// Each group's "personality." Aim: baby babbling + bubble + mystical
// creature. Recipe components:
//   - sine/triangle ONLY — no square/saw anywhere. Keeps the timbre soft
//     and vowel-like (no buzzy synth bite even in the "intense" red).
//   - heavier vibrato (10–18 cents) + slow rate gives the wobbly cooing
//     of an unsteady baby voice.
//   - very low filter Q (0.3–1.0) — voices read as pure tones rather
//     than honky synth blips.
//   - multi-syllable groups now PORTAMENTO between syllables (see
//     playUtterance), so a 3-syllable yellow voice glides across pitches
//     instead of stepping. Reads as connected babble, not staccato.
//   - filter envelope opens then closes during the utterance, giving a
//     bubble-like "expand and contract" feel.
const GROUP_STYLES: Record<EmotionColorGroup, GroupStyle> = {
  // 🟡 bright/expanding — happy babble ("ooh-deee-eee")
  yellow: {
    oscA: "sine", oscB: "triangle", oscBMix: 0.30, oscBDetuneCents: 0,
    octaveShift: +1,
    sweepRatio: 0.78, sweepDur: 0.060,
    filterBase: 1800, filterPitchMult: 0.85, filterQ: 0.7,
    attack: 0.030,
    syllableDur: 0.150, syllableSteps: [0, +2, +4], syllableSpacing: 0.110,
    reverbSend: 0.30,
    vibratoHz: 6.5, vibratoCents: 14,
  },
  // 🟢 stable/recovery — content coo ("mm-mmm")
  green: {
    oscA: "sine", oscB: "sine", oscBMix: 0.45, oscBDetuneCents: 18,
    octaveShift: 0,
    sweepRatio: 0.88, sweepDur: 0.12,
    filterBase: 1200, filterPitchMult: 0.55, filterQ: 0.5,
    attack: 0.060,
    syllableDur: 0.36, syllableSteps: [0, -2], syllableSpacing: 0.190,
    reverbSend: 0.40,
    vibratoHz: 4.0, vibratoCents: 12,
  },
  // 🔴 intense — bright but soft chirp ("ya-WEH!") — still no harsh wave
  red: {
    oscA: "triangle", oscB: "sine", oscBMix: 0.45, oscBDetuneCents: 0,
    octaveShift: 0,
    sweepRatio: 0.62, sweepDur: 0.045,
    filterBase: 1500, filterPitchMult: 1.05, filterQ: 1.4,
    attack: 0.014,
    syllableDur: 0.16, syllableSteps: [0, +3], syllableSpacing: 0.085,
    reverbSend: 0.18,
    vibratoHz: 5.0, vibratoCents: 10,
  },
  // 🔵 sinking — long low whoo ("ohh…")
  blue: {
    oscA: "sine", oscB: "sine", oscBMix: 0.40, oscBDetuneCents: 14,
    octaveShift: -1,
    sweepRatio: 1.45, sweepDur: 0.22,
    filterBase: 800, filterPitchMult: 0.45, filterQ: 0.4,
    attack: 0.045,
    syllableDur: 0.55, syllableSteps: [0], syllableSpacing: 0,
    reverbSend: 0.50,
    vibratoHz: 3.5, vibratoCents: 11,
  },
  // 🟣 complex/deep — mystical warble ("ooh-aww-eee")
  purple: {
    oscA: "triangle", oscB: "triangle", oscBMix: 0.60, oscBDetuneCents: 18,
    octaveShift: 0,
    sweepRatio: 1.10, sweepDur: 0.10,
    filterBase: 1300, filterPitchMult: 0.75, filterQ: 0.8,
    attack: 0.035,
    syllableDur: 0.26, syllableSteps: [0, -2, -4], syllableSpacing: 0.135,
    reverbSend: 0.46,
    vibratoHz: 4.5, vibratoCents: 16,
  },
  // 🟠 tension/anxiety — bubbly rapid trill ("blip-blip-blip-blip")
  orange: {
    oscA: "sine", oscB: "triangle", oscBMix: 0.30, oscBDetuneCents: 0,
    octaveShift: +1,
    sweepRatio: 0.85, sweepDur: 0.025,
    filterBase: 1900, filterPitchMult: 0.75, filterQ: 1.0,
    attack: 0.012,
    syllableDur: 0.090, syllableSteps: [0, +1, 0, -1, 0], syllableSpacing: 0.075,
    reverbSend: 0.28,
    vibratoHz: 8.0, vibratoCents: 9,
  },
  // ⚫ apathy — quiet sigh ("mmf…")
  grey: {
    oscA: "sine", oscB: "sine", oscBMix: 0.20, oscBDetuneCents: 8,
    octaveShift: -1,
    sweepRatio: 0.95, sweepDur: 0.18,
    filterBase: 700, filterPitchMult: 0.35, filterQ: 0.3,
    attack: 0.075,
    syllableDur: 0.32, syllableSteps: [0], syllableSpacing: 0,
    reverbSend: 0.18,
    vibratoHz: 2.5, vibratoCents: 8,
  },
  // 🌿 cognitive/clear — bright bubble tweet ("tee-WEET!")
  mint: {
    oscA: "sine", oscB: "triangle", oscBMix: 0.35, oscBDetuneCents: 0,
    octaveShift: +1,
    sweepRatio: 0.80, sweepDur: 0.050,
    filterBase: 2200, filterPitchMult: 0.95, filterQ: 0.8,
    attack: 0.018,
    syllableDur: 0.15, syllableSteps: [0, +5], syllableSpacing: 0.090,
    reverbSend: 0.30,
    vibratoHz: 5.5, vibratoCents: 12,
  },
};

function styleFor(key: EmotionKey): GroupStyle {
  const group = EMOTION_COLOR_GROUP[key] ?? "mint";
  return GROUP_STYLES[group];
}

type UtteranceOptions = {
  startOffset: number;
  amp: number;
};

// Schedules ONE complete voice — across however many syllables the group
// uses — as a single connected utterance. One pair of oscillators plays
// from start to finish; the frequency curve PORTAMENTOs between syllable
// pitches (with a brief brighter sweep at the very start), and the
// envelope dips slightly between syllables to give them rhythmic shape
// without re-attacking. The filter cutoff opens then closes across the
// utterance for a bubble-like expand/contract feel.
function playUtterance(
  c: AudioContext,
  master: GainNode,
  basePitch: number,
  style: GroupStyle,
  opts: UtteranceOptions,
): void {
  const { startOffset, amp } = opts;
  const t0 = c.currentTime + startOffset;

  // Apply per-group octave shift to the base pitch — lifts birds up,
  // sinks lows down, while keeping each emotion's place in the scale.
  // Plus tiny ±15-cent jitter per call so two consecutive plays of the
  // same emotion don't sound mechanically identical (organic baby
  // imprecision).
  const jitter = Math.pow(2, ((Math.random() - 0.5) * 30) / 1200);
  const targetPitch = basePitch * Math.pow(2, style.octaveShift) * jitter;

  // Compute the absolute pitch each syllable lands on.
  const sylPitches = style.syllableSteps.map(
    (step) => targetPitch * Math.pow(2, step / 12),
  );
  const lastSylStart = (sylPitches.length - 1) * style.syllableSpacing;
  const tEnd = t0 + lastSylStart + style.syllableDur;

  // ── Oscillators ──────────────────────────────────────────────────────
  const oscA = c.createOscillator();
  oscA.type = style.oscA;
  const oscB = c.createOscillator();
  oscB.type = style.oscB;
  if (style.oscA === style.oscB && style.oscBDetuneCents !== 0) {
    oscB.detune.value = style.oscBDetuneCents;
  }

  // ── Frequency curve ─────────────────────────────────────────────────
  // Initial sweep — start at sweepRatio × first-syllable pitch, ramp
  // exponentially to it over sweepDur. Up-sweep = chirp, down = sigh.
  const sweepStart = sylPitches[0] * style.sweepRatio;
  oscA.frequency.setValueAtTime(sweepStart, t0);
  oscA.frequency.exponentialRampToValueAtTime(sylPitches[0], t0 + style.sweepDur);
  oscB.frequency.setValueAtTime(sweepStart, t0);
  oscB.frequency.exponentialRampToValueAtTime(sylPitches[0], t0 + style.sweepDur);

  // Portamento between syllables — linearRamp to the next syllable's
  // pitch over a brief glide. This is the key change that turns
  // step-step-step chirps into a connected babble.
  const PORTAMENTO_S = 0.045;
  for (let i = 1; i < sylPitches.length; i++) {
    const tSyl = t0 + i * style.syllableSpacing;
    oscA.frequency.linearRampToValueAtTime(sylPitches[i], tSyl + PORTAMENTO_S);
    oscB.frequency.linearRampToValueAtTime(sylPitches[i], tSyl + PORTAMENTO_S);
  }

  // ── Vibrato (optional) ──────────────────────────────────────────────
  // One LFO runs through the whole utterance, modulating both oscillators
  // for a unified wobble. Skipped entirely when vibrato is off.
  let lfo: OscillatorNode | null = null;
  if (style.vibratoHz > 0 && style.vibratoCents > 0) {
    lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = style.vibratoHz;
    const lfoGain = c.createGain();
    lfoGain.gain.value =
      targetPitch * (Math.pow(2, style.vibratoCents / 1200) - 1);
    lfo.connect(lfoGain);
    lfoGain.connect(oscA.frequency);
    lfoGain.connect(oscB.frequency);
  }

  // ── Mix ─────────────────────────────────────────────────────────────
  const mixA = c.createGain();
  mixA.gain.value = 1.0;
  const mixB = c.createGain();
  mixB.gain.value = style.oscBMix;

  // ── Filter (with envelope) ──────────────────────────────────────────
  // Low-Q lowpass that "opens" during the attack and slowly "closes"
  // across the utterance — gives a bubble-like expand/contract shape.
  const cutoffSettled = style.filterBase + targetPitch * style.filterPitchMult;
  const cutoffPeak = cutoffSettled * 1.5;
  const cutoffStart = cutoffSettled * 0.55;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = style.filterQ;
  filter.frequency.setValueAtTime(cutoffStart, t0);
  filter.frequency.linearRampToValueAtTime(cutoffPeak, t0 + style.attack * 1.6);
  filter.frequency.exponentialRampToValueAtTime(cutoffSettled * 0.45, tEnd);

  // ── Amplitude envelope ──────────────────────────────────────────────
  // Gentle attack, then dip-and-rebound across each syllable boundary so
  // multi-syllable utterances feel articulated even though one pair of
  // oscillators plays through them all. Final exponential release.
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(amp, t0 + style.attack);
  for (let i = 1; i < sylPitches.length; i++) {
    const tSyl = t0 + i * style.syllableSpacing;
    // Tiny dip just before the next syllable lands (rhythm).
    env.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, amp * 0.40),
      Math.max(t0 + 0.001, tSyl - 0.018),
    );
    // Re-peak slightly attenuated as the syllable arrives.
    env.gain.exponentialRampToValueAtTime(amp * 0.92, tSyl + 0.030);
  }
  env.gain.exponentialRampToValueAtTime(0.0001, tEnd);

  // ── Wire ────────────────────────────────────────────────────────────
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
  oscA.stop(tEnd + 0.05);
  oscB.stop(tEnd + 0.05);
  if (lfo) lfo.stop(tEnd + 0.05);
}

type VoiceOptions = {
  startOffset?: number;
  /** Peak amp for the utterance. */
  amp?: number;
};

// Compatibility wrapper — early code paths called playVoice; now it's a
// thin shim around playUtterance.
function playVoice(
  c: AudioContext,
  master: GainNode,
  basePitch: number,
  style: GroupStyle,
  opts: VoiceOptions = {},
): void {
  const { startOffset = 0, amp = 0.32 } = opts;
  playUtterance(c, master, basePitch, style, { startOffset, amp });
}

/** Returns the total time (s) one full utterance takes for a given style. */
function voiceTotalDur(style: GroupStyle): number {
  const lastStart = (style.syllableSteps.length - 1) * style.syllableSpacing;
  return lastStart + style.syllableDur;
}

/**
 * Single energy block "voice" — fires the group's syllable pattern.
 * Wired to /energy-blocks tile clicks AND the main-page ambient chatter
 * (which calls this with a small amp for distant creatures and a loud
 * amp for the focused one).
 *
 * Pass `force: true` to bypass the global mute (Sound Off toggle).
 * Used by per-page click handlers — pressing an energy block or a
 * BokBokpedia creature box should always play, even when ambient
 * chatter is silenced.
 */
// ---- Per-color-group creature chirps ---------------------------------
// Eight color groups, eight distinct sonic flavours. Every chirp still
// shares the "mystical / bouncy / cute" umbrella (pure-sine sources +
// reverb wash), but the pitch arc, envelope, octave register, detune
// shimmer, lowpass character, and reverb send all vary by group so a
// red anger chirp doesn't sound like a yellow joy chirp.
//
// The eight groups (EmotionColorGroup):
//   yellow → bright bouncy "ping!"   high register, big overshoot
//   green  → soft warm hum            low-mid, gentle upward glide
//   red    → punchy drop "bomp!"      mid register, descending arc
//   blue   → falling sigh             low register, long tail, downward slide
//   purple → harmonic chime           perfect-fifth overtone, slow attack
//   orange → trembling bell           tremolo wobble, jittery decay
//   grey   → distant whisper          muted (filter closed), long fade
//   mint   → crystal "ding!"          neutral pitch, no arc, light reverb
//
// Per-emotion pitch (pitchFor) still picks the specific note within
// the group's octave register, so the 50 emotions remain distinguish-
// able even after collapsing onto 8 timbres.
type ChirpGroupStyle = {
  /** Multiply pitchFor(key) by this. 2 = +1 octave, 1 = same, 0.5 = -1. */
  octaveMult: number;
  /** Pitch arc as [start_mult, peak_mult, end_mult] of the base pitch. */
  pitchArc: [number, number, number];
  /** Arc timing in seconds — [time to peak, time to end]. */
  pitchArcTiming: [number, number];
  /** Detune of oscB in cents (0 = unison, ±N = chorus / beating). */
  oscBDetuneCents: number;
  /** Add a third oscillator at the perfect fifth (1.5× pitch) for
   *  harmonic depth. Used by purple. */
  fifthHarmonic: boolean;
  /** Attack time in seconds. Snappier = brighter onset. */
  attackSec: number;
  /** Total chirp duration in seconds. */
  durationSec: number;
  /** Lowpass cutoff multiplier (× base pitch). Lower = darker. */
  lowpassMult: number;
  /** Lowpass Q resonance. */
  lowpassQ: number;
  /** Reverb wet send (0–1). Higher = more ethereal. */
  reverbSend: number;
  /** Tremolo amount on the gain (0–1). 0 = no wobble. Used by orange. */
  tremoloDepth: number;
  /** Tremolo rate (Hz). */
  tremoloHz: number;
};

const GROUP_CHIRPS: Record<EmotionColorGroup, ChirpGroupStyle> = {
  // 🟡 Bright bouncy "ping!" — high register, big up-overshoot, sparkly.
  yellow: {
    octaveMult: 2.0,
    pitchArc: [0.7, 1.18, 1.0],
    pitchArcTiming: [0.04, 0.13],
    oscBDetuneCents: 14,
    fifthHarmonic: false,
    attackSec: 0.005,
    durationSec: 0.38,
    lowpassMult: 7,
    lowpassQ: 0.4,
    reverbSend: 0.45,
    tremoloDepth: 0,
    tremoloHz: 0,
  },
  // 🟢 Soft warm hum — mid register, gentle small upward glide, long
  // mellow tail. Sounds like a deep breath out.
  green: {
    octaveMult: 1.0,
    pitchArc: [0.95, 1.02, 1.0],
    pitchArcTiming: [0.06, 0.22],
    oscBDetuneCents: 8,
    fifthHarmonic: false,
    attackSec: 0.05,
    durationSec: 0.55,
    lowpassMult: 4,
    lowpassQ: 0.3,
    reverbSend: 0.35,
    tremoloDepth: 0,
    tremoloHz: 0,
  },
  // 🔴 Punchy descending "bomp!" — mid register, pitch DROPS, snappy
  // envelope, less reverb (more direct / dry).
  red: {
    octaveMult: 1.5,
    pitchArc: [1.25, 1.0, 0.85],
    pitchArcTiming: [0.03, 0.18],
    oscBDetuneCents: 18,
    fifthHarmonic: false,
    attackSec: 0.003,
    durationSec: 0.32,
    lowpassMult: 5,
    lowpassQ: 0.8,
    reverbSend: 0.22,
    tremoloDepth: 0,
    tremoloHz: 0,
  },
  // 🔵 Falling sigh — low register, slow downward slide, lots of
  // reverb. Distant and sad.
  blue: {
    octaveMult: 1.0,
    pitchArc: [1.05, 0.92, 0.78],
    pitchArcTiming: [0.08, 0.45],
    oscBDetuneCents: 6,
    fifthHarmonic: false,
    attackSec: 0.04,
    durationSec: 0.65,
    lowpassMult: 3.5,
    lowpassQ: 0.4,
    reverbSend: 0.55,
    tremoloDepth: 0,
    tremoloHz: 0,
  },
  // 🟣 Harmonic chime — mid register, adds a perfect-fifth overtone
  // for layered depth. Slow attack, generous reverb. The "complex
  // emotion" sound.
  purple: {
    octaveMult: 1.5,
    pitchArc: [0.9, 1.0, 1.0],
    pitchArcTiming: [0.12, 0.35],
    oscBDetuneCents: 4,
    fifthHarmonic: true,
    attackSec: 0.06,
    durationSec: 0.55,
    lowpassMult: 5,
    lowpassQ: 0.4,
    reverbSend: 0.55,
    tremoloDepth: 0,
    tremoloHz: 0,
  },
  // 🟠 Trembling bell — mid-high register, fast tremolo wobble that
  // makes the chirp feel anxious / jittery.
  orange: {
    octaveMult: 1.5,
    pitchArc: [0.9, 1.05, 0.98],
    pitchArcTiming: [0.05, 0.18],
    oscBDetuneCents: 22,
    fifthHarmonic: false,
    attackSec: 0.01,
    durationSec: 0.45,
    lowpassMult: 5,
    lowpassQ: 0.6,
    reverbSend: 0.4,
    tremoloDepth: 0.4,
    tremoloHz: 11,
  },
  // ⚫ Distant whisper — low register, dark filter, very long soft
  // tail. Sounds far away / fading.
  grey: {
    octaveMult: 1.0,
    pitchArc: [0.9, 0.95, 0.85],
    pitchArcTiming: [0.07, 0.4],
    oscBDetuneCents: 3,
    fifthHarmonic: false,
    attackSec: 0.07,
    durationSec: 0.7,
    lowpassMult: 2.5,
    lowpassQ: 0.3,
    reverbSend: 0.6,
    tremoloDepth: 0,
    tremoloHz: 0,
  },
  // 🌿 Crystal "ding!" — neutral pitch (no arc), pure clean sine,
  // light reverb. The "insight" / "clarity" sound.
  mint: {
    octaveMult: 2.0,
    pitchArc: [1.0, 1.0, 1.0],
    pitchArcTiming: [0.005, 0.2],
    oscBDetuneCents: 5,
    fifthHarmonic: false,
    attackSec: 0.004,
    durationSec: 0.4,
    lowpassMult: 8,
    lowpassQ: 0.3,
    reverbSend: 0.4,
    tremoloDepth: 0,
    tremoloHz: 0,
  },
};

function playGroupChirp(
  c: AudioContext,
  out: GainNode,
  basePitchHz: number,
  group: EmotionColorGroup,
  opts: { amp?: number; t0?: number } = {},
): void {
  const { amp = 0.36, t0: requestedT0 } = opts;
  const now = c.currentTime;
  const t0 = Math.max(requestedT0 ?? now, now);
  const style = GROUP_CHIRPS[group];
  const p = basePitchHz * style.octaveMult;

  // Two-oscillator chorus, optionally plus a fifth harmonic for purple.
  const oscs: OscillatorNode[] = [];
  const mixGains: number[] = [];
  const oscA = c.createOscillator();
  oscA.type = "sine";
  oscs.push(oscA);
  mixGains.push(1.0);
  const oscB = c.createOscillator();
  oscB.type = "sine";
  oscB.detune.value = style.oscBDetuneCents;
  oscs.push(oscB);
  mixGains.push(0.5);
  if (style.fifthHarmonic) {
    const oscC = c.createOscillator();
    oscC.type = "sine";
    oscs.push(oscC);
    // Mix the fifth at low level so it adds harmonic colour without
    // overpowering the root.
    mixGains.push(0.35);
  }

  // Apply the pitch arc to every oscillator. The fifth-harmonic osc
  // (if present) plays at p × 1.5 — we pre-multiply the arc values
  // for it so the relative arc shape is the same.
  const [aStart, aPeak, aEnd] = style.pitchArc;
  const [tPeak, tEnd] = style.pitchArcTiming;
  oscs.forEach((osc, i) => {
    const fifth = i === 2 ? 1.5 : 1.0;
    const base = p * fifth;
    osc.frequency.setValueAtTime(base * aStart, t0);
    osc.frequency.exponentialRampToValueAtTime(base * aPeak, t0 + tPeak);
    osc.frequency.exponentialRampToValueAtTime(base * aEnd, t0 + tEnd);
  });

  // Per-oscillator mix gains.
  const mixNodes = mixGains.map((g) => {
    const node = c.createGain();
    node.gain.value = g;
    return node;
  });

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.min(9000, p * style.lowpassMult);
  filter.Q.value = style.lowpassQ;

  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(amp, t0 + style.attackSec);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + style.durationSec);

  // Wire: each osc → its mix gain → shared filter → env → out.
  oscs.forEach((osc, i) => {
    osc.connect(mixNodes[i]);
    mixNodes[i].connect(filter);
  });
  filter.connect(env);
  env.connect(out);

  // Reverb send.
  if (reverbInput && style.reverbSend > 0) {
    const send = c.createGain();
    send.gain.value = style.reverbSend;
    env.connect(send);
    send.connect(reverbInput);
  }

  // Orange's tremolo: a low-rate sine LFO modulates a second gain
  // node sitting between env and out, ±tremoloDepth around 1.0.
  if (style.tremoloDepth > 0 && style.tremoloHz > 0) {
    const trem = c.createGain();
    trem.gain.value = 1 - style.tremoloDepth / 2; // sits at mid-depth
    const lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = style.tremoloHz;
    const lfoAmp = c.createGain();
    lfoAmp.gain.value = style.tremoloDepth / 2;
    lfo.connect(lfoAmp);
    lfoAmp.connect(trem.gain);
    // Insert trem AFTER env. Disconnect env→out and rewire env→trem→out.
    env.disconnect();
    env.connect(trem);
    trem.connect(out);
    // Reverb send was already attached to env above; that still works
    // — the dry/wet pre-tremolo signal goes to reverb (which is fine,
    // tremoloing the reverb tail can sound seasick).
    lfo.start(t0);
    lfo.stop(t0 + style.durationSec + 0.05);
  }

  oscs.forEach((osc) => {
    osc.start(t0);
    osc.stop(t0 + style.durationSec + 0.05);
  });
}

export function playEnergyBlock(
  key: EmotionKey,
  amp = 0.36,
  opts: { force?: boolean } = {},
): void {
  const c = ensureCtx();
  const out = opts.force ? alwaysOnGain : masterGain;
  if (!c || !out) return;
  const group = EMOTION_COLOR_GROUP[key] ?? "mint";
  playGroupChirp(c, out, pitchFor(key), group, { amp });
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
 *
 * Pass `force: true` to bypass the global mute. Used by per-page
 * click handlers (BokBokpedia / Calendar tile clicks) — pressing a
 * creature should always play it, even when ambient chatter is off.
 */
export function playCreatureGiggle(
  blocks: CreatureBlock[],
  opts: { force?: boolean } = {},
): void {
  const c = ensureCtx();
  const out = opts.force ? alwaysOnGain : masterGain;
  if (!c || !out) return;
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

  // Stagger by each chirp's own duration. Blue / grey emotions have
  // longer tails, so the cascade spaces them out more; yellow / mint
  // chirps are short and pile up faster — this matches the "feel" of
  // each colour group (high-energy creatures babble, low-energy ones
  // sigh slowly). 45 % overlap so each new chirp lands while the
  // previous one is still ringing.
  const baseTime = c.currentTime;
  let cursor = 0;
  voices.forEach((b, i) => {
    const group = EMOTION_COLOR_GROUP[b.emotionKey] ?? "mint";
    const dur = GROUP_CHIRPS[group].durationSec;
    const t0 = baseTime + cursor + Math.random() * 0.04;
    const amp = 0.26 + Math.random() * 0.10;
    playGroupChirp(c, out, pitchFor(b.emotionKey), group, { amp, t0 });
    cursor += dur * 0.45;
    if (i === 0) cursor = Math.max(cursor, 0.08);
  });
}

// ---- Typing tick ------------------------------------------------------
// Water-drop / mystical "plip" played on each keystroke inside a text
// field (journal, name, search). Not the usual mechanical typing sound:
// the recipe is a pure sine with a fast downward pitch glide, a snappy
// attack, and an exponential decay.
//
// Routed through the always-on output (NOT masterGain) so the Sound Off
// toggle has no effect on typing — per the user's spec, keystroke
// feedback should always play, even when ambient chatter is silenced.
// We skip the reverb send specifically because the reverb chain's wet
// path feeds masterGain (it would be cut by mute); a dry water-drop
// still reads as mystical thanks to the pitch glide + lowpass.
//
// Pentatonic-biased so successive keystrokes form a soft, randomised
// little melody instead of pitched chaos.

// G minor pentatonic, two octaves clustered around the bell register.
// A random note picked per keystroke keeps it musical without sounding
// patterned.
const TYPING_NOTES_HZ: number[] = [
  587.33, 698.46, 783.99, 880.00, 1046.50,   // D5, F5, G5, A5, C6
  1174.66, 1396.91, 1567.98, 1760.00, 2093.00, // D6, F6, G6, A6, C7
];

export function playTypingTick(): void {
  const c = ensureCtx();
  if (!c || !alwaysOnGain) return;

  const now = c.currentTime;
  const note = TYPING_NOTES_HZ[Math.floor(Math.random() * TYPING_NOTES_HZ.length)];
  // ±15 cent jitter so two consecutive identical notes still feel
  // organically off-grid.
  const pitch = note * Math.pow(2, ((Math.random() - 0.5) * 30) / 1200);

  const osc = c.createOscillator();
  osc.type = "sine";
  // Pitch glides DOWN from start*1.35 → start over ~70 ms, giving the
  // signature "plip" of a droplet hitting water.
  osc.frequency.setValueAtTime(pitch * 1.35, now);
  osc.frequency.exponentialRampToValueAtTime(pitch, now + 0.07);

  // Gentle lowpass keeps the high partials from feeling harsh; the
  // cutoff tracks pitch so high notes still sparkle.
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = Math.min(8000, pitch * 4.5);
  filt.Q.value = 0.6;

  // Snappy attack, exponential decay. Peak amp is intentionally tiny
  // (~0.06) because typing fires many ticks per second.
  const peakAmp = 0.055 + Math.random() * 0.025;
  const env = c.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peakAmp, now + 0.004);
  // Exponential ramp to a tiny floor → smooth tail without a click.
  env.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);

  osc.connect(filt);
  filt.connect(env);
  env.connect(alwaysOnGain);

  osc.start(now);
  osc.stop(now + 0.22);
}

// ---- Droplet tick (mouse-move) ---------------------------------------
// The user wants the mouse sound to be a sibling of the typing tick —
// same water-drop family, just distinct enough that the two voices
// don't sound identical when they overlap. So this is the typing
// recipe (sine + downward pitch glide + snappy attack + short decay),
// pitched one octave lower so it sits below the typing register, and
// with a light reverb send (the only real timbre difference) to give
// it a slightly more ambient character.
//
// Routed through masterGain so the global Sound Off toggle silences
// it like the rest of the ambient audio.
//
// Caller passes an optional pitchIndex 0..9 (mapped from cursor Y by
// MouseSounds — top of viewport = high, bottom = low). Without an
// index the note is uniformly random across the same scale.

const DROPLET_NOTES_HZ: number[] = [
  // G minor pentatonic, ONE OCTAVE BELOW the typing tick's scale.
  // Order matters — MouseSounds uses the array index to map cursor Y
  // to pitch (top of viewport reads as the highest note).
  293.66, 349.23, 392.00, 440.00, 523.25,    // D4, F4, G4, A4, C5
  587.33, 698.46, 783.99, 880.00, 1046.50,   // D5, F5, G5, A5, C6
];

// ---- Candy bag rustle (candy button click) --------------------------
// Plays the real plastic-bag rustle recording (public/sounds/plastic-
// bag.mp3) — first 2 seconds only. Mimics the "treat bag" sound that
// makes a dog snap to attention. Routed through alwaysOnGain so it
// fires regardless of the Sound Off toggle ("you pressed it, you hear
// it" — same rule as energy-block tile clicks).
//
// While the rustle plays, the creature voices (ambient chatter +
// giggles, all routed through masterGain) duck to silence so the
// rustle stands out — like a room going quiet when a dog hears the
// crinkle. Master ramps back up automatically after the rustle ends.

const PLASTIC_BAG_PATH = "/sounds/plastic-bag.mp3";
const PLASTIC_BAG_PLAY_MS = 2000; // first 2 seconds of the file only
const PLASTIC_BAG_GAIN = 0.7;

let plasticBagBuffer: AudioBuffer | null = null;
let plasticBagLoading: Promise<AudioBuffer | null> | null = null;
function loadPlasticBag(c: AudioContext): Promise<AudioBuffer | null> {
  if (plasticBagBuffer) return Promise.resolve(plasticBagBuffer);
  if (plasticBagLoading) return plasticBagLoading;
  plasticBagLoading = fetch(PLASTIC_BAG_PATH)
    .then((r) => r.arrayBuffer())
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      plasticBagBuffer = buf;
      return buf;
    })
    .catch((err) => {
      // Don't crash if the file is missing / fails to decode — just
      // log and let the button continue to work silently.
      console.error("[bokbok] plastic bag sound failed to load:", err);
      plasticBagLoading = null;
      return null;
    });
  return plasticBagLoading;
}

// Tracks any in-flight master-duck restore so successive candy clicks
// don't fight over the ramp schedule.
let masterDuckRestoreTimer: number | null = null;

/** Duck masterGain to silence for `ms`, then ramp back to the user's
 *  current target gain (UNMUTED_GAIN, or 0 if muted). Used by the
 *  candy rustle to make the creature voices momentarily go quiet. */
function duckMasterFor(ms: number): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  const now = c.currentTime;
  // Cancel any previously-scheduled ramps so we control the curve.
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  // 30 ms fade-down — fast enough to feel like a cut, slow enough not
  // to click.
  masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.03);
  if (masterDuckRestoreTimer !== null) {
    clearTimeout(masterDuckRestoreTimer);
  }
  masterDuckRestoreTimer = window.setTimeout(() => {
    masterDuckRestoreTimer = null;
    const c2 = ensureCtx();
    if (!c2 || !masterGain) return;
    const t = c2.currentTime;
    const target = muted ? 0 : UNMUTED_GAIN;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    // 150 ms ramp back up — softer than the duck-down so the room
    // gently comes back to life after the rustle settles.
    masterGain.gain.linearRampToValueAtTime(target, t + 0.15);
  }, ms);
}

// ---- Whistle (whistle button click) ---------------------------------
// Plays the real whistle recording on the whistle button. Routed
// through alwaysOnGain so it fires regardless of the Sound Off toggle
// (same rule as the candy rustle — "you pressed it, you hear it").
// Briefly ducks the creature voice channel like the rustle does so the
// whistle blast cuts through the ambient babble instead of getting
// buried under it.

const WHISTLE_PATH = "/sounds/whistle.wav";
const WHISTLE_GAIN = 0.65;
const WHISTLE_PLAY_MS = 1600; // ducks ambient chatter for ~1.6 s

let whistleBuffer: AudioBuffer | null = null;
let whistleLoading: Promise<AudioBuffer | null> | null = null;
function loadWhistle(c: AudioContext): Promise<AudioBuffer | null> {
  if (whistleBuffer) return Promise.resolve(whistleBuffer);
  if (whistleLoading) return whistleLoading;
  whistleLoading = fetch(WHISTLE_PATH)
    .then((r) => r.arrayBuffer())
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      whistleBuffer = buf;
      return buf;
    })
    .catch((err) => {
      console.error("[bokbok] whistle sound failed to load:", err);
      whistleLoading = null;
      return null;
    });
  return whistleLoading;
}

export function playWhistle(): void {
  const c = ensureCtx();
  if (!c || !alwaysOnGain) return;

  // Drop the creature voices so the whistle reads clearly — same
  // duck-the-room pattern the candy rustle uses.
  duckMasterFor(WHISTLE_PLAY_MS);

  loadWhistle(c).then((buf) => {
    if (!buf) return;
    const c2 = ensureCtx();
    if (!c2 || !alwaysOnGain) return;
    const now = c2.currentTime;
    const dur = buf.duration;

    const src = c2.createBufferSource();
    src.buffer = buf;

    // Quick fade-out on the tail so abrupt cuts don't click.
    const gain = c2.createGain();
    gain.gain.setValueAtTime(WHISTLE_GAIN, now);
    const fadeStart = Math.max(0, dur - 0.10);
    gain.gain.setValueAtTime(WHISTLE_GAIN, now + fadeStart);
    gain.gain.linearRampToValueAtTime(0.0001, now + dur);

    src.connect(gain);
    gain.connect(alwaysOnGain);

    src.start(now, 0, dur);
    src.stop(now + dur + 0.02);
  });
}

// ---- Ball bounce (fetch ball thrown into the scene) ------------------
// Plays the real ball.mp3 recording starting at 4.0 s — the point where
// the file's bouncy-ball "boing / tap-tap-tap" begins (the first ~4 s are
// lead-in we skip). Runs to the end of the file (~1.5 s of bounces),
// which lines up with the ~1.4 s three-bounce drop animation in the
// scene. Routed through alwaysOnGain so it fires regardless of the Sound
// Off toggle ("you threw it, you hear it" — same rule as whistle/candy).

const BALL_PATH = "/sounds/ball.mp3";
const BALL_BOUNCE_START_S = 4.0; // skip the lead-in; bounces begin here
const BALL_BOUNCE_GAIN = 0.7;

// One crisp single-bounce "tap" carved from the recording — used for the
// keep-away dribble (each time a creature catches / picks up the ball).
// The file holds clean isolated bounce transients at ~4.4 s, ~4.92 s and
// ~5.34 s; we slice the first one (onset ~4.40 s, decays by ~4.6 s).
const BALL_DRIBBLE_START_S = 4.38;
const BALL_DRIBBLE_DUR_S = 0.22;
const BALL_DRIBBLE_GAIN = 0.5; // softer than the throw — it repeats

let ballBuffer: AudioBuffer | null = null;
let ballLoading: Promise<AudioBuffer | null> | null = null;
function loadBall(c: AudioContext): Promise<AudioBuffer | null> {
  if (ballBuffer) return Promise.resolve(ballBuffer);
  if (ballLoading) return ballLoading;
  ballLoading = fetch(BALL_PATH)
    .then((r) => r.arrayBuffer())
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      ballBuffer = buf;
      return buf;
    })
    .catch((err) => {
      console.error("[bokbok] ball sound failed to load:", err);
      ballLoading = null;
      return null;
    });
  return ballLoading;
}

export function playBallBounce(): void {
  const c = ensureCtx();
  if (!c || !alwaysOnGain) return;

  loadBall(c).then((buf) => {
    if (!buf) return;
    const c2 = ensureCtx();
    if (!c2 || !alwaysOnGain) return;
    const now = c2.currentTime;
    const start = Math.min(BALL_BOUNCE_START_S, Math.max(0, buf.duration - 0.05));
    const playDur = Math.max(0, buf.duration - start);
    if (playDur <= 0) return;

    const src = c2.createBufferSource();
    src.buffer = buf;

    // Tiny fade-in + tail fade-out so starting mid-file (at 4.0 s) and
    // cutting at the very end don't click.
    const gain = c2.createGain();
    const edge = Math.min(0.02, playDur / 4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(BALL_BOUNCE_GAIN, now + edge);
    gain.gain.setValueAtTime(BALL_BOUNCE_GAIN, now + playDur - edge);
    gain.gain.linearRampToValueAtTime(0.0001, now + playDur);

    src.connect(gain);
    gain.connect(alwaysOnGain);

    src.start(now, start, playDur);
    src.stop(now + playDur + 0.02);
  });
}

// Single bounce-tap for the keep-away dribble. Plays one short slice of
// ball.mp3 with a tiny random pitch shift so repeated catches don't sound
// mechanically identical. Routed through alwaysOnGain like the throw —
// it's the same ball, just changing hands.
export function playBallDribble(): void {
  const c = ensureCtx();
  if (!c || !alwaysOnGain) return;

  loadBall(c).then((buf) => {
    if (!buf) return;
    const c2 = ensureCtx();
    if (!c2 || !alwaysOnGain) return;
    const now = c2.currentTime;
    const start = Math.min(
      BALL_DRIBBLE_START_S,
      Math.max(0, buf.duration - 0.05),
    );
    const playDur = Math.min(
      BALL_DRIBBLE_DUR_S,
      Math.max(0, buf.duration - start),
    );
    if (playDur <= 0) return;

    const src = c2.createBufferSource();
    src.buffer = buf;
    // ±6% pitch jitter for variety across repeated passes.
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.12;

    const gain = c2.createGain();
    const edge = Math.min(0.012, playDur / 4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(BALL_DRIBBLE_GAIN, now + edge);
    gain.gain.setValueAtTime(BALL_DRIBBLE_GAIN, now + playDur - edge);
    gain.gain.linearRampToValueAtTime(0.0001, now + playDur);

    src.connect(gain);
    gain.connect(alwaysOnGain);

    src.start(now, start, playDur);
    src.stop(now + playDur + 0.02);
  });
}

// ---- Pinset grab / release (tweezers pick-up & put-down) -------------
// Plays slices of the "Whoosh & Grab" recording (public/sounds/pinset.mp3,
// ~12.3 s long). The tail of the file holds FOUR one-shots — two whooshes
// then two grabs — but we keep only the FIRST of each pair so the cursor
// gesture maps to one clean sound:
//   • release ("놓는 소리") — the first whoosh burst at ~10.16 s. Slice
//     stops at ~10.44 s, before the second whoosh at ~10.57 s.
//   • grab    ("잡는 소리") — the first grab burst at ~11.01 s. Slice
//     stops at ~11.34 s, before the second grab at ~11.94 s.
// A small lead-in (~20-30 ms of silence before the onset) lets the fade-in
// finish before the attack, so the transient isn't softened.
// Routed through alwaysOnGain so they fire regardless of the Sound Off
// toggle — same "you did it, you hear it" rule as whistle / ball / candy.

const PINSET_PATH = "/sounds/pinset.mp3";
const PINSET_RELEASE_START_S = 10.14; // 놓는 소리 — first whoosh only
const PINSET_RELEASE_DUR_S = 0.30;
const PINSET_GRAB_START_S = 10.98; // 잡는 소리 — first grab only
const PINSET_GRAB_DUR_S = 0.36;
const PINSET_GAIN = 0.85;

let pinsetBuffer: AudioBuffer | null = null;
let pinsetLoading: Promise<AudioBuffer | null> | null = null;
function loadPinset(c: AudioContext): Promise<AudioBuffer | null> {
  if (pinsetBuffer) return Promise.resolve(pinsetBuffer);
  if (pinsetLoading) return pinsetLoading;
  pinsetLoading = fetch(PINSET_PATH)
    .then((r) => r.arrayBuffer())
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      pinsetBuffer = buf;
      return buf;
    })
    .catch((err) => {
      console.error("[bokbok] pinset sound failed to load:", err);
      pinsetLoading = null;
      return null;
    });
  return pinsetLoading;
}

/** Play a [startS, startS+durS] slice of the pinset recording with tiny
 *  anti-click fades on both edges (the recording's one-shots sit mid-
 *  file, so we always start partway in). */
function playPinsetSlice(startS: number, durS: number): void {
  const c = ensureCtx();
  if (!c || !alwaysOnGain) return;

  loadPinset(c).then((buf) => {
    if (!buf) return;
    const c2 = ensureCtx();
    if (!c2 || !alwaysOnGain) return;
    const now = c2.currentTime;
    const start = Math.min(startS, Math.max(0, buf.duration - 0.05));
    const playDur = Math.min(durS, Math.max(0, buf.duration - start));
    if (playDur <= 0) return;

    const src = c2.createBufferSource();
    src.buffer = buf;

    // Fast fade-in keeps the SFX attack punchy while killing the click
    // from starting mid-waveform; matching tail fade for the cut.
    const gain = c2.createGain();
    const edge = Math.min(0.012, playDur / 4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(PINSET_GAIN, now + edge);
    gain.gain.setValueAtTime(PINSET_GAIN, now + playDur - edge);
    gain.gain.linearRampToValueAtTime(0.0001, now + playDur);

    src.connect(gain);
    gain.connect(alwaysOnGain);

    src.start(now, start, playDur);
    src.stop(now + playDur + 0.02);
  });
}

/** 잡는 소리 — tweezers pinch a creature (pick-up). */
export function playPinsetGrab(): void {
  playPinsetSlice(PINSET_GRAB_START_S, PINSET_GRAB_DUR_S);
}

/** 놓는 소리 — creature set back down / let go (release). */
export function playPinsetRelease(): void {
  playPinsetSlice(PINSET_RELEASE_START_S, PINSET_RELEASE_DUR_S);
}

// ---- Pet (쓰다듬기) ---------------------------------------------------
// Fully synthesized — no sample. When petted the creature does a fast,
// happy WIGGLE (a ~1.4 s shake that decays over its last 0.4 s), so the
// sound is a soft "purr-trill": a warm low coo whose volume FLUTTERS at
// the wiggle rate — the audio analogue of the vibration you'd feel
// stroking something happy. A gentle upward pitch drift reads as content/
// affectionate, and both the flutter depth and the volume ease off over
// the final stretch so the sound settles in sync with the shake decaying
// out (no hard stop). Routed through alwaysOnGain so it fires regardless
// of the Sound Off toggle — same "you did it, you hear it" rule as the
// whistle / ball / candy / pinset one-shots.

const PET_DUR_S = 1.25; // a touch shorter than the 1.4 s shake window
const PET_BASE_HZ = 196; // warm low-mid coo (G3)
const PET_FLUTTER_START_HZ = 22; // purr/wiggle flutter at the lively start
const PET_FLUTTER_END_HZ = 13; // flutter slows as the wiggle settles
const PET_FLUTTER_DEPTH = 0.9; // 0..1 — how deep the volume pulses
const PET_GAIN = 0.34;

/** 쓰다듬는 소리 — a synthesized happy purr-trill fired on a pet-mode click. */
export function playPet(): void {
  const c = ensureCtx();
  if (!c || !alwaysOnGain) return;

  const t0 = c.currentTime;
  const tEnd = t0 + PET_DUR_S;
  const settle = tEnd - 0.4; // flutter + volume start easing off here

  // Two slightly detuned carriers → a soft chorus rather than a bare tone.
  // Triangle + sine keeps it vowel-like and warm (no synth buzz). A small
  // upward glide across the body, settling back at the end, reads as a
  // contented little coo.
  const oscA = c.createOscillator();
  oscA.type = "triangle";
  const oscB = c.createOscillator();
  oscB.type = "sine";
  oscB.detune.value = 10;
  const pStart = PET_BASE_HZ * 0.97;
  const pPeak = PET_BASE_HZ * 1.06;
  for (const o of [oscA, oscB]) {
    o.frequency.setValueAtTime(pStart, t0);
    o.frequency.linearRampToValueAtTime(pPeak, settle);
    o.frequency.linearRampToValueAtTime(PET_BASE_HZ, tEnd);
  }

  // Gentle pitch vibrato on top of the glide — a touch of wobble so the
  // coo feels alive/cute rather than mechanical.
  const vib = c.createOscillator();
  vib.type = "sine";
  vib.frequency.value = 5.5;
  const vibAmp = c.createGain();
  vibAmp.gain.value = PET_BASE_HZ * (Math.pow(2, 12 / 1200) - 1); // ±12 cents
  vib.connect(vibAmp);
  vibAmp.connect(oscA.frequency);
  vibAmp.connect(oscB.frequency);

  // Per-osc mix, then a warm lowpass that opens on the swell and closes as
  // it settles — the "bubble" expand/contract used by the creature voices.
  const mixA = c.createGain();
  mixA.gain.value = 1.0;
  const mixB = c.createGain();
  mixB.gain.value = 0.5;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.6;
  filter.frequency.setValueAtTime(700, t0);
  filter.frequency.linearRampToValueAtTime(1500, t0 + 0.18);
  filter.frequency.linearRampToValueAtTime(600, tEnd);

  // Main amplitude envelope: soft swell-in, hold, exponential ease-out
  // across the settle so the stop feels like a sigh, not a cut.
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(PET_GAIN, t0 + 0.12);
  env.gain.setValueAtTime(PET_GAIN, settle);
  env.gain.exponentialRampToValueAtTime(0.0001, tEnd);

  // Flutter (tremolo) = the purr / the wiggle. A sine LFO swings the gain
  // of `trem` around its mean. As the shake decays the flutter DEPTH ramps
  // to 0 while the mean ramps up to 1, so the pulsing smooths out without
  // the overall level dropping — the trill "calms down" instead of fading.
  const trem = c.createGain();
  trem.gain.setValueAtTime(1 - PET_FLUTTER_DEPTH / 2, t0);
  trem.gain.linearRampToValueAtTime(1, tEnd);
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(PET_FLUTTER_START_HZ, t0);
  lfo.frequency.linearRampToValueAtTime(PET_FLUTTER_END_HZ, tEnd);
  const lfoAmp = c.createGain();
  lfoAmp.gain.setValueAtTime(PET_FLUTTER_DEPTH / 2, t0);
  lfoAmp.gain.linearRampToValueAtTime(PET_FLUTTER_DEPTH / 2, settle);
  lfoAmp.gain.linearRampToValueAtTime(0.0001, tEnd);
  lfo.connect(lfoAmp);
  lfoAmp.connect(trem.gain);

  // Wire: oscs → mix → filter → env → trem → out. Light reverb send off
  // env (pre-tremolo) for a touch of mystical air, like the other voices.
  oscA.connect(mixA);
  oscB.connect(mixB);
  mixA.connect(filter);
  mixB.connect(filter);
  filter.connect(env);
  env.connect(trem);
  trem.connect(alwaysOnGain);
  if (reverbInput) {
    const send = c.createGain();
    send.gain.value = 0.22;
    env.connect(send);
    send.connect(reverbInput);
  }

  oscA.start(t0);
  oscB.start(t0);
  vib.start(t0);
  lfo.start(t0);
  const stopAt = tEnd + 0.05;
  oscA.stop(stopAt);
  oscB.stop(stopAt);
  vib.stop(stopAt);
  lfo.stop(stopAt);
}

export function playCandyRustle(): void {
  const c = ensureCtx();
  if (!c || !alwaysOnGain) return;

  // Duck creature sounds immediately so the rustle has the room to
  // itself, regardless of whether the buffer load is still in flight.
  duckMasterFor(PLASTIC_BAG_PLAY_MS);

  loadPlasticBag(c).then((buf) => {
    if (!buf) return; // failed to load — quiet fallback, duck still ran
    const c2 = ensureCtx();
    if (!c2 || !alwaysOnGain) return;
    const now = c2.currentTime;
    const dur = Math.min(PLASTIC_BAG_PLAY_MS / 1000, buf.duration);

    const src = c2.createBufferSource();
    src.buffer = buf;

    // Tail-end fade-out (last 150 ms) so cutting at 2.0 s doesn't
    // produce an audible click. Body sits at PLASTIC_BAG_GAIN.
    const gain = c2.createGain();
    gain.gain.setValueAtTime(PLASTIC_BAG_GAIN, now);
    const fadeStart = Math.max(0, dur - 0.15);
    gain.gain.setValueAtTime(PLASTIC_BAG_GAIN, now + fadeStart);
    gain.gain.linearRampToValueAtTime(0.0001, now + dur);

    src.connect(gain);
    gain.connect(alwaysOnGain);

    src.start(now, 0, dur);
    // Tiny extra stop margin so the ramp-to-near-zero completes
    // before the source is torn down.
    src.stop(now + dur + 0.02);
  });
}

// ---- Magnetic mouse-move sound --------------------------------------
// Looping playback of the first 7.5 seconds of magnetic.mp3
// (00:00:07:15 @ 30fps in the source timeline) while the cursor moves.
// A SCHEDULER kicks off one pass at a time: each pass plays the full
// sample, then rests for MAGNETIC_REST_S of silence ("한 템포 쉬고"),
// then the next pass starts. Tiny anti-click fades (~12 ms) on the
// edges of each pass prevent boundary pops; otherwise the pass plays
// cleanly with no crossfading so you hear the actual tail of the
// sample before the rest.
//
// The audible output is gated by magneticGain, which the mouse-tick
// "tops up": ramp to peak → hold briefly → fade out. While ticks
// keep firing the fade-out keeps getting rescheduled = continuous
// sound. When the cursor stops, the last scheduled fade-out runs and
// the trail naturally dies.
//
// Routed through masterGain so the Sound Off toggle silences it along
// with the rest of the ambient audio.

const MAGNETIC_PATH = "/sounds/magnetic.mp3";
const MAGNETIC_LOOP_LEN_S = 7.5;     // length of one pass through the sample (00:00:07:15 @ 30fps)
const MAGNETIC_REST_S = 0.15;        // silence between consecutive passes (한 템포)
const MAGNETIC_EDGE_FADE_S = 0.012;  // anti-click fades on pass start/end
const MAGNETIC_PEAK = 0.35;          // gain reached on each tick top-up
const MAGNETIC_RAMP_UP_S = 0.04;     // gain ramp on top-up (fast = responsive)
const MAGNETIC_HOLD_S = 0.18;        // hold at peak before fading
const MAGNETIC_FADE_OUT_S = 0.45;    // fade tail after movement stops
const MAGNETIC_LOOKAHEAD_S = 2.0;    // schedule passes this far ahead
const MAGNETIC_SCHEDULER_MS = 1000;  // top up the schedule once per second

let magneticBuffer: AudioBuffer | null = null;
let magneticLoading: Promise<AudioBuffer | null> | null = null;
// Long-lived gain node for the continuous loop. Created lazily on the
// first successful tick; left running for the lifetime of the page.
let magneticGain: GainNode | null = null;
let magneticSchedulerTimer: number | null = null;
let magneticNextStartTime = 0;

function loadMagnetic(c: AudioContext): Promise<AudioBuffer | null> {
  if (magneticBuffer) return Promise.resolve(magneticBuffer);
  if (magneticLoading) return magneticLoading;
  magneticLoading = fetch(MAGNETIC_PATH)
    .then((r) => r.arrayBuffer())
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      magneticBuffer = buf;
      return buf;
    })
    .catch((err) => {
      // Don't crash if the file is missing / fails to decode — the
      // cursor trail just stays silent.
      console.error("[bokbok] magnetic sound failed to load:", err);
      magneticLoading = null;
      return null;
    });
  return magneticLoading;
}

/** Schedule ONE full pass through [0, LOOP_LEN] of the buffer. Tiny
 *  anti-click fades on the edges; otherwise the pass plays cleanly so
 *  the listener hears the full tail before the rest. */
function scheduleMagneticPass(
  c: AudioContext,
  buf: AudioBuffer,
  startTime: number,
): void {
  if (!magneticGain) return;
  const passDur = Math.min(MAGNETIC_LOOP_LEN_S, buf.duration);
  const edge = Math.min(MAGNETIC_EDGE_FADE_S, passDur / 4);

  const src = c.createBufferSource();
  src.buffer = buf;

  const env = c.createGain();
  env.gain.setValueAtTime(0, startTime);
  env.gain.linearRampToValueAtTime(1, startTime + edge);
  env.gain.setValueAtTime(1, startTime + passDur - edge);
  env.gain.linearRampToValueAtTime(0.0001, startTime + passDur);

  src.connect(env);
  env.connect(magneticGain);

  src.start(startTime, 0, passDur);
  src.stop(startTime + passDur + 0.05);
}

function magneticSchedulerTick(): void {
  const c = ctx;
  if (!c || !magneticBuffer || !magneticGain) return;
  const horizon = c.currentTime + MAGNETIC_LOOKAHEAD_S;
  // Each cycle = full pass + rest. No overlap — the rest is meant to
  // be heard between loops.
  const stride = MAGNETIC_LOOP_LEN_S + MAGNETIC_REST_S;
  while (magneticNextStartTime < horizon) {
    scheduleMagneticPass(c, magneticBuffer, magneticNextStartTime);
    magneticNextStartTime += stride;
  }
}

function ensureMagneticLoop(c: AudioContext, buf: AudioBuffer): void {
  if (magneticGain) return;
  if (!masterGain) return;

  const gain = c.createGain();
  gain.gain.value = 0;
  gain.connect(masterGain);
  magneticGain = gain;

  // Kick off the loop with one immediate pass, then let the periodic
  // scheduler keep filling ahead of currentTime.
  magneticNextStartTime = c.currentTime + 0.02;
  magneticSchedulerTick();
  if (magneticSchedulerTimer === null) {
    magneticSchedulerTimer = window.setInterval(
      magneticSchedulerTick,
      MAGNETIC_SCHEDULER_MS,
    );
  }
}

export function playMagneticTick(opts: { amp?: number } = {}): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  const peak = opts.amp ?? MAGNETIC_PEAK;

  loadMagnetic(c).then((buf) => {
    if (!buf) return;
    const c2 = ensureCtx();
    if (!c2 || !masterGain) return;
    ensureMagneticLoop(c2, buf);
    if (!magneticGain) return;

    const now = c2.currentTime;
    const g = magneticGain.gain;

    // "Top up" the envelope: cancel any pending fade, ramp from current
    // value up to peak, hold briefly, then fade out. While the user
    // keeps moving, every new tick replaces this schedule before the
    // fade has a chance to complete → continuous sound. When movement
    // stops, the last-scheduled fade-out runs uninterrupted and the
    // loop naturally goes silent.
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(peak, now + MAGNETIC_RAMP_UP_S);
      g.setValueAtTime(peak, now + MAGNETIC_RAMP_UP_S + MAGNETIC_HOLD_S);
      g.linearRampToValueAtTime(
        0.0001,
        now + MAGNETIC_RAMP_UP_S + MAGNETIC_HOLD_S + MAGNETIC_FADE_OUT_S,
      );
    } catch {
      // cancelScheduledValues can throw in odd cases (e.g. context
      // torn down mid-tick); silently swallow.
    }
  });
}

export function playDropletTick(pitchIndex?: number): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;

  const now = c.currentTime;
  const idx =
    typeof pitchIndex === "number"
      ? Math.max(0, Math.min(DROPLET_NOTES_HZ.length - 1, Math.floor(pitchIndex)))
      : Math.floor(Math.random() * DROPLET_NOTES_HZ.length);
  const note = DROPLET_NOTES_HZ[idx];
  // ±15 cent jitter — same as the typing tick.
  const pitch = note * Math.pow(2, ((Math.random() - 0.5) * 30) / 1200);

  // Same recipe as playTypingTick: sine + downward pitch glide. The
  // only audible difference is the lower pitch register + the light
  // reverb tail below.
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(pitch * 1.35, now);
  osc.frequency.exponentialRampToValueAtTime(pitch, now + 0.07);

  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = Math.min(8000, pitch * 4.5);
  filt.Q.value = 0.6;

  // Same envelope shape as typing — snappy attack, short exponential
  // decay. Amp a hair lower so the mouse trail doesn't dominate the
  // (always-on) typing voice when both fire at once.
  const peakAmp = 0.045 + Math.random() * 0.02;
  const env = c.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peakAmp, now + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);

  osc.connect(filt);
  filt.connect(env);
  env.connect(masterGain);

  // Light reverb send — the typing tick is bone-dry; this small wet
  // path is the only real timbre difference and gives the cursor
  // trail a touch of mystical air.
  if (reverbInput) {
    const send = c.createGain();
    send.gain.value = 0.2;
    env.connect(send);
    send.connect(reverbInput);
  }

  osc.start(now);
  osc.stop(now + 0.22);
}

// ---- Shooting-star glitter ------------------------------------------
// Plays the real "Glitter Sound" recording (public/sounds/glitter.mp3)
// when the 별똥별 button fires. The flock falls silent for the ~2.2 s
// fly-by (ambientChatter.setMuted), so the glitter has the room to
// itself. Routed through alwaysOnGain so it sounds regardless of the
// Sound Off toggle — same "you pressed it, you hear it" rule as the
// whistle / ball / candy / pinset one-shots.

const GLITTER_PATH = "/sounds/glitter.mp3";
const GLITTER_GAIN = 0.8;

let glitterBuffer: AudioBuffer | null = null;
let glitterLoading: Promise<AudioBuffer | null> | null = null;
function loadGlitter(c: AudioContext): Promise<AudioBuffer | null> {
  if (glitterBuffer) return Promise.resolve(glitterBuffer);
  if (glitterLoading) return glitterLoading;
  glitterLoading = fetch(GLITTER_PATH)
    .then((r) => r.arrayBuffer())
    .then((ab) => c.decodeAudioData(ab))
    .then((buf) => {
      glitterBuffer = buf;
      return buf;
    })
    .catch((err) => {
      console.error("[bokbok] glitter sound failed to load:", err);
      glitterLoading = null;
      return null;
    });
  return glitterLoading;
}

export function playGlitter(): void {
  const c = ensureCtx();
  if (!c || !alwaysOnGain) return;

  loadGlitter(c).then((buf) => {
    if (!buf) return;
    const c2 = ensureCtx();
    if (!c2 || !alwaysOnGain) return;
    const now = c2.currentTime;
    const dur = buf.duration;
    if (dur <= 0) return;

    const src = c2.createBufferSource();
    src.buffer = buf;

    // Tiny tail fade-out so the cut at the file's end never clicks.
    const gain = c2.createGain();
    const edge = Math.min(0.08, dur / 4);
    gain.gain.setValueAtTime(GLITTER_GAIN, now);
    gain.gain.setValueAtTime(GLITTER_GAIN, now + dur - edge);
    gain.gain.linearRampToValueAtTime(0.0001, now + dur);

    src.connect(gain);
    gain.connect(alwaysOnGain);

    src.start(now);
    src.stop(now + dur + 0.02);
  });
}
