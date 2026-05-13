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
export function playEnergyBlock(
  key: EmotionKey,
  amp = 0.36,
  opts: { force?: boolean } = {},
): void {
  const c = ensureCtx();
  const out = opts.force ? alwaysOnGain : masterGain;
  if (!c || !out) return;
  playVoice(c, out, pitchFor(key), styleFor(key), { amp });
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

  // Stagger: each next voice starts ~70% through the previous voice's
  // total duration plus a little jitter — overlapping enough to feel like
  // a babbling chorus, separated enough that you can pick out chirps.
  let cursor = 0;
  voices.forEach((b, i) => {
    const style = styleFor(b.emotionKey);
    const offset = cursor + Math.random() * 0.025;
    const amp = 0.26 + Math.random() * 0.10;
    playVoice(c, out, pitchFor(b.emotionKey), style, {
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

// ---- Marimba tick (mouse-move) ---------------------------------------
// Soft, dreamy marimba note played as the cursor wanders across the
// page. Triangle wave body + sine octave for sparkle, lowpass that
// opens at attack and closes through the decay — gives a clearly
// wooden, struck character. Routed through masterGain so the Sound Off
// toggle silences it like the rest of the ambient audio. A generous
// reverb send keeps each note feeling like it's drifting in a small
// hall, which leans into the "mystical" brief the user asked for.
//
// Caller passes an optional pitchIndex 0..9 (mapped from cursor Y by
// MouseSounds — top of viewport = high, bottom = low). Without an
// index the note is uniformly random across the same scale.

const MARIMBA_NOTES_HZ: number[] = [
  // C minor pentatonic (with passing notes), two octaves, low → high.
  // Order matters — MouseSounds uses the array index to map cursor Y
  // to pitch (top of viewport reads as the highest note).
  261.63, 311.13, 349.23, 392.00, 466.16,    // C4, Eb4, F4, G4, Bb4
  523.25, 622.25, 698.46, 783.99, 932.33,    // C5, Eb5, F5, G5, Bb5
];

export function playMarimbaTick(pitchIndex?: number): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;

  const now = c.currentTime;
  const idx =
    typeof pitchIndex === "number"
      ? Math.max(0, Math.min(MARIMBA_NOTES_HZ.length - 1, Math.floor(pitchIndex)))
      : Math.floor(Math.random() * MARIMBA_NOTES_HZ.length);
  const note = MARIMBA_NOTES_HZ[idx];
  // ±20 cent jitter so wide cursor sweeps don't sound robotic.
  const pitch = note * Math.pow(2, ((Math.random() - 0.5) * 40) / 1200);

  // Body — slightly-detuned triangle gives the woody marimba bar feel.
  const oscBody = c.createOscillator();
  oscBody.type = "triangle";
  oscBody.frequency.setValueAtTime(pitch * 1.02, now);
  oscBody.frequency.exponentialRampToValueAtTime(pitch, now + 0.02);
  const oscOctave = c.createOscillator();
  oscOctave.type = "sine";
  oscOctave.frequency.setValueAtTime(pitch * 2, now);

  // Octave mix at ~20% of body for sparkle (any higher and it edges
  // into "bell" territory and loses the wood).
  const octaveMix = c.createGain();
  octaveMix.gain.value = 0.18;

  // Filter envelope opens at the strike, closes through the decay —
  // that's what gives the struck-wood character.
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(pitch * 7, now);
  filt.frequency.exponentialRampToValueAtTime(pitch * 2.2, now + 0.5);
  filt.Q.value = 0.4;

  // Soft volume — mouse-move fires up to ~5 ticks/sec. Peak ~0.045
  // sits quietly underneath any creature audio without disappearing.
  const peakAmp = 0.04 + Math.random() * 0.015;
  const env = c.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peakAmp, now + 0.008);
  // ~0.55 s decay reads as a clean wooden ping (full marimba is
  // longer but the tail gets noisy when notes overlap).
  env.gain.exponentialRampToValueAtTime(0.0008, now + 0.55);

  oscBody.connect(filt);
  oscOctave.connect(octaveMix);
  octaveMix.connect(filt);
  filt.connect(env);
  env.connect(masterGain);

  // Reverb send — heavier than typing since marimba notes are sparser
  // and benefit from the spatial tail.
  if (reverbInput) {
    const send = c.createGain();
    send.gain.value = 0.35;
    env.connect(send);
    send.connect(reverbInput);
  }

  oscBody.start(now);
  oscBody.stop(now + 0.62);
  oscOctave.start(now);
  oscOctave.stop(now + 0.62);
}
