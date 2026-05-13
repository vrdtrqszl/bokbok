// Language / translation module for BokBok.
//
// One source of truth for the current language is `localStorage` under
// the key `bokbok:language` (the LanguageButton picker writes it). This
// module exposes:
//
//   - useLanguage()  — React hook returning the current Lang, reactive
//                      to changes from the picker (via a custom event)
//                      and from other tabs (via `storage` events).
//   - useT()         — Convenience: returns a `t(key)` translator
//                      already bound to the current Lang.
//   - t(key, lang)   — Direct lookup for non-React code.
//   - getLang()      — Synchronous current Lang read (SSR-safe).
//
// Journal text and user-given creature names stay as written; everything
// in the dictionaries below is UI chrome (nav, buttons, hints, emotion
// names + descriptions, month / day labels).

"use client";

import { useEffect, useState } from "react";
import type { EmotionKey } from "./emotions";

export type Lang = "ENG" | "ESP" | "KOR";

export const LANGUAGE_STORAGE_KEY = "bokbok:language";
export const LANGUAGE_CHANGED_EVENT = "bokbok:language-changed";

export function getLang(): Lang {
  if (typeof window === "undefined") return "ENG";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "ESP" || stored === "KOR") return stored;
  } catch {
    // ignore
  }
  return "ENG";
}

export function setLang(next: Lang): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(LANGUAGE_CHANGED_EVENT));
}

/** Hook: returns the current language, re-rendering on changes. */
export function useLanguage(): Lang {
  const [lang, setLangState] = useState<Lang>("ENG");
  useEffect(() => {
    const sync = () => setLangState(getLang());
    sync();
    window.addEventListener(LANGUAGE_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return lang;
}

/** Hook: returns a translator `t(key)` bound to the current language. */
export function useT(): (key: TranslationKey) => string {
  const lang = useLanguage();
  return (key) => t(key, lang);
}

/** Translate a key with an optional language override. */
export function t(key: TranslationKey, lang?: Lang): string {
  const L = lang ?? getLang();
  return DICT[L][key] ?? DICT.ENG[key] ?? key;
}

// ---- Dictionaries ----------------------------------------------------
// Keep all strings in one place. Adding a new UI string: declare its
// English text, then add ESP + KOR rows. Missing rows fall back to ENG.

type Dict = Record<string, string>;

const ENG: Dict = {
  // Nav
  "nav.create": "Create",
  "nav.calendar": "Calendar",
  "nav.encyclopedia": "BokBokpedia",
  "nav.energy_blocks": "Energy Blocks",
  "nav.about": "About",

  // BokBok button (main page)
  "main.bokbok_button": "BokBok",
  "main.fullscreen_enter": "Enter full screen",
  "main.fullscreen_exit": "Exit full screen",
  "main.candy_title": "Call creatures back to the centre",
  "main.zoom_in": "Zoom in",
  "main.zoom_out": "Zoom out",
  "main.sound_on": "Sound on — click to mute",
  "main.sound_off": "Sound off — click to turn on",

  // Right-panel hints
  "panel.click_creature": "Click a creature in the",
  "panel.bokbokpedia_to_view": "BokBokpedia to view it",
  "panel.calendar_to_view": "calendar to view it",
  "panel.pick_from_bokbokpedia": "Pick a creature from the BokBokpedia to read its journal entry.",
  "panel.pick_from_calendar": "Pick a creature from the calendar to read its journal entry.",
  "panel.no_journal_manual": "No journal entry — this creature was made in the manual studio.",
  "panel.empty_name": "Name",

  // Create / Manual pages
  "create.placeholder_journal": "What happened today? Describe events and feelings…",
  "create.empty_canvas": "Type below and press Generate",
  "create.placeholder_name": "Name",
  "create.placeholder_search_blocks": "Search…",
  "create.generate": "Generate",
  "create.manually": "Manually",
  "create.upload": "Upload to Ecosystem",
  "create.uploaded": "Uploaded",
  "create.go_to_ecosystem": "Go to ecosystem",
  "create.delete": "Delete",
  "create.cancel": "Cancel",
  "create.edit": "Edit",
  "create.alert_write_journal": "Please write your journal entry first.",
  "create.alert_creature_name": "Please give your creature a name first.",
  "create.alert_add_block": "Please add at least one block to the canvas first.",

  // Encyclopedia
  "enc.search_placeholder": "Name or date",
  "enc.no_matches": "No matches for",
  "enc.empty_no_creatures": "No creatures yet.",
  "enc.empty_create_first": "Create your first one →",

  // Energy Blocks
  "eb.empty_viewfinder_line1": "Click an energy block in the",
  "eb.empty_viewfinder_line2": "grid to view it",
  "eb.info_intro_line1": "Each block holds a feeling.",
  "eb.info_intro_line2": "Click one to read about it.",

  // Actions shared on multiple pages
  "action.download": "Download",
  "action.edit": "Edit",
  "action.delete": "Delete",

  // Months (Calendar)
  "month.1": "January", "month.2": "February", "month.3": "March",
  "month.4": "April",   "month.5": "May",      "month.6": "June",
  "month.7": "July",    "month.8": "August",   "month.9": "September",
  "month.10": "October","month.11": "November","month.12": "December",

  // Days (Calendar)
  "day.sun": "Sun", "day.mon": "Mon", "day.tue": "Tue", "day.wed": "Wed",
  "day.thu": "Thu", "day.fri": "Fri", "day.sat": "Sat",
};

const ESP: Dict = {
  "nav.create": "Crear",
  "nav.calendar": "Calendario",
  "nav.encyclopedia": "BokBokpedia",
  "nav.energy_blocks": "Bloques de Energía",
  "nav.about": "Acerca",

  "main.bokbok_button": "BokBok",
  "main.fullscreen_enter": "Pantalla completa",
  "main.fullscreen_exit": "Salir de pantalla completa",
  "main.candy_title": "Llamar a las criaturas al centro",
  "main.zoom_in": "Acercar",
  "main.zoom_out": "Alejar",
  "main.sound_on": "Sonido activado — clic para silenciar",
  "main.sound_off": "Sonido silenciado — clic para activar",

  "panel.click_creature": "Haz clic en una criatura de la",
  "panel.bokbokpedia_to_view": "BokBokpedia para verla",
  "panel.calendar_to_view": "calendario para verla",
  "panel.pick_from_bokbokpedia": "Elige una criatura de la BokBokpedia para leer su diario.",
  "panel.pick_from_calendar": "Elige una criatura del calendario para leer su diario.",
  "panel.no_journal_manual": "Sin diario — esta criatura se creó en el estudio manual.",
  "panel.empty_name": "Nombre",

  "create.placeholder_journal": "¿Qué pasó hoy? Describe eventos y sentimientos…",
  "create.empty_canvas": "Escribe abajo y pulsa Generar",
  "create.placeholder_name": "Nombre",
  "create.placeholder_search_blocks": "Buscar…",
  "create.generate": "Generar",
  "create.manually": "Manual",
  "create.upload": "Subir al Ecosistema",
  "create.uploaded": "Subido",
  "create.go_to_ecosystem": "Ir al ecosistema",
  "create.delete": "Eliminar",
  "create.cancel": "Cancelar",
  "create.edit": "Editar",
  "create.alert_write_journal": "Por favor escribe tu diario primero.",
  "create.alert_creature_name": "Por favor ponle un nombre a tu criatura primero.",
  "create.alert_add_block": "Por favor añade al menos un bloque al lienzo primero.",

  "enc.search_placeholder": "Nombre o fecha",
  "enc.no_matches": "Sin resultados para",
  "enc.empty_no_creatures": "Aún no hay criaturas.",
  "enc.empty_create_first": "Crea la primera →",

  "eb.empty_viewfinder_line1": "Haz clic en un bloque de la",
  "eb.empty_viewfinder_line2": "cuadrícula para verlo",
  "eb.info_intro_line1": "Cada bloque guarda un sentimiento.",
  "eb.info_intro_line2": "Haz clic en uno para leer sobre él.",

  "action.download": "Descargar",
  "action.edit": "Editar",
  "action.delete": "Eliminar",

  "month.1": "Enero",     "month.2": "Febrero",   "month.3": "Marzo",
  "month.4": "Abril",     "month.5": "Mayo",      "month.6": "Junio",
  "month.7": "Julio",     "month.8": "Agosto",    "month.9": "Septiembre",
  "month.10": "Octubre",  "month.11": "Noviembre","month.12": "Diciembre",

  "day.sun": "Dom", "day.mon": "Lun", "day.tue": "Mar", "day.wed": "Mié",
  "day.thu": "Jue", "day.fri": "Vie", "day.sat": "Sáb",
};

const KOR: Dict = {
  "nav.create": "만들기",
  "nav.calendar": "캘린더",
  "nav.encyclopedia": "복복피디아",
  "nav.energy_blocks": "에너지 블록",
  "nav.about": "소개",

  "main.bokbok_button": "복복",
  "main.fullscreen_enter": "전체 화면",
  "main.fullscreen_exit": "전체 화면 종료",
  "main.candy_title": "크리쳐들을 가운데로 모으기",
  "main.zoom_in": "확대",
  "main.zoom_out": "축소",
  "main.sound_on": "소리 켜짐 — 클릭하면 음소거",
  "main.sound_off": "소리 꺼짐 — 클릭하면 켜기",

  "panel.click_creature": "크리쳐를 클릭하세요",
  "panel.bokbokpedia_to_view": "복복피디아에서",
  "panel.calendar_to_view": "캘린더에서",
  "panel.pick_from_bokbokpedia": "복복피디아에서 크리쳐를 골라 일기를 읽어보세요.",
  "panel.pick_from_calendar": "캘린더에서 크리쳐를 골라 일기를 읽어보세요.",
  "panel.no_journal_manual": "일기 없음 — 이 크리쳐는 직접 만들기로 생성됐어요.",
  "panel.empty_name": "이름",

  "create.placeholder_journal": "오늘 어떤 일이 있었나요? 사건과 감정을 적어보세요…",
  "create.empty_canvas": "아래에 적고 생성을 눌러보세요",
  "create.placeholder_name": "이름",
  "create.placeholder_search_blocks": "검색…",
  "create.generate": "생성",
  "create.manually": "직접 만들기",
  "create.upload": "생태계에 올리기",
  "create.uploaded": "업로드됨",
  "create.go_to_ecosystem": "생태계로 가기",
  "create.delete": "삭제",
  "create.cancel": "취소",
  "create.edit": "편집",
  "create.alert_write_journal": "먼저 일기를 작성해주세요.",
  "create.alert_creature_name": "먼저 크리쳐의 이름을 지어주세요.",
  "create.alert_add_block": "캔버스에 블록을 하나 이상 추가해주세요.",

  "enc.search_placeholder": "이름 또는 날짜",
  "enc.no_matches": "검색 결과 없음:",
  "enc.empty_no_creatures": "아직 크리쳐가 없어요.",
  "enc.empty_create_first": "첫 크리쳐를 만들어보세요 →",

  "eb.empty_viewfinder_line1": "오른쪽 격자에서",
  "eb.empty_viewfinder_line2": "에너지 블록을 클릭하세요",
  "eb.info_intro_line1": "각 블록은 하나의 감정을 담고 있어요.",
  "eb.info_intro_line2": "클릭해서 자세히 알아보세요.",

  "action.download": "다운로드",
  "action.edit": "편집",
  "action.delete": "삭제",

  "month.1": "1월",  "month.2": "2월",  "month.3": "3월",
  "month.4": "4월",  "month.5": "5월",  "month.6": "6월",
  "month.7": "7월",  "month.8": "8월",  "month.9": "9월",
  "month.10": "10월","month.11": "11월","month.12": "12월",

  "day.sun": "일", "day.mon": "월", "day.tue": "화", "day.wed": "수",
  "day.thu": "목", "day.fri": "금", "day.sat": "토",
};

// ---- Emotion-specific translations ------------------------------------
// Display name per emotion key in each language. Keep ENG matching the
// existing `displayName` field in lib/emotions.ts.

export const EMOTION_NAME: Record<Lang, Record<EmotionKey, string>> = {
  ENG: {
    happiness: "Happiness", joy: "Joy", excitement: "Excitement",
    anticipation: "Anticipation", hope: "Hope", thrill: "Thrill", pleasure: "Pleasure",
    calmness: "Calmness", satisfaction: "Satisfaction", relief: "Relief",
    gratitude: "Gratitude", intimacy: "Intimacy",
    anger: "Anger", irritation: "Irritation", passion: "Passion",
    jealousy: "Jealousy", envy: "Envy",
    sadness: "Sadness", depression: "Depression", loneliness: "Loneliness",
    disappointment: "Disappointment", despair: "Despair", frustration: "Frustration",
    love: "Love", moved: "Moved", longing: "Longing", nostalgia: "Nostalgia",
    guilt: "Guilt", regret: "Regret",
    anxiety: "Anxiety", tension: "Tension", pressure: "Pressure",
    stress: "Stress", confused: "Confused", hesitation: "Hesitation",
    helplessness: "Helplessness", emptiness: "Emptiness",
    boredom: "Boredom", fatigue: "Fatigue", apathy: "Apathy",
    surprise: "Surprise", curiosity: "Curiosity", engagement: "Engagement",
    confidence: "Confidence", pride: "Pride", liberation: "Liberation",
    embarrassment: "Embarrassment", shame: "Shame", disgust: "Disgust", insight: "Insight",
  },
  ESP: {
    happiness: "Felicidad", joy: "Alegría", excitement: "Emoción",
    anticipation: "Anticipación", hope: "Esperanza", thrill: "Euforia", pleasure: "Placer",
    calmness: "Calma", satisfaction: "Satisfacción", relief: "Alivio",
    gratitude: "Gratitud", intimacy: "Intimidad",
    anger: "Ira", irritation: "Irritación", passion: "Pasión",
    jealousy: "Celos", envy: "Envidia",
    sadness: "Tristeza", depression: "Depresión", loneliness: "Soledad",
    disappointment: "Decepción", despair: "Desesperación", frustration: "Frustración",
    love: "Amor", moved: "Conmoción", longing: "Anhelo", nostalgia: "Nostalgia",
    guilt: "Culpa", regret: "Arrepentimiento",
    anxiety: "Ansiedad", tension: "Tensión", pressure: "Presión",
    stress: "Estrés", confused: "Confusión", hesitation: "Vacilación",
    helplessness: "Impotencia", emptiness: "Vacío",
    boredom: "Aburrimiento", fatigue: "Fatiga", apathy: "Apatía",
    surprise: "Sorpresa", curiosity: "Curiosidad", engagement: "Compromiso",
    confidence: "Confianza", pride: "Orgullo", liberation: "Liberación",
    embarrassment: "Vergüenza", shame: "Vergüenza profunda", disgust: "Asco", insight: "Comprensión",
  },
  KOR: {
    happiness: "행복", joy: "기쁨", excitement: "설렘",
    anticipation: "기대", hope: "희망", thrill: "짜릿함", pleasure: "즐거움",
    calmness: "평온", satisfaction: "만족", relief: "안도",
    gratitude: "감사", intimacy: "친밀감",
    anger: "분노", irritation: "짜증", passion: "열정",
    jealousy: "질투", envy: "부러움",
    sadness: "슬픔", depression: "우울", loneliness: "외로움",
    disappointment: "실망", despair: "절망", frustration: "좌절",
    love: "사랑", moved: "감동", longing: "그리움", nostalgia: "향수",
    guilt: "죄책감", regret: "후회",
    anxiety: "불안", tension: "긴장", pressure: "압박",
    stress: "스트레스", confused: "혼란", hesitation: "망설임",
    helplessness: "무력감", emptiness: "공허",
    boredom: "지루함", fatigue: "피로", apathy: "무기력",
    surprise: "놀람", curiosity: "호기심", engagement: "몰입",
    confidence: "자신감", pride: "자긍심", liberation: "해방감",
    embarrassment: "당황", shame: "수치심", disgust: "혐오", insight: "통찰",
  },
};

// Convenience accessor for emotion display names.
export function emotionName(key: EmotionKey, lang?: Lang): string {
  const L = lang ?? getLang();
  return EMOTION_NAME[L][key] ?? EMOTION_NAME.ENG[key] ?? key;
}

// ---- Type wrangling --------------------------------------------------
// TranslationKey is derived from the ENG dictionary so callers get
// autocomplete for valid keys.

export type TranslationKey = keyof typeof ENG;

const DICT: Record<Lang, Dict> = { ENG, ESP, KOR };
