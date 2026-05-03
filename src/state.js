import { LANGUAGE_TO_LAYOUT, SUPPORTED_LANGUAGES } from "./constants.js";

function resolveInitialLanguage() {
  try {
    const saved = window.localStorage.getItem("miniSamplerLanguage");
    if (SUPPORTED_LANGUAGES.includes(saved)) return saved;
  } catch (_error) {}

  const browserLanguage = navigator.language?.toLowerCase() || "";
  const primaryLanguage = browserLanguage.split("-")[0];
  return SUPPORTED_LANGUAGES.includes(primaryLanguage) ? primaryLanguage : "en";
}

const initialLanguage = resolveInitialLanguage();

export const lang = {
  current: initialLanguage,
  layout: LANGUAGE_TO_LAYOUT[initialLanguage] || "qwerty",
};

export const editionState = {
  current: "chromatic",
};

export const keys = {
  computerOctave: 2,
  whiteKeyWidth: 54,
  blackKeyWidth: 34,
  keybedElement: null,
  keyElements: new Map(),
  activeVoices: new Map(),
  pressedKeyToMidi: new Map(),
  pointerIdToMidi: new Map(),
  layoutKeyToMidi: new Map(),
  drumPressedKeyToPad: new Map(),
};

export const audio = {
  loadedBuffer: null,
  renderedBuffer: null,
};

export const adsrState = {
  enabled: false,
  attack: 0.02,
  decay: 0.18,
  sustain: 0.75,
  release: 0.24,
};

export const playbackState = {
  sampleStartNorm: 0,
  loopEnabled: false,
  loopStartNorm: 0,
  loopEndNorm: 1,
};

export const outputState = {
  volume: 1,
};

export const filterState = {
  enabled: false,
  type: "lowpass",
  freq: 1000,
  Q: 1.0,
};

export const statusState = {
  sample: { key: "sample.none", params: {} },
  record: { key: "record.status.readyToRecord", params: {} },
  performance: { key: "performance.status.ready", params: {} },
};

export const wave = {
  activeMarker: null,
  pointerId: null,
  priorityMidi: null,
  snapshot: null,
  playheadAnimId: null,
};

export const recordingState = {
  mediaStream: null,
  mediaRecorder: null,
  chunks: [],
  startTimeMs: 0,
  timerId: null,
  micPermissionState: "unknown",
  streamDeviceId: "",
};

export const perfState = {
  timerId: null,
  startTimeMs: 0,
  isRecording: false,
  recordedSamples: 0,
  leftChunks: [],
  rightChunks: [],
  mp3Recorder: null,
  mp3Chunks: [],
  wavUrl: "",
  mp3Url: "",
};

function createDrumPadState(index) {
  return {
    index,
    label: "",
    buffer: null,
    sampleStartNorm: 0,
    volume: 1,
    pitchSemitones: 0,
    adsr: {
      enabled: false,
      attack: 0.02,
      decay: 0.18,
      sustain: 0.75,
      release: 0.24,
    },
  };
}

export const drumState = {
  selectedPadIndex: 0,
  pads: Array.from({ length: 8 }, (_, index) => createDrumPadState(index)),
  activeVoices: new Map(),
  pointerIdToPadIndex: new Map(),
};
