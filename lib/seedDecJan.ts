// One-shot seeder that fills the ecosystem with one creature per day across
// 2025-12-01 → 2026-01-21 (52 days). Each phase of the arc is keyed to a
// pair of emotions per the user's spec:
//
//   Dec week 1            apathy + anger          ("무기력하고 화남")
//   Dec weeks 2–3         depression + sadness    ("우울하고 슬픔")
//   Dec last week → Jan w1 happiness              ("행복")
//   Jan weeks 2–3         satisfaction + joy      ("만족스러움, 기쁨")
//
// IDs are derived from the date (`seed-YYYY-MM-DD`) so re-running the seeder
// is idempotent — it skips dates already present and never duplicates. The
// `clearSeeds` helper deletes only those `seed-…` ids so user-created
// creatures are left alone.

import {
  generateCreature,
  randomCreatureName,
  type CreatureSpec,
} from "./creature";
import { EMOTIONS, type EmotionKey, type EmotionScore } from "./emotions";
import { loadEcosystem, uploadCreature, deleteCreatureById } from "./ecosystem";

type Phase = {
  /** YYYY-MM-DD inclusive */
  start: string;
  /** YYYY-MM-DD inclusive */
  end: string;
  primary: EmotionKey;
  /** Optional companion emotion for the day. */
  secondary?: EmotionKey;
  /** Pool of one-line journal entries; cycled by day index. */
  journals: string[];
};

const PHASES: Phase[] = [
  {
    start: "2025-12-01",
    end: "2025-12-07",
    primary: "apathy",
    secondary: "anger",
    journals: [
      "Today felt heavy. Nothing pulled at me, and small things kept setting me off.",
      "Couldn't be bothered with much. Got snappy at things that didn't deserve it.",
      "Empty kind of day. Everything was either dull or quietly infuriating.",
      "Felt flat. Got irritated at the small stuff again.",
      "Low energy and short fuse. Hard to tell which was worse.",
      "Spent the day on autopilot, snapping at people I shouldn't have.",
      "Nothing felt worth doing, and I kept getting angry about it.",
    ],
  },
  {
    start: "2025-12-08",
    end: "2025-12-21",
    primary: "depression",
    secondary: "sadness",
    journals: [
      "Stayed under the covers most of the day. Everything ached without a clear reason.",
      "Cried over something small in the kitchen. Couldn't shake the heaviness.",
      "The day moved past me. I watched it go and felt nothing land.",
      "Hollow and tired. Wanted to talk to someone but couldn't pick up the phone.",
      "Tried to journal earlier and just stared at the page. Sad in a quiet way.",
      "Walked to the window twice. The grey outside matched the grey inside.",
      "Heavy chest, slow thoughts. Not the worst day, just a deep one.",
      "Ate something and didn't taste it. The sadness has weight today.",
      "Counted hours instead of doing anything. Tears came around evening.",
      "Felt forgotten by myself today. Just getting to bedtime took effort.",
      "Low and lonely, even with people around. The grey feeling stretched all day.",
      "Writing this from bed. Nothing went wrong, nothing went right.",
      "Quiet kind of grief. Don't know what for.",
      "Another slow day. The sadness is starting to feel familiar.",
    ],
  },
  {
    start: "2025-12-22",
    end: "2026-01-07",
    primary: "happiness",
    journals: [
      "Something shifted today. The light through the window felt warm and the day moved gently.",
      "Smiled at the cat for no reason. Good kind of day.",
      "Walked outside and the air felt kind. Small good things kept happening.",
      "Made tea slowly and actually enjoyed it. Quiet happiness.",
      "Caught myself humming. Don't remember the last time I did that.",
      "Whole day felt soft around the edges. Grateful for it.",
      "Went out and the world felt friendly. Easy day.",
      "Cooked something I love and ate it slowly. Happy in a calm way.",
      "Met a friend, laughed twice. Forgot how good that feels.",
      "The kind of day where you notice the sky.",
      "Worked on something I cared about and lost track of time. Light kind of happy.",
      "Got cold outside but came home to a warm house. Counted my luck.",
      "Read by the window. Whole afternoon went by softly.",
      "Cracked a joke at dinner and meant it. Warmth in the room.",
      "Year's almost over. Feeling okay about how it ends.",
      "First day of the year. Hopeful and quiet.",
      "Slept well, woke up okay. The little wins.",
    ],
  },
  {
    start: "2026-01-08",
    end: "2026-01-21",
    primary: "satisfaction",
    secondary: "joy",
    journals: [
      "Today felt full. Things came together in a quiet, steady way.",
      "Finished something I'd been putting off. Felt good.",
      "Made progress on what mattered and noticed the joy in it.",
      "Solid day. Worked, rested, ate well. Pleased with all of it.",
      "Crossed things off the list and laughed at dinner. Pretty perfect.",
      "Felt accomplished and light at the same time. New combination.",
      "Did the thing, did it well, and let myself enjoy it.",
      "Steady joy today. The satisfying kind that lingers.",
      "Found my rhythm again. Everything moved easily.",
      "Big smile at lunch. Couldn't tell you why exactly.",
      "Clear-headed and cheerful. Got more done than expected.",
      "Sweet kind of day. Felt earned without any pressure.",
      "Joy in small completions. Putting things in their place.",
      "Comfortable in my own skin today. Quietly happy with how it went.",
    ],
  },
];

// Yields YYYY-MM-DD strings between (inclusive) startISO and endISO.
function* datesBetween(startISO: string, endISO: string): Generator<string> {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    yield `${y}-${m}-${day}`;
  }
}

// Per-day score variation so creatures aren't carbon-copies of each other.
// Primary cycles 3 / 4; secondary cycles 1 / 2 / 1. Both feed into
// generateCreature's intensity ramp (count + scale).
function buildScores(
  primary: EmotionKey,
  secondary: EmotionKey | undefined,
  dayIdx: number,
): EmotionScore[] {
  const out: EmotionScore[] = [
    { emotion: EMOTIONS[primary], score: 3 + (dayIdx % 2) },
  ];
  if (secondary) {
    out.push({
      emotion: EMOTIONS[secondary],
      score: 1 + (dayIdx % 3 === 1 ? 1 : 0),
    });
  }
  return out;
}

export type SeedResult = {
  added: number;
  skipped: number;
  total: number;
};

/**
 * Idempotently fill the ecosystem with the Dec-Jan demo arc. Returns counts
 * of added vs skipped (already-present) creatures.
 */
export async function seedDecJan(): Promise<SeedResult> {
  const existing = await loadEcosystem();
  const existingIds = new Set(existing.map((c) => c.id));
  let added = 0;
  let skipped = 0;
  let total = 0;

  for (const phase of PHASES) {
    let dayIdx = 0;
    for (const dateISO of datesBetween(phase.start, phase.end)) {
      total++;
      const id = `seed-${dateISO}`;
      if (existingIds.has(id)) {
        skipped++;
        dayIdx++;
        continue;
      }

      const scores = buildScores(phase.primary, phase.secondary, dayIdx);
      const creature = generateCreature(scores);
      // Deterministic id by date so re-runs don't duplicate.
      creature.id = id;
      creature.dateISO = dateISO;
      creature.name = randomCreatureName(EMOTIONS[phase.primary].displayName);
      creature.journalText = phase.journals[dayIdx % phase.journals.length];
      creature.source = "generate";

      await uploadCreature(creature);
      added++;
      dayIdx++;
    }
  }

  return { added, skipped, total };
}

/**
 * Removes only seed-* creatures (those produced by this seeder). Returns the
 * number of deleted entries. User-created creatures are untouched.
 */
export async function clearDecJanSeeds(): Promise<number> {
  const all = await loadEcosystem();
  const seeds = all.filter((c) => c.id.startsWith("seed-"));
  let deleted = 0;
  for (const c of seeds) {
    if (await deleteCreatureById(c.id)) deleted++;
  }
  return deleted;
}
