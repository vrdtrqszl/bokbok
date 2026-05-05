// Catalog of energy blocks. Each block represents one emotion and maps to a
// gradient PNG in /public/energy-blocks/. Keywords (English + Korean) are used
// by extractEmotions() for a simple substring/word-boundary match.

export type EmotionKey =
  | "joy"
  | "sadness"
  | "anger"
  | "fear"
  | "surprise"
  | "disgust"
  | "love"
  | "loneliness"
  | "embarrassment"
  | "guilt"
  | "pride"
  | "shame"
  | "jealousy"
  | "envy"
  | "relief"
  | "tension"
  | "nervousness"
  | "anxiety"
  | "calmness"
  | "satisfaction"
  | "emptiness"
  | "void"
  | "despair"
  | "hope"
  | "anticipation"
  | "excitement"
  | "being-moved"
  | "gratitude"
  | "regret"
  | "resentment"
  | "hurt-feelings";

export type Emotion = {
  id: number;
  key: EmotionKey;
  displayName: string;
  imagePath: string;
  // valence: positive (1), neutral (0), negative (-1) — used as a tiebreaker
  // and for layout hints (e.g., positive emotions cluster brighter)
  valence: 1 | 0 | -1;
  keywords: string[]; // matched as case-insensitive substrings
  // 1–2 sentence description, shown on the Energy Blocks page info panel.
  // Optional — only the 6 primary emotions shown on that page need it today.
  description?: string;
};

export const EMOTIONS: Record<EmotionKey, Emotion> = {
  joy: {
    id: 1,
    key: "joy",
    displayName: "Joy",
    imagePath: "/energy-blocks/1-joy.png",
    valence: 1,
    keywords: [
      "joy", "happy", "happiness", "delight", "delighted", "cheer", "cheerful",
      "glad", "smile", "smiled", "smiling", "laugh", "laughed", "laughing", "fun",
      "yay", "wonderful", "great", "awesome",
      "기쁘", "기쁨", "행복", "즐거", "즐겁", "신나", "웃", "좋",
    ],
    description:
      "Joy is a positive emotion felt in the mind and body when desires or expectations are fulfilled.",
  },
  sadness: {
    id: 2,
    key: "sadness",
    displayName: "Sadness",
    imagePath: "/energy-blocks/2-sadness.png",
    valence: -1,
    keywords: [
      "sad", "sadness", "cry", "crying", "tear", "tears", "wept", "weep",
      "sorrow", "miserable", "down", "blue", "depressed",
      "슬프", "슬픔", "울", "눈물", "우울", "서글", "쓸쓸",
    ],
    description:
      "Sadness is a low, heavy emotion that arises when something loved is lost or out of reach.",
  },
  anger: {
    id: 3,
    key: "anger",
    displayName: "Anger",
    imagePath: "/energy-blocks/3-anger.png",
    valence: -1,
    keywords: [
      "anger", "angry", "mad", "furious", "rage", "raging", "hate", "hated",
      "annoyed", "annoying", "irritated", "irritating", "fume", "fuming",
      "화나", "화가", "분노", "짜증", "열받", "빡",
    ],
    description:
      "Anger is a hot, sharp emotion stirred by a sense of being wronged or blocked.",
  },
  fear: {
    id: 4,
    key: "fear",
    displayName: "Fear",
    imagePath: "/energy-blocks/4-fear.png",
    valence: -1,
    keywords: [
      "fear", "afraid", "scared", "scary", "terrified", "terrifying", "frighten",
      "frightened", "frightening", "panic", "horrified", "dread",
      "무섭", "두렵", "두려", "겁", "공포", "오싹",
    ],
    description:
      "Fear is a tightening emotion that warns the body of danger, real or imagined.",
  },
  surprise: {
    id: 5,
    key: "surprise",
    displayName: "Surprise",
    imagePath: "/energy-blocks/5-surprise.png",
    valence: 0,
    keywords: [
      "surprise", "surprised", "shock", "shocked", "shocking", "astonish",
      "astonished", "stunned", "wow", "unexpected", "sudden", "suddenly",
      "놀라", "놀랐", "헐", "갑자기", "깜짝",
    ],
    description:
      "Surprise is a brief, suspended emotion sparked by something unexpected.",
  },
  disgust: {
    id: 6,
    key: "disgust",
    displayName: "Disgust",
    imagePath: "/energy-blocks/6-disgust.png",
    valence: -1,
    keywords: [
      "disgust", "disgusted", "disgusting", "gross", "yuck", "ew", "nasty",
      "repulsive", "revolt", "revolting", "sick",
      "역겨", "더러", "구역", "거부감", "혐오",
    ],
    description:
      "Disgust is a recoiling emotion the body uses to push away what feels unsafe or unclean.",
  },
  love: {
    id: 7,
    key: "love",
    displayName: "Love",
    imagePath: "/energy-blocks/7-love.png",
    valence: 1,
    keywords: [
      "love", "loved", "loving", "adore", "adored", "fond", "affection",
      "affectionate", "cherish", "cherished", "darling", "sweetheart",
      "사랑", "애정", "좋아하",
    ],
  },
  loneliness: {
    id: 8,
    key: "loneliness",
    displayName: "Loneliness",
    imagePath: "/energy-blocks/8-loneliness.png",
    valence: -1,
    keywords: [
      "lonely", "loneliness", "alone", "isolated", "isolation", "abandoned",
      "by myself", "no one", "no friends",
      "외로", "혼자", "고독", "쓸쓸",
    ],
  },
  embarrassment: {
    id: 9,
    key: "embarrassment",
    displayName: "Embarrassment",
    imagePath: "/energy-blocks/9-embarrassment.png",
    valence: -1,
    keywords: [
      "embarrass", "embarrassed", "embarrassing", "awkward", "blush", "blushed",
      "humiliated", "cringe", "cringed",
      "민망", "창피", "쪽팔", "어색", "부끄",
    ],
  },
  guilt: {
    id: 10,
    key: "guilt",
    displayName: "Guilt",
    imagePath: "/energy-blocks/10-guilt.png",
    valence: -1,
    keywords: [
      "guilt", "guilty", "remorse", "remorseful", "my fault", "i shouldn't",
      "i should have", "wrong of me",
      "죄책", "죄송", "미안",
    ],
  },
  pride: {
    id: 11,
    key: "pride",
    displayName: "Pride",
    imagePath: "/energy-blocks/11-pride.png",
    valence: 1,
    keywords: [
      "pride", "proud", "accomplished", "accomplishment", "achievement",
      "achieve", "achieved", "did it", "i did", "succeeded", "victory",
      "자랑", "뿌듯", "자부심", "성취", "해냈", "이뤘",
    ],
  },
  shame: {
    id: 12,
    key: "shame",
    displayName: "Shame",
    imagePath: "/energy-blocks/12-shame.png",
    valence: -1,
    keywords: [
      "shame", "ashamed", "shameful", "disgrace", "disgraced", "humiliation",
      "수치", "부끄러",
    ],
  },
  jealousy: {
    id: 13,
    key: "jealousy",
    displayName: "Jealousy",
    imagePath: "/energy-blocks/13-jealousy.png",
    valence: -1,
    keywords: [
      "jealous", "jealousy", "possessive", "threatened",
      "질투", "샘",
    ],
  },
  envy: {
    id: 14,
    key: "envy",
    displayName: "Envy",
    imagePath: "/energy-blocks/14-envy.png",
    valence: -1,
    keywords: [
      "envy", "envious", "wish i had", "wish i were",
      "부럽", "부러움",
    ],
  },
  relief: {
    id: 15,
    key: "relief",
    displayName: "Relief",
    imagePath: "/energy-blocks/15-relief.png",
    valence: 1,
    keywords: [
      "relief", "relieved", "phew", "thank god", "finally over", "made it",
      "안도", "다행", "후",
    ],
  },
  tension: {
    id: 16,
    key: "tension",
    displayName: "Tension",
    imagePath: "/energy-blocks/16-tension.png",
    valence: -1,
    keywords: [
      "tension", "tense", "stressed", "stress", "stressful", "pressure",
      "uptight", "wound up",
      "긴장", "스트레스", "압박", "부담",
    ],
  },
  nervousness: {
    id: 17,
    key: "nervousness",
    displayName: "Nervousness",
    imagePath: "/energy-blocks/17-nervousness.png",
    valence: -1,
    keywords: [
      "nervous", "nervousness", "jittery", "butterflies", "fidget", "fidgety",
      "uneasy",
      "초조", "조마조마", "안절부절",
    ],
  },
  anxiety: {
    id: 18,
    key: "anxiety",
    displayName: "Anxiety",
    imagePath: "/energy-blocks/18-anxiety.png",
    valence: -1,
    keywords: [
      "anxious", "anxiety", "worried", "worry", "worrying", "unease",
      "overthink", "overthinking", "what if",
      "불안", "걱정", "근심",
    ],
  },
  calmness: {
    id: 19,
    key: "calmness",
    displayName: "Calmness",
    imagePath: "/energy-blocks/19-calmness.png",
    valence: 1,
    keywords: [
      "calm", "calmness", "peace", "peaceful", "serene", "serenity", "tranquil",
      "still", "settled", "quiet",
      "차분", "평온", "고요", "안정",
    ],
  },
  satisfaction: {
    id: 20,
    key: "satisfaction",
    displayName: "Satisfaction",
    imagePath: "/energy-blocks/20-satisfaction.png",
    valence: 1,
    keywords: [
      "satisfaction", "satisfied", "satisfying", "content", "contented",
      "fulfilled", "fulfilling",
      "만족", "충족", "흡족",
    ],
  },
  emptiness: {
    id: 21,
    key: "emptiness",
    displayName: "Emptiness",
    imagePath: "/energy-blocks/21-emptiness.png",
    valence: -1,
    keywords: [
      "empty", "emptiness", "hollow", "numb", "blank", "nothing inside",
      "공허", "허무", "텅",
    ],
  },
  void: {
    id: 22,
    key: "void",
    displayName: "Void",
    imagePath: "/energy-blocks/22-void.png",
    valence: -1,
    keywords: [
      "void", "abyss", "nothing", "nothingness", "meaningless", "pointless",
      "무의미", "허", "공허",
    ],
  },
  despair: {
    id: 23,
    key: "despair",
    displayName: "Despair",
    imagePath: "/energy-blocks/23-despair.png",
    valence: -1,
    keywords: [
      "despair", "hopeless", "give up", "gave up", "no way out", "rock bottom",
      "절망", "포기", "막막",
    ],
  },
  hope: {
    id: 24,
    key: "hope",
    displayName: "Hope",
    imagePath: "/energy-blocks/24-hope.png",
    valence: 1,
    keywords: [
      "hope", "hopeful", "optimistic", "optimism", "looking forward", "i think i can",
      "things will", "better days",
      "희망", "낙관",
    ],
  },
  anticipation: {
    id: 25,
    key: "anticipation",
    displayName: "Anticipation",
    imagePath: "/energy-blocks/25-anticipation.png",
    valence: 1,
    keywords: [
      "anticipate", "anticipation", "looking forward", "can't wait", "expecting",
      "expectation", "excited for", "eager",
      "기대", "설레",
    ],
  },
  excitement: {
    id: 26,
    key: "excitement",
    displayName: "Excitement",
    imagePath: "/energy-blocks/26-excitement.png",
    valence: 1,
    keywords: [
      "excited", "excitement", "exciting", "thrilled", "thrilling", "pumped",
      "hyped", "amazing",
      "신나", "흥분", "들뜨", "두근",
    ],
  },
  "being-moved": {
    id: 27,
    key: "being-moved",
    displayName: "Being Moved",
    imagePath: "/energy-blocks/27-being-moved.png",
    valence: 1,
    keywords: [
      "moved", "touched", "moving", "touching", "heartwarming", "tearful joy",
      "tears of joy", "deeply",
      "감동", "뭉클", "찡",
    ],
  },
  gratitude: {
    id: 28,
    key: "gratitude",
    displayName: "Gratitude",
    imagePath: "/energy-blocks/28-gratitude.png",
    valence: 1,
    keywords: [
      "grateful", "gratitude", "thankful", "thanks", "thank you", "appreciate",
      "appreciated", "appreciating", "blessed",
      "감사", "고맙", "고마",
    ],
  },
  regret: {
    id: 29,
    key: "regret",
    displayName: "Regret",
    imagePath: "/energy-blocks/29-regret.png",
    valence: -1,
    keywords: [
      "regret", "regrets", "regretted", "regretting", "wish i hadn't", "should have",
      "shouldn't have", "if only",
      "후회", "아쉽", "아쉬움",
    ],
  },
  resentment: {
    id: 30,
    key: "resentment",
    displayName: "Resentment",
    imagePath: "/energy-blocks/30-resentment.png",
    valence: -1,
    keywords: [
      "resent", "resented", "resentment", "bitter", "bitterness", "grudge",
      "원망", "억울",
    ],
  },
  "hurt-feelings": {
    id: 31,
    key: "hurt-feelings",
    displayName: "Hurt Feelings",
    imagePath: "/energy-blocks/31-hurt-feelings.png",
    valence: -1,
    keywords: [
      "hurt", "hurts", "wounded", "stung", "betrayed", "broken heart",
      "heartbreak", "heartbroken", "rejected", "rejection",
      "상처", "마음이 아", "서운",
    ],
  },
};

export const EMOTION_LIST: Emotion[] = Object.values(EMOTIONS);

export type EmotionScore = {
  emotion: Emotion;
  score: number;
};

/**
 * Extract emotions from text via keyword matching. Returns top emotions
 * sorted by score, descending. Always returns at least `minResults` (default 5)
 * by topping up with random emotions weighted toward the input's overall valence
 * if not enough keyword hits are found.
 */
export function extractEmotions(text: string, minResults = 5): EmotionScore[] {
  const lower = text.toLowerCase();
  const scored: EmotionScore[] = [];

  for (const emotion of EMOTION_LIST) {
    let score = 0;
    for (const kw of emotion.keywords) {
      const k = kw.toLowerCase();
      if (!k) continue;
      // Count occurrences. Use simple split-based count (ok for keyword length >= 2).
      const parts = lower.split(k);
      score += parts.length - 1;
    }
    if (score > 0) scored.push({ emotion, score });
  }

  // Sort by score desc; tiebreaker: higher absolute valence wins so the
  // output feels emotionally specific.
  scored.sort((a, b) => b.score - a.score || Math.abs(b.emotion.valence) - Math.abs(a.emotion.valence));

  // If we have fewer than minResults, top up using a deterministic-ish but
  // varied selection seeded by the text length so the same input is stable
  // within a session but two different inputs vary.
  if (scored.length < minResults) {
    // Bias the top-up toward the dominant valence we already saw, falling
    // back to neutral if we have nothing.
    const leadingValence = scored[0]?.emotion.valence ?? 0;
    const present = new Set(scored.map((s) => s.emotion.key));
    const candidates = EMOTION_LIST.filter((e) => !present.has(e.key)).sort((a, b) => {
      const aDist = Math.abs(a.valence - leadingValence);
      const bDist = Math.abs(b.valence - leadingValence);
      return aDist - bDist;
    });
    const seed = (text.length * 9301 + 49297) % 233280;
    let s = seed;
    while (scored.length < minResults && candidates.length) {
      s = (s * 9301 + 49297) % 233280;
      const idx = s % candidates.length;
      const picked = candidates.splice(idx, 1)[0];
      scored.push({ emotion: picked, score: 0.5 }); // half-strength filler
    }
  }

  return scored;
}
