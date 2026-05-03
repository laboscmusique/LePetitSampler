export const BASE_MIDI = 48;
export const PLAYABLE_MIN_MIDI = 48;
export const PLAYABLE_MAX_MIDI = 64;
export const VISUAL_MIN_MIDI = PLAYABLE_MIN_MIDI - 12;
export const VISUAL_MAX_MIDI = PLAYABLE_MAX_MIDI + 12;
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const MIN_WHITE_KEY_WIDTH = 22;
export const BLACK_KEY_RATIO = 0.62;

export const SUPPORTED_LANGUAGES = ["fr", "en", "de", "es", "it", "pt"];

export const LANGUAGE_TO_LAYOUT = {
  fr: "azerty",
  en: "qwerty",
  de: "qwertz",
  es: "qwerty",
  it: "qwerty",
  pt: "qwerty",
};

export const KEYBOARD_LAYOUTS = {
  qwerty: ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";"],
  azerty: ["q", "z", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", "m"],
  qwertz: ["a", "w", "s", "e", "d", "f", "t", "g", "z", "h", "u", "j", "k", "o", "l", "p", "m"],
};

export const DRUM_KEYBOARD_LAYOUTS = {
  qwerty: ["a", "s", "d", "f", "g", "h", "j", "k"],
  azerty: ["q", "s", "d", "f", "g", "h", "j", "k"],
  qwertz: ["a", "s", "d", "f", "g", "h", "j", "k"],
};
