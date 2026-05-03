const BASE_MIDI = 48; // C3
const PLAYABLE_MIN_MIDI = 48;
const PLAYABLE_MAX_MIDI = 64;
const VISUAL_MIN_MIDI = PLAYABLE_MIN_MIDI - 12;
const VISUAL_MAX_MIDI = PLAYABLE_MAX_MIDI + 12;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MIN_WHITE_KEY_WIDTH = 22;
const BLACK_KEY_RATIO = 0.62;

const keyboardLayouts = {
  qwerty: ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";"],
  azerty: ["q", "z", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", "m"]
};

const visualNotes = Array.from(
  { length: VISUAL_MAX_MIDI - VISUAL_MIN_MIDI + 1 },
  (_, idx) => createNote(VISUAL_MIN_MIDI + idx)
);

const whiteKeyCount = visualNotes.filter((note) => note.type === "white").length;

const fileInput = document.getElementById("sampleFile");
const loadSampleButton = document.getElementById("loadSampleButton");
const openRecordModalButton = document.getElementById("openRecordModalButton");
const langBtns = document.querySelectorAll(".locale-btn[data-lang]");
const keyboardOctaveBtns = document.querySelectorAll(".keyboard-octave-btn");
const sampleName = document.getElementById("sampleName");
const volumeControl = document.getElementById("volumeControl");
const volumeValue = document.getElementById("volumeValue");
const recordModal = document.getElementById("recordModal");
const closeRecordModalButton = document.getElementById("closeRecordModalButton");
const refreshRecordInputsButton = document.getElementById("refreshRecordInputsButton");
const recordPermissionHint = document.getElementById("recordPermissionHint");
const recordInputSelect = document.getElementById("recordInputSelect");
const recordStartButton = document.getElementById("recordStartButton");
const recordStopButton = document.getElementById("recordStopButton");
const recordTimer = document.getElementById("recordTimer");
const recordStatus = document.getElementById("recordStatus");
const performanceWidget = document.getElementById("performanceWidget");
const performanceWidgetBody = document.getElementById("performanceWidgetBody");
const togglePerformanceWidgetButton = document.getElementById("togglePerformanceWidgetButton");
const performanceStartButton = document.getElementById("performanceStartButton");
const performanceStopButton = document.getElementById("performanceStopButton");
const performanceTimer = document.getElementById("performanceTimer");
const performanceStatus = document.getElementById("performanceStatus");
const downloadPerformanceWav = document.getElementById("downloadPerformanceWav");
const downloadPerformanceMp3 = document.getElementById("downloadPerformanceMp3");
const performanceMp3Hint = document.getElementById("performanceMp3Hint");
const keyboardRoot = document.getElementById("pianoKeyboard");
const waveformCanvas = document.getElementById("waveform");
const canvasCtx = waveformCanvas.getContext("2d");
const filterEnabledInput = document.getElementById("filterEnabled");
const filterToggleLabel = document.getElementById("filterToggleLabel");
const filterModeLp = document.getElementById("filterModeLp");
const filterModeHp = document.getElementById("filterModeHp");
const freqControl = document.getElementById("freqControl");
const resoControl = document.getElementById("resoControl");
const freqInput = document.getElementById("freqInput");
const resoInput = document.getElementById("resoInput");
const loopEnabledInput = document.getElementById("loopEnabled");
const loopToggleLabel = document.getElementById("loopToggleLabel");
const resetPlaybackPointsButton = document.getElementById("resetPlaybackPoints");
const sampleStartInput = document.getElementById("sampleStartInput");
const loopStartInput = document.getElementById("loopStartInput");
const loopEndInput = document.getElementById("loopEndInput");
const sampleStartSlider = document.getElementById("sampleStartSlider");
const loopStartSlider = document.getElementById("loopStartSlider");
const loopEndSlider = document.getElementById("loopEndSlider");
const adsrPanel = document.querySelector(".adsr-panel");
const filterPanel = document.querySelector(".filter-panel");
const filterGraphCanvas = document.getElementById("filterGraph");
const filterGraphCtx = filterGraphCanvas.getContext("2d");
const adsrGraphCanvas = document.getElementById("adsrGraph");
const adsrGraphCtx = adsrGraphCanvas.getContext("2d");
const adsrModeBadge = document.getElementById("adsrModeBadge");
const adsrToggleLabel = document.getElementById("adsrToggleLabel");
const adsrEnabledInput = document.getElementById("adsrEnabled");
const attackControl = document.getElementById("attackControl");
const decayControl = document.getElementById("decayControl");
const sustainControl = document.getElementById("sustainControl");
const releaseControl = document.getElementById("releaseControl");
const attackInput = document.getElementById("attackInput");
const decayInput = document.getElementById("decayInput");
const sustainInput = document.getElementById("sustainInput");
const releaseInput = document.getElementById("releaseInput");

let audioContext;
let loadedBuffer = null;
let renderedBuffer = null;
let currentLanguage = resolveInitialLanguage();
let currentLayout = currentLanguage === "fr" ? "azerty" : "qwerty";
let currentComputerKeyboardOctave = 2;
let whiteKeyWidth = 54;
let blackKeyWidth = 34;
let keybedElement = null;
let mediaStream = null;
let mediaRecorder = null;
let recordingChunks = [];
let recordingStartTimeMs = 0;
let recordingTimerId = null;
let micPermissionState = "unknown";
let streamDeviceId = "";
let filterInputGain = null;
let filterNodeA = null;
let filterNodeB = null;
let masterOutputGain = null;
let performanceStreamDestination = null;
let performanceTapNode = null;
let performanceTapSink = null;
let performanceTimerId = null;
let performanceStartTimeMs = 0;
let performanceIsRecording = false;
let performanceRecordedSamples = 0;
let performanceLeftChunks = [];
let performanceRightChunks = [];
let performanceMp3Recorder = null;
let performanceMp3Chunks = [];
let performanceWavUrl = "";
let performanceMp3Url = "";
let sampleStatus = { key: "sample.none", params: {} };
let recordStatusState = { key: "record.status.readyToRecord", params: {} };
let performanceStatusState = { key: "performance.status.ready", params: {} };
let audioResumePromise = null;
let performanceTapConnected = false;

const keyElements = new Map();
const activeVoices = new Map();
const pressedKeyboardKeyToMidi = new Map();
const pointerIdToMidi = new Map();
let layoutKeyToMidi = new Map();

const adsrState = {
  enabled: false,
  attack: 0.02,
  decay: 0.18,
  sustain: 0.75,
  release: 0.24
};

const playbackState = {
  sampleStartNorm: 0,
  loopEnabled: false,
  loopStartNorm: 0,
  loopEndNorm: 1
};

const outputState = {
  volume: 1
};

const filterState = {
  enabled: false,
  type: "lowpass",
  freq: 1000,
  Q: 1.0
};

let activeWaveformMarker = null;
let waveformPointerId = null;
let priorityMidi = null;
let waveformSnapshot = null;
let playheadAnimId = null;

const translations = {
  fr: {
    "lang.label": "Langue et clavier",
    "common.value": "Valeur",
    "common.stop": "Stop",
    "app.title": "LePetitSampler",
    "app.subtitle": "Charge un sample accordé en C3 et joue-le sur plusieurs notes.",
    "app.base": "Base: C3",
    "volume.label": "Volume",
    "actions.loadSample": "Charger un sample",
    "actions.recordSample": "Enregistrer un sample",
    "adsr.summary": "Enveloppe ADSR",
    "adsr.enabled": "ADSR activée",
    "adsr.disabled": "ADSR désactivée",
    "adsr.mode.adsr": "Mode: ADSR",
    "adsr.mode.direct": "Mode: Direct",
    "adsr.helper.enabled": "Attack {attack}s, decay {decay}s, sustain {sustain}%, release {release}s.",
    "adsr.helper.direct": "Enveloppe bypassée: volume constant pendant l'appui, arrêt immédiat au relâchement.",
    "waveform.title": "Waveform",
    "waveform.loopEnabled": "Loop activée",
    "waveform.loopDisabled": "Loop désactivée",
    "waveform.resetPoints": "Reset points",
    "waveform.help": "Drag sur la waveform: <strong>Sample Start</strong> (vert), <strong>Loop In</strong> et <strong>Loop Out</strong> (bleu).",
    "waveform.start": "Sample Start",
    "waveform.loopIn": "Loop In",
    "waveform.loopOut": "Loop Out",
    "waveform.empty": "Charge un fichier audio pour afficher la waveform",
    "filter.summary": "Filtre",
    "filter.enabled": "Filtre activé",
    "filter.disabled": "Filtre désactivé",
    "filter.mode.lp": "LP",
    "filter.mode.hp": "HP",
    "filter.freq": "Freq",
    "filter.reso": "Resonance",
    "keyboard.title": "Clavier",
    "keyboard.octaveLabel": "Octave clavier ordinateur",
    "recordModal.title": "Enregistrer un sample",
    "recordModal.close": "Fermer",
    "recordModal.audioInput": "Entrée audio",
    "recordModal.refresh": "Actualiser",
    "recordModal.start": "Démarrer",
    "record.recording": "Enregistrement…",
    "record.badge.ready": "PRÊT",
    "record.badge.recording": "ENREGISTREMENT",
    "record.permission.grantedReady": "Autorisation micro accordée. Entrée prête.",
    "record.permission.deniedEnable": "Autorisation micro refusée. Active-la dans le navigateur.",
    "record.permission.request": "Demande d'autorisation micro...",
    "record.permission.waiting": "Permission micro en attente.",
    "record.permission.accessImpossible": "Accès micro impossible ({detail}).",
    "record.permission.alreadyGrantedPreparing": "Autorisation micro déjà accordée. Préparation de l'entrée...",
    "record.permission.deniedSettings": "Autorisation micro refusée. Active-la dans les réglages du navigateur.",
    "record.permission.clickStart": "Clique sur Démarrer pour autoriser le micro.",
    "record.permission.popupClosed": "Popup fermé.",
    "record.permission.notSupported": "Cette plateforme ne supporte pas MediaRecorder.",
    "record.status.readyToRecord": "Prêt à enregistrer",
    "record.status.notSupported": "Enregistrement non supporté sur ce navigateur.",
    "record.status.refreshInputsError": "Impossible d'actualiser les entrées audio.",
    "record.status.selectedUnavailable": "Entrée sélectionnée indisponible, fallback sur entrée par défaut...",
    "record.status.sourceReady": "Entrée prête ({source}).",
    "record.status.inputActive": "Entrée active: {source}.",
    "record.status.finishedLoaded": "Enregistrement terminé et chargé.",
    "record.status.processingError": "Erreur pendant le traitement de l'enregistrement.",
    "record.status.recordingInProgress": "Enregistrement en cours ({source})...",
    "record.status.startFailed": "Impossible de démarrer l'enregistrement ({detail}).",
    "record.status.listInputsError": "Impossible de lister les entrées audio.",
    "device.defaultInput": "Entrée par défaut",
    "device.inputLabel": "Entrée {index}{suffix}",
    "sample.none": "Aucun sample chargé",
    "sample.loaded": "Sample chargé: {label}",
    "sample.decodeError": "Erreur de décodage du sample.",
    "sample.loadBeforePlay": "Charge un sample avant de jouer.",
    "performance.title": "Enregistrer ma performance",
    "performance.help": "Capture directe de la sortie du sampler (clavier physique + clavier visuel).",
    "performance.start": "Démarrer",
    "performance.downloadWav": "Télécharger WAV",
    "performance.downloadMp3": "Télécharger MP3",
    "performance.badge.ready": "PRÊT",
    "performance.badge.recording": "ENREGISTREMENT",
    "performance.toggle.open": "Ouvrir",
    "performance.toggle.collapse": "Réduire",
    "performance.status.ready": "Prêt à capturer la performance.",
    "performance.status.capturing": "Capture performance en cours...",
    "performance.status.noSound": "Aucun son capturé (joue des notes pendant la capture).",
    "performance.status.capturedBoth": "Performance capturée. Exports WAV et MP3 prêts.",
    "performance.status.capturedWav": "Performance capturée. Export WAV prêt.",
    "performance.mp3.supported": "MP3 natif supporté: export MP3 disponible après l'enregistrement.",
    "performance.mp3.unsupported": "MP3 non supporté par ce navigateur: export WAV disponible.",
    "modal.closeOnEscape": "Fermer"
  },
  en: {
    "lang.label": "Language & keyboard",
    "common.value": "Value",
    "common.stop": "Stop",
    "app.title": "LePetitSampler",
    "app.subtitle": "Load a sample tuned in C3 and play it at different pitches.",
    "app.base": "Base: C3",
    "volume.label": "Volume",
    "actions.loadSample": "Load a sample",
    "actions.recordSample": "Record a sample",
    "adsr.summary": "ADSR Envelope",
    "adsr.enabled": "ADSR enabled",
    "adsr.disabled": "ADSR disabled",
    "adsr.mode.adsr": "Mode: ADSR",
    "adsr.mode.direct": "Mode: Direct",
    "adsr.helper.enabled": "Attack {attack}s, decay {decay}s, sustain {sustain}%, release {release}s.",
    "adsr.helper.direct": "Envelope bypassed: constant volume while held, immediate stop on release.",
    "waveform.title": "Waveform",
    "waveform.loopEnabled": "Loop enabled",
    "waveform.loopDisabled": "Loop disabled",
    "waveform.resetPoints": "Reset points",
    "waveform.help": "Drag on the waveform: <strong>Sample Start</strong> (green), <strong>Loop In</strong> and <strong>Loop Out</strong> (blue).",
    "waveform.start": "Sample Start",
    "waveform.loopIn": "Loop In",
    "waveform.loopOut": "Loop Out",
    "waveform.empty": "Load an audio file to display the waveform",
    "filter.summary": "Filter",
    "filter.enabled": "Filter enabled",
    "filter.disabled": "Filter disabled",
    "filter.mode.lp": "LP",
    "filter.mode.hp": "HP",
    "filter.freq": "Freq",
    "filter.reso": "Resonance",
    "keyboard.title": "Keyboard",
    "keyboard.octaveLabel": "Octave for computer keyboard",
    "recordModal.title": "Record a sample",
    "recordModal.close": "Close",
    "recordModal.audioInput": "Audio input",
    "recordModal.refresh": "Refresh",
    "recordModal.start": "Start",
    "record.recording": "Recording…",
    "record.badge.ready": "READY",
    "record.badge.recording": "RECORDING",
    "record.permission.grantedReady": "Microphone permission granted. Input ready.",
    "record.permission.deniedEnable": "Microphone permission denied. Enable it in your browser.",
    "record.permission.request": "Requesting microphone permission...",
    "record.permission.waiting": "Microphone permission pending.",
    "record.permission.accessImpossible": "Microphone access failed ({detail}).",
    "record.permission.alreadyGrantedPreparing": "Microphone permission already granted. Preparing input...",
    "record.permission.deniedSettings": "Microphone permission denied. Enable it in browser settings.",
    "record.permission.clickStart": "Click Start to authorize microphone access.",
    "record.permission.popupClosed": "Popup closed.",
    "record.permission.notSupported": "This platform does not support MediaRecorder.",
    "record.status.readyToRecord": "Ready to record",
    "record.status.notSupported": "Recording is not supported on this browser.",
    "record.status.refreshInputsError": "Unable to refresh audio inputs.",
    "record.status.selectedUnavailable": "Selected input unavailable, falling back to default input...",
    "record.status.sourceReady": "Input ready ({source}).",
    "record.status.inputActive": "Active input: {source}.",
    "record.status.finishedLoaded": "Recording complete and loaded.",
    "record.status.processingError": "Error while processing recording.",
    "record.status.recordingInProgress": "Recording in progress ({source})...",
    "record.status.startFailed": "Unable to start recording ({detail}).",
    "record.status.listInputsError": "Unable to list audio inputs.",
    "device.defaultInput": "Default input",
    "device.inputLabel": "Input {index}{suffix}",
    "sample.none": "No sample loaded",
    "sample.loaded": "Sample loaded: {label}",
    "sample.decodeError": "Sample decoding error.",
    "sample.loadBeforePlay": "Load a sample before playing.",
    "performance.title": "Record my performance",
    "performance.help": "Direct capture of the sampler output (physical keyboard + on-screen keyboard).",
    "performance.start": "Start",
    "performance.downloadWav": "Download WAV",
    "performance.downloadMp3": "Download MP3",
    "performance.badge.ready": "READY",
    "performance.badge.recording": "RECORDING",
    "performance.toggle.open": "Open",
    "performance.toggle.collapse": "Collapse",
    "performance.status.ready": "Ready to capture performance.",
    "performance.status.capturing": "Performance capture in progress...",
    "performance.status.noSound": "No audio captured (play notes while recording).",
    "performance.status.capturedBoth": "Performance captured. WAV and MP3 exports are ready.",
    "performance.status.capturedWav": "Performance captured. WAV export is ready.",
    "performance.mp3.supported": "Native MP3 supported: MP3 export available after recording.",
    "performance.mp3.unsupported": "MP3 unsupported in this browser: WAV export available.",
    "modal.closeOnEscape": "Close"
  }
};

function resolveInitialLanguage() {
  try {
    const saved = window.localStorage.getItem("miniSamplerLanguage");
    if (saved === "fr" || saved === "en") {
      return saved;
    }
  } catch (_error) {
    // Ignore localStorage errors.
  }
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function preferredLayoutForLanguage(language) {
  return language === "fr" ? "azerty" : "qwerty";
}

function t(key, params = {}) {
  const table = translations[currentLanguage] || translations.fr;
  const fallbackTable = translations.fr;
  const template = table[key] ?? fallbackTable[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, token) => {
    const value = params[token];
    return value == null ? `{${token}}` : String(value);
  });
}

function setSampleStatus(key, params = {}) {
  sampleStatus = { key, params };
  sampleName.textContent = t(key, params);
}

function setRecordStatus(key, params = {}) {
  recordStatusState = { key, params };
  recordStatus.textContent = t(key, params);
}

function setPerformanceStatus(key, params = {}) {
  performanceStatusState = { key, params };
  performanceStatus.textContent = t(key, params);
}

function computerKeyboardBaseMidi() {
  return 24 + currentComputerKeyboardOctave * 12;
}

function rebuildLayoutKeyToMidi() {
  const keys = keyboardLayouts[currentLayout] || [];
  const baseMidi = computerKeyboardBaseMidi();
  const nextMap = new Map();
  const keyCount = Math.min(12, keys.length);

  for (let idx = 0; idx < keyCount; idx += 1) {
    nextMap.set(keys[idx], baseMidi + idx);
  }

  layoutKeyToMidi = nextMap;
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLanguage;
  document.title = t("app.title");

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml;
    if (!key) return;
    el.innerHTML = t(key);
  });

  waveformCanvas.setAttribute("aria-label", currentLanguage === "fr" ? "Waveform du sample" : "Sample waveform");
  keyboardRoot.setAttribute("aria-label", currentLanguage === "fr" ? "Clavier piano interactif" : "Interactive piano keyboard");
}

function applyDynamicTranslations() {
  setSampleStatus(sampleStatus.key, sampleStatus.params);
  setRecordStatus(recordStatusState.key, recordStatusState.params);
  setPerformanceStatus(performanceStatusState.key, performanceStatusState.params);
  updateRecordingUi();
  updatePerformanceUi();
  updateAdsrStateFromInputs();
  setPerformanceWidgetCollapsed(performanceWidget.classList.contains("collapsed"));
  performanceMp3Hint.textContent = supportsPerformanceMp3() ? t("performance.mp3.supported") : t("performance.mp3.unsupported");
  redrawWaveform();
  refreshAudioInputDevices().catch(() => {
    // Ignore refresh errors during language switch.
  });
}

function applyLanguage(language, syncLayout = true) {
  if (language !== "fr" && language !== "en") return;
  currentLanguage = language;
  langBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.lang === language));
  if (syncLayout) {
    setKeyboardLayout(preferredLayoutForLanguage(language));
  }
  applyStaticTranslations();
  applyDynamicTranslations();
  try {
    window.localStorage.setItem("miniSamplerLanguage", language);
  } catch (_error) {
    // Ignore localStorage errors.
  }
}

function createNote(midi) {
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    midi,
    note: `${NOTE_NAMES[noteIndex]}${octave}`,
    type: NOTE_NAMES[noteIndex].includes("#") ? "black" : "white"
  };
}

function sliderToFreq(sliderVal) {
  return 20 * Math.pow(1000, Number.parseFloat(sliderVal) / 1000);
}

function freqToSlider(freq) {
  return Math.round(1000 * Math.log(Math.max(freq, 20) / 20) / Math.log(1000));
}

function applyFilterState() {
  if (!filterNodeA || !filterNodeB || !audioContext) return;
  [filterNodeA, filterNodeB].forEach((node) => {
    node.type = filterState.type;
    node.frequency.setValueAtTime(filterState.freq, audioContext.currentTime);
    node.Q.setValueAtTime(filterState.Q, audioContext.currentTime);
  });
}

function applyOutputVolume() {
  if (!masterOutputGain || !audioContext) {
    return;
  }
  masterOutputGain.gain.setValueAtTime(outputState.volume, audioContext.currentTime);
}

function syncVolumeUi() {
  if (volumeControl) {
    volumeControl.value = String(Math.round(outputState.volume * 100));
  }
  if (volumeValue) {
    volumeValue.textContent = `${Math.round(outputState.volume * 100)}%`;
  }
}

function updateVolumeFromControl() {
  outputState.volume = clamp((Number.parseFloat(volumeControl.value) || 0) / 100, 0, 3);
  syncVolumeUi();
  applyOutputVolume();
  redrawWaveform();
}

function updateFilterUiState() {
  const disabled = !filterState.enabled;
  [freqControl, resoControl, freqInput, resoInput, filterModeLp, filterModeHp].forEach((el) => {
    el.disabled = disabled;
  });

  if (filterEnabledInput) filterEnabledInput.checked = filterState.enabled;
  if (filterPanel) filterPanel.classList.toggle("is-disabled", disabled);
  if (filterToggleLabel) filterToggleLabel.textContent = filterState.enabled ? t("filter.enabled") : t("filter.disabled");

  filterModeLp.classList.toggle("active", filterState.type === "lowpass");
  filterModeHp.classList.toggle("active", filterState.type === "highpass");
}

function syncFilterControls() {
  freqControl.value = String(freqToSlider(filterState.freq));
  resoControl.value = filterState.Q.toFixed(2);
  freqInput.value = String(Math.round(filterState.freq));
  resoInput.value = filterState.Q.toFixed(1);
}

function updateFilterFromControls() {
  filterState.freq = clamp(sliderToFreq(freqControl.value), 20, 20000);
  filterState.Q = clamp(Number.parseFloat(resoControl.value) || 1, 0.1, 30);
  syncFilterControls();
  applyFilterState();
  renderFilterGraph();
}

function updateFilterFromManualInputs() {
  filterState.freq = clamp(Number.parseFloat(freqInput.value) || 1000, 20, 20000);
  filterState.Q = clamp(Number.parseFloat(resoInput.value) || 1, 0.1, 30);
  syncFilterControls();
  applyFilterState();
  renderFilterGraph();
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext({ latencyHint: "interactive" });

    filterInputGain = audioContext.createGain();
    filterNodeA = audioContext.createBiquadFilter();
    filterNodeA.type = filterState.type;
    filterNodeA.frequency.value = filterState.freq;
    filterNodeA.Q.value = filterState.Q;

    filterNodeB = audioContext.createBiquadFilter();
    filterNodeB.type = filterState.type;
    filterNodeB.frequency.value = filterState.freq;
    filterNodeB.Q.value = filterState.Q;

    masterOutputGain = audioContext.createGain();
    masterOutputGain.gain.value = outputState.volume;
    masterOutputGain.connect(audioContext.destination);

    filterInputGain.connect(filterNodeA);
    filterNodeA.connect(filterNodeB);
    filterNodeB.connect(masterOutputGain);

    performanceStreamDestination = audioContext.createMediaStreamDestination();
    masterOutputGain.connect(performanceStreamDestination);

    performanceTapNode = audioContext.createScriptProcessor(512, 2, 2);
    performanceTapSink = audioContext.createGain();
    performanceTapSink.gain.value = 0;
    performanceTapNode.connect(performanceTapSink);
    performanceTapSink.connect(audioContext.destination);
    performanceTapNode.onaudioprocess = (event) => {
      if (!performanceIsRecording) {
        return;
      }

      const inputBuffer = event.inputBuffer;
      const left = new Float32Array(inputBuffer.getChannelData(0));
      const right = inputBuffer.numberOfChannels > 1
        ? new Float32Array(inputBuffer.getChannelData(1))
        : new Float32Array(left);

      performanceLeftChunks.push(left);
      performanceRightChunks.push(right);
      performanceRecordedSamples += left.length;
    };

    applyFilterState();
    applyOutputVolume();
  }
}

function setPerformanceTapConnection(connected) {
  if (!masterOutputGain || !performanceTapNode || performanceTapConnected === connected) {
    return;
  }

  try {
    if (connected) {
      masterOutputGain.connect(performanceTapNode);
    } else {
      masterOutputGain.disconnect(performanceTapNode);
    }
    performanceTapConnected = connected;
  } catch (_error) {
    // No-op: older browsers may throw on duplicate/disconnected states.
  }
}

async function ensureAudioRunning() {
  ensureAudioContext();
  if (!audioContext) {
    return false;
  }
  if (audioContext.state === "running") {
    return true;
  }
  if (audioContext.state === "closed") {
    return false;
  }

  if (!audioResumePromise) {
    audioResumePromise = audioContext.resume()
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        audioResumePromise = null;
      });
  }

  await audioResumePromise;
  return audioContext.state === "running";
}

function isMidiInputHeld(midi) {
  for (const heldMidi of pressedKeyboardKeyToMidi.values()) {
    if (heldMidi === midi) return true;
  }
  for (const heldMidi of pointerIdToMidi.values()) {
    if (heldMidi === midi) return true;
  }
  return false;
}

function midiToPlaybackRate(midi) {
  return Math.pow(2, (midi - BASE_MIDI) / 12);
}

function drawEmptyWaveform() {
  const width = Math.floor(waveformCanvas.clientWidth);
  const height = Math.floor(waveformCanvas.clientHeight);

  canvasCtx.clearRect(0, 0, width, height);

  canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, height / 2);
  canvasCtx.lineTo(width, height / 2);
  canvasCtx.stroke();

  canvasCtx.fillStyle = "rgba(242, 245, 255, 0.42)";
  canvasCtx.font = "500 18px Space Grotesk, sans-serif";
  canvasCtx.textAlign = "center";
  canvasCtx.textBaseline = "middle";
  canvasCtx.fillText(t("waveform.empty"), width / 2, height / 2);
  waveformSnapshot = null;
}

function resizeAdsrGraphCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.max(300, Math.floor(adsrGraphCanvas.clientWidth));
  const displayHeight = Math.max(130, Math.floor(adsrGraphCanvas.clientHeight));

  adsrGraphCanvas.width = Math.floor(displayWidth * dpr);
  adsrGraphCanvas.height = Math.floor(displayHeight * dpr);
  adsrGraphCtx.setTransform(1, 0, 0, 1, 0, 0);
  adsrGraphCtx.scale(dpr, dpr);
}

function resizeWaveformCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.max(320, Math.floor(waveformCanvas.clientWidth));
  const displayHeight = Math.max(180, Math.floor(waveformCanvas.clientHeight));
  waveformCanvas.width = Math.floor(displayWidth * dpr);
  waveformCanvas.height = Math.floor(displayHeight * dpr);
  canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
  canvasCtx.scale(dpr, dpr);

  if (renderedBuffer) {
    drawWaveform(renderedBuffer);
  } else {
    drawEmptyWaveform();
    updatePlaybackUi();
  }
}

function drawWaveform(audioBuffer) {
  renderedBuffer = audioBuffer;
  normalizePlaybackState();

  const channelData = audioBuffer.getChannelData(0);
  const width = Math.floor(waveformCanvas.clientWidth);
  const height = Math.floor(waveformCanvas.clientHeight);
  const mid = height / 2;
  const visualVolume = clamp(outputState.volume, 0, 3);
  const samplesPerPixel = Math.floor(channelData.length / width) || 1;

  canvasCtx.clearRect(0, 0, width, height);

  if (playbackState.loopEnabled) {
    const loopStartX = playbackState.loopStartNorm * width;
    const loopEndX = playbackState.loopEndNorm * width;
    canvasCtx.fillStyle = "rgba(57, 123, 161, 0.16)";
    canvasCtx.fillRect(loopStartX, 0, Math.max(1, loopEndX - loopStartX), height);
  }

  canvasCtx.strokeStyle = "rgba(242, 245, 255, 0.55)";
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();

  for (let x = 0; x < width; x += 1) {
    const start = x * samplesPerPixel;
    let min = 1;
    let max = -1;

    for (let i = 0; i < samplesPerPixel; i += 1) {
      const value = channelData[start + i] ?? 0;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    const scaledMin = clamp(min * visualVolume, -1, 1);
    const scaledMax = clamp(max * visualVolume, -1, 1);
    const yTop = mid + scaledMin * (mid - 10);
    const yBottom = mid + scaledMax * (mid - 10);
    canvasCtx.moveTo(x, yTop);
    canvasCtx.lineTo(x, yBottom);
  }

  canvasCtx.stroke();

  canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  canvasCtx.lineWidth = 1;
  canvasCtx.beginPath();
  canvasCtx.moveTo(0, mid);
  canvasCtx.lineTo(width, mid);
  canvasCtx.stroke();

  drawWaveformMarkers(width, height);
  waveformSnapshot = canvasCtx.getImageData(0, 0, waveformCanvas.width, waveformCanvas.height);
  updatePlaybackUi();
}

function drawWaveformMarkers(width, height) {
  const markerSize = 7;
  const markers = [
    { id: "sampleStart", x: playbackState.sampleStartNorm * width, color: "#77e086", label: t("waveform.start") },
    { id: "loopStart", x: playbackState.loopStartNorm * width, color: "#2a7aa8", label: t("waveform.loopIn") },
    { id: "loopEnd", x: playbackState.loopEndNorm * width, color: "#2a7aa8", label: t("waveform.loopOut") }
  ];

  for (const marker of markers) {
    const isLoopMarker = marker.id !== "sampleStart";
    if (isLoopMarker && !playbackState.loopEnabled) {
      continue;
    }

    canvasCtx.strokeStyle = marker.color;
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(marker.x, 0);
    canvasCtx.lineTo(marker.x, height);
    canvasCtx.stroke();

    canvasCtx.fillStyle = marker.color;
    canvasCtx.beginPath();
    canvasCtx.moveTo(marker.x - markerSize, 0);
    canvasCtx.lineTo(marker.x + markerSize, 0);
    canvasCtx.lineTo(marker.x, markerSize + 4);
    canvasCtx.closePath();
    canvasCtx.fill();

    const labelAlignLeft = marker.id !== "loopEnd";
    canvasCtx.fillStyle = marker.color;
    canvasCtx.font = "700 10px Space Grotesk, sans-serif";
    canvasCtx.textAlign = labelAlignLeft ? "left" : "right";
    canvasCtx.textBaseline = "top";
    const labelX = labelAlignLeft ? marker.x + markerSize + 3 : marker.x - markerSize - 3;
    canvasCtx.fillText(marker.label, labelX, markerSize + 6);
  }
}

function redrawWaveform() {
  if (renderedBuffer) {
    drawWaveform(renderedBuffer);
  } else {
    drawEmptyWaveform();
    updatePlaybackUi();
  }
}

function waveformXToNorm(clientX) {
  const rect = waveformCanvas.getBoundingClientRect();
  const x = clamp(clientX - rect.left, 0, rect.width);
  if (rect.width <= 0) return 0;
  return x / rect.width;
}

function getClosestWaveMarker(normX) {
  const markers = [
    { id: "sampleStart", norm: playbackState.sampleStartNorm },
    { id: "loopStart", norm: playbackState.loopStartNorm },
    { id: "loopEnd", norm: playbackState.loopEndNorm }
  ];

  const visibleMarkers = markers.filter((marker) => marker.id === "sampleStart" || playbackState.loopEnabled);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const marker of visibleMarkers) {
    const distance = Math.abs(normX - marker.norm);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = marker.id;
    }
  }

  return bestDistance <= 0.04 ? best : null;
}

function applyMarkerNorm(markerId, normValue) {
  const gap = minLoopGapNorm();

  if (markerId === "sampleStart") {
    const maxValue = playbackState.loopEnabled ? playbackState.loopEndNorm - gap : 1;
    playbackState.sampleStartNorm = clamp(normValue, 0, maxValue);
  } else if (markerId === "loopStart") {
    playbackState.loopStartNorm = clamp(normValue, 0, playbackState.loopEndNorm - gap);
    if (playbackState.sampleStartNorm > playbackState.loopEndNorm - gap) {
      playbackState.sampleStartNorm = Math.max(0, playbackState.loopEndNorm - gap);
    }
  } else if (markerId === "loopEnd") {
    const minValue = Math.max(playbackState.loopStartNorm + gap, playbackState.sampleStartNorm + gap);
    playbackState.loopEndNorm = clamp(normValue, minValue, 1);
  }

  normalizePlaybackState();
  redrawWaveform();
}

function applyPlaybackSecondsInput(markerId, rawValue) {
  const duration = getDurationSeconds();
  if (duration <= 0) {
    updatePlaybackUi();
    return;
  }

  const seconds = clamp(Number.parseFloat(rawValue) || 0, 0, duration);
  const norm = seconds / duration;

  if ((markerId === "loopStart" || markerId === "loopEnd") && !playbackState.loopEnabled) {
    updatePlaybackUi();
    return;
  }

  applyMarkerNorm(markerId, norm);
}

function setKeyActive(midi, active) {
  const keyEl = keyElements.get(midi);
  if (!keyEl) return;
  keyEl.classList.toggle("active", active);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDurationSeconds() {
  return loadedBuffer?.duration || renderedBuffer?.duration || 0;
}

function minLoopGapNorm() {
  const duration = getDurationSeconds();
  if (duration <= 0) return 0.001;
  return clamp(0.01 / duration, 0.001, 0.05);
}

function normalizePlaybackState() {
  const gap = minLoopGapNorm();

  playbackState.sampleStartNorm = clamp(playbackState.sampleStartNorm, 0, 1);
  playbackState.loopStartNorm = clamp(playbackState.loopStartNorm, 0, 1 - gap);
  playbackState.loopEndNorm = clamp(playbackState.loopEndNorm, playbackState.loopStartNorm + gap, 1);

  if (playbackState.sampleStartNorm > playbackState.loopEndNorm - gap) {
    playbackState.sampleStartNorm = Math.max(0, playbackState.loopEndNorm - gap);
  }
}

function syncPlaybackSliders() {
  sampleStartSlider.value = String(Math.round(playbackState.sampleStartNorm * 1000));
  loopStartSlider.value = String(Math.round(playbackState.loopStartNorm * 1000));
  loopEndSlider.value = String(Math.round(playbackState.loopEndNorm * 1000));
}

function updatePlaybackUi() {
  const duration = getDurationSeconds();
  const hasSample = loadedBuffer !== null;
  const loopOff = !playbackState.loopEnabled;

  const startSeconds = playbackState.sampleStartNorm * duration;
  const loopStartSeconds = playbackState.loopStartNorm * duration;
  const loopEndSeconds = playbackState.loopEndNorm * duration;

  loopEnabledInput.checked = playbackState.loopEnabled;
  sampleStartInput.value = startSeconds.toFixed(2);
  loopStartInput.value = loopStartSeconds.toFixed(2);
  loopEndInput.value = loopEndSeconds.toFixed(2);

  const maxSeconds = Math.max(duration, 0);
  sampleStartInput.max = maxSeconds.toFixed(2);
  loopStartInput.max = maxSeconds.toFixed(2);
  loopEndInput.max = maxSeconds.toFixed(2);

  sampleStartInput.disabled = !hasSample;
  sampleStartSlider.disabled = !hasSample;
  loopEnabledInput.disabled = !hasSample;
  loopStartInput.disabled = !hasSample || loopOff;
  loopEndInput.disabled = !hasSample || loopOff;

  if (loopToggleLabel) {
    loopToggleLabel.textContent = playbackState.loopEnabled ? t("waveform.loopEnabled") : t("waveform.loopDisabled");
  }

  document.querySelectorAll(".waveform-card--start").forEach((el) => {
    el.classList.toggle("is-disabled", !hasSample);
  });
  document.querySelectorAll(".waveform-card--loop").forEach((el) => {
    el.classList.toggle("is-disabled", !hasSample || loopOff);
  });
  document.querySelectorAll(".waveform-cards > .loop-toggle").forEach((el) => {
    el.classList.toggle("is-disabled", !hasSample);
  });

  syncPlaybackSliders();
}

function resetPlaybackState() {
  playbackState.sampleStartNorm = 0;
  playbackState.loopEnabled = false;
  playbackState.loopStartNorm = 0;
  playbackState.loopEndNorm = 1;
  activeWaveformMarker = null;
  waveformPointerId = null;
  priorityMidi = null;
}

function revokePerformanceDownloadUrls() {
  if (performanceWavUrl) {
    URL.revokeObjectURL(performanceWavUrl);
    performanceWavUrl = "";
  }
  if (performanceMp3Url) {
    URL.revokeObjectURL(performanceMp3Url);
    performanceMp3Url = "";
  }
}

function setDownloadLinkState(linkEl, url, filename) {
  if (!url) {
    linkEl.classList.add("disabled");
    linkEl.removeAttribute("href");
    linkEl.removeAttribute("download");
    return;
  }
  linkEl.classList.remove("disabled");
  linkEl.href = url;
  linkEl.download = filename;
}

function refreshPerformanceDownloads() {
  setDownloadLinkState(downloadPerformanceWav, performanceWavUrl, "performance.wav");
  setDownloadLinkState(downloadPerformanceMp3, performanceMp3Url, "performance.mp3");
}

function formatClockFromMs(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updatePerformanceTimer() {
  if (!performanceIsRecording) {
    performanceTimer.textContent = "00:00";
    return;
  }
  performanceTimer.textContent = formatClockFromMs(Date.now() - performanceStartTimeMs);
}

function updatePerformanceUi() {
  performanceStartButton.disabled = performanceIsRecording;
  performanceStopButton.disabled = !performanceIsRecording;
  performanceStartButton.textContent = performanceIsRecording ? t("record.recording") : t("performance.start");
  performanceStartButton.classList.toggle("recording", performanceIsRecording);
  document.body.classList.toggle("is-recording", performanceIsRecording || (mediaRecorder && mediaRecorder.state === "recording"));
}

function mergeFloatChunks(chunks, totalLength) {
  const out = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function encodeWavFromStereo(left, right, sampleRate) {
  const channelCount = 2;
  const sampleCount = left.length;
  const bytesPerSample = 2;
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  const writeString = (value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
    offset += value.length;
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channelCount, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * channelCount * bytesPerSample, true);
  offset += 4;
  view.setUint16(offset, channelCount * bytesPerSample, true);
  offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  let dataOffset = offset;
  for (let i = 0; i < sampleCount; i += 1) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(dataOffset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    dataOffset += 2;
    view.setInt16(dataOffset, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    dataOffset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function supportsPerformanceMp3() {
  return Boolean(window.MediaRecorder && MediaRecorder.isTypeSupported("audio/mpeg"));
}

function updateRecordTimer() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    recordTimer.textContent = "00:00";
    return;
  }
  recordTimer.textContent = formatClockFromMs(Date.now() - recordingStartTimeMs);
}

function setRecordPermissionHint(text) {
  recordPermissionHint.textContent = text;
}

async function queryMicrophonePermission() {
  if (!navigator.permissions?.query) {
    micPermissionState = "unsupported";
    return micPermissionState;
  }

  try {
    const permissionStatus = await navigator.permissions.query({ name: "microphone" });
    micPermissionState = permissionStatus.state;
    permissionStatus.onchange = () => {
      micPermissionState = permissionStatus.state;
      if (micPermissionState === "granted") {
        setRecordPermissionHint(t("record.permission.grantedReady"));
      } else if (micPermissionState === "denied") {
        setRecordPermissionHint(t("record.permission.deniedEnable"));
      }
    };
  } catch (_error) {
    micPermissionState = "unsupported";
  }

  return micPermissionState;
}

function updateRecordingUi() {
  const isSupported = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  const isRecording = Boolean(mediaRecorder && mediaRecorder.state === "recording");

  recordStartButton.disabled = !isSupported || isRecording;
  recordStopButton.disabled = !isSupported || !isRecording;
  recordInputSelect.disabled = !isSupported || isRecording;
  refreshRecordInputsButton.disabled = !isSupported || isRecording;
  recordStartButton.textContent = isRecording ? t("record.recording") : t("recordModal.start");
  recordStartButton.classList.toggle("recording", isRecording);
  document.body.classList.toggle("is-recording", isRecording || performanceIsRecording);

  if (!isSupported) {
    setRecordStatus("record.status.notSupported");
    setRecordPermissionHint(t("record.permission.notSupported"));
  }
}

function stopMediaStreamTracks() {
  if (!mediaStream) return;
  for (const track of mediaStream.getTracks()) {
    track.stop();
  }
  mediaStream = null;
}

async function refreshAudioInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    recordInputSelect.innerHTML = `<option value=''>${t("device.defaultInput")}</option>`;
    return;
  }

  const previousValue = recordInputSelect.value;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((device) => device.kind === "audioinput");

  recordInputSelect.innerHTML = "";

  if (audioInputs.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("device.defaultInput");
    recordInputSelect.appendChild(option);
    return;
  }

  audioInputs.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    const fallbackId = device.deviceId ? ` (${device.deviceId.slice(0, 6)})` : "";
    option.textContent = device.label || t("device.inputLabel", { index: index + 1, suffix: fallbackId });
    recordInputSelect.appendChild(option);
  });

  if (previousValue && audioInputs.some((device) => device.deviceId === previousValue)) {
    recordInputSelect.value = previousValue;
  }
}

async function requestAudioStreamForSelection() {
  const selectedId = recordInputSelect.value;

  const exactConstraints = selectedId
    ? { audio: { deviceId: { exact: selectedId } } }
    : { audio: true };

  try {
    return await navigator.mediaDevices.getUserMedia(exactConstraints);
  } catch (error) {
    if (selectedId && (error?.name === "OverconstrainedError" || error?.name === "NotFoundError")) {
      setRecordStatus("record.status.selectedUnavailable");
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    throw error;
  }
}

async function ensureRecordingReady(forceNewStream = false) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    updateRecordingUi();
    return false;
  }

  if (!forceNewStream && mediaStream && mediaStream.active) {
    return true;
  }

  try {
    setRecordPermissionHint(t("record.permission.request"));
    const nextStream = await requestAudioStreamForSelection();

    if (mediaStream && mediaStream !== nextStream) {
      stopMediaStreamTracks();
    }

    mediaStream = nextStream;
    const firstTrack = mediaStream.getAudioTracks()[0];
    streamDeviceId = firstTrack?.getSettings?.().deviceId || "";

    await refreshAudioInputDevices();
    await queryMicrophonePermission();

    if (micPermissionState === "granted" || streamDeviceId) {
      setRecordPermissionHint(t("record.permission.grantedReady"));
    } else {
      setRecordPermissionHint(t("record.permission.waiting"));
    }
    return true;
  } catch (error) {
    const detail = error?.name ? `${error.name}${error.message ? `: ${error.message}` : ""}` : "unknown error";
    setRecordPermissionHint(t("record.permission.accessImpossible", { detail }));
    console.error(error);
    return false;
  }
}

function openRecordModal() {
  recordModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  updateRecordingUi();

  queryMicrophonePermission().then((state) => {
    if (state === "granted") {
      setRecordPermissionHint(t("record.permission.alreadyGrantedPreparing"));
    } else if (state === "denied") {
      setRecordPermissionHint(t("record.permission.deniedSettings"));
    } else {
      setRecordPermissionHint(t("record.permission.clickStart"));
    }
  });

  ensureRecordingReady().then((ok) => {
    if (ok) {
      const firstTrack = mediaStream?.getAudioTracks?.()[0];
      const sourceName = firstTrack?.label || t("device.defaultInput").toLowerCase();
      setRecordStatus("record.status.sourceReady", { source: sourceName });
    }
    updateRecordingUi();
  });
}

function closeRecordModal() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopRecordingSample();
  }
  recordModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  stopMediaStreamTracks();
  streamDeviceId = "";
  recordTimer.textContent = "00:00";
  setRecordPermissionHint(t("record.permission.popupClosed"));
  updateRecordingUi();
}

function isRecordModalOpen() {
  return !recordModal.classList.contains("hidden");
}

async function loadSampleFromArrayBuffer(arrayBuffer, label) {
  ensureAudioContext();
  await ensureAudioRunning();
  stopAllNotes();
  loadedBuffer = await audioContext.decodeAudioData(arrayBuffer);
  resetPlaybackState();
  renderedBuffer = loadedBuffer;
  setSampleStatus("sample.loaded", { label });
  drawWaveform(loadedBuffer);
}

function pickRecorderMimeType() {
  if (!window.MediaRecorder) return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4"
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecordingSample() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    updateRecordingUi();
    return;
  }

  try {
    const isReady = await ensureRecordingReady();
    if (!isReady || !mediaStream) {
      return;
    }

    const mimeType = pickRecorderMimeType();
    mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);

    recordingChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordingChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      try {
        const recordBlob = new Blob(recordingChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
        const buffer = await recordBlob.arrayBuffer();
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await loadSampleFromArrayBuffer(buffer, `recording-${stamp}`);
        setRecordStatus("record.status.finishedLoaded");
      } catch (error) {
        setRecordStatus("record.status.processingError");
        console.error(error);
      } finally {
        if (recordingTimerId) {
          window.clearInterval(recordingTimerId);
          recordingTimerId = null;
        }
        updateRecordTimer();
        mediaRecorder = null;
        recordingChunks = [];
        updateRecordingUi();
      }
    };

    mediaRecorder.start();
    recordingStartTimeMs = Date.now();
    const firstTrack = mediaStream.getAudioTracks()[0];
    const sourceName = firstTrack?.label || t("device.defaultInput").toLowerCase();
    setRecordStatus("record.status.recordingInProgress", { source: sourceName });
    updateRecordTimer();
    recordingTimerId = window.setInterval(updateRecordTimer, 200);
    updateRecordingUi();
  } catch (error) {
    mediaRecorder = null;
    const detail = error?.name ? `${error.name}${error.message ? `: ${error.message}` : ""}` : "unknown error";
    setRecordStatus("record.status.startFailed", { detail });
    updateRecordingUi();
    console.error(error);
  }
}

function stopRecordingSample() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    return;
  }
  mediaRecorder.stop();
}

function resetPerformanceCaptureBuffers() {
  performanceLeftChunks = [];
  performanceRightChunks = [];
  performanceRecordedSamples = 0;
  performanceMp3Chunks = [];
}

function setPerformanceWidgetCollapsed(collapsed) {
  performanceWidget.classList.toggle("collapsed", collapsed);
  togglePerformanceWidgetButton.textContent = collapsed ? t("performance.toggle.open") : t("performance.toggle.collapse");
}

function createPerformanceMp3Recorder() {
  if (!supportsPerformanceMp3() || !performanceStreamDestination) {
    return null;
  }

  try {
    return new MediaRecorder(performanceStreamDestination.stream, { mimeType: "audio/mpeg" });
  } catch (_error) {
    return null;
  }
}

function startPerformanceRecording() {
  ensureAudioContext();
  if (!audioContext || !performanceStreamDestination || performanceIsRecording) {
    return;
  }
  setPerformanceWidgetCollapsed(false);

  revokePerformanceDownloadUrls();
  refreshPerformanceDownloads();
  resetPerformanceCaptureBuffers();

  performanceMp3Recorder = createPerformanceMp3Recorder();
  if (performanceMp3Recorder) {
    performanceMp3Recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        performanceMp3Chunks.push(event.data);
      }
    };
    performanceMp3Recorder.start();
  }

  performanceIsRecording = true;
  setPerformanceTapConnection(true);
  performanceStartTimeMs = Date.now();
  setPerformanceStatus("performance.status.capturing");
  updatePerformanceTimer();
  performanceTimerId = window.setInterval(updatePerformanceTimer, 200);
  updatePerformanceUi();
}

function stopPerformanceRecording() {
  if (!performanceIsRecording) {
    return;
  }

  performanceIsRecording = false;
  setPerformanceTapConnection(false);
  if (performanceTimerId) {
    window.clearInterval(performanceTimerId);
    performanceTimerId = null;
  }
  updatePerformanceTimer();
  updatePerformanceUi();

  const finalize = () => {
    const sampleRate = audioContext?.sampleRate || 44100;
    const left = mergeFloatChunks(performanceLeftChunks, performanceRecordedSamples);
    const right = mergeFloatChunks(performanceRightChunks, performanceRecordedSamples);

    if (left.length === 0) {
      setPerformanceStatus("performance.status.noSound");
      return;
    }

    const wavBlob = encodeWavFromStereo(left, right, sampleRate);
    performanceWavUrl = URL.createObjectURL(wavBlob);

    if (performanceMp3Chunks.length > 0) {
      const mp3Blob = new Blob(performanceMp3Chunks, { type: "audio/mpeg" });
      performanceMp3Url = URL.createObjectURL(mp3Blob);
    } else {
      performanceMp3Url = "";
    }

    refreshPerformanceDownloads();
    setPerformanceStatus(performanceMp3Url ? "performance.status.capturedBoth" : "performance.status.capturedWav");
  };

  if (performanceMp3Recorder && performanceMp3Recorder.state === "recording") {
    performanceMp3Recorder.onstop = () => {
      performanceMp3Recorder = null;
      finalize();
    };
    performanceMp3Recorder.stop();
  } else {
    performanceMp3Recorder = null;
    finalize();
  }
}

function renderAdsrGraph() {
  const width = Math.floor(adsrGraphCanvas.clientWidth);
  const height = Math.floor(adsrGraphCanvas.clientHeight);
  const left = 34;
  const right = width - 12;
  const top = 10;
  const bottom = height - 20;
  const innerWidth = right - left;
  const innerHeight = bottom - top;

  adsrGraphCtx.clearRect(0, 0, width, height);

  adsrGraphCtx.strokeStyle = "rgba(23, 37, 47, 0.14)";
  adsrGraphCtx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = top + (innerHeight / 4) * i;
    adsrGraphCtx.beginPath();
    adsrGraphCtx.moveTo(left, y);
    adsrGraphCtx.lineTo(right, y);
    adsrGraphCtx.stroke();
  }

  adsrGraphCtx.fillStyle = "rgba(34, 58, 71, 0.56)";
  adsrGraphCtx.font = "500 10px Space Grotesk, sans-serif";
  adsrGraphCtx.textAlign = "left";
  adsrGraphCtx.textBaseline = "middle";
  adsrGraphCtx.fillText("0", 10, bottom);
  adsrGraphCtx.fillText("1", 10, top);

  const holdWeight = 0.4;
  const attackTime = adsrState.attack;
  const decayTime = adsrState.decay;
  const releaseTime = Math.max(adsrState.release, 0.001);
  const sustainLevel = Math.max(adsrState.sustain, 0.0001);

  const totalWeight = attackTime + decayTime + holdWeight + releaseTime;
  const x0 = left;
  const xA = x0 + innerWidth * (attackTime / totalWeight);
  const xD = xA + innerWidth * (decayTime / totalWeight);
  const xS = xD + innerWidth * (holdWeight / totalWeight);
  const xR = right;

  const y0 = bottom;
  const yPeak = top;
  const ySustain = top + innerHeight * (1 - sustainLevel);

  adsrGraphCtx.fillStyle = "rgba(255, 79, 89, 0.24)";
  adsrGraphCtx.beginPath();
  adsrGraphCtx.moveTo(x0, y0);
  adsrGraphCtx.lineTo(xA, yPeak);
  adsrGraphCtx.lineTo(xD, ySustain);
  adsrGraphCtx.lineTo(xS, ySustain);
  adsrGraphCtx.lineTo(xR, y0);
  adsrGraphCtx.closePath();
  adsrGraphCtx.fill();

  adsrGraphCtx.strokeStyle = adsrState.enabled ? "#ff4f59" : "rgba(255, 79, 89, 0.6)";
  adsrGraphCtx.lineWidth = 2.2;
  adsrGraphCtx.beginPath();
  adsrGraphCtx.moveTo(x0, y0);
  adsrGraphCtx.lineTo(xA, yPeak);
  adsrGraphCtx.lineTo(xD, ySustain);
  adsrGraphCtx.lineTo(xS, ySustain);
  adsrGraphCtx.lineTo(xR, y0);
  adsrGraphCtx.stroke();

  adsrGraphCtx.strokeStyle = "rgba(23, 37, 47, 0.22)";
  adsrGraphCtx.setLineDash([4, 4]);
  [xA, xD, xS].forEach((x) => {
    adsrGraphCtx.beginPath();
    adsrGraphCtx.moveTo(x, top);
    adsrGraphCtx.lineTo(x, bottom);
    adsrGraphCtx.stroke();
  });
  adsrGraphCtx.setLineDash([]);

  adsrGraphCtx.fillStyle = "rgba(34, 58, 71, 0.8)";
  adsrGraphCtx.font = "700 10px Space Grotesk, sans-serif";
  adsrGraphCtx.textAlign = "center";
  adsrGraphCtx.textBaseline = "top";
  adsrGraphCtx.fillText("A", (x0 + xA) / 2, bottom + 4);
  adsrGraphCtx.fillText("D", (xA + xD) / 2, bottom + 4);
  adsrGraphCtx.fillText("S", (xD + xS) / 2, bottom + 4);
  adsrGraphCtx.fillText("R", (xS + xR) / 2, bottom + 4);
}

function syncAdsrControlsFromState() {
  attackControl.value = adsrState.attack.toFixed(2);
  decayControl.value = adsrState.decay.toFixed(2);
  sustainControl.value = adsrState.sustain.toFixed(2);
  releaseControl.value = adsrState.release.toFixed(2);

  attackInput.value = adsrState.attack.toFixed(2);
  decayInput.value = adsrState.decay.toFixed(2);
  sustainInput.value = String(Math.round(adsrState.sustain * 100));
  releaseInput.value = adsrState.release.toFixed(2);
}

function updateAdsrStateFromInputs(source = "slider") {
  adsrState.enabled = adsrEnabledInput.checked;

  if (source === "manual") {
    adsrState.attack = clamp(Number.parseFloat(attackInput.value) || 0, 0, 2);
    adsrState.decay = clamp(Number.parseFloat(decayInput.value) || 0, 0, 2);
    adsrState.sustain = clamp((Number.parseFloat(sustainInput.value) || 0) / 100, 0, 1);
    adsrState.release = clamp(Number.parseFloat(releaseInput.value) || 0, 0, 3);
  } else {
    adsrState.attack = clamp(Number.parseFloat(attackControl.value) || 0, 0, 2);
    adsrState.decay = clamp(Number.parseFloat(decayControl.value) || 0, 0, 2);
    adsrState.sustain = clamp(Number.parseFloat(sustainControl.value) || 0, 0, 1);
    adsrState.release = clamp(Number.parseFloat(releaseControl.value) || 0, 0, 3);
  }

  syncAdsrControlsFromState();

  attackControl.disabled = !adsrState.enabled;
  decayControl.disabled = !adsrState.enabled;
  sustainControl.disabled = !adsrState.enabled;
  releaseControl.disabled = !adsrState.enabled;
  attackInput.disabled = !adsrState.enabled;
  decayInput.disabled = !adsrState.enabled;
  sustainInput.disabled = !adsrState.enabled;
  releaseInput.disabled = !adsrState.enabled;
  adsrPanel.classList.toggle("is-disabled", !adsrState.enabled);
  adsrToggleLabel.textContent = adsrState.enabled ? t("adsr.enabled") : t("adsr.disabled");

  if (adsrState.enabled) {
    adsrModeBadge.textContent = t("adsr.mode.adsr");
  } else {
    adsrModeBadge.textContent = t("adsr.mode.direct");
  }

  renderAdsrGraph();
}

function resizeFilterGraphCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.max(300, Math.floor(filterGraphCanvas.clientWidth));
  const displayHeight = Math.max(130, Math.floor(filterGraphCanvas.clientHeight));

  filterGraphCanvas.width = Math.floor(displayWidth * dpr);
  filterGraphCanvas.height = Math.floor(displayHeight * dpr);
  filterGraphCtx.setTransform(1, 0, 0, 1, 0, 0);
  filterGraphCtx.scale(dpr, dpr);
}

function computeFilterMagResponse(filterType, cutoffFreq, q, sampleRate, freqPoints) {
  const w0 = 2 * Math.PI * cutoffFreq / sampleRate;
  const sinW0 = Math.sin(w0);
  const cosW0 = Math.cos(w0);
  const alpha = sinW0 / (2 * q);

  let b0, b1, b2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  if (filterType === "lowpass") {
    b0 = (1 - cosW0) / 2;
    b1 = 1 - cosW0;
    b2 = (1 - cosW0) / 2;
  } else {
    b0 = (1 + cosW0) / 2;
    b1 = -(1 + cosW0);
    b2 = (1 + cosW0) / 2;
  }

  const response = new Float32Array(freqPoints.length);

  for (let i = 0; i < freqPoints.length; i++) {
    const w = 2 * Math.PI * freqPoints[i] / sampleRate;
    const cosW = Math.cos(w);
    const sinW = Math.sin(w);
    const cos2W = Math.cos(2 * w);
    const sin2W = Math.sin(2 * w);

    const numReal = b0 + b1 * cosW + b2 * cos2W;
    const numImag = b1 * sinW + b2 * sin2W;
    const denReal = a0 + a1 * cosW + a2 * cos2W;
    const denImag = a1 * sinW + a2 * sin2W;

    const numMag2 = numReal * numReal + numImag * numImag;
    const denMag2 = denReal * denReal + denImag * denImag;

    response[i] = Math.sqrt(numMag2 / Math.max(denMag2, 1e-20));
  }

  return response;
}

function filterFreqToX(freq, left, innerWidth) {
  const minLog = Math.log(20);
  const maxLog = Math.log(20000);
  return left + innerWidth * (Math.log(Math.max(freq, 20)) - minLog) / (maxLog - minLog);
}

function renderFilterGraph() {
  const width = Math.floor(filterGraphCanvas.clientWidth);
  const height = Math.floor(filterGraphCanvas.clientHeight);
  const left = 36;
  const right = width - 12;
  const top = 10;
  const bottom = height - 24;
  const innerWidth = right - left;
  const innerHeight = bottom - top;

  const dbMin = -40;
  const dbMax = 60;
  const dbRange = dbMax - dbMin;

  filterGraphCtx.clearRect(0, 0, width, height);

  filterGraphCtx.strokeStyle = "rgba(23, 37, 47, 0.14)";
  filterGraphCtx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + (innerHeight / 4) * i;
    filterGraphCtx.beginPath();
    filterGraphCtx.moveTo(left, y);
    filterGraphCtx.lineTo(right, y);
    filterGraphCtx.stroke();
  }

  const freqGridLines = [100, 1000, 10000];
  for (const f of freqGridLines) {
    const x = filterFreqToX(f, left, innerWidth);
    filterGraphCtx.beginPath();
    filterGraphCtx.moveTo(x, top);
    filterGraphCtx.lineTo(x, bottom);
    filterGraphCtx.stroke();
  }

  filterGraphCtx.fillStyle = "rgba(34, 58, 71, 0.56)";
  filterGraphCtx.font = "500 10px Space Grotesk, sans-serif";
  filterGraphCtx.textAlign = "right";
  filterGraphCtx.textBaseline = "middle";
  filterGraphCtx.fillText(`+${dbMax}`, left - 4, top);
  const y0db = top + innerHeight * (1 - (0 - dbMin) / dbRange);
  filterGraphCtx.fillText("0", left - 4, y0db);
  filterGraphCtx.fillText(`${dbMin}`, left - 4, bottom);

  filterGraphCtx.textAlign = "center";
  filterGraphCtx.textBaseline = "top";
  for (const f of freqGridLines) {
    const x = filterFreqToX(f, left, innerWidth);
    const label = f >= 1000 ? `${f / 1000}k` : String(f);
    filterGraphCtx.fillText(label, x, bottom + 4);
  }

  const sr = audioContext?.sampleRate || 44100;
  const numPoints = innerWidth;
  const minLog = Math.log(20);
  const maxLog = Math.log(20000);
  const freqPoints = new Float32Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    freqPoints[i] = Math.exp(minLog + (maxLog - minLog) * (i / Math.max(numPoints - 1, 1)));
  }

  const magResponse = computeFilterMagResponse(
    filterState.type,
    filterState.freq,
    filterState.Q,
    sr,
    freqPoints
  );

  for (let i = 0; i < magResponse.length; i++) {
    magResponse[i] *= magResponse[i];
  }

  const isActive = filterState.enabled;
  const curveFill = isActive ? "rgba(62, 184, 255, 0.18)" : "rgba(62, 184, 255, 0.06)";
  const curveStroke = isActive ? "#3eb8ff" : "rgba(62, 184, 255, 0.4)";

  filterGraphCtx.fillStyle = curveFill;
  filterGraphCtx.beginPath();
  filterGraphCtx.moveTo(left, bottom);
  for (let i = 0; i < numPoints; i++) {
    const db = 20 * Math.log10(Math.max(magResponse[i], 1e-10));
    const clampedDb = clamp(db, dbMin, dbMax);
    const y = top + innerHeight * (1 - (clampedDb - dbMin) / dbRange);
    filterGraphCtx.lineTo(left + i, y);
  }
  filterGraphCtx.lineTo(right, bottom);
  filterGraphCtx.closePath();
  filterGraphCtx.fill();

  filterGraphCtx.strokeStyle = curveStroke;
  filterGraphCtx.lineWidth = 2.2;
  filterGraphCtx.beginPath();
  for (let i = 0; i < numPoints; i++) {
    const db = 20 * Math.log10(Math.max(magResponse[i], 1e-10));
    const clampedDb = clamp(db, dbMin, dbMax);
    const y = top + innerHeight * (1 - (clampedDb - dbMin) / dbRange);
    if (i === 0) {
      filterGraphCtx.moveTo(left + i, y);
    } else {
      filterGraphCtx.lineTo(left + i, y);
    }
  }
  filterGraphCtx.stroke();

  if (isActive) {
    const cutoffX = filterFreqToX(filterState.freq, left, innerWidth);
    filterGraphCtx.strokeStyle = "rgba(62, 184, 255, 0.35)";
    filterGraphCtx.setLineDash([4, 4]);
    filterGraphCtx.beginPath();
    filterGraphCtx.moveTo(cutoffX, top);
    filterGraphCtx.lineTo(cutoffX, bottom);
    filterGraphCtx.stroke();
    filterGraphCtx.setLineDash([]);
  }
}

function updatePriorityMidi(releasedMidi) {
  if (releasedMidi !== priorityMidi) return;
  priorityMidi = null;
  for (const m of activeVoices.keys()) {
    if (priorityMidi === null || m < priorityMidi) {
      priorityMidi = m;
    }
  }
}

function getPlayheadNorm() {
  if (priorityMidi === null || !loadedBuffer || !audioContext) return null;
  const voice = activeVoices.get(priorityMidi);
  if (!voice) return null;

  const elapsed = (audioContext.currentTime - voice.startTime) * voice.playbackRate;
  let posInBuffer = voice.startOffset + elapsed;

  if (playbackState.loopEnabled) {
    const loopStart = playbackState.loopStartNorm * loadedBuffer.duration;
    const loopEnd = playbackState.loopEndNorm * loadedBuffer.duration;
    const loopLength = loopEnd - loopStart;
    if (loopLength > 0 && posInBuffer >= loopEnd) {
      posInBuffer = loopStart + ((posInBuffer - loopStart) % loopLength);
    }
  }

  return clamp(posInBuffer / loadedBuffer.duration, 0, 1);
}

function startPlayheadAnimation() {
  if (playheadAnimId !== null) return;

  function frame() {
    if (activeVoices.size === 0 || !waveformSnapshot) {
      playheadAnimId = null;
      if (waveformSnapshot) {
        canvasCtx.putImageData(waveformSnapshot, 0, 0);
      }
      return;
    }

    const norm = getPlayheadNorm();
    if (norm === null) {
      playheadAnimId = null;
      return;
    }

    canvasCtx.putImageData(waveformSnapshot, 0, 0);

    const width = Math.floor(waveformCanvas.clientWidth);
    const height = Math.floor(waveformCanvas.clientHeight);
    const x = norm * width;

    canvasCtx.strokeStyle = "#ff7d3d";
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(x, 0);
    canvasCtx.lineTo(x, height);
    canvasCtx.stroke();

    playheadAnimId = requestAnimationFrame(frame);
  }

  playheadAnimId = requestAnimationFrame(frame);
}

function startNote(midi) {
  if (!loadedBuffer) {
    setSampleStatus("sample.loadBeforePlay");
    return;
  }

  if (activeVoices.has(midi)) {
    return;
  }

  ensureAudioContext();
  if (audioContext.state !== "running") {
    ensureAudioRunning().then((isReady) => {
      if (isReady && !activeVoices.has(midi) && isMidiInputHeld(midi)) {
        startNote(midi);
      }
    });
    return;
  }
  normalizePlaybackState();

  const source = audioContext.createBufferSource();
  source.buffer = loadedBuffer;
  source.loop = playbackState.loopEnabled;
  if (source.loop) {
    source.loopStart = playbackState.loopStartNorm * loadedBuffer.duration;
    source.loopEnd = playbackState.loopEndNorm * loadedBuffer.duration;
  }
  source.playbackRate.value = midiToPlaybackRate(midi);

  const gain = audioContext.createGain();
  const now = audioContext.currentTime;

  if (adsrState.enabled) {
    const attackEnd = now + adsrState.attack;
    const decayEnd = attackEnd + adsrState.decay;
    const sustainTarget = Math.max(adsrState.sustain, 0.0001);

    gain.gain.setValueAtTime(0.0001, now);
    if (adsrState.attack > 0) {
      gain.gain.exponentialRampToValueAtTime(1, attackEnd);
    } else {
      gain.gain.setValueAtTime(1, now);
    }

    if (adsrState.decay > 0) {
      gain.gain.exponentialRampToValueAtTime(sustainTarget, decayEnd);
    } else {
      gain.gain.setValueAtTime(sustainTarget, attackEnd);
    }
  } else {
    gain.gain.setValueAtTime(1, now);
  }

  source.connect(gain);
  const inputTarget = filterState.enabled
    ? (filterInputGain || masterOutputGain || audioContext.destination)
    : (masterOutputGain || audioContext.destination);
  gain.connect(inputTarget);

  source.onended = () => {
    const voice = activeVoices.get(midi);
    if (voice && voice.source === source) {
      activeVoices.delete(midi);
      setKeyActive(midi, false);
      updatePriorityMidi(midi);
    }
  };

  const startOffset = clamp(playbackState.sampleStartNorm * loadedBuffer.duration, 0, Math.max(0, loadedBuffer.duration - 0.001));
  source.start(now, startOffset);
  activeVoices.set(midi, { source, gain, startTime: now, startOffset, playbackRate: source.playbackRate.value });
  setKeyActive(midi, true);

  if (priorityMidi === null) {
    priorityMidi = midi;
  }
  startPlayheadAnimation();
}

function stopNote(midi) {
  const voice = activeVoices.get(midi);
  if (!voice || !audioContext) {
    setKeyActive(midi, false);
    return;
  }

  const now = audioContext.currentTime;
  const param = voice.gain.gain;
  const currentGain = Math.max(param.value, 0.0001);

  param.cancelScheduledValues(now);
  param.setValueAtTime(currentGain, now);

  if (adsrState.enabled && adsrState.release > 0) {
    param.exponentialRampToValueAtTime(0.0001, now + adsrState.release);
    try {
      voice.source.stop(now + adsrState.release + 0.02);
    } catch (_err) {
      // Source déjà stoppée.
    }
  } else {
    param.setValueAtTime(0, now);
    try {
      voice.source.stop(now + 0.005);
    } catch (_err) {
      // Source déjà stoppée.
    }
  }

  activeVoices.delete(midi);
  updatePriorityMidi(midi);
  window.setTimeout(() => {
    if (!activeVoices.has(midi)) {
      setKeyActive(midi, false);
    }
  }, 65);
}

function stopAllNotes() {
  for (const midi of Array.from(activeVoices.keys())) {
    stopNote(midi);
  }
}

function getShortcutForMidi(midi) {
  for (const [key, mappedMidi] of layoutKeyToMidi.entries()) {
    if (mappedMidi === midi) {
      return key.toUpperCase();
    }
  }
  return null;
}

function createKeyLabel(note, shortcut) {
  if (!shortcut) {
    return note.note;
  }

  if (whiteKeyWidth <= 30) {
    return shortcut;
  }

  return note.type === "white" ? `${note.note} · ${shortcut}` : shortcut;
}

function refreshKeyboardLabels() {
  for (const note of visualNotes) {
    const keyEl = keyElements.get(note.midi);
    if (!keyEl) continue;

    const shortcut = getShortcutForMidi(note.midi);
    keyEl.textContent = createKeyLabel(note, shortcut);
    keyEl.classList.toggle("note-only", !shortcut);
    keyEl.title = shortcut ? `${note.note} (${shortcut})` : note.note;
  }
}

function updateKeyboardGeometry() {
  if (!keybedElement) return;

  const rootStyle = window.getComputedStyle(keyboardRoot);
  const paddingX = parseFloat(rootStyle.paddingLeft) + parseFloat(rootStyle.paddingRight);
  const availableWidth = Math.max(320, keyboardRoot.clientWidth - paddingX);

  whiteKeyWidth = Math.max(MIN_WHITE_KEY_WIDTH, Math.floor(availableWidth / whiteKeyCount));
  blackKeyWidth = Math.max(14, Math.round(whiteKeyWidth * BLACK_KEY_RATIO));

  let whiteIndex = 0;

  for (const note of visualNotes) {
    const keyEl = keyElements.get(note.midi);
    if (!keyEl) continue;

    if (note.type === "white") {
      keyEl.style.left = `${whiteIndex * whiteKeyWidth}px`;
      keyEl.style.width = `${whiteKeyWidth}px`;
      whiteIndex += 1;
    } else {
      keyEl.style.left = `${whiteIndex * whiteKeyWidth - Math.floor(blackKeyWidth / 2)}px`;
      keyEl.style.width = `${blackKeyWidth}px`;
    }

    keyEl.style.fontSize = note.type === "white"
      ? `${Math.max(9, Math.min(12, Math.round(whiteKeyWidth * 0.24)))}px`
      : `${Math.max(9, Math.min(11, Math.round(whiteKeyWidth * 0.24)))}px`;
  }

  keybedElement.style.width = `${whiteIndex * whiteKeyWidth}px`;
  refreshKeyboardLabels();
}

function attachPointerHandlers(keyEl, midi) {
  keyEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    keyEl.setPointerCapture(event.pointerId);
    pointerIdToMidi.set(event.pointerId, midi);
    startNote(midi);
  });

  const releasePointer = (event) => {
    const storedMidi = pointerIdToMidi.get(event.pointerId);
    if (storedMidi == null) return;

    pointerIdToMidi.delete(event.pointerId);
    stopNote(storedMidi);

    if (keyEl.hasPointerCapture(event.pointerId)) {
      keyEl.releasePointerCapture(event.pointerId);
    }
  };

  keyEl.addEventListener("pointerup", releasePointer);
  keyEl.addEventListener("pointercancel", releasePointer);
  keyEl.addEventListener("lostpointercapture", releasePointer);
}

function createKeyboard() {
  keybedElement = document.createElement("div");
  keybedElement.className = "keybed";

  for (const note of visualNotes) {
    const keyEl = document.createElement("button");
    keyEl.type = "button";
    keyEl.className = `key ${note.type === "white" ? "white-key" : "black-key"}`;
    keyEl.dataset.midi = String(note.midi);

    attachPointerHandlers(keyEl, note.midi);

    keyElements.set(note.midi, keyEl);
    keybedElement.appendChild(keyEl);
  }

  keyboardRoot.innerHTML = "";
  keyboardRoot.appendChild(keybedElement);
  updateKeyboardGeometry();
}

function clearPressedStates() {
  pressedKeyboardKeyToMidi.clear();
  pointerIdToMidi.clear();
  stopAllNotes();
}

function normalizedEventKey(key) {
  if (!key || key.length !== 1) return null;
  return key.toLowerCase();
}

function setKeyboardLayout(layoutName) {
  if (!(layoutName in keyboardLayouts)) return;
  currentLayout = layoutName;
  clearPressedStates();
  rebuildLayoutKeyToMidi();
  refreshKeyboardLabels();
}

function setComputerKeyboardOctave(nextValue) {
  const parsed = Number.parseInt(nextValue, 10);
  if (![1, 2, 3].includes(parsed)) {
    return;
  }
  currentComputerKeyboardOctave = parsed;
  keyboardOctaveBtns.forEach((btn) => {
    btn.classList.toggle("active", Number.parseInt(btn.dataset.octave, 10) === parsed);
  });
  clearPressedStates();
  rebuildLayoutKeyToMidi();
  refreshKeyboardLabels();
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const arrayBuffer = await file.arrayBuffer();
    await loadSampleFromArrayBuffer(arrayBuffer, file.name);
  } catch (error) {
    stopAllNotes();
    loadedBuffer = null;
    renderedBuffer = null;
    resetPlaybackState();
    setSampleStatus("sample.decodeError");
    drawEmptyWaveform();
    updatePlaybackUi();
    console.error(error);
  }
});

langBtns.forEach((btn) => {
  btn.addEventListener("click", () => applyLanguage(btn.dataset.lang, true));
});

keyboardOctaveBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setComputerKeyboardOctave(btn.dataset.octave);
  });
});

loadSampleButton.addEventListener("click", () => {
  fileInput.click();
});

openRecordModalButton.addEventListener("click", () => {
  openRecordModal();
});

closeRecordModalButton.addEventListener("click", () => {
  closeRecordModal();
});

togglePerformanceWidgetButton.addEventListener("click", () => {
  const isCollapsed = performanceWidget.classList.contains("collapsed");
  setPerformanceWidgetCollapsed(!isCollapsed);
});

recordModal.addEventListener("pointerdown", (event) => {
  if (event.target === recordModal) {
    closeRecordModal();
  }
});

refreshRecordInputsButton.addEventListener("click", () => {
  refreshAudioInputDevices().catch((error) => {
    setRecordStatus("record.status.refreshInputsError");
    console.error(error);
  });
});

recordInputSelect.addEventListener("change", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") return;
  ensureRecordingReady(true).then((ok) => {
    if (ok) {
      const firstTrack = mediaStream?.getAudioTracks?.()[0];
      const sourceName = firstTrack?.label || t("device.defaultInput").toLowerCase();
      setRecordStatus("record.status.inputActive", { source: sourceName });
    }
  });
});

recordStartButton.addEventListener("click", () => {
  startRecordingSample();
});

recordStopButton.addEventListener("click", () => {
  stopRecordingSample();
});

performanceStartButton.addEventListener("click", () => {
  startPerformanceRecording();
});

performanceStopButton.addEventListener("click", () => {
  stopPerformanceRecording();
});

adsrEnabledInput.addEventListener("input", () => updateAdsrStateFromInputs("slider"));
adsrEnabledInput.addEventListener("change", () => updateAdsrStateFromInputs("slider"));

[attackControl, decayControl, sustainControl, releaseControl].forEach((control) => {
  control.addEventListener("input", () => updateAdsrStateFromInputs("slider"));
  control.addEventListener("change", () => updateAdsrStateFromInputs("slider"));
});

[attackInput, decayInput, sustainInput, releaseInput].forEach((control) => {
  control.addEventListener("input", () => updateAdsrStateFromInputs("manual"));
  control.addEventListener("change", () => updateAdsrStateFromInputs("manual"));
});

[freqControl, resoControl].forEach((control) => {
  control.addEventListener("input", updateFilterFromControls);
  control.addEventListener("change", updateFilterFromControls);
});

[freqInput, resoInput].forEach((input) => {
  input.addEventListener("input", updateFilterFromManualInputs);
  input.addEventListener("change", updateFilterFromManualInputs);
});

volumeControl.addEventListener("input", updateVolumeFromControl);
volumeControl.addEventListener("change", updateVolumeFromControl);

filterEnabledInput.addEventListener("input", () => {
  filterState.enabled = filterEnabledInput.checked;
  updateFilterUiState();
  syncFilterControls();
  renderFilterGraph();
});
filterEnabledInput.addEventListener("change", () => {
  filterState.enabled = filterEnabledInput.checked;
  updateFilterUiState();
  syncFilterControls();
  renderFilterGraph();
});

filterModeLp.addEventListener("click", () => {
  filterState.type = "lowpass";
  updateFilterUiState();
  applyFilterState();
  renderFilterGraph();
});

filterModeHp.addEventListener("click", () => {
  filterState.type = "highpass";
  updateFilterUiState();
  applyFilterState();
  renderFilterGraph();
});

loopEnabledInput.addEventListener("change", () => {
  playbackState.loopEnabled = loopEnabledInput.checked;
  normalizePlaybackState();
  redrawWaveform();
});

resetPlaybackPointsButton.addEventListener("click", () => {
  resetPlaybackState();
  redrawWaveform();
});

sampleStartInput.addEventListener("input", () => applyPlaybackSecondsInput("sampleStart", sampleStartInput.value));
sampleStartInput.addEventListener("change", () => applyPlaybackSecondsInput("sampleStart", sampleStartInput.value));
loopStartInput.addEventListener("input", () => applyPlaybackSecondsInput("loopStart", loopStartInput.value));
loopStartInput.addEventListener("change", () => applyPlaybackSecondsInput("loopStart", loopStartInput.value));
loopEndInput.addEventListener("input", () => applyPlaybackSecondsInput("loopEnd", loopEndInput.value));
loopEndInput.addEventListener("change", () => applyPlaybackSecondsInput("loopEnd", loopEndInput.value));

[sampleStartSlider, loopStartSlider, loopEndSlider].forEach((slider) => {
  slider.addEventListener("input", () => {
    const norm = Number.parseInt(slider.value, 10) / 1000;
    if (slider === sampleStartSlider) {
      applyMarkerNorm("sampleStart", norm);
    } else if (slider === loopStartSlider) {
      applyMarkerNorm("loopStart", norm);
    } else {
      applyMarkerNorm("loopEnd", norm);
    }
  });
  slider.addEventListener("change", () => {
    const norm = Number.parseInt(slider.value, 10) / 1000;
    if (slider === sampleStartSlider) {
      applyMarkerNorm("sampleStart", norm);
    } else if (slider === loopStartSlider) {
      applyMarkerNorm("loopStart", norm);
    } else {
      applyMarkerNorm("loopEnd", norm);
    }
  });
});

waveformCanvas.addEventListener("pointerdown", (event) => {
  if (!renderedBuffer) {
    fileInput.click();
    return;
  }

  const normX = waveformXToNorm(event.clientX);
  let markerId = getClosestWaveMarker(normX);
  if (!markerId) {
    markerId = playbackState.loopEnabled ? "loopStart" : "sampleStart";
  }

  waveformCanvas.setPointerCapture(event.pointerId);
  activeWaveformMarker = markerId;
  waveformPointerId = event.pointerId;
  applyMarkerNorm(markerId, normX);
});

waveformCanvas.addEventListener("pointermove", (event) => {
  if (waveformPointerId !== event.pointerId || !activeWaveformMarker) return;
  const normX = waveformXToNorm(event.clientX);
  applyMarkerNorm(activeWaveformMarker, normX);
});

function releaseWaveformPointer(event) {
  if (waveformPointerId !== event.pointerId) return;

  activeWaveformMarker = null;
  waveformPointerId = null;
  if (waveformCanvas.hasPointerCapture(event.pointerId)) {
    waveformCanvas.releasePointerCapture(event.pointerId);
  }
}

waveformCanvas.addEventListener("pointerup", releaseWaveformPointer);
waveformCanvas.addEventListener("pointercancel", releaseWaveformPointer);
waveformCanvas.addEventListener("lostpointercapture", releaseWaveformPointer);

window.addEventListener("pointerdown", () => {
  ensureAudioRunning();
}, { capture: true, passive: true });

window.addEventListener("keydown", () => {
  ensureAudioRunning();
}, { capture: true });

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isRecordModalOpen()) {
    closeRecordModal();
    return;
  }

  if (isRecordModalOpen()) {
    return;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const pressedKey = normalizedEventKey(event.key);
  if (!pressedKey) return;

  const midi = layoutKeyToMidi.get(pressedKey);
  if (midi == null) return;

  event.preventDefault();

  if (event.repeat || pressedKeyboardKeyToMidi.has(pressedKey)) {
    return;
  }

  pressedKeyboardKeyToMidi.set(pressedKey, midi);
  startNote(midi);
});

window.addEventListener("keyup", (event) => {
  const releasedKey = normalizedEventKey(event.key);
  if (!releasedKey) return;

  const midi = pressedKeyboardKeyToMidi.get(releasedKey);
  if (midi == null) return;

  pressedKeyboardKeyToMidi.delete(releasedKey);
  stopNote(midi);
});

window.addEventListener("blur", clearPressedStates);

if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    refreshAudioInputDevices().catch((error) => {
      console.error(error);
    });
  });
}

createKeyboard();
setKeyboardLayout(currentLayout);
setComputerKeyboardOctave(currentComputerKeyboardOctave);
resizeAdsrGraphCanvas();
resizeFilterGraphCanvas();
syncFilterControls();
syncVolumeUi();
updateFilterUiState();
renderFilterGraph();
resizeWaveformCanvas();
refreshPerformanceDownloads();
setPerformanceWidgetCollapsed(true);
applyLanguage(currentLanguage, true);
setRecordPermissionHint(t("record.permission.clickStart"));
refreshAudioInputDevices().catch((error) => {
  setRecordStatus("record.status.listInputsError");
  console.error(error);
});
window.addEventListener("resize", () => {
  resizeAdsrGraphCanvas();
  resizeFilterGraphCanvas();
  resizeWaveformCanvas();
  updateKeyboardGeometry();
  renderAdsrGraph();
  renderFilterGraph();
});
