// Catalog of energy blocks. Each block represents one emotion and maps to a
// gradient PNG in /public/energy-blocks/. Keywords (English + Korean) are used
// by extractEmotions() for a simple substring/word-boundary match.
//
// The catalog is exactly the 50-emotion set under /50 energy blocks/ in the
// repo root: ids 1..50, with id 47 holding "embarrassment" (the original PNG
// was checked in as a duplicate "31._HURT_FEELINGS.png" — we put it where the
// numbering left a gap so the catalog is 1..50 contiguous, and relabelled to
// embarrassment to match the design intent).

export type EmotionKey =
  | "happiness"
  | "joy"
  | "excitement"
  | "anticipation"
  | "hope"
  | "thrill"
  | "pleasure"
  | "calmness"
  | "satisfaction"
  | "relief"
  | "gratitude"
  | "intimacy"
  | "anger"
  | "irritation"
  | "passion"
  | "jealousy"
  | "envy"
  | "sadness"
  | "depression"
  | "loneliness"
  | "disappointment"
  | "despair"
  | "frustration"
  | "love"
  | "moved"
  | "longing"
  | "nostalgia"
  | "guilt"
  | "regret"
  | "anxiety"
  | "tension"
  | "pressure"
  | "stress"
  | "confused"
  | "hesitation"
  | "helplessness"
  | "emptiness"
  | "boredom"
  | "fatigue"
  | "apathy"
  | "surprise"
  | "curiosity"
  | "engagement"
  | "confidence"
  | "pride"
  | "liberation"
  | "embarrassment"
  | "shame"
  | "disgust"
  | "insight";

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
  // Optional — only the primary emotions shown on that page need it today.
  description?: string;
};

export const EMOTIONS: Record<EmotionKey, Emotion> = {
  happiness: {
    id: 1,
    key: "happiness",
    displayName: "Happiness",
    imagePath: "/energy-blocks/1-happiness.png",
    valence: 1,
    keywords: [
      "happy", "happiness", "content", "contentment", "cheerful", "cheer",
      "smile", "smiled", "smiling", "good day", "great day",
      "행복", "행복해", "행복하", "좋은", "흐뭇",
    ],
    description:
      "Happiness is a steady, warm sense of well-being that settles in when life feels good as it is.",
  },
  joy: {
    id: 2,
    key: "joy",
    displayName: "Joy",
    imagePath: "/energy-blocks/2-joy.png",
    valence: 1,
    keywords: [
      "joy", "joyful", "delight", "delighted", "glee", "gleeful", "elated",
      "laugh", "laughed", "laughing", "yay", "wonderful", "fantastic",
      "기쁘", "기쁨", "즐거", "즐겁", "신나", "웃",
    ],
    description:
      "Joy is a bright, lifting emotion that bursts out when something delights the mind and body.",
  },
  excitement: {
    id: 3,
    key: "excitement",
    displayName: "Excitement",
    imagePath: "/energy-blocks/3-excitement.png",
    valence: 1,
    keywords: [
      "excited", "excitement", "exciting", "thrilled", "pumped", "hyped",
      "amazing", "buzzing", "energized",
      "신나", "흥분", "들뜨", "두근",
    ],
  },
  anticipation: {
    id: 4,
    key: "anticipation",
    displayName: "Anticipation",
    imagePath: "/energy-blocks/4-anticipation.png",
    valence: 1,
    keywords: [
      "anticipate", "anticipation", "looking forward", "can't wait", "eager",
      "expecting", "expectation",
      "기대", "설레",
    ],
  },
  hope: {
    id: 5,
    key: "hope",
    displayName: "Hope",
    imagePath: "/energy-blocks/5-hope.png",
    valence: 1,
    keywords: [
      "hope", "hopeful", "optimistic", "optimism", "i think i can",
      "things will", "better days",
      "희망", "낙관",
    ],
  },
  thrill: {
    id: 6,
    key: "thrill",
    displayName: "Thrill",
    imagePath: "/energy-blocks/6-thrill.png",
    valence: 1,
    keywords: [
      "thrill", "thrilling", "rush", "adrenaline", "exhilarating",
      "exhilarated", "wild ride",
      "짜릿", "스릴",
    ],
  },
  pleasure: {
    id: 7,
    key: "pleasure",
    displayName: "Pleasure",
    imagePath: "/energy-blocks/7-pleasure.png",
    valence: 1,
    keywords: [
      "pleasure", "pleasant", "enjoyed", "enjoying", "lovely", "nice",
      "cozy", "indulge", "indulgent",
      "기분 좋", "즐거움", "쾌적",
    ],
  },
  calmness: {
    id: 8,
    key: "calmness",
    displayName: "Calmness",
    imagePath: "/energy-blocks/8-calmness.png",
    valence: 1,
    keywords: [
      "calm", "calmness", "peace", "peaceful", "serene", "serenity",
      "tranquil", "still", "settled", "quiet",
      "차분", "평온", "고요", "안정",
    ],
  },
  satisfaction: {
    id: 9,
    key: "satisfaction",
    displayName: "Satisfaction",
    imagePath: "/energy-blocks/9-satisfaction.png",
    valence: 1,
    keywords: [
      "satisfaction", "satisfied", "satisfying", "fulfilled", "fulfilling",
      "well done", "complete",
      "만족", "충족", "흡족",
    ],
  },
  relief: {
    id: 10,
    key: "relief",
    displayName: "Relief",
    imagePath: "/energy-blocks/10-relief.png",
    valence: 1,
    keywords: [
      "relief", "relieved", "phew", "thank god", "finally over", "made it",
      "안도", "다행", "후",
    ],
  },
  gratitude: {
    id: 11,
    key: "gratitude",
    displayName: "Gratitude",
    imagePath: "/energy-blocks/11-gratitude.png",
    valence: 1,
    keywords: [
      "grateful", "gratitude", "thankful", "thanks", "thank you",
      "appreciate", "appreciated", "appreciating", "blessed",
      "감사", "고맙", "고마",
    ],
  },
  intimacy: {
    id: 12,
    key: "intimacy",
    displayName: "Intimacy",
    imagePath: "/energy-blocks/12-intimacy.png",
    valence: 1,
    keywords: [
      "intimate", "intimacy", "close", "closeness", "tender", "tenderness",
      "bonded", "connected",
      "친밀", "가까움", "유대",
    ],
  },
  anger: {
    id: 13,
    key: "anger",
    displayName: "Anger",
    imagePath: "/energy-blocks/13-anger.png",
    valence: -1,
    keywords: [
      "anger", "angry", "mad", "furious", "rage", "raging", "hate", "hated",
      "fume", "fuming",
      "화나", "화가", "분노", "열받", "빡",
    ],
    description:
      "Anger is a hot, sharp emotion stirred by a sense of being wronged or blocked.",
  },
  irritation: {
    id: 14,
    key: "irritation",
    displayName: "Irritation",
    imagePath: "/energy-blocks/14-irritation.png",
    valence: -1,
    keywords: [
      "irritated", "irritating", "annoyed", "annoying", "bothered",
      "bothering", "agitated", "peeved",
      "짜증", "거슬", "성가",
    ],
  },
  passion: {
    id: 15,
    key: "passion",
    displayName: "Passion",
    imagePath: "/energy-blocks/15-passion.png",
    valence: 1,
    keywords: [
      "passion", "passionate", "fervent", "burning", "alive", "fired up",
      "열정", "정열",
    ],
  },
  jealousy: {
    id: 16,
    key: "jealousy",
    displayName: "Jealousy",
    imagePath: "/energy-blocks/16-jealousy.png",
    valence: -1,
    keywords: [
      "jealous", "jealousy", "possessive", "threatened",
      "질투", "샘",
    ],
  },
  envy: {
    id: 17,
    key: "envy",
    displayName: "Envy",
    imagePath: "/energy-blocks/17-envy.png",
    valence: -1,
    keywords: [
      "envy", "envious", "wish i had", "wish i were",
      "부럽", "부러움",
    ],
  },
  sadness: {
    id: 18,
    key: "sadness",
    displayName: "Sadness",
    imagePath: "/energy-blocks/18-sadness.png",
    valence: -1,
    keywords: [
      "sad", "sadness", "cry", "crying", "tear", "tears", "wept", "weep",
      "sorrow", "miserable", "down", "blue",
      "슬프", "슬픔", "울", "눈물", "서글", "쓸쓸",
    ],
    description:
      "Sadness is a low, heavy emotion that arises when something loved is lost or out of reach.",
  },
  depression: {
    id: 19,
    key: "depression",
    displayName: "Depression",
    imagePath: "/energy-blocks/19-depression.png",
    valence: -1,
    keywords: [
      "depressed", "depression", "deeply down", "hollow days", "no light",
      "heavy", "drained",
      "우울", "울적",
    ],
  },
  loneliness: {
    id: 20,
    key: "loneliness",
    displayName: "Loneliness",
    imagePath: "/energy-blocks/20-loneliness.png",
    valence: -1,
    keywords: [
      "lonely", "loneliness", "alone", "isolated", "isolation", "abandoned",
      "by myself", "no one", "no friends",
      "외로", "혼자", "고독",
    ],
  },
  disappointment: {
    id: 21,
    key: "disappointment",
    displayName: "Disappointment",
    imagePath: "/energy-blocks/21-disappointment.png",
    valence: -1,
    keywords: [
      "disappointed", "disappointing", "disappointment", "let down", "letdown",
      "expected better",
      "실망", "기대 이하",
    ],
  },
  despair: {
    id: 22,
    key: "despair",
    displayName: "Despair",
    imagePath: "/energy-blocks/22-despair.png",
    valence: -1,
    keywords: [
      "despair", "hopeless", "give up", "gave up", "no way out", "rock bottom",
      "절망", "포기", "막막",
    ],
  },
  frustration: {
    id: 23,
    key: "frustration",
    displayName: "Frustration",
    imagePath: "/energy-blocks/23-frustration.png",
    valence: -1,
    keywords: [
      "frustrated", "frustrating", "frustration", "stuck", "blocked",
      "can't get", "ugh",
      "답답", "짜증나",
    ],
  },
  love: {
    id: 24,
    key: "love",
    displayName: "Love",
    imagePath: "/energy-blocks/24-love.png",
    valence: 1,
    keywords: [
      "love", "loved", "loving", "adore", "adored", "fond", "affection",
      "affectionate", "cherish", "cherished", "darling", "sweetheart",
      "사랑", "애정", "좋아하",
    ],
    description:
      "Love is a warm, expanding emotion that draws you toward someone or something with care.",
  },
  moved: {
    id: 25,
    key: "moved",
    displayName: "Moved",
    imagePath: "/energy-blocks/25-moved.png",
    valence: 1,
    keywords: [
      "moved", "touched", "moving", "touching", "heartwarming",
      "tears of joy", "deeply",
      "감동", "뭉클", "찡",
    ],
  },
  longing: {
    id: 26,
    key: "longing",
    displayName: "Longing",
    imagePath: "/energy-blocks/26-longing.png",
    valence: 0,
    keywords: [
      "longing", "long for", "yearn", "yearning", "miss you", "miss them",
      "miss it", "ache for",
      "그리워", "그리움", "사무치",
    ],
  },
  nostalgia: {
    id: 27,
    key: "nostalgia",
    displayName: "Nostalgia",
    imagePath: "/energy-blocks/27-nostalgia.png",
    valence: 0,
    keywords: [
      "nostalgia", "nostalgic", "remember when", "back then", "those days",
      "old days",
      "추억", "옛날",
    ],
  },
  guilt: {
    id: 28,
    key: "guilt",
    displayName: "Guilt",
    imagePath: "/energy-blocks/28-guilt.png",
    valence: -1,
    keywords: [
      "guilt", "guilty", "remorse", "remorseful", "my fault", "i shouldn't",
      "i should have", "wrong of me",
      "죄책", "죄송", "미안",
    ],
  },
  regret: {
    id: 29,
    key: "regret",
    displayName: "Regret",
    imagePath: "/energy-blocks/29-regret.png",
    valence: -1,
    keywords: [
      "regret", "regrets", "regretted", "regretting", "wish i hadn't",
      "should have", "shouldn't have", "if only",
      "후회", "아쉽", "아쉬움",
    ],
  },
  anxiety: {
    id: 30,
    key: "anxiety",
    displayName: "Anxiety",
    imagePath: "/energy-blocks/30-anxiety.png",
    valence: -1,
    keywords: [
      "anxious", "anxiety", "worried", "worry", "worrying", "unease",
      "overthink", "overthinking", "what if", "panic",
      "불안", "걱정", "근심",
    ],
  },
  tension: {
    id: 31,
    key: "tension",
    displayName: "Tension",
    imagePath: "/energy-blocks/31-tension.png",
    valence: -1,
    keywords: [
      "tension", "tense", "uptight", "wound up", "on edge", "tight",
      "긴장", "팽팽",
    ],
  },
  pressure: {
    id: 32,
    key: "pressure",
    displayName: "Pressure",
    imagePath: "/energy-blocks/32-pressure.png",
    valence: -1,
    keywords: [
      "pressure", "pressured", "under pressure", "deadline", "expectations on me",
      "압박", "부담",
    ],
  },
  stress: {
    id: 33,
    key: "stress",
    displayName: "Stress",
    imagePath: "/energy-blocks/33-stress.png",
    valence: -1,
    keywords: [
      "stress", "stressed", "stressful", "overwhelmed", "swamped", "burnt out",
      "burned out", "burnout",
      "스트레스", "지쳐", "번아웃",
    ],
  },
  confused: {
    id: 34,
    key: "confused",
    displayName: "Confused",
    imagePath: "/energy-blocks/34-confused.png",
    valence: 0,
    keywords: [
      "confused", "confusing", "confusion", "don't understand", "doesn't make sense",
      "puzzled", "lost",
      "혼란", "헷갈", "어리둥",
    ],
  },
  hesitation: {
    id: 35,
    key: "hesitation",
    displayName: "Hesitation",
    imagePath: "/energy-blocks/35-hesitation.png",
    valence: 0,
    keywords: [
      "hesitate", "hesitant", "hesitation", "not sure", "second thoughts",
      "weighing", "torn",
      "망설", "주저", "고민",
    ],
  },
  helplessness: {
    id: 36,
    key: "helplessness",
    displayName: "Helplessness",
    imagePath: "/energy-blocks/36-helplessness.png",
    valence: -1,
    keywords: [
      "helpless", "helplessness", "powerless", "nothing i can do", "stuck",
      "무력", "어쩔 수",
    ],
  },
  emptiness: {
    id: 37,
    key: "emptiness",
    displayName: "Emptiness",
    imagePath: "/energy-blocks/37-emptiness.png",
    valence: -1,
    keywords: [
      "empty", "emptiness", "hollow", "numb", "blank", "nothing inside",
      "공허", "허무", "텅",
    ],
  },
  boredom: {
    id: 38,
    key: "boredom",
    displayName: "Boredom",
    imagePath: "/energy-blocks/38-boredom.png",
    valence: -1,
    keywords: [
      "bored", "boring", "boredom", "dull", "uninteresting", "nothing to do",
      "지루", "심심", "따분",
    ],
  },
  fatigue: {
    id: 39,
    key: "fatigue",
    displayName: "Fatigue",
    imagePath: "/energy-blocks/39-fatigue.png",
    valence: -1,
    keywords: [
      "tired", "fatigue", "fatigued", "exhausted", "exhausting", "worn out",
      "spent", "drained",
      "피곤", "지쳐", "피로",
    ],
  },
  apathy: {
    id: 40,
    key: "apathy",
    displayName: "Apathy",
    imagePath: "/energy-blocks/40-apathy.png",
    valence: -1,
    keywords: [
      "apathy", "apathetic", "don't care", "indifferent", "whatever",
      "meh",
      "무관심", "심드렁",
    ],
  },
  surprise: {
    id: 41,
    key: "surprise",
    displayName: "Surprise",
    imagePath: "/energy-blocks/41-surprise.png",
    valence: 0,
    keywords: [
      "surprise", "surprised", "shock", "shocked", "shocking", "astonish",
      "astonished", "stunned", "wow", "unexpected", "sudden", "suddenly",
      "놀라", "놀랐", "헐", "갑자기", "깜짝",
    ],
    description:
      "Surprise is a brief, suspended emotion sparked by something unexpected.",
  },
  curiosity: {
    id: 42,
    key: "curiosity",
    displayName: "Curiosity",
    imagePath: "/energy-blocks/42-curiosity.png",
    valence: 1,
    keywords: [
      "curious", "curiosity", "wondering", "wonder why", "interested",
      "intrigued", "want to know",
      "궁금", "호기심",
    ],
  },
  engagement: {
    id: 43,
    key: "engagement",
    displayName: "Engagement",
    imagePath: "/energy-blocks/43-engagement.png",
    valence: 1,
    keywords: [
      "engaged", "engagement", "absorbed", "immersed", "in flow", "flow state",
      "focused",
      "몰입", "집중",
    ],
  },
  confidence: {
    id: 44,
    key: "confidence",
    displayName: "Confidence",
    imagePath: "/energy-blocks/44-confidence.png",
    valence: 1,
    keywords: [
      "confident", "confidence", "self-assured", "sure of myself", "i can",
      "i've got this",
      "자신감", "자신",
    ],
  },
  pride: {
    id: 45,
    key: "pride",
    displayName: "Pride",
    imagePath: "/energy-blocks/45-pride.png",
    valence: 1,
    keywords: [
      "pride", "proud", "accomplished", "accomplishment", "achievement",
      "achieve", "achieved", "did it", "i did", "succeeded",
      "자랑", "뿌듯", "자부심", "성취", "해냈", "이뤘",
    ],
  },
  liberation: {
    id: 46,
    key: "liberation",
    displayName: "Liberation",
    imagePath: "/energy-blocks/46-liberation.png",
    valence: 1,
    keywords: [
      "free", "freedom", "liberated", "liberation", "unburdened", "released",
      "let go",
      "자유", "해방", "후련",
    ],
  },
  embarrassment: {
    id: 47,
    key: "embarrassment",
    displayName: "Embarrassment",
    imagePath: "/energy-blocks/47-embarrassment.png",
    valence: -1,
    keywords: [
      "embarrass", "embarrassed", "embarrassing", "embarrassment",
      "awkward", "awkwardly",
      "blush", "blushed", "blushing",
      "cringe", "cringed", "cringy", "cringeworthy",
      "mortified", "mortifying",
      "민망", "창피", "쪽팔", "어색",
    ],
  },
  shame: {
    id: 48,
    key: "shame",
    displayName: "Shame",
    imagePath: "/energy-blocks/48-shame.png",
    valence: -1,
    keywords: [
      "shame", "ashamed", "shameful", "disgrace", "disgraced",
      "humiliation", "humiliated",
      "수치", "부끄러",
    ],
  },
  disgust: {
    id: 49,
    key: "disgust",
    displayName: "Disgust",
    imagePath: "/energy-blocks/49-disgust.png",
    valence: -1,
    keywords: [
      "disgust", "disgusted", "disgusting", "gross", "yuck", "ew", "nasty",
      "repulsive", "revolt", "revolting", "sick",
      "역겨", "더러", "구역", "거부감", "혐오",
    ],
    description:
      "Disgust is a recoiling emotion the body uses to push away what feels unsafe or unclean.",
  },
  insight: {
    id: 50,
    key: "insight",
    displayName: "Insight",
    imagePath: "/energy-blocks/50-insight.png",
    valence: 1,
    keywords: [
      "insight", "realized", "realization", "clarity", "aha", "now i see",
      "it clicked",
      "깨달", "깨달음", "통찰",
    ],
  },
};

export const EMOTION_LIST: Emotion[] = Object.values(EMOTIONS);

// One-sentence description used by the Energy Blocks catalog page (info
// panel). One sentence per emotion, written in the same "[Emotion] is a
// <adj> <emotion> that <does X> when <Y>" cadence as the Figma reference.
// Kept separate from EMOTIONS so churning copy doesn't touch creature-gen
// fields like keywords / valence.
export const EMOTION_DESCRIPTION: Record<EmotionKey, string> = {
  happiness:
    "Happiness is a steady, warm sense of well-being that settles in when life feels good as it is.",
  joy:
    "Joy is a bright, lifting emotion that bursts out when something delights the mind and body.",
  excitement:
    "Excitement is a buzzing surge of energy that builds when something stirring is on the way.",
  anticipation:
    "Anticipation is a leaning-forward feeling that arises when you expect something good is about to happen.",
  hope:
    "Hope is a quiet upward pull that arises when you trust good things might still come.",
  thrill:
    "Thrill is a sharp, electric rush that hits when life suddenly turns vivid and uncertain.",
  pleasure:
    "Pleasure is a simple, embodied sweetness that arises when something pleases the senses.",
  calmness:
    "Calmness is a soft, settled feeling that arrives when the mind and body finally let go.",
  satisfaction:
    "Satisfaction is a grounded sense of fullness that follows when something has been completed well.",
  relief:
    "Relief is a loosening wave that washes through when a strain or worry finally lifts.",
  gratitude:
    "Gratitude is a warm openness that arises when you recognize what others have given you.",
  intimacy:
    "Intimacy is a close, soft warmth that arises when guards drop between two people.",
  anger:
    "Anger is a hot, sharp emotion stirred by a sense of being wronged or blocked.",
  irritation:
    "Irritation is a small, prickly feeling that flares when something keeps rubbing the wrong way.",
  passion:
    "Passion is a burning intensity that arises when something matters to you deeply.",
  jealousy:
    "Jealousy is a clenching ache that appears when you fear losing what is yours.",
  envy:
    "Envy is a sour pull that arises when someone has what you wish were yours.",
  sadness:
    "Sadness is a low, heavy emotion that arises when something loved is lost or out of reach.",
  depression:
    "Depression is a heavy, all-over flatness that settles in when energy and meaning drain away.",
  loneliness:
    "Loneliness is a hollow ache that arises when connection with others feels far away.",
  disappointment:
    "Disappointment is a quiet drop that follows when reality turns out smaller than what you'd hoped.",
  despair:
    "Despair is a bottomless dark that takes hold when no path forward seems possible.",
  frustration:
    "Frustration is a pressed-up feeling that builds when effort keeps meeting a wall.",
  love:
    "Love is a warm, expanding emotion that draws you toward someone or something with care.",
  moved:
    "Being moved is a swelling tenderness that wells up when something quietly touches the heart.",
  longing:
    "Longing is a slow, aching reach toward someone or something far away.",
  nostalgia:
    "Nostalgia is a bittersweet warmth that visits when memories of the past come back vividly.",
  guilt:
    "Guilt is a weight on the chest that arises when you sense you've harmed someone.",
  regret:
    "Regret is a backwards-looking ache for the choice you wish you hadn't made.",
  anxiety:
    "Anxiety is a jittery unease that hums in the body when an unknown future presses in.",
  tension:
    "Tension is a tight, braced feeling that holds the body when threat or strain hovers near.",
  pressure:
    "Pressure is a pressing-in weight that arises when too much rests on what you do next.",
  stress:
    "Stress is an overheated load that piles up when more is asked than the body can carry.",
  confused:
    "Confusion is a tangled blur that settles in when nothing quite makes sense.",
  hesitation:
    "Hesitation is a held-breath pause that arises when the next step is unclear.",
  helplessness:
    "Helplessness is a heavy stillness that settles in when nothing you do seems to help.",
  emptiness:
    "Emptiness is a wide, hollow quiet that lingers when feeling and meaning have drained out.",
  boredom:
    "Boredom is a flat, slow drag that builds when nothing is interesting enough to engage you.",
  fatigue:
    "Fatigue is a bone-deep heaviness that arrives when the body has nothing left to give.",
  apathy:
    "Apathy is a flat indifference that settles in when nothing seems worth caring about.",
  surprise:
    "Surprise is a brief, suspended emotion sparked by something unexpected.",
  curiosity:
    "Curiosity is a leaning-forward openness that arises when something pulls you to know more.",
  engagement:
    "Engagement is a focused absorption that takes hold when what you're doing fully meets you.",
  confidence:
    "Confidence is a steady, rooted self-trust that holds you up when you act in the world.",
  pride:
    "Pride is a lifting warmth that follows when you know you've done something well.",
  liberation:
    "Liberation is a wide, free expansion that follows when something heavy finally lets go.",
  embarrassment:
    "Embarrassment is a flushed unease that rises when you feel suddenly, awkwardly seen.",
  shame:
    "Shame is a shrinking heat that arises when you feel exposed as not good enough.",
  disgust:
    "Disgust is a recoiling emotion the body uses to push away what feels unsafe or unclean.",
  insight:
    "Insight is a quiet click that arrives when something previously hidden suddenly becomes clear.",
};

// Coarse color group per emotion. Two consumers:
//   1. Energy Blocks page — keeps same-coloured tiles from sitting next to
//      each other in the random grid.
//   2. lib/audio — each group has its own voice character (waveform,
//      pitch sweep direction, syllable pattern, filter, reverb), so all
//      emotions inside a group "sound similar" while different groups
//      sound clearly distinct.
//
// Membership matches the user's spec (Dec 2026):
//   yellow  bright, expanding feelings
//   green   stable / recovering feelings
//   red     intense feelings
//   blue    sinking feelings
//   purple  complex / deep feelings
//   orange  tension / anxiety feelings
//   grey    flattened / blocked feelings
//   mint    cognitive / neutral / clear states (catch-all)
export type EmotionColorGroup =
  | "yellow"
  | "green"
  | "red"
  | "blue"
  | "purple"
  | "orange"
  | "grey"
  | "mint";

export const EMOTION_COLOR_GROUP: Record<EmotionKey, EmotionColorGroup> = {
  // 🟡 yellow — bright, expanding feelings
  happiness: "yellow",
  joy: "yellow",
  excitement: "yellow",
  anticipation: "yellow",
  hope: "yellow",
  thrill: "yellow",
  pleasure: "yellow",

  // 🟢 green — stable / recovering feelings
  calmness: "green",
  satisfaction: "green",
  relief: "green",
  gratitude: "green",
  intimacy: "green",

  // 🔴 red — intense feelings
  anger: "red",
  irritation: "red",
  passion: "red",
  jealousy: "red",
  envy: "red",

  // 🔵 blue — sinking feelings
  sadness: "blue",
  depression: "blue",
  loneliness: "blue",
  disappointment: "blue",
  despair: "blue",
  frustration: "blue",

  // 🟣 purple — complex / deep feelings
  love: "purple",
  moved: "purple",
  longing: "purple",
  nostalgia: "purple",
  guilt: "purple",
  regret: "purple",

  // 🟠 orange — tension / anxiety feelings
  anxiety: "orange",
  tension: "orange",
  pressure: "orange",
  stress: "orange",
  confused: "orange",
  hesitation: "orange",

  // ⚫ grey — flattened / blocked feelings
  helplessness: "grey",
  emptiness: "grey",
  boredom: "grey",
  fatigue: "grey",
  apathy: "grey",

  // 🌿 mint — cognitive / neutral / clear states
  surprise: "mint",
  curiosity: "mint",
  engagement: "mint",
  confidence: "mint",
  pride: "mint",
  liberation: "mint",
  embarrassment: "mint",
  shame: "mint",
  disgust: "mint",
  insight: "mint",
};

export type EmotionScore = {
  emotion: Emotion;
  score: number;
};

// English negation tokens. We scan the ~18 chars before each ASCII keyword
// match — but only treat the hit as negated if the negation is in the SAME
// clause (no comma / period / "but" / "and" / "yet" between the negation
// and the keyword). Without this clause-awareness, "I'm not sad, just
// tired" would wrongly negate "tired" because "not" still sits within the
// lookback window. Without word-boundary anchoring (which buildKeywordRegex
// adds for ASCII keywords) the old substring scoring also let "unhappy"
// trigger happiness — both fixes together produce sensible matches.
const ENGLISH_NEGATIONS =
  /\b(?:not|no|never|hardly|barely|cannot|isn't|wasn't|aren't|weren't|don't|didn't|doesn't|won't|wouldn't|couldn't|shouldn't|haven't|hasn't|hadn't)\b/gi;
const CLAUSE_BREAK = /[.,;!?]|\b(?:but|yet|though|however|and|or)\b/i;
const NEGATION_LOOKBACK_CHARS = 18;

// Returns true iff a negation in the SAME clause as `start` precedes it
// within NEGATION_LOOKBACK_CHARS. The "same clause" test rejects the
// negation if any clause-break punctuation/conjunction sits between the
// negation and `start` — so "I'm not sad, just tired" doesn't negate
// "tired" but "I'm not very happy" does negate "happy".
function isEnglishNegated(text: string, start: number): boolean {
  const before = text.slice(Math.max(0, start - NEGATION_LOOKBACK_CHARS), start);
  let lastNegEnd = -1;
  ENGLISH_NEGATIONS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENGLISH_NEGATIONS.exec(before)) !== null) {
    lastNegEnd = m.index + m[0].length;
    if (ENGLISH_NEGATIONS.lastIndex === m.index) ENGLISH_NEGATIONS.lastIndex++;
  }
  if (lastNegEnd === -1) return false;
  const between = before.slice(lastNegEnd);
  return !CLAUSE_BREAK.test(between);
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAsciiKeyword(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return false;
  }
  return true;
}

// Build a regex for a single keyword:
//   English (ASCII): anchor at a word boundary on the LEFT only, no end
//     anchor — so "happy" matches "happy", "happily", "happiness" but
//     NOT "unhappy" (the previous substring scoring incorrectly counted
//     "unhappy" as happiness).
//   Korean / mixed: plain substring — Hangul agglutinates and there's no
//     prefix-false-positive risk in journal text.
function buildKeywordRegex(keyword: string): RegExp {
  const k = keyword.toLowerCase();
  if (isAsciiKeyword(k)) {
    return new RegExp(`\\b${escapeForRegex(k)}`, "gi");
  }
  return new RegExp(escapeForRegex(k), "gi");
}

/**
 * Extract emotions from text via keyword matching. Returns top emotions
 * sorted by score, descending. Always returns at least `minResults` (default 5)
 * by topping up with random emotions weighted toward the input's overall valence
 * if not enough keyword hits are found.
 *
 * Match rules:
 *   - English keywords use a word-start anchor (\b<kw>) so substrings like
 *     "happy" inside "unhappy" don't score happiness.
 *   - Negations within ~18 chars before an English match cancel that hit,
 *     so "I'm not happy" doesn't score happiness either.
 *   - Hits are deduped per emotion by character range, so a single word
 *     like "laughed" only counts once even if both "laugh" and "laughed"
 *     are in the keyword list.
 */
export function extractEmotions(text: string, minResults = 5): EmotionScore[] {
  const lower = text.toLowerCase();
  const scored: EmotionScore[] = [];

  for (const emotion of EMOTION_LIST) {
    // Track [start, end) ranges of counted hits to suppress double-counting
    // when multiple keywords match the same word (e.g. "laugh" and
    // "laughed" both inside "laughed").
    const used: Array<[number, number]> = [];
    let score = 0;
    for (const kw of emotion.keywords) {
      const k = kw.toLowerCase();
      if (!k) continue;
      const isAscii = isAsciiKeyword(k);
      const re = buildKeywordRegex(k);
      let m: RegExpExecArray | null;
      while ((m = re.exec(lower)) !== null) {
        const start = m.index;
        const end = start + k.length;
        if (re.lastIndex === start) re.lastIndex++; // guard against zero-width
        // Skip hits already covered by an earlier keyword for this emotion.
        let overlaps = false;
        for (const [s, e] of used) {
          if (start < e && end > s) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;
        // Skip hits negated within their clause (English only — Korean
        // negation handling is harder and lower ROI; left as future work).
        if (isAscii && isEnglishNegated(lower, start)) continue;
        used.push([start, end]);
        score += 1;
      }
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
