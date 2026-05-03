(() => {
  // src/constants.js
  var BASE_MIDI = 48;
  var PLAYABLE_MIN_MIDI = 48;
  var PLAYABLE_MAX_MIDI = 64;
  var VISUAL_MIN_MIDI = PLAYABLE_MIN_MIDI - 12;
  var VISUAL_MAX_MIDI = PLAYABLE_MAX_MIDI + 12;
  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var MIN_WHITE_KEY_WIDTH = 22;
  var BLACK_KEY_RATIO = 0.62;
  var SUPPORTED_LANGUAGES = ["fr", "en", "de", "es", "it", "pt"];
  var LANGUAGE_TO_LAYOUT = {
    fr: "azerty",
    en: "qwerty",
    de: "qwertz",
    es: "qwerty",
    it: "qwerty",
    pt: "qwerty"
  };
  var KEYBOARD_LAYOUTS = {
    qwerty: ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";"],
    azerty: ["q", "z", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", "m"],
    qwertz: ["a", "w", "s", "e", "d", "f", "t", "g", "z", "h", "u", "j", "k", "o", "l", "p", "m"]
  };
  var DRUM_KEYBOARD_LAYOUTS = {
    qwerty: ["a", "s", "d", "f", "g", "h", "j", "k"],
    azerty: ["q", "s", "d", "f", "g", "h", "j", "k"],
    qwertz: ["a", "s", "d", "f", "g", "h", "j", "k"]
  };

  // src/state.js
  function resolveInitialLanguage() {
    try {
      const saved = window.localStorage.getItem("miniSamplerLanguage");
      if (SUPPORTED_LANGUAGES.includes(saved)) return saved;
    } catch (_error) {
    }
    const browserLanguage = navigator.language?.toLowerCase() || "";
    const primaryLanguage = browserLanguage.split("-")[0];
    return SUPPORTED_LANGUAGES.includes(primaryLanguage) ? primaryLanguage : "en";
  }
  var initialLanguage = resolveInitialLanguage();
  var lang = {
    current: initialLanguage,
    layout: LANGUAGE_TO_LAYOUT[initialLanguage] || "qwerty"
  };
  var editionState = {
    current: "chromatic"
  };
  var keys = {
    computerOctave: 2,
    whiteKeyWidth: 54,
    blackKeyWidth: 34,
    keybedElement: null,
    keyElements: /* @__PURE__ */ new Map(),
    activeVoices: /* @__PURE__ */ new Map(),
    pressedKeyToMidi: /* @__PURE__ */ new Map(),
    pointerIdToMidi: /* @__PURE__ */ new Map(),
    layoutKeyToMidi: /* @__PURE__ */ new Map(),
    drumPressedKeyToPad: /* @__PURE__ */ new Map()
  };
  var audio = {
    loadedBuffer: null,
    renderedBuffer: null
  };
  var adsrState = {
    enabled: false,
    attack: 0.02,
    decay: 0.18,
    sustain: 0.75,
    release: 0.24
  };
  var playbackState = {
    sampleStartNorm: 0,
    loopEnabled: false,
    loopStartNorm: 0,
    loopEndNorm: 1
  };
  var outputState = {
    volume: 1
  };
  var filterState = {
    enabled: false,
    type: "lowpass",
    freq: 1e3,
    Q: 1
  };
  var statusState = {
    sample: { key: "sample.none", params: {} },
    record: { key: "record.status.readyToRecord", params: {} },
    performance: { key: "performance.status.ready", params: {} }
  };
  var wave = {
    activeMarker: null,
    pointerId: null,
    priorityMidi: null,
    snapshot: null,
    playheadAnimId: null
  };
  var recordingState = {
    mediaStream: null,
    mediaRecorder: null,
    chunks: [],
    startTimeMs: 0,
    timerId: null,
    micPermissionState: "unknown",
    streamDeviceId: ""
  };
  var perfState = {
    timerId: null,
    startTimeMs: 0,
    isRecording: false,
    recordedSamples: 0,
    leftChunks: [],
    rightChunks: [],
    mp3Recorder: null,
    mp3Chunks: [],
    wavUrl: "",
    mp3Url: ""
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
        release: 0.24
      }
    };
  }
  var drumState = {
    selectedPadIndex: 0,
    pads: Array.from({ length: 8 }, (_, index) => createDrumPadState(index)),
    activeVoices: /* @__PURE__ */ new Map(),
    pointerIdToPadIndex: /* @__PURE__ */ new Map()
  };

  // src/utils.js
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function createNote(midi) {
    const noteIndex = (midi % 12 + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    return {
      midi,
      note: `${NOTE_NAMES[noteIndex]}${octave}`,
      type: NOTE_NAMES[noteIndex].includes("#") ? "black" : "white"
    };
  }
  var visualNotes = Array.from(
    { length: VISUAL_MAX_MIDI - VISUAL_MIN_MIDI + 1 },
    (_, idx) => createNote(VISUAL_MIN_MIDI + idx)
  );
  var whiteKeyCount = visualNotes.filter((note) => note.type === "white").length;
  function midiToPlaybackRate(midi) {
    return Math.pow(2, (midi - BASE_MIDI) / 12);
  }
  function sliderToFreq(sliderVal) {
    return 20 * Math.pow(1e3, Number.parseFloat(sliderVal) / 1e3);
  }
  function freqToSlider(freq) {
    return Math.round(1e3 * Math.log(Math.max(freq, 20) / 20) / Math.log(1e3));
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
      view.setInt16(dataOffset, l < 0 ? l * 32768 : l * 32767, true);
      dataOffset += 2;
      view.setInt16(dataOffset, r < 0 ? r * 32768 : r * 32767, true);
      dataOffset += 2;
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  // src/i18n.js
  var translations = {
    fr: {
      "lang.label": "Langue et clavier",
      "common.value": "Valeur",
      "common.stop": "Stop",
      "app.title": "LePetitSampler",
      "app.drumTitle": "LePetitSampler",
      "app.editionSubtitle": "Chromatic Edition",
      "app.subtitle": "Charge un sample accord\xE9 en C3 et joue-le sur plusieurs notes.",
      "app.base": "Base: C3",
      "edition.label": "Edition",
      "edition.chromatic": "Chromatic Edition",
      "edition.drum": "Drum Edition",
      "edition.empty": "Page vierge pour l'instant.",
      "volume.label": "Volume",
      "volume.global": "Volume general",
      "actions.loadSample": "Charger un sample",
      "actions.recordSample": "Enregistrer un sample",
      "adsr.summary": "Enveloppe ADSR",
      "adsr.enabled": "ADSR activ\xE9e",
      "adsr.disabled": "ADSR d\xE9sactiv\xE9e",
      "adsr.mode.adsr": "Mode: ADSR",
      "adsr.mode.direct": "Mode: Direct",
      "adsr.helper.enabled": "Attack {attack}s, decay {decay}s, sustain {sustain}%, release {release}s.",
      "adsr.helper.direct": "Enveloppe bypass\xE9e: volume constant pendant l'appui, arr\xEAt imm\xE9diat au rel\xE2chement.",
      "waveform.title": "Forme d'onde",
      "waveform.loopEnabled": "Loop activ\xE9e",
      "waveform.loopDisabled": "Loop d\xE9sactiv\xE9e",
      "waveform.resetPoints": "Reset points",
      "waveform.help": "D\xE9place les barres sur la forme d'onde: <strong>Sample Start</strong> (vert), <strong>Loop In</strong> et <strong>Loop Out</strong> (bleu).",
      "waveform.helpDrum": "D\xE9place la barre sur la forme d'onde: <strong>Sample Start</strong>. Ajuste aussi <strong>Volume</strong> et <strong>Pitch</strong> du pad.",
      "waveform.changeSample": "Changer le sample",
      "waveform.padVolume": "Volume",
      "waveform.pitch": "Pitch",
      "waveform.start": "Sample Start",
      "waveform.loopIn": "Loop In",
      "waveform.loopOut": "Loop Out",
      "waveform.empty": "Charge un fichier audio pour afficher la forme d'onde",
      "filter.summary": "Filtre",
      "filter.enabled": "Filtre activ\xE9",
      "filter.disabled": "Filtre d\xE9sactiv\xE9",
      "filter.mode.lp": "LP",
      "filter.mode.hp": "HP",
      "filter.freq": "Fr\xE9quence",
      "filter.reso": "Resonance",
      "keyboard.title": "Clavier",
      "keyboard.octaveLabel": "Octave clavier ordinateur",
      "drum.padsTitle": "Pads",
      "drum.padsHint": "",
      "drum.clickToAdd": "Cliquer pour ajouter",
      "sampleSource.title": "Ajouter un sample",
      "sampleSource.padLabel": "Pad {index}",
      "sampleSource.load": "Charger un sample",
      "sampleSource.record": "Enregistrer un sample",
      "recordModal.title": "Enregistrer un sample",
      "recordModal.close": "Fermer",
      "recordModal.audioInput": "Entr\xE9e audio",
      "recordModal.refresh": "Actualiser",
      "recordModal.start": "D\xE9marrer",
      "record.recording": "Enregistrement\u2026",
      "record.badge.ready": "PR\xCAT",
      "record.badge.recording": "ENREGISTREMENT",
      "record.permission.grantedReady": "Autorisation micro accord\xE9e. Entr\xE9e pr\xEAte.",
      "record.permission.deniedEnable": "Autorisation micro refus\xE9e. Active-la dans le navigateur.",
      "record.permission.request": "Demande d'autorisation micro...",
      "record.permission.waiting": "Permission micro en attente.",
      "record.permission.accessImpossible": "Acc\xE8s micro impossible ({detail}).",
      "record.permission.alreadyGrantedPreparing": "Autorisation micro d\xE9j\xE0 accord\xE9e. Pr\xE9paration de l'entr\xE9e...",
      "record.permission.deniedSettings": "Autorisation micro refus\xE9e. Active-la dans les r\xE9glages du navigateur.",
      "record.permission.clickStart": "Clique sur D\xE9marrer pour autoriser le micro.",
      "record.permission.popupClosed": "Popup ferm\xE9.",
      "record.permission.notSupported": "Cette plateforme ne supporte pas MediaRecorder.",
      "record.status.readyToRecord": "Pr\xEAt \xE0 enregistrer",
      "record.status.notSupported": "Enregistrement non support\xE9 sur ce navigateur.",
      "record.status.refreshInputsError": "Impossible d'actualiser les entr\xE9es audio.",
      "record.status.selectedUnavailable": "Entr\xE9e s\xE9lectionn\xE9e indisponible, fallback sur entr\xE9e par d\xE9faut...",
      "record.status.sourceReady": "Entr\xE9e pr\xEAte ({source}).",
      "record.status.inputActive": "Entr\xE9e active: {source}.",
      "record.status.finishedLoaded": "Enregistrement termin\xE9 et charg\xE9.",
      "record.status.processingError": "Erreur pendant le traitement de l'enregistrement.",
      "record.status.recordingInProgress": "Enregistrement en cours ({source})...",
      "record.status.startFailed": "Impossible de d\xE9marrer l'enregistrement ({detail}).",
      "record.status.listInputsError": "Impossible de lister les entr\xE9es audio.",
      "device.defaultInput": "Entr\xE9e par d\xE9faut",
      "device.inputLabel": "Entr\xE9e {index}{suffix}",
      "sample.none": "Aucun sample charg\xE9",
      "sample.loaded": "Sample charg\xE9: {label}",
      "sample.decodeError": "Erreur de d\xE9codage du sample.",
      "sample.loadBeforePlay": "Charge un sample avant de jouer.",
      "performance.title": "Enregistrer ma performance",
      "performance.help": "Capture directe de la sortie du sampler (clavier physique + clavier visuel).",
      "performance.start": "D\xE9marrer",
      "performance.downloadWav": "T\xE9l\xE9charger WAV",
      "performance.downloadMp3": "T\xE9l\xE9charger MP3",
      "performance.badge.ready": "PR\xCAT",
      "performance.badge.recording": "ENREGISTREMENT",
      "performance.toggle.open": "Ouvrir",
      "performance.toggle.collapse": "R\xE9duire",
      "performance.status.ready": "Pr\xEAt \xE0 capturer la performance.",
      "performance.status.capturing": "Capture performance en cours...",
      "performance.status.noSound": "Aucun son captur\xE9 (joue des notes pendant la capture).",
      "performance.status.capturedBoth": "Performance captur\xE9e. Exports WAV et MP3 pr\xEAts.",
      "performance.status.capturedWav": "Performance captur\xE9e. Export WAV pr\xEAt.",
      "performance.mp3.supported": "MP3 natif support\xE9: export MP3 disponible apr\xE8s l'enregistrement.",
      "performance.mp3.unsupported": "MP3 non support\xE9 par ce navigateur: export WAV disponible.",
      "modal.closeOnEscape": "Fermer",
      "aria.waveform": "Forme d'onde du sample",
      "aria.keyboard": "Clavier piano interactif",
      "sequencer.title": "Sequenceur",
      "sequencer.bpm": "BPM",
      "sequencer.play": "Play",
      "sequencer.stop": "Stop",
      "sequencer.clear": "Effacer",
      "sequencer.export": "Exporter",
      "sequencer.exportSuccess": "Export reussi !",
      "sequencer.exportError": "Erreur lors de l'export.",
      "sequencer.bpmRange": "Le BPM doit etre compris entre 40 et 240."
    },
    en: {
      "lang.label": "Language & keyboard",
      "common.value": "Value",
      "common.stop": "Stop",
      "app.title": "LePetitSampler",
      "app.drumTitle": "LePetitSampler",
      "app.editionSubtitle": "Chromatic Edition",
      "app.subtitle": "Load a sample tuned in C3 and play it at different pitches.",
      "app.base": "Base: C3",
      "edition.label": "Edition",
      "edition.chromatic": "Chromatic Edition",
      "edition.drum": "Drum Edition",
      "edition.empty": "Blank page for now.",
      "volume.label": "Volume",
      "volume.global": "Global volume",
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
      "waveform.help": "Move the bars on the waveform: <strong>Sample Start</strong> (green), <strong>Loop In</strong> and <strong>Loop Out</strong> (blue).",
      "waveform.helpDrum": "Move the marker on the waveform: <strong>Sample Start</strong>. Also adjust pad <strong>Volume</strong> and <strong>Pitch</strong>.",
      "waveform.changeSample": "Change sample",
      "waveform.padVolume": "Volume",
      "waveform.pitch": "Pitch",
      "waveform.start": "Sample Start",
      "waveform.loopIn": "Loop In",
      "waveform.loopOut": "Loop Out",
      "waveform.empty": "Load an audio file to display the waveform",
      "filter.summary": "Filter",
      "filter.enabled": "Filter enabled",
      "filter.disabled": "Filter disabled",
      "filter.mode.lp": "LP",
      "filter.mode.hp": "HP",
      "filter.freq": "Frequence",
      "filter.reso": "Resonance",
      "keyboard.title": "Keyboard",
      "keyboard.octaveLabel": "Octave for computer keyboard",
      "drum.padsTitle": "Pads",
      "drum.padsHint": "",
      "drum.clickToAdd": "Click to add",
      "sampleSource.title": "Add a sample",
      "sampleSource.padLabel": "Pad {index}",
      "sampleSource.load": "Load a sample",
      "sampleSource.record": "Record a sample",
      "recordModal.title": "Record a sample",
      "recordModal.close": "Close",
      "recordModal.audioInput": "Audio input",
      "recordModal.refresh": "Refresh",
      "recordModal.start": "Start",
      "record.recording": "Recording\u2026",
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
      "modal.closeOnEscape": "Close",
      "aria.waveform": "Sample waveform",
      "aria.keyboard": "Interactive piano keyboard",
      "sequencer.title": "Sequencer",
      "sequencer.bpm": "BPM",
      "sequencer.play": "Play",
      "sequencer.stop": "Stop",
      "sequencer.clear": "Clear",
      "sequencer.export": "Export",
      "sequencer.exportSuccess": "Export successful!",
      "sequencer.exportError": "Export failed.",
      "sequencer.bpmRange": "BPM must be between 40 and 240."
    },
    de: {
      "lang.label": "Sprache und Tastatur",
      "common.value": "Wert",
      "common.stop": "Stopp",
      "app.title": "LePetitSampler",
      "app.drumTitle": "LePetitSampler",
      "app.editionSubtitle": "Chromatic Edition",
      "app.subtitle": "Lade ein auf C3 gestimmtes Sample und spiele es in verschiedenen Tonhohen.",
      "app.base": "Basis: C3",
      "edition.label": "Edition",
      "edition.chromatic": "Chromatic Edition",
      "edition.drum": "Drum Edition",
      "edition.empty": "Leere Seite vorerst.",
      "volume.label": "Lautstarke",
      "volume.global": "Gesamtlautstarke",
      "actions.loadSample": "Sample laden",
      "actions.recordSample": "Sample aufnehmen",
      "adsr.summary": "ADSR-Hullkurve",
      "adsr.enabled": "ADSR aktiviert",
      "adsr.disabled": "ADSR deaktiviert",
      "adsr.mode.adsr": "Modus: ADSR",
      "adsr.mode.direct": "Modus: Direkt",
      "adsr.helper.enabled": "Attack {attack}s, decay {decay}s, sustain {sustain}%, release {release}s.",
      "adsr.helper.direct": "Hullkurve umgangen: konstante Lautstarke beim Halten, sofortiger Stopp beim Loslassen.",
      "waveform.title": "Wellenform",
      "waveform.loopEnabled": "Loop aktiviert",
      "waveform.loopDisabled": "Loop deaktiviert",
      "waveform.resetPoints": "Punkte zurucksetzen",
      "waveform.help": "Verschiebe die Balken auf der Wellenform: <strong>Sample Start</strong> (gr\xFCn), <strong>Loop In</strong> und <strong>Loop Out</strong> (blau).",
      "waveform.helpDrum": "Verschiebe den Marker auf der Wellenform: <strong>Sample Start</strong>. Passe auch <strong>Lautstarke</strong> und <strong>Pitch</strong> des Pads an.",
      "waveform.changeSample": "Sample andern",
      "waveform.padVolume": "Volume",
      "waveform.pitch": "Pitch",
      "waveform.start": "Sample Start",
      "waveform.loopIn": "Loop In",
      "waveform.loopOut": "Loop Out",
      "waveform.empty": "Lade eine Audiodatei, um die Wellenform anzuzeigen",
      "filter.summary": "Filter",
      "filter.enabled": "Filter aktiviert",
      "filter.disabled": "Filter deaktiviert",
      "filter.mode.lp": "LP",
      "filter.mode.hp": "HP",
      "filter.freq": "Frequenz",
      "filter.reso": "Resonanz",
      "keyboard.title": "Tastatur",
      "keyboard.octaveLabel": "Oktave der Computertastatur",
      "drum.padsTitle": "Pads",
      "drum.padsHint": "",
      "drum.clickToAdd": "Klicken zum Hinzufugen",
      "sampleSource.title": "Sample hinzufugen",
      "sampleSource.padLabel": "Pad {index}",
      "sampleSource.load": "Sample laden",
      "sampleSource.record": "Sample aufnehmen",
      "recordModal.title": "Sample aufnehmen",
      "recordModal.close": "Schliessen",
      "recordModal.audioInput": "Audioeingang",
      "recordModal.refresh": "Aktualisieren",
      "recordModal.start": "Start",
      "record.recording": "Aufnahme...",
      "record.badge.ready": "BEREIT",
      "record.badge.recording": "AUFNAHME",
      "record.permission.grantedReady": "Mikrofonberechtigung erteilt. Eingang bereit.",
      "record.permission.deniedEnable": "Mikrofonberechtigung verweigert. Aktiviere sie im Browser.",
      "record.permission.request": "Mikrofonberechtigung wird angefordert...",
      "record.permission.waiting": "Warte auf Mikrofonberechtigung.",
      "record.permission.accessImpossible": "Mikrofonzugriff fehlgeschlagen ({detail}).",
      "record.permission.alreadyGrantedPreparing": "Mikrofonberechtigung bereits erteilt. Eingang wird vorbereitet...",
      "record.permission.deniedSettings": "Mikrofonberechtigung verweigert. Aktiviere sie in den Browsereinstellungen.",
      "record.permission.clickStart": "Klicke auf Start, um das Mikrofon zu autorisieren.",
      "record.permission.popupClosed": "Popup geschlossen.",
      "record.permission.notSupported": "Diese Plattform unterstutzt MediaRecorder nicht.",
      "record.status.readyToRecord": "Aufnahmebereit",
      "record.status.notSupported": "Aufnahme wird von diesem Browser nicht unterstutzt.",
      "record.status.refreshInputsError": "Audioeingange konnten nicht aktualisiert werden.",
      "record.status.selectedUnavailable": "Gewahlter Eingang nicht verfugbar, wechsle auf Standardeingang...",
      "record.status.sourceReady": "Eingang bereit ({source}).",
      "record.status.inputActive": "Aktiver Eingang: {source}.",
      "record.status.finishedLoaded": "Aufnahme beendet und geladen.",
      "record.status.processingError": "Fehler bei der Verarbeitung der Aufnahme.",
      "record.status.recordingInProgress": "Aufnahme lauft ({source})...",
      "record.status.startFailed": "Aufnahme konnte nicht gestartet werden ({detail}).",
      "record.status.listInputsError": "Audioeingange konnten nicht aufgelistet werden.",
      "device.defaultInput": "Standardeingang",
      "device.inputLabel": "Eingang {index}{suffix}",
      "sample.none": "Kein Sample geladen",
      "sample.loaded": "Sample geladen: {label}",
      "sample.decodeError": "Fehler beim Dekodieren des Samples.",
      "sample.loadBeforePlay": "Lade ein Sample, bevor du spielst.",
      "performance.title": "Meine Performance aufnehmen",
      "performance.help": "Direkte Aufnahme der Sampler-Ausgabe (physische Tastatur + Bildschirmtastatur).",
      "performance.start": "Start",
      "performance.downloadWav": "WAV herunterladen",
      "performance.downloadMp3": "MP3 herunterladen",
      "performance.badge.ready": "BEREIT",
      "performance.badge.recording": "AUFNAHME",
      "performance.toggle.open": "Offnen",
      "performance.toggle.collapse": "Einklappen",
      "performance.status.ready": "Bereit, um die Performance aufzunehmen.",
      "performance.status.capturing": "Performance-Aufnahme lauft...",
      "performance.status.noSound": "Kein Ton aufgenommen (spiele wahrend der Aufnahme Noten).",
      "performance.status.capturedBoth": "Performance aufgenommen. WAV- und MP3-Export sind bereit.",
      "performance.status.capturedWav": "Performance aufgenommen. WAV-Export ist bereit.",
      "performance.mp3.supported": "Natives MP3 wird unterstutzt: MP3-Export nach der Aufnahme verfugbar.",
      "performance.mp3.unsupported": "MP3 wird von diesem Browser nicht unterstutzt: WAV-Export verfugbar.",
      "modal.closeOnEscape": "Schliessen",
      "aria.waveform": "Sample-Wellenform",
      "aria.keyboard": "Interaktive Piano-Tastatur",
      "sequencer.title": "Sequencer",
      "sequencer.bpm": "BPM",
      "sequencer.play": "Play",
      "sequencer.stop": "Stop",
      "sequencer.clear": "Loschen",
      "sequencer.export": "Export",
      "sequencer.exportSuccess": "Export erfolgreich!",
      "sequencer.exportError": "Export fehlgeschlagen.",
      "sequencer.bpmRange": "Der BPM muss zwischen 40 und 240 liegen."
    },
    es: {
      "lang.label": "Idioma y teclado",
      "common.value": "Valor",
      "common.stop": "Parar",
      "app.title": "LePetitSampler",
      "app.drumTitle": "LePetitSampler",
      "app.editionSubtitle": "Chromatic Edition",
      "app.subtitle": "Carga una muestra afinada en C3 y tocalo en diferentes alturas.",
      "app.base": "Base: C3",
      "edition.label": "Edicion",
      "edition.chromatic": "Chromatic Edition",
      "edition.drum": "Drum Edition",
      "edition.empty": "Pagina en blanco por ahora.",
      "volume.label": "Volumen",
      "volume.global": "Volumen general",
      "actions.loadSample": "Cargar una muestra",
      "actions.recordSample": "Grabar una muestra",
      "adsr.summary": "Envolvente ADSR",
      "adsr.enabled": "ADSR activada",
      "adsr.disabled": "ADSR desactivada",
      "adsr.mode.adsr": "Modo: ADSR",
      "adsr.mode.direct": "Modo: Directo",
      "adsr.helper.enabled": "Attack {attack}s, decay {decay}s, sustain {sustain}%, release {release}s.",
      "adsr.helper.direct": "Envolvente omitida: volumen constante mientras se mantiene, parada inmediata al soltar.",
      "waveform.title": "Forma de onda",
      "waveform.loopEnabled": "Loop activado",
      "waveform.loopDisabled": "Loop desactivado",
      "waveform.resetPoints": "Restablecer puntos",
      "waveform.help": "Mueve las barras en la forma de onda: <strong>Sample Start</strong> (verde), <strong>Loop In</strong> y <strong>Loop Out</strong> (azul).",
      "waveform.helpDrum": "Desplaza el marcador en la forma de onda: <strong>Sample Start</strong>. Ajusta tambien el <strong>Volumen</strong> y el <strong>Pitch</strong> del pad.",
      "waveform.changeSample": "Cambiar el sample",
      "waveform.padVolume": "Volume",
      "waveform.pitch": "Pitch",
      "waveform.start": "Sample Start",
      "waveform.loopIn": "Loop In",
      "waveform.loopOut": "Loop Out",
      "waveform.empty": "Carga un archivo de audio para mostrar la forma de onda",
      "filter.summary": "Filtro",
      "filter.enabled": "Filtro activado",
      "filter.disabled": "Filtro desactivado",
      "filter.mode.lp": "LP",
      "filter.mode.hp": "HP",
      "filter.freq": "Frecuencia",
      "filter.reso": "Resonancia",
      "keyboard.title": "Teclado",
      "keyboard.octaveLabel": "Octava del teclado del ordenador",
      "drum.padsTitle": "Pads",
      "drum.padsHint": "",
      "drum.clickToAdd": "Clic para agregar",
      "sampleSource.title": "Agregar un sample",
      "sampleSource.padLabel": "Pad {index}",
      "sampleSource.load": "Cargar un sample",
      "sampleSource.record": "Grabar un sample",
      "recordModal.title": "Grabar una muestra",
      "recordModal.close": "Cerrar",
      "recordModal.audioInput": "Entrada de audio",
      "recordModal.refresh": "Actualizar",
      "recordModal.start": "Iniciar",
      "record.recording": "Grabando...",
      "record.badge.ready": "LISTO",
      "record.badge.recording": "GRABANDO",
      "record.permission.grantedReady": "Permiso de microfono concedido. Entrada lista.",
      "record.permission.deniedEnable": "Permiso de microfono denegado. Activalo en tu navegador.",
      "record.permission.request": "Solicitando permiso de microfono...",
      "record.permission.waiting": "Permiso de microfono pendiente.",
      "record.permission.accessImpossible": "No se pudo acceder al microfono ({detail}).",
      "record.permission.alreadyGrantedPreparing": "Permiso de microfono ya concedido. Preparando entrada...",
      "record.permission.deniedSettings": "Permiso de microfono denegado. Activalo en la configuracion del navegador.",
      "record.permission.clickStart": "Haz clic en Iniciar para autorizar el microfono.",
      "record.permission.popupClosed": "Ventana emergente cerrada.",
      "record.permission.notSupported": "Esta plataforma no admite MediaRecorder.",
      "record.status.readyToRecord": "Listo para grabar",
      "record.status.notSupported": "La grabacion no es compatible con este navegador.",
      "record.status.refreshInputsError": "No se pudieron actualizar las entradas de audio.",
      "record.status.selectedUnavailable": "La entrada seleccionada no esta disponible, cambiando a la entrada predeterminada...",
      "record.status.sourceReady": "Entrada lista ({source}).",
      "record.status.inputActive": "Entrada activa: {source}.",
      "record.status.finishedLoaded": "Grabacion terminada y cargada.",
      "record.status.processingError": "Error al procesar la grabacion.",
      "record.status.recordingInProgress": "Grabacion en curso ({source})...",
      "record.status.startFailed": "No se pudo iniciar la grabacion ({detail}).",
      "record.status.listInputsError": "No se pudieron listar las entradas de audio.",
      "device.defaultInput": "Entrada predeterminada",
      "device.inputLabel": "Entrada {index}{suffix}",
      "sample.none": "Ninguna muestra cargada",
      "sample.loaded": "Muestra cargada: {label}",
      "sample.decodeError": "Error al decodificar la muestra.",
      "sample.loadBeforePlay": "Carga una muestra antes de tocar.",
      "performance.title": "Grabar mi interpretacion",
      "performance.help": "Captura directa de la salida del sampler (teclado fisico + teclado en pantalla).",
      "performance.start": "Iniciar",
      "performance.downloadWav": "Descargar WAV",
      "performance.downloadMp3": "Descargar MP3",
      "performance.badge.ready": "LISTO",
      "performance.badge.recording": "GRABANDO",
      "performance.toggle.open": "Abrir",
      "performance.toggle.collapse": "Contraer",
      "performance.status.ready": "Listo para capturar la interpretacion.",
      "performance.status.capturing": "Captura de la interpretacion en curso...",
      "performance.status.noSound": "No se capturo audio (toca notas durante la grabacion).",
      "performance.status.capturedBoth": "Interpretacion capturada. Exportaciones WAV y MP3 listas.",
      "performance.status.capturedWav": "Interpretacion capturada. Exportacion WAV lista.",
      "performance.mp3.supported": "MP3 nativo compatible: exportacion MP3 disponible tras la grabacion.",
      "performance.mp3.unsupported": "MP3 no compatible en este navegador: exportacion WAV disponible.",
      "modal.closeOnEscape": "Cerrar",
      "aria.waveform": "Forma de onda de la muestra",
      "aria.keyboard": "Teclado de piano interactivo",
      "sequencer.title": "Secuenciador",
      "sequencer.bpm": "BPM",
      "sequencer.play": "Play",
      "sequencer.stop": "Stop",
      "sequencer.clear": "Borrar",
      "sequencer.export": "Exportar",
      "sequencer.exportSuccess": "Exportacion exitosa!",
      "sequencer.exportError": "Error en la exportacion.",
      "sequencer.bpmRange": "El BPM debe estar entre 40 y 240."
    },
    it: {
      "lang.label": "Lingua e tastiera",
      "common.value": "Valore",
      "common.stop": "Stop",
      "app.title": "LePetitSampler",
      "app.drumTitle": "LePetitSampler",
      "app.editionSubtitle": "Chromatic Edition",
      "app.subtitle": "Carica un campione accordato in C3 e suonalo a diverse altezze.",
      "app.base": "Base: C3",
      "edition.label": "Edizione",
      "edition.chromatic": "Chromatic Edition",
      "edition.drum": "Drum Edition",
      "edition.empty": "Pagina vuota per ora.",
      "volume.label": "Volume",
      "volume.global": "Volume generale",
      "actions.loadSample": "Carica un campione",
      "actions.recordSample": "Registra un campione",
      "adsr.summary": "Inviluppo ADSR",
      "adsr.enabled": "ADSR attivo",
      "adsr.disabled": "ADSR disattivo",
      "adsr.mode.adsr": "Modalita: ADSR",
      "adsr.mode.direct": "Modalita: Diretta",
      "adsr.helper.enabled": "Attack {attack}s, decay {decay}s, sustain {sustain}%, release {release}s.",
      "adsr.helper.direct": "Inviluppo bypassato: volume costante mentre il tasto e premuto, stop immediato al rilascio.",
      "waveform.title": "Forma d'onda",
      "waveform.loopEnabled": "Loop attivo",
      "waveform.loopDisabled": "Loop disattivo",
      "waveform.resetPoints": "Reimposta punti",
      "waveform.help": "Sposta le barre sulla forma d'onda: <strong>Sample Start</strong> (verde), <strong>Loop In</strong> e <strong>Loop Out</strong> (blu).",
      "waveform.helpDrum": "Sposta il marcatore sulla forma d'onda: <strong>Sample Start</strong>. Regola anche <strong>Volume</strong> e <strong>Pitch</strong> del pad.",
      "waveform.changeSample": "Cambia il sample",
      "waveform.padVolume": "Volume",
      "waveform.pitch": "Pitch",
      "waveform.start": "Sample Start",
      "waveform.loopIn": "Loop In",
      "waveform.loopOut": "Loop Out",
      "waveform.empty": "Carica un file audio per visualizzare la forma d'onda",
      "filter.summary": "Filtro",
      "filter.enabled": "Filtro attivo",
      "filter.disabled": "Filtro disattivo",
      "filter.mode.lp": "LP",
      "filter.mode.hp": "HP",
      "filter.freq": "Frequenza",
      "filter.reso": "Risonanza",
      "keyboard.title": "Tastiera",
      "keyboard.octaveLabel": "Ottava della tastiera del computer",
      "drum.padsTitle": "Pads",
      "drum.padsHint": "",
      "drum.clickToAdd": "Clicca per aggiungere",
      "sampleSource.title": "Aggiungi un sample",
      "sampleSource.padLabel": "Pad {index}",
      "sampleSource.load": "Carica un sample",
      "sampleSource.record": "Registra un sample",
      "recordModal.title": "Registra un campione",
      "recordModal.close": "Chiudi",
      "recordModal.audioInput": "Ingresso audio",
      "recordModal.refresh": "Aggiorna",
      "recordModal.start": "Avvia",
      "record.recording": "Registrazione...",
      "record.badge.ready": "PRONTO",
      "record.badge.recording": "REGISTRAZIONE",
      "record.permission.grantedReady": "Permesso microfono concesso. Ingresso pronto.",
      "record.permission.deniedEnable": "Permesso microfono negato. Abilitalo nel browser.",
      "record.permission.request": "Richiesta permesso microfono...",
      "record.permission.waiting": "Permesso microfono in attesa.",
      "record.permission.accessImpossible": "Accesso al microfono non riuscito ({detail}).",
      "record.permission.alreadyGrantedPreparing": "Permesso microfono gia concesso. Preparazione ingresso...",
      "record.permission.deniedSettings": "Permesso microfono negato. Abilitalo nelle impostazioni del browser.",
      "record.permission.clickStart": "Clicca su Avvia per autorizzare il microfono.",
      "record.permission.popupClosed": "Popup chiuso.",
      "record.permission.notSupported": "Questa piattaforma non supporta MediaRecorder.",
      "record.status.readyToRecord": "Pronto per registrare",
      "record.status.notSupported": "Registrazione non supportata su questo browser.",
      "record.status.refreshInputsError": "Impossibile aggiornare gli ingressi audio.",
      "record.status.selectedUnavailable": "Ingresso selezionato non disponibile, passaggio all'ingresso predefinito...",
      "record.status.sourceReady": "Ingresso pronto ({source}).",
      "record.status.inputActive": "Ingresso attivo: {source}.",
      "record.status.finishedLoaded": "Registrazione completata e caricata.",
      "record.status.processingError": "Errore durante l'elaborazione della registrazione.",
      "record.status.recordingInProgress": "Registrazione in corso ({source})...",
      "record.status.startFailed": "Impossibile avviare la registrazione ({detail}).",
      "record.status.listInputsError": "Impossibile elencare gli ingressi audio.",
      "device.defaultInput": "Ingresso predefinito",
      "device.inputLabel": "Ingresso {index}{suffix}",
      "sample.none": "Nessun campione caricato",
      "sample.loaded": "Campione caricato: {label}",
      "sample.decodeError": "Errore di decodifica del campione.",
      "sample.loadBeforePlay": "Carica un campione prima di suonare.",
      "performance.title": "Registra la mia performance",
      "performance.help": "Acquisizione diretta dell'uscita del sampler (tastiera fisica + tastiera a schermo).",
      "performance.start": "Avvia",
      "performance.downloadWav": "Scarica WAV",
      "performance.downloadMp3": "Scarica MP3",
      "performance.badge.ready": "PRONTO",
      "performance.badge.recording": "REGISTRAZIONE",
      "performance.toggle.open": "Apri",
      "performance.toggle.collapse": "Comprimi",
      "performance.status.ready": "Pronto per acquisire la performance.",
      "performance.status.capturing": "Acquisizione performance in corso...",
      "performance.status.noSound": "Nessun audio acquisito (suona note durante la registrazione).",
      "performance.status.capturedBoth": "Performance acquisita. Esportazioni WAV e MP3 pronte.",
      "performance.status.capturedWav": "Performance acquisita. Esportazione WAV pronta.",
      "performance.mp3.supported": "MP3 nativo supportato: esportazione MP3 disponibile dopo la registrazione.",
      "performance.mp3.unsupported": "MP3 non supportato in questo browser: esportazione WAV disponibile.",
      "modal.closeOnEscape": "Chiudi",
      "aria.waveform": "Forma d'onda del campione",
      "aria.keyboard": "Tastiera pianoforte interattiva",
      "sequencer.title": "Sequencer",
      "sequencer.bpm": "BPM",
      "sequencer.play": "Play",
      "sequencer.stop": "Stop",
      "sequencer.clear": "Cancella",
      "sequencer.export": "Esporta",
      "sequencer.exportSuccess": "Esportazione riuscita!",
      "sequencer.exportError": "Esportazione fallita.",
      "sequencer.bpmRange": "Il BPM deve essere compreso tra 40 e 240."
    },
    pt: {
      "lang.label": "Idioma e teclado",
      "common.value": "Valor",
      "common.stop": "Parar",
      "app.title": "LePetitSampler",
      "app.drumTitle": "LePetitSampler",
      "app.editionSubtitle": "Chromatic Edition",
      "app.subtitle": "Carrega um sample afinado em C3 e toca-o em diferentes alturas.",
      "app.base": "Base: C3",
      "edition.label": "Edicao",
      "edition.chromatic": "Chromatic Edition",
      "edition.drum": "Drum Edition",
      "edition.empty": "Pagina em branco por enquanto.",
      "volume.label": "Volume",
      "volume.global": "Volume geral",
      "actions.loadSample": "Carregar um sample",
      "actions.recordSample": "Gravar um sample",
      "adsr.summary": "Envolvente ADSR",
      "adsr.enabled": "ADSR ativada",
      "adsr.disabled": "ADSR desativada",
      "adsr.mode.adsr": "Modo: ADSR",
      "adsr.mode.direct": "Modo: Direto",
      "adsr.helper.enabled": "Attack {attack}s, decay {decay}s, sustain {sustain}%, release {release}s.",
      "adsr.helper.direct": "Envolvente ignorada: volume constante enquanto premido, paragem imediata ao libertar.",
      "waveform.title": "Forma de onda",
      "waveform.loopEnabled": "Loop ativado",
      "waveform.loopDisabled": "Loop desativado",
      "waveform.resetPoints": "Repor pontos",
      "waveform.help": "Move as barras na forma de onda: <strong>Sample Start</strong> (verde), <strong>Loop In</strong> e <strong>Loop Out</strong> (azul).",
      "waveform.helpDrum": "Move o marcador na forma de onda: <strong>Sample Start</strong>. Ajusta tambem o <strong>Volume</strong> e o <strong>Pitch</strong> do pad.",
      "waveform.changeSample": "Alterar o sample",
      "waveform.padVolume": "Volume",
      "waveform.pitch": "Pitch",
      "waveform.start": "Sample Start",
      "waveform.loopIn": "Loop In",
      "waveform.loopOut": "Loop Out",
      "waveform.empty": "Carrega um ficheiro de audio para mostrar a forma de onda",
      "filter.summary": "Filtro",
      "filter.enabled": "Filtro ativado",
      "filter.disabled": "Filtro desativado",
      "filter.mode.lp": "LP",
      "filter.mode.hp": "HP",
      "filter.freq": "Frequencia",
      "filter.reso": "Ressonancia",
      "keyboard.title": "Teclado",
      "keyboard.octaveLabel": "Oitava do teclado do computador",
      "drum.padsTitle": "Pads",
      "drum.padsHint": "",
      "drum.clickToAdd": "Clicar para adicionar",
      "sampleSource.title": "Adicionar um sample",
      "sampleSource.padLabel": "Pad {index}",
      "sampleSource.load": "Carregar um sample",
      "sampleSource.record": "Gravar um sample",
      "recordModal.title": "Gravar um sample",
      "recordModal.close": "Fechar",
      "recordModal.audioInput": "Entrada de audio",
      "recordModal.refresh": "Atualizar",
      "recordModal.start": "Iniciar",
      "record.recording": "A gravar...",
      "record.badge.ready": "PRONTO",
      "record.badge.recording": "GRAVACAO",
      "record.permission.grantedReady": "Permissao de microfone concedida. Entrada pronta.",
      "record.permission.deniedEnable": "Permissao de microfone negada. Ativa-a no navegador.",
      "record.permission.request": "A solicitar permissao de microfone...",
      "record.permission.waiting": "Permissao de microfone pendente.",
      "record.permission.accessImpossible": "Nao foi possivel aceder ao microfone ({detail}).",
      "record.permission.alreadyGrantedPreparing": "Permissao de microfone ja concedida. A preparar entrada...",
      "record.permission.deniedSettings": "Permissao de microfone negada. Ativa-a nas definicoes do navegador.",
      "record.permission.clickStart": "Clica em Iniciar para autorizar o microfone.",
      "record.permission.popupClosed": "Janela fechada.",
      "record.permission.notSupported": "Esta plataforma nao suporta MediaRecorder.",
      "record.status.readyToRecord": "Pronto para gravar",
      "record.status.notSupported": "Gravacao nao suportada neste navegador.",
      "record.status.refreshInputsError": "Nao foi possivel atualizar as entradas de audio.",
      "record.status.selectedUnavailable": "Entrada selecionada indisponivel, a mudar para a entrada predefinida...",
      "record.status.sourceReady": "Entrada pronta ({source}).",
      "record.status.inputActive": "Entrada ativa: {source}.",
      "record.status.finishedLoaded": "Gravacao terminada e carregada.",
      "record.status.processingError": "Erro ao processar a gravacao.",
      "record.status.recordingInProgress": "Gravacao em curso ({source})...",
      "record.status.startFailed": "Nao foi possivel iniciar a gravacao ({detail}).",
      "record.status.listInputsError": "Nao foi possivel listar as entradas de audio.",
      "device.defaultInput": "Entrada predefinida",
      "device.inputLabel": "Entrada {index}{suffix}",
      "sample.none": "Nenhum sample carregado",
      "sample.loaded": "Sample carregado: {label}",
      "sample.decodeError": "Erro ao descodificar o sample.",
      "sample.loadBeforePlay": "Carrega um sample antes de tocar.",
      "performance.title": "Gravar a minha performance",
      "performance.help": "Captura direta da saida do sampler (teclado fisico + teclado no ecra).",
      "performance.start": "Iniciar",
      "performance.downloadWav": "Transferir WAV",
      "performance.downloadMp3": "Transferir MP3",
      "performance.badge.ready": "PRONTO",
      "performance.badge.recording": "GRAVACAO",
      "performance.toggle.open": "Abrir",
      "performance.toggle.collapse": "Recolher",
      "performance.status.ready": "Pronto para capturar a performance.",
      "performance.status.capturing": "Captura da performance em curso...",
      "performance.status.noSound": "Nenhum audio capturado (toca notas durante a gravacao).",
      "performance.status.capturedBoth": "Performance capturada. Exportacoes WAV e MP3 prontas.",
      "performance.status.capturedWav": "Performance capturada. Exportacao WAV pronta.",
      "performance.mp3.supported": "MP3 nativo suportado: exportacao MP3 disponivel apos a gravacao.",
      "performance.mp3.unsupported": "MP3 nao suportado neste navegador: exportacao WAV disponivel.",
      "modal.closeOnEscape": "Fechar",
      "aria.waveform": "Forma de onda do sample",
      "aria.keyboard": "Teclado de piano interativo",
      "sequencer.title": "Sequenciador",
      "sequencer.bpm": "BPM",
      "sequencer.play": "Play",
      "sequencer.stop": "Stop",
      "sequencer.clear": "Limpar",
      "sequencer.export": "Exportar",
      "sequencer.exportSuccess": "Exportacao concluida!",
      "sequencer.exportError": "Erro na exportacao.",
      "sequencer.bpmRange": "O BPM deve estar entre 40 e 240."
    }
  };
  function preferredLayoutForLanguage(language) {
    return LANGUAGE_TO_LAYOUT[language] || "qwerty";
  }
  function t(key, params = {}) {
    const table = translations[lang.current] || translations.fr;
    const template = table[key] ?? translations.en[key] ?? translations.fr[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_match, token) => {
      const value = params[token];
      return value == null ? `{${token}}` : String(value);
    });
  }
  function applyStaticTranslations() {
    document.documentElement.lang = lang.current;
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
    const waveformCanvas3 = document.getElementById("waveform");
    if (waveformCanvas3) waveformCanvas3.setAttribute("aria-label", t("aria.waveform"));
    const keyboardRoot3 = document.getElementById("pianoKeyboard");
    if (keyboardRoot3) keyboardRoot3.setAttribute("aria-label", t("aria.keyboard"));
  }
  function applyLanguage(language, { syncLayout, onDynamicUpdate } = {}) {
    if (!SUPPORTED_LANGUAGES.includes(language)) return;
    lang.current = language;
    if (syncLayout) syncLayout(preferredLayoutForLanguage(language));
    applyStaticTranslations();
    if (onDynamicUpdate) onDynamicUpdate();
    try {
      window.localStorage.setItem("miniSamplerLanguage", language);
    } catch (_error) {
    }
  }

  // src/main-status.js
  var sampleNameEl = null;
  var recordStatusEl = null;
  var performanceStatusEl = null;
  function initStatusElements({ sampleName, recordStatus, performanceStatus }) {
    sampleNameEl = sampleName;
    recordStatusEl = recordStatus;
    performanceStatusEl = performanceStatus;
  }
  function setSampleStatus(key, params = {}) {
    statusState.sample = { key, params };
    if (sampleNameEl) sampleNameEl.textContent = t(key, params);
  }
  function setRecordStatus(key, params = {}) {
    statusState.record = { key, params };
    if (recordStatusEl) recordStatusEl.textContent = t(key, params);
  }
  function setPerformanceStatus(key, params = {}) {
    statusState.performance = { key, params };
    if (performanceStatusEl) performanceStatusEl.textContent = t(key, params);
  }
  function refreshDynamicStatus() {
    setSampleStatus(statusState.sample.key, statusState.sample.params);
    setRecordStatus(statusState.record.key, statusState.record.params);
    setPerformanceStatus(statusState.performance.key, statusState.performance.params);
  }

  // src/audio-engine.js
  var audioContext = null;
  var filterInputGain = null;
  var filterNodeA = null;
  var filterNodeB = null;
  var masterOutputGain = null;
  var performanceStreamDestination = null;
  var performanceTapNode = null;
  var performanceTapSink = null;
  var performanceTapConnected = false;
  var audioResumePromise = null;
  function getAudioContext() {
    return audioContext;
  }
  function getPerformanceStreamDestination() {
    return performanceStreamDestination;
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
        if (!perfState.isRecording) return;
        const inputBuffer = event.inputBuffer;
        const left = new Float32Array(inputBuffer.getChannelData(0));
        const right = inputBuffer.numberOfChannels > 1 ? new Float32Array(inputBuffer.getChannelData(1)) : new Float32Array(left);
        perfState.leftChunks.push(left);
        perfState.rightChunks.push(right);
        perfState.recordedSamples += left.length;
      };
      applyFilterState();
      applyOutputVolume();
    }
  }
  function setPerformanceTapConnection(connected) {
    if (!masterOutputGain || !performanceTapNode || performanceTapConnected === connected) return;
    try {
      if (connected) {
        masterOutputGain.connect(performanceTapNode);
      } else {
        masterOutputGain.disconnect(performanceTapNode);
      }
      performanceTapConnected = connected;
    } catch (_error) {
    }
  }
  async function ensureAudioRunning() {
    ensureAudioContext();
    if (!audioContext) return false;
    if (audioContext.state === "running") return true;
    if (audioContext.state === "closed") return false;
    if (!audioResumePromise) {
      audioResumePromise = audioContext.resume().catch((error) => {
        console.error(error);
      }).finally(() => {
        audioResumePromise = null;
      });
    }
    await audioResumePromise;
    return audioContext.state === "running";
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
    if (!masterOutputGain || !audioContext) return;
    masterOutputGain.gain.setValueAtTime(outputState.volume, audioContext.currentTime);
  }
  function isMidiInputHeld(midi) {
    for (const heldMidi of keys.pressedKeyToMidi.values()) {
      if (heldMidi === midi) return true;
    }
    for (const heldMidi of keys.pointerIdToMidi.values()) {
      if (heldMidi === midi) return true;
    }
    return false;
  }
  function updatePriorityMidi(releasedMidi) {
    if (releasedMidi !== wave.priorityMidi) return;
    wave.priorityMidi = null;
    for (const m of keys.activeVoices.keys()) {
      if (wave.priorityMidi === null || m < wave.priorityMidi) {
        wave.priorityMidi = m;
      }
    }
  }
  function getPlayheadNorm() {
    if (wave.priorityMidi === null || !audio.loadedBuffer || !audioContext) return null;
    const voice = keys.activeVoices.get(wave.priorityMidi);
    if (!voice) return null;
    const elapsed = (audioContext.currentTime - voice.startTime) * voice.playbackRate;
    let posInBuffer = voice.startOffset + elapsed;
    if (playbackState.loopEnabled) {
      const loopStart = playbackState.loopStartNorm * audio.loadedBuffer.duration;
      const loopEnd = playbackState.loopEndNorm * audio.loadedBuffer.duration;
      const loopLength = loopEnd - loopStart;
      if (loopLength > 0 && posInBuffer >= loopEnd) {
        posInBuffer = loopStart + (posInBuffer - loopStart) % loopLength;
      }
    }
    return clamp(posInBuffer / audio.loadedBuffer.duration, 0, 1);
  }
  function startPlayheadAnimation(canvasEl, ctx) {
    if (wave.playheadAnimId !== null) return;
    function frame() {
      if (keys.activeVoices.size === 0 || !wave.snapshot) {
        wave.playheadAnimId = null;
        if (wave.snapshot) ctx.putImageData(wave.snapshot, 0, 0);
        return;
      }
      const norm = getPlayheadNorm();
      if (norm === null) {
        wave.playheadAnimId = null;
        return;
      }
      ctx.putImageData(wave.snapshot, 0, 0);
      const width = Math.floor(canvasEl.clientWidth);
      const height = Math.floor(canvasEl.clientHeight);
      const x = norm * width;
      ctx.strokeStyle = "#ff7d3d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      wave.playheadAnimId = requestAnimationFrame(frame);
    }
    wave.playheadAnimId = requestAnimationFrame(frame);
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
  function minLoopGapNorm() {
    const duration = audio.loadedBuffer?.duration || audio.renderedBuffer?.duration || 0;
    if (duration <= 0) return 1e-3;
    return clamp(0.01 / duration, 1e-3, 0.05);
  }
  function startNote(midi, { onSampleMissing, waveformCanvas: waveformCanvas3, waveformCtx }) {
    if (!audio.loadedBuffer) {
      if (onSampleMissing) onSampleMissing();
      return;
    }
    if (keys.activeVoices.has(midi)) return;
    ensureAudioContext();
    if (audioContext.state !== "running") {
      ensureAudioRunning().then((isReady) => {
        if (isReady && !keys.activeVoices.has(midi) && isMidiInputHeld(midi)) {
          startNote(midi, { onSampleMissing, waveformCanvas: waveformCanvas3, waveformCtx });
        }
      });
      return;
    }
    normalizePlaybackState();
    const source = audioContext.createBufferSource();
    source.buffer = audio.loadedBuffer;
    source.loop = playbackState.loopEnabled;
    if (source.loop) {
      source.loopStart = playbackState.loopStartNorm * audio.loadedBuffer.duration;
      source.loopEnd = playbackState.loopEndNorm * audio.loadedBuffer.duration;
    }
    source.playbackRate.value = midiToPlaybackRate(midi);
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    if (adsrState.enabled) {
      const attackEnd = now + adsrState.attack;
      const decayEnd = attackEnd + adsrState.decay;
      const sustainTarget = Math.max(adsrState.sustain, 1e-4);
      gain.gain.setValueAtTime(1e-4, now);
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
    const inputTarget = filterState.enabled ? filterInputGain || masterOutputGain || audioContext.destination : masterOutputGain || audioContext.destination;
    gain.connect(inputTarget);
    source.onended = () => {
      const voice = keys.activeVoices.get(midi);
      if (voice && voice.source === source) {
        keys.activeVoices.delete(midi);
        setKeyActive(midi, false);
        updatePriorityMidi(midi);
      }
    };
    const startOffset = clamp(
      playbackState.sampleStartNorm * audio.loadedBuffer.duration,
      0,
      Math.max(0, audio.loadedBuffer.duration - 1e-3)
    );
    source.start(now, startOffset);
    keys.activeVoices.set(midi, {
      source,
      gain,
      startTime: now,
      startOffset,
      playbackRate: source.playbackRate.value
    });
    setKeyActive(midi, true);
    if (wave.priorityMidi === null) {
      wave.priorityMidi = midi;
    }
    startPlayheadAnimation(waveformCanvas3, waveformCtx);
  }
  function stopNote(midi) {
    const voice = keys.activeVoices.get(midi);
    if (!voice || !audioContext) {
      setKeyActive(midi, false);
      return;
    }
    const now = audioContext.currentTime;
    const param = voice.gain.gain;
    const currentGain = Math.max(param.value, 1e-4);
    param.cancelScheduledValues(now);
    param.setValueAtTime(currentGain, now);
    if (adsrState.enabled && adsrState.release > 0) {
      param.exponentialRampToValueAtTime(1e-4, now + adsrState.release);
      try {
        voice.source.stop(now + adsrState.release + 0.02);
      } catch (_err) {
      }
    } else {
      param.setValueAtTime(0, now);
      try {
        voice.source.stop(now + 5e-3);
      } catch (_err) {
      }
    }
    keys.activeVoices.delete(midi);
    updatePriorityMidi(midi);
    window.setTimeout(() => {
      if (!keys.activeVoices.has(midi)) {
        setKeyActive(midi, false);
      }
    }, 65);
  }
  function stopAllNotes() {
    for (const midi of Array.from(keys.activeVoices.keys())) {
      stopNote(midi);
    }
  }
  function isDrumPadInputHeld(padIndex) {
    for (const heldPad of keys.drumPressedKeyToPad.values()) {
      if (heldPad === padIndex) return true;
    }
    for (const heldPad of drumState.pointerIdToPadIndex.values()) {
      if (heldPad === padIndex) return true;
    }
    return false;
  }
  function setDrumPadActive(padIndex, active) {
    const padButton = document.querySelector(`[data-drum-pad-index="${padIndex}"]`);
    if (!padButton) return;
    padButton.classList.toggle("active", active);
  }
  function startDrumPad(padIndex, { onSampleMissing } = {}) {
    const pad = drumState.pads[padIndex];
    if (!pad || !pad.buffer) {
      if (onSampleMissing) onSampleMissing(padIndex);
      return;
    }
    ensureAudioContext();
    if (!audioContext) return;
    if (audioContext.state !== "running") {
      ensureAudioRunning().then((isReady) => {
        if (isReady && isDrumPadInputHeld(padIndex)) {
          startDrumPad(padIndex, { onSampleMissing });
        }
      });
      return;
    }
    const previousVoice = drumState.activeVoices.get(padIndex);
    if (previousVoice) {
      try {
        previousVoice.source.stop(audioContext.currentTime + 2e-3);
      } catch (_error) {
      }
      drumState.activeVoices.delete(padIndex);
    }
    const source = audioContext.createBufferSource();
    source.buffer = pad.buffer;
    const pitchSemitones = clamp(pad.pitchSemitones ?? 0, -24, 24);
    source.playbackRate.value = Math.pow(2, pitchSemitones / 12);
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const padVolume = clamp(pad.volume, 0, 3);
    const padAdsr = pad.adsr;
    if (padAdsr.enabled) {
      const attackEnd = now + padAdsr.attack;
      const decayEnd = attackEnd + padAdsr.decay;
      const sustainTarget = Math.max(padAdsr.sustain * padVolume, 1e-4);
      gain.gain.setValueAtTime(1e-4, now);
      if (padAdsr.attack > 0) {
        gain.gain.exponentialRampToValueAtTime(Math.max(padVolume, 1e-4), attackEnd);
      } else {
        gain.gain.setValueAtTime(Math.max(padVolume, 1e-4), now);
      }
      if (padAdsr.decay > 0) {
        gain.gain.exponentialRampToValueAtTime(sustainTarget, decayEnd);
      } else {
        gain.gain.setValueAtTime(sustainTarget, attackEnd);
      }
    } else {
      gain.gain.setValueAtTime(padVolume, now);
    }
    source.connect(gain);
    gain.connect(masterOutputGain || audioContext.destination);
    source.onended = () => {
      const voice = drumState.activeVoices.get(padIndex);
      if (voice && voice.source === source) {
        drumState.activeVoices.delete(padIndex);
        setDrumPadActive(padIndex, false);
      }
    };
    const startOffset = clamp(
      pad.sampleStartNorm * pad.buffer.duration,
      0,
      Math.max(0, pad.buffer.duration - 1e-3)
    );
    source.start(now, startOffset);
    drumState.activeVoices.set(padIndex, {
      source,
      gain,
      adsrEnabled: padAdsr.enabled,
      release: padAdsr.release
    });
    setDrumPadActive(padIndex, true);
  }
  function stopDrumPad(padIndex) {
    const voice = drumState.activeVoices.get(padIndex);
    if (!voice || !audioContext) {
      setDrumPadActive(padIndex, false);
      return;
    }
    const now = audioContext.currentTime;
    const param = voice.gain.gain;
    const currentGain = Math.max(param.value, 1e-4);
    param.cancelScheduledValues(now);
    param.setValueAtTime(currentGain, now);
    if (voice.adsrEnabled && voice.release > 0) {
      param.exponentialRampToValueAtTime(1e-4, now + voice.release);
      try {
        voice.source.stop(now + voice.release + 0.02);
      } catch (_error) {
      }
    } else {
      param.setValueAtTime(0, now);
      try {
        voice.source.stop(now + 5e-3);
      } catch (_error) {
      }
    }
    drumState.activeVoices.delete(padIndex);
    window.setTimeout(() => {
      if (!drumState.activeVoices.has(padIndex)) {
        setDrumPadActive(padIndex, false);
      }
    }, 65);
  }
  function stopAllDrumPads() {
    for (const padIndex of Array.from(drumState.activeVoices.keys())) {
      stopDrumPad(padIndex);
    }
    if (drumState.sequencerVoices) {
      for (const voice of drumState.sequencerVoices.values()) {
        try {
          voice.source.stop();
        } catch (_e) {
        }
      }
      drumState.sequencerVoices.clear();
    }
  }
  function triggerDrumPadShot(padIndex, when) {
    const pad = drumState.pads[padIndex];
    if (!pad || !pad.buffer || !audioContext) return;
    const prev = drumState.sequencerVoices?.get(padIndex);
    if (prev) {
      try {
        prev.source.stop(when);
      } catch (_e) {
      }
    }
    if (!drumState.sequencerVoices) drumState.sequencerVoices = /* @__PURE__ */ new Map();
    const source = audioContext.createBufferSource();
    source.buffer = pad.buffer;
    const pitchSemitones = clamp(pad.pitchSemitones ?? 0, -24, 24);
    source.playbackRate.value = Math.pow(2, pitchSemitones / 12);
    const gain = audioContext.createGain();
    const padVolume = clamp(pad.volume, 0, 3);
    const padAdsr = pad.adsr;
    const startTime = Math.max(when, audioContext.currentTime);
    if (padAdsr.enabled) {
      const attackEnd = startTime + padAdsr.attack;
      const decayEnd = attackEnd + padAdsr.decay;
      const sustainTarget = Math.max(padAdsr.sustain * padVolume, 1e-4);
      gain.gain.setValueAtTime(1e-4, startTime);
      if (padAdsr.attack > 0) {
        gain.gain.exponentialRampToValueAtTime(Math.max(padVolume, 1e-4), attackEnd);
      } else {
        gain.gain.setValueAtTime(Math.max(padVolume, 1e-4), startTime);
      }
      if (padAdsr.decay > 0) {
        gain.gain.exponentialRampToValueAtTime(sustainTarget, decayEnd);
      }
    } else {
      gain.gain.setValueAtTime(padVolume, startTime);
    }
    source.connect(gain);
    gain.connect(masterOutputGain || audioContext.destination);
    const startOffset = clamp(
      pad.sampleStartNorm * pad.buffer.duration,
      0,
      Math.max(0, pad.buffer.duration - 1e-3)
    );
    source.start(startTime, startOffset);
    drumState.sequencerVoices.set(padIndex, { source, gain });
    source.onended = () => {
      const voice = drumState.sequencerVoices?.get(padIndex);
      if (voice && voice.source === source) {
        drumState.sequencerVoices.delete(padIndex);
      }
    };
  }
  function setKeyActive(midi, active) {
    const keyEl = keys.keyElements.get(midi);
    if (!keyEl) return;
    keyEl.classList.toggle("active", active);
  }
  async function loadSampleFromArrayBuffer(arrayBuffer, label, { redrawWaveform: redrawWaveform2, updatePlaybackUi: updatePlaybackUi2 }) {
    ensureAudioContext();
    await ensureAudioRunning();
    stopAllNotes();
    audio.loadedBuffer = await audioContext.decodeAudioData(arrayBuffer);
    playbackState.sampleStartNorm = 0;
    playbackState.loopEnabled = false;
    playbackState.loopStartNorm = 0;
    playbackState.loopEndNorm = 1;
    wave.activeMarker = null;
    wave.pointerId = null;
    wave.priorityMidi = null;
    audio.renderedBuffer = audio.loadedBuffer;
    setSampleStatus("sample.loaded", { label });
    if (redrawWaveform2) redrawWaveform2(audio.loadedBuffer);
    if (updatePlaybackUi2) updatePlaybackUi2();
  }

  // src/waveform.js
  var waveformCanvas = null;
  var canvasCtx = null;
  function initWaveform(canvas) {
    waveformCanvas = canvas;
    canvasCtx = canvas.getContext("2d");
  }
  function getWaveformCanvas() {
    return waveformCanvas;
  }
  function getWaveformCtx() {
    return canvasCtx;
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
    wave.snapshot = null;
  }
  function drawWaveform(audioBuffer) {
    audio.renderedBuffer = audioBuffer;
    const channelData = audioBuffer.getChannelData(0);
    const width = Math.floor(waveformCanvas.clientWidth);
    const height = Math.floor(waveformCanvas.clientHeight);
    const mid = height / 2;
    const samplesPerPixel = Math.floor(channelData.length / width) || 1;
    const waveformGain = getWaveformVisualGain();
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
        const value = (channelData[start + i] ?? 0) * waveformGain;
        const clamped = clamp(value, -1, 1);
        if (clamped < min) min = clamped;
        if (clamped > max) max = clamped;
      }
      const yTop = mid + min * (mid - 10);
      const yBottom = mid + max * (mid - 10);
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
    wave.snapshot = canvasCtx.getImageData(0, 0, waveformCanvas.width, waveformCanvas.height);
  }
  function getWaveformVisualGain() {
    if (editionState.current !== "drum") return 1;
    const selectedPad = drumState.pads[drumState.selectedPadIndex];
    if (!selectedPad) return 1;
    return clamp(selectedPad.volume ?? 1, 0, 3);
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
      if (isLoopMarker && !playbackState.loopEnabled) continue;
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
    if (audio.renderedBuffer) {
      drawWaveform(audio.renderedBuffer);
    } else {
      drawEmptyWaveform();
    }
  }
  function resizeWaveformCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(320, Math.floor(waveformCanvas.clientWidth));
    const displayHeight = Math.max(180, Math.floor(waveformCanvas.clientHeight));
    waveformCanvas.width = Math.floor(displayWidth * dpr);
    waveformCanvas.height = Math.floor(displayHeight * dpr);
    canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
    canvasCtx.scale(dpr, dpr);
    if (audio.renderedBuffer) {
      drawWaveform(audio.renderedBuffer);
    } else {
      drawEmptyWaveform();
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
  function drawMiniWaveformFromStart(canvas, audioBuffer, startNorm = 0, gain = 1) {
    if (!canvas || !audioBuffer) return;
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(100, Math.floor(canvas.clientWidth || 120));
    const displayHeight = Math.max(40, Math.floor(canvas.clientHeight || 54));
    canvas.width = Math.floor(displayWidth * dpr);
    canvas.height = Math.floor(displayHeight * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    const mid = displayHeight / 2;
    const channelData = audioBuffer.getChannelData(0);
    const startIndex = Math.floor(clamp(startNorm, 0, 1) * channelData.length);
    const sampleCount = Math.max(1, channelData.length - startIndex);
    const samplesPerPixel = Math.max(1, Math.floor(sampleCount / displayWidth));
    const waveformGain = clamp(gain, 0, 3);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(displayWidth, mid);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 125, 61, 0.95)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < displayWidth; x += 1) {
      const start = startIndex + x * samplesPerPixel;
      let min = 1;
      let max = -1;
      for (let i = 0; i < samplesPerPixel; i += 1) {
        const value = (channelData[start + i] ?? 0) * waveformGain;
        const clamped = clamp(value, -1, 1);
        if (clamped < min) min = clamped;
        if (clamped > max) max = clamped;
      }
      const yTop = mid + min * (mid - 4);
      const yBottom = mid + max * (mid - 4);
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, yBottom);
    }
    ctx.stroke();
  }

  // src/adsr.js
  var adsrGraphCanvas = null;
  var adsrGraphCtx = null;
  var adsrPanel = null;
  var adsrToggleLabel = null;
  var adsrModeBadge = null;
  var adsrEnabledInput = null;
  var attackControl = null;
  var decayControl = null;
  var sustainControl = null;
  var releaseControl = null;
  var attackInput = null;
  var decayInput = null;
  var sustainInput = null;
  var releaseInput = null;
  function initAdsr(elements) {
    adsrGraphCanvas = elements.adsrGraphCanvas;
    adsrGraphCtx = adsrGraphCanvas.getContext("2d");
    adsrPanel = elements.adsrPanel;
    adsrToggleLabel = elements.adsrToggleLabel;
    adsrModeBadge = elements.adsrModeBadge;
    adsrEnabledInput = elements.adsrEnabledInput;
    attackControl = elements.attackControl;
    decayControl = elements.decayControl;
    sustainControl = elements.sustainControl;
    releaseControl = elements.releaseControl;
    attackInput = elements.attackInput;
    decayInput = elements.decayInput;
    sustainInput = elements.sustainInput;
    releaseInput = elements.releaseInput;
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
      const y = top + innerHeight / 4 * i;
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
    const releaseTime = Math.max(adsrState.release, 1e-3);
    const sustainLevel = Math.max(adsrState.sustain, 1e-4);
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
  function bindAdsrEvents() {
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
  }

  // src/filter.js
  var filterPanel = null;
  var filterToggleLabel = null;
  var filterModeLp = null;
  var filterModeHp = null;
  var filterEnabledInput = null;
  var freqControl = null;
  var resoControl = null;
  var freqInput = null;
  var resoInput = null;
  var filterGraphCanvas = null;
  var filterGraphCtx = null;
  var getAudioContextFn = null;
  function initFilter(elements, { getAudioContext: getAudioContext2 }) {
    filterPanel = elements.filterPanel;
    filterToggleLabel = elements.filterToggleLabel;
    filterModeLp = elements.filterModeLp;
    filterModeHp = elements.filterModeHp;
    filterEnabledInput = elements.filterEnabledInput;
    freqControl = elements.freqControl;
    resoControl = elements.resoControl;
    freqInput = elements.freqInput;
    resoInput = elements.resoInput;
    filterGraphCanvas = elements.filterGraphCanvas;
    filterGraphCtx = filterGraphCanvas.getContext("2d");
    getAudioContextFn = getAudioContext2;
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
    const maxLog = Math.log(2e4);
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
      const y = top + innerHeight / 4 * i;
      filterGraphCtx.beginPath();
      filterGraphCtx.moveTo(left, y);
      filterGraphCtx.lineTo(right, y);
      filterGraphCtx.stroke();
    }
    const freqGridLines = [100, 1e3, 1e4];
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
      const label = f >= 1e3 ? `${f / 1e3}k` : String(f);
      filterGraphCtx.fillText(label, x, bottom + 4);
    }
    const sr = getAudioContextFn?.()?.sampleRate || 44100;
    const numPoints = innerWidth;
    const minLog = Math.log(20);
    const maxLog = Math.log(2e4);
    const freqPoints = new Float32Array(numPoints);
    for (let i = 0; i < numPoints; i++) {
      freqPoints[i] = Math.exp(minLog + (maxLog - minLog) * (i / Math.max(numPoints - 1, 1)));
    }
    const magResponse = computeFilterMagResponse(filterState.type, filterState.freq, filterState.Q, sr, freqPoints);
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
    filterState.freq = clamp(sliderToFreq(freqControl.value), 20, 2e4);
    filterState.Q = clamp(Number.parseFloat(resoControl.value) || 1, 0.1, 30);
    syncFilterControls();
    renderFilterGraph();
  }
  function updateFilterFromManualInputs() {
    filterState.freq = clamp(Number.parseFloat(freqInput.value) || 1e3, 20, 2e4);
    filterState.Q = clamp(Number.parseFloat(resoInput.value) || 1, 0.1, 30);
    syncFilterControls();
    renderFilterGraph();
  }
  function bindFilterEvents({ applyFilterState: applyFilterState2 }) {
    [freqControl, resoControl].forEach((control) => {
      control.addEventListener("input", () => {
        updateFilterFromControls();
        applyFilterState2();
      });
      control.addEventListener("change", () => {
        updateFilterFromControls();
        applyFilterState2();
      });
    });
    [freqInput, resoInput].forEach((input) => {
      input.addEventListener("input", () => {
        updateFilterFromManualInputs();
        applyFilterState2();
      });
      input.addEventListener("change", () => {
        updateFilterFromManualInputs();
        applyFilterState2();
      });
    });
    filterEnabledInput.addEventListener("input", () => {
      filterState.enabled = filterEnabledInput.checked;
      updateFilterUiState();
      syncFilterControls();
      renderFilterGraph();
      applyFilterState2();
    });
    filterEnabledInput.addEventListener("change", () => {
      filterState.enabled = filterEnabledInput.checked;
      updateFilterUiState();
      syncFilterControls();
      renderFilterGraph();
      applyFilterState2();
    });
    filterModeLp.addEventListener("click", () => {
      filterState.type = "lowpass";
      updateFilterUiState();
      applyFilterState2();
      renderFilterGraph();
    });
    filterModeHp.addEventListener("click", () => {
      filterState.type = "highpass";
      updateFilterUiState();
      applyFilterState2();
      renderFilterGraph();
    });
  }
  function updateFilterUi() {
    updateFilterUiState();
    syncFilterControls();
  }

  // src/playback.js
  var loopEnabledInput = null;
  var loopToggleLabel = null;
  var resetPlaybackPointsButton = null;
  var sampleStartInput = null;
  var loopStartInput = null;
  var loopEndInput = null;
  var sampleStartSlider = null;
  var loopStartSlider = null;
  var loopEndSlider = null;
  function initPlayback(elements) {
    loopEnabledInput = elements.loopEnabledInput;
    loopToggleLabel = elements.loopToggleLabel;
    resetPlaybackPointsButton = elements.resetPlaybackPointsButton;
    sampleStartInput = elements.sampleStartInput;
    loopStartInput = elements.loopStartInput;
    loopEndInput = elements.loopEndInput;
    sampleStartSlider = elements.sampleStartSlider;
    loopStartSlider = elements.loopStartSlider;
    loopEndSlider = elements.loopEndSlider;
  }
  function getDurationSeconds() {
    return audio.loadedBuffer?.duration || audio.renderedBuffer?.duration || 0;
  }
  function minLoopGapNorm2() {
    const duration = getDurationSeconds();
    if (duration <= 0) return 1e-3;
    return clamp(0.01 / duration, 1e-3, 0.05);
  }
  function syncPlaybackSliders() {
    sampleStartSlider.value = String(Math.round(playbackState.sampleStartNorm * 1e3));
    loopStartSlider.value = String(Math.round(playbackState.loopStartNorm * 1e3));
    loopEndSlider.value = String(Math.round(playbackState.loopEndNorm * 1e3));
  }
  function updatePlaybackUi() {
    const duration = getDurationSeconds();
    const hasSample = audio.loadedBuffer !== null;
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
    loopStartSlider.disabled = !hasSample || loopOff;
    loopEndInput.disabled = !hasSample || loopOff;
    loopEndSlider.disabled = !hasSample || loopOff;
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
  function applyMarkerNorm(markerId, normValue) {
    const gap = minLoopGapNorm2();
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
  function bindPlaybackEvents() {
    loopEnabledInput.addEventListener("change", () => {
      playbackState.loopEnabled = loopEnabledInput.checked;
      normalizePlaybackState();
      updatePlaybackUi();
      redrawWaveform();
    });
    resetPlaybackPointsButton.addEventListener("click", () => {
      playbackState.sampleStartNorm = 0;
      playbackState.loopEnabled = false;
      playbackState.loopStartNorm = 0;
      playbackState.loopEndNorm = 1;
      wave.activeMarker = null;
      wave.pointerId = null;
      wave.priorityMidi = null;
      updatePlaybackUi();
      redrawWaveform();
    });
    sampleStartInput.addEventListener("input", () => applyPlaybackSecondsInput("sampleStart", sampleStartInput.value));
    sampleStartInput.addEventListener("change", () => applyPlaybackSecondsInput("sampleStart", sampleStartInput.value));
    loopStartInput.addEventListener("input", () => applyPlaybackSecondsInput("loopStart", loopStartInput.value));
    loopStartInput.addEventListener("change", () => applyPlaybackSecondsInput("loopStart", loopStartInput.value));
    loopEndInput.addEventListener("input", () => applyPlaybackSecondsInput("loopEnd", loopEndInput.value));
    loopEndInput.addEventListener("change", () => applyPlaybackSecondsInput("loopEnd", loopEndInput.value));
    [sampleStartSlider, loopStartSlider, loopEndSlider].forEach((slider) => {
      const handler = () => {
        const norm = Number.parseInt(slider.value, 10) / 1e3;
        if (slider === sampleStartSlider) {
          applyMarkerNorm("sampleStart", norm);
        } else if (slider === loopStartSlider) {
          applyMarkerNorm("loopStart", norm);
        } else {
          applyMarkerNorm("loopEnd", norm);
        }
      };
      slider.addEventListener("input", handler);
      slider.addEventListener("change", handler);
    });
  }

  // src/keyboard.js
  var keyboardRoot = null;
  var keyboardOctaveBtns = null;
  var startNoteFn = null;
  var stopNoteFn = null;
  var stopAllNotesFn = null;
  var startDrumPadFn = null;
  var stopDrumPadFn = null;
  var stopAllDrumPadsFn = null;
  var getWaveformCanvasFn = null;
  var getWaveformCtxFn = null;
  var getEditionPageFn = () => "chromatic";
  var isRecordModalOpenFn = () => false;
  var closeRecordModalFn = () => {
  };
  var drumLayoutKeyToPad = /* @__PURE__ */ new Map();
  function initKeyboard(elements, {
    startNote: startNote2,
    stopNote: stopNote2,
    stopAllNotes: stopAllNotes2,
    startDrumPad: startDrumPad2,
    stopDrumPad: stopDrumPad2,
    stopAllDrumPads: stopAllDrumPads2,
    getWaveformCanvas: getWaveformCanvas2,
    getWaveformCtx: getWaveformCtx2,
    getEditionPage,
    isRecordModalOpen: isRecordModalOpen2,
    closeRecordModal: closeRecordModal2
  }) {
    keyboardRoot = elements.keyboardRoot;
    keyboardOctaveBtns = elements.keyboardOctaveBtns;
    startNoteFn = startNote2;
    stopNoteFn = stopNote2;
    stopAllNotesFn = stopAllNotes2;
    startDrumPadFn = startDrumPad2;
    stopDrumPadFn = stopDrumPad2;
    stopAllDrumPadsFn = stopAllDrumPads2;
    getWaveformCanvasFn = getWaveformCanvas2;
    getWaveformCtxFn = getWaveformCtx2;
    getEditionPageFn = getEditionPage;
    isRecordModalOpenFn = isRecordModalOpen2;
    closeRecordModalFn = closeRecordModal2;
  }
  function computerKeyboardBaseMidi() {
    return 24 + keys.computerOctave * 12;
  }
  function rebuildLayoutKeyToMidi() {
    const layoutKeys = KEYBOARD_LAYOUTS[lang.layout] || [];
    const drumLayoutKeys = DRUM_KEYBOARD_LAYOUTS[lang.layout] || DRUM_KEYBOARD_LAYOUTS.qwerty;
    const baseMidi = computerKeyboardBaseMidi();
    const nextMap = /* @__PURE__ */ new Map();
    const nextDrumMap = /* @__PURE__ */ new Map();
    const keyCount = Math.min(12, layoutKeys.length);
    const drumKeyCount = Math.min(8, drumLayoutKeys.length);
    for (let idx = 0; idx < keyCount; idx += 1) {
      nextMap.set(layoutKeys[idx], baseMidi + idx);
    }
    for (let idx = 0; idx < drumKeyCount; idx += 1) {
      nextDrumMap.set(drumLayoutKeys[idx], idx);
    }
    keys.layoutKeyToMidi = nextMap;
    drumLayoutKeyToPad = nextDrumMap;
  }
  function getShortcutForMidi(midi) {
    for (const [key, mappedMidi] of keys.layoutKeyToMidi.entries()) {
      if (mappedMidi === midi) return key.toUpperCase();
    }
    return null;
  }
  function createKeyLabel(note, shortcut) {
    if (!shortcut) return note.note;
    if (keys.whiteKeyWidth <= 30) return shortcut;
    return note.type === "white" ? `${note.note} \xB7 ${shortcut}` : shortcut;
  }
  function refreshKeyboardLabels() {
    for (const note of visualNotes) {
      const keyEl = keys.keyElements.get(note.midi);
      if (!keyEl) continue;
      const shortcut = getShortcutForMidi(note.midi);
      keyEl.textContent = createKeyLabel(note, shortcut);
      keyEl.classList.toggle("note-only", !shortcut);
      keyEl.title = shortcut ? `${note.note} (${shortcut})` : note.note;
    }
  }
  function updateKeyboardGeometry() {
    if (!keys.keybedElement) return;
    const rootStyle = window.getComputedStyle(keyboardRoot);
    const paddingX = parseFloat(rootStyle.paddingLeft) + parseFloat(rootStyle.paddingRight);
    const availableWidth = Math.max(320, keyboardRoot.clientWidth - paddingX);
    keys.whiteKeyWidth = Math.max(MIN_WHITE_KEY_WIDTH, Math.floor(availableWidth / whiteKeyCount));
    keys.blackKeyWidth = Math.max(14, Math.round(keys.whiteKeyWidth * BLACK_KEY_RATIO));
    let whiteIndex = 0;
    for (const note of visualNotes) {
      const keyEl = keys.keyElements.get(note.midi);
      if (!keyEl) continue;
      if (note.type === "white") {
        keyEl.style.left = `${whiteIndex * keys.whiteKeyWidth}px`;
        keyEl.style.width = `${keys.whiteKeyWidth}px`;
        whiteIndex += 1;
      } else {
        keyEl.style.left = `${whiteIndex * keys.whiteKeyWidth - Math.floor(keys.blackKeyWidth / 2)}px`;
        keyEl.style.width = `${keys.blackKeyWidth}px`;
      }
      keyEl.style.fontSize = note.type === "white" ? `${Math.max(9, Math.min(12, Math.round(keys.whiteKeyWidth * 0.24)))}px` : `${Math.max(9, Math.min(11, Math.round(keys.whiteKeyWidth * 0.24)))}px`;
    }
    keys.keybedElement.style.width = `${whiteIndex * keys.whiteKeyWidth}px`;
    refreshKeyboardLabels();
  }
  function attachPointerHandlers(keyEl, midi) {
    keyEl.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      keyEl.setPointerCapture(event.pointerId);
      keys.pointerIdToMidi.set(event.pointerId, midi);
      startNoteFn(midi, {
        waveformCanvas: getWaveformCanvasFn(),
        waveformCtx: getWaveformCtxFn()
      });
    });
    const releasePointer = (event) => {
      const storedMidi = keys.pointerIdToMidi.get(event.pointerId);
      if (storedMidi == null) return;
      keys.pointerIdToMidi.delete(event.pointerId);
      stopNoteFn(storedMidi);
      if (keyEl.hasPointerCapture(event.pointerId)) {
        keyEl.releasePointerCapture(event.pointerId);
      }
    };
    keyEl.addEventListener("pointerup", releasePointer);
    keyEl.addEventListener("pointercancel", releasePointer);
    keyEl.addEventListener("lostpointercapture", releasePointer);
  }
  function createKeyboard() {
    const keybed = document.createElement("div");
    keybed.className = "keybed";
    keys.keybedElement = keybed;
    for (const note of visualNotes) {
      const keyEl = document.createElement("button");
      keyEl.type = "button";
      keyEl.className = `key ${note.type === "white" ? "white-key" : "black-key"}`;
      keyEl.dataset.midi = String(note.midi);
      attachPointerHandlers(keyEl, note.midi);
      keys.keyElements.set(note.midi, keyEl);
      keybed.appendChild(keyEl);
    }
    keyboardRoot.innerHTML = "";
    keyboardRoot.appendChild(keybed);
    updateKeyboardGeometry();
  }
  function clearAllPressedStates() {
    keys.pressedKeyToMidi.clear();
    keys.drumPressedKeyToPad.clear();
    keys.pointerIdToMidi.clear();
    stopAllNotesFn();
    stopAllDrumPadsFn();
  }
  function setKeyboardLayout(layoutName) {
    if (!(layoutName in KEYBOARD_LAYOUTS)) return;
    lang.layout = layoutName;
    clearAllPressedStates();
    rebuildLayoutKeyToMidi();
    refreshKeyboardLabels();
  }
  function setComputerKeyboardOctave(nextValue) {
    const parsed = Number.parseInt(nextValue, 10);
    if (![1, 2, 3].includes(parsed)) return;
    keys.computerOctave = parsed;
    keyboardOctaveBtns.forEach((btn) => {
      btn.classList.toggle("active", Number.parseInt(btn.dataset.octave, 10) === parsed);
    });
    clearAllPressedStates();
    rebuildLayoutKeyToMidi();
    refreshKeyboardLabels();
  }
  function handleKeyDown(event) {
    if (event.key === "Escape" && isRecordModalOpenFn()) {
      closeRecordModalFn();
      return;
    }
    if (isRecordModalOpenFn()) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (getEditionPageFn() === "drum") {
      handleDrumKeyDown(event);
      return;
    }
    const pressedKey = event.key?.length === 1 ? event.key.toLowerCase() : null;
    if (!pressedKey) return;
    const midi = keys.layoutKeyToMidi.get(pressedKey);
    if (midi == null) return;
    event.preventDefault();
    if (event.repeat || keys.pressedKeyToMidi.has(pressedKey)) return;
    keys.pressedKeyToMidi.set(pressedKey, midi);
    startNoteFn(midi, {
      waveformCanvas: getWaveformCanvasFn(),
      waveformCtx: getWaveformCtxFn()
    });
  }
  function handleKeyUp(event) {
    if (getEditionPageFn() === "drum") {
      handleDrumKeyUp(event);
      return;
    }
    const releasedKey = event.key?.length === 1 ? event.key.toLowerCase() : null;
    if (!releasedKey) return;
    const midi = keys.pressedKeyToMidi.get(releasedKey);
    if (midi == null) return;
    keys.pressedKeyToMidi.delete(releasedKey);
    stopNoteFn(midi);
  }
  function handleBlur() {
    clearAllPressedStates();
  }
  function bindKeyboardOctaveEvents() {
    keyboardOctaveBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        setComputerKeyboardOctave(btn.dataset.octave);
      });
    });
  }
  function handleDrumKeyDown(event) {
    const pressedKey = event.key?.length === 1 ? event.key.toLowerCase() : null;
    if (!pressedKey) return;
    const padIndex = drumLayoutKeyToPad.get(pressedKey);
    if (padIndex == null) return;
    event.preventDefault();
    if (event.repeat || keys.drumPressedKeyToPad.has(pressedKey)) return;
    keys.drumPressedKeyToPad.set(pressedKey, padIndex);
    startDrumPadFn(padIndex);
  }
  function handleDrumKeyUp(event) {
    const releasedKey = event.key?.length === 1 ? event.key.toLowerCase() : null;
    if (!releasedKey) return;
    const padIndex = keys.drumPressedKeyToPad.get(releasedKey);
    if (padIndex == null) return;
    keys.drumPressedKeyToPad.delete(releasedKey);
    stopDrumPadFn(padIndex);
  }

  // src/record.js
  var recordModal = null;
  var closeRecordModalButton = null;
  var refreshRecordInputsButton = null;
  var recordInputSelect = null;
  var recordStartButton = null;
  var recordStopButton = null;
  var recordTimer = null;
  var recordPermissionHint = null;
  var loadSampleFn = null;
  var stopAllNotesFn2 = null;
  function initRecord(elements, { loadSample, stopAllNotes: stopAllNotes2 }) {
    recordModal = elements.recordModal;
    closeRecordModalButton = elements.closeRecordModalButton;
    refreshRecordInputsButton = elements.refreshRecordInputsButton;
    recordInputSelect = elements.recordInputSelect;
    recordStartButton = elements.recordStartButton;
    recordStopButton = elements.recordStopButton;
    recordTimer = elements.recordTimer;
    recordPermissionHint = elements.recordPermissionHint;
    loadSampleFn = loadSample;
    stopAllNotesFn2 = stopAllNotes2;
  }
  function isRecordModalOpen() {
    return !recordModal.classList.contains("hidden");
  }
  function setRecordPermissionHint(text) {
    recordPermissionHint.textContent = text;
  }
  function updateRecordTimer() {
    if (!recordingState.mediaRecorder || recordingState.mediaRecorder.state !== "recording") {
      recordTimer.textContent = "00:00";
      return;
    }
    const elapsed = Date.now() - recordingState.startTimeMs;
    const totalSeconds = Math.max(0, Math.floor(elapsed / 1e3));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    recordTimer.textContent = `${minutes}:${seconds}`;
  }
  function updateRecordingUi() {
    const isSupported = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
    const isRecording = Boolean(recordingState.mediaRecorder && recordingState.mediaRecorder.state === "recording");
    recordStartButton.disabled = !isSupported || isRecording;
    recordStopButton.disabled = !isSupported || !isRecording;
    recordInputSelect.disabled = !isSupported || isRecording;
    refreshRecordInputsButton.disabled = !isSupported || isRecording;
    recordStartButton.textContent = isRecording ? t("record.recording") : t("recordModal.start");
    recordStartButton.classList.toggle("recording", isRecording);
    document.body.classList.toggle("is-recording", isRecording);
    if (!isSupported) {
      setRecordStatus("record.status.notSupported");
      setRecordPermissionHint(t("record.permission.notSupported"));
    }
  }
  function stopMediaStreamTracks() {
    if (!recordingState.mediaStream) return;
    for (const track of recordingState.mediaStream.getTracks()) {
      track.stop();
    }
    recordingState.mediaStream = null;
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
    const exactConstraints = selectedId ? { audio: { deviceId: { exact: selectedId } } } : { audio: true };
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
  async function queryMicrophonePermission() {
    if (!navigator.permissions?.query) {
      recordingState.micPermissionState = "unsupported";
      return recordingState.micPermissionState;
    }
    try {
      const permissionStatus = await navigator.permissions.query({ name: "microphone" });
      recordingState.micPermissionState = permissionStatus.state;
      permissionStatus.onchange = () => {
        recordingState.micPermissionState = permissionStatus.state;
        if (recordingState.micPermissionState === "granted") {
          setRecordPermissionHint(t("record.permission.grantedReady"));
        } else if (recordingState.micPermissionState === "denied") {
          setRecordPermissionHint(t("record.permission.deniedEnable"));
        }
      };
    } catch (_error) {
      recordingState.micPermissionState = "unsupported";
    }
    return recordingState.micPermissionState;
  }
  async function ensureRecordingReady(forceNewStream = false) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      updateRecordingUi();
      return false;
    }
    if (!forceNewStream && recordingState.mediaStream && recordingState.mediaStream.active) {
      return true;
    }
    try {
      setRecordPermissionHint(t("record.permission.request"));
      const nextStream = await requestAudioStreamForSelection();
      if (recordingState.mediaStream && recordingState.mediaStream !== nextStream) {
        stopMediaStreamTracks();
      }
      recordingState.mediaStream = nextStream;
      const firstTrack = recordingState.mediaStream.getAudioTracks()[0];
      recordingState.streamDeviceId = firstTrack?.getSettings?.().deviceId || "";
      await refreshAudioInputDevices();
      await queryMicrophonePermission();
      if (recordingState.micPermissionState === "granted" || recordingState.streamDeviceId) {
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
        const firstTrack = recordingState.mediaStream?.getAudioTracks?.()[0];
        const sourceName = firstTrack?.label || t("device.defaultInput").toLowerCase();
        setRecordStatus("record.status.sourceReady", { source: sourceName });
      }
      updateRecordingUi();
    });
  }
  function closeRecordModal() {
    if (recordingState.mediaRecorder && recordingState.mediaRecorder.state === "recording") {
      stopRecordingSample();
    }
    recordModal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    stopMediaStreamTracks();
    recordingState.streamDeviceId = "";
    recordTimer.textContent = "00:00";
    setRecordPermissionHint(t("record.permission.popupClosed"));
    updateRecordingUi();
  }
  async function startRecordingSample() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      updateRecordingUi();
      return;
    }
    try {
      const isReady = await ensureRecordingReady();
      if (!isReady || !recordingState.mediaStream) return;
      const mimeType = pickRecorderMimeType();
      recordingState.mediaRecorder = mimeType ? new MediaRecorder(recordingState.mediaStream, { mimeType }) : new MediaRecorder(recordingState.mediaStream);
      recordingState.chunks = [];
      recordingState.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingState.chunks.push(event.data);
        }
      };
      recordingState.mediaRecorder.onstop = async () => {
        try {
          const recordBlob = new Blob(recordingState.chunks, { type: recordingState.mediaRecorder?.mimeType || "audio/webm" });
          const buffer = await recordBlob.arrayBuffer();
          const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
          await loadSampleFn(buffer, `recording-${stamp}`);
          setRecordStatus("record.status.finishedLoaded");
        } catch (error) {
          setRecordStatus("record.status.processingError");
          console.error(error);
        } finally {
          if (recordingState.timerId) {
            window.clearInterval(recordingState.timerId);
            recordingState.timerId = null;
          }
          updateRecordTimer();
          recordingState.mediaRecorder = null;
          recordingState.chunks = [];
          updateRecordingUi();
        }
      };
      recordingState.mediaRecorder.start();
      recordingState.startTimeMs = Date.now();
      const firstTrack = recordingState.mediaStream.getAudioTracks()[0];
      const sourceName = firstTrack?.label || t("device.defaultInput").toLowerCase();
      setRecordStatus("record.status.recordingInProgress", { source: sourceName });
      updateRecordTimer();
      recordingState.timerId = window.setInterval(updateRecordTimer, 200);
      updateRecordingUi();
    } catch (error) {
      recordingState.mediaRecorder = null;
      const detail = error?.name ? `${error.name}${error.message ? `: ${error.message}` : ""}` : "unknown error";
      setRecordStatus("record.status.startFailed", { detail });
      updateRecordingUi();
      console.error(error);
    }
  }
  function stopRecordingSample() {
    if (!recordingState.mediaRecorder || recordingState.mediaRecorder.state !== "recording") return;
    recordingState.mediaRecorder.stop();
  }
  function bindRecordEvents() {
    closeRecordModalButton.addEventListener("click", closeRecordModal);
    refreshRecordInputsButton.addEventListener("click", () => {
      refreshAudioInputDevices().catch((error) => {
        setRecordStatus("record.status.refreshInputsError");
        console.error(error);
      });
    });
    recordInputSelect.addEventListener("change", () => {
      if (recordingState.mediaRecorder && recordingState.mediaRecorder.state === "recording") return;
      ensureRecordingReady(true).then((ok) => {
        if (ok) {
          const firstTrack = recordingState.mediaStream?.getAudioTracks?.()[0];
          const sourceName = firstTrack?.label || t("device.defaultInput").toLowerCase();
          setRecordStatus("record.status.inputActive", { source: sourceName });
        }
      });
    });
    recordStartButton.addEventListener("click", startRecordingSample);
    recordStopButton.addEventListener("click", stopRecordingSample);
  }
  function refreshAudioInputDevicesPublic() {
    return refreshAudioInputDevices();
  }

  // src/performance.js
  var performanceWidget = null;
  var togglePerformanceWidgetButton = null;
  var performanceStartButton = null;
  var performanceStopButton = null;
  var performanceTimer = null;
  var downloadPerformanceWav = null;
  var downloadPerformanceMp3 = null;
  var performanceMp3Hint = null;
  var ensureAudioContextFn = null;
  var getAudioContextFn2 = null;
  var getPerformanceStreamDestinationFn = null;
  var setPerformanceTapConnectionFn = null;
  function initPerformance(elements, { ensureAudioContext: ensureAudioContext2, getAudioContext: getAudioContext2, getPerformanceStreamDestination: getPerformanceStreamDestination2, setPerformanceTapConnection: setPerformanceTapConnection2 }) {
    performanceWidget = elements.performanceWidget;
    togglePerformanceWidgetButton = elements.togglePerformanceWidgetButton;
    performanceStartButton = elements.performanceStartButton;
    performanceStopButton = elements.performanceStopButton;
    performanceTimer = elements.performanceTimer;
    downloadPerformanceWav = elements.downloadPerformanceWav;
    downloadPerformanceMp3 = elements.downloadPerformanceMp3;
    performanceMp3Hint = elements.performanceMp3Hint;
    ensureAudioContextFn = ensureAudioContext2;
    getAudioContextFn2 = getAudioContext2;
    getPerformanceStreamDestinationFn = getPerformanceStreamDestination2;
    setPerformanceTapConnectionFn = setPerformanceTapConnection2;
  }
  function supportsPerformanceMp3() {
    return Boolean(window.MediaRecorder && MediaRecorder.isTypeSupported("audio/mpeg"));
  }
  function revokePerformanceDownloadUrls() {
    if (perfState.wavUrl) {
      URL.revokeObjectURL(perfState.wavUrl);
      perfState.wavUrl = "";
    }
    if (perfState.mp3Url) {
      URL.revokeObjectURL(perfState.mp3Url);
      perfState.mp3Url = "";
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
    setDownloadLinkState(downloadPerformanceWav, perfState.wavUrl, "performance.wav");
    setDownloadLinkState(downloadPerformanceMp3, perfState.mp3Url, "performance.mp3");
  }
  function updatePerformanceTimer() {
    if (!perfState.isRecording) {
      performanceTimer.textContent = "00:00";
      return;
    }
    const elapsed = Date.now() - perfState.startTimeMs;
    const totalSeconds = Math.max(0, Math.floor(elapsed / 1e3));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    performanceTimer.textContent = `${minutes}:${seconds}`;
  }
  function updatePerformanceUi() {
    performanceStartButton.disabled = perfState.isRecording;
    performanceStopButton.disabled = !perfState.isRecording;
    performanceStartButton.textContent = perfState.isRecording ? t("record.recording") : t("performance.start");
    performanceStartButton.classList.toggle("recording", perfState.isRecording);
    document.body.classList.toggle("is-recording", perfState.isRecording);
  }
  function setPerformanceWidgetCollapsed(collapsed) {
    performanceWidget.classList.toggle("collapsed", collapsed);
    togglePerformanceWidgetButton.textContent = collapsed ? t("performance.toggle.open") : t("performance.toggle.collapse");
  }
  function resetPerformanceCaptureBuffers() {
    perfState.leftChunks = [];
    perfState.rightChunks = [];
    perfState.recordedSamples = 0;
    perfState.mp3Chunks = [];
  }
  function createPerformanceMp3Recorder() {
    if (!supportsPerformanceMp3() || !getPerformanceStreamDestinationFn()) return null;
    try {
      return new MediaRecorder(getPerformanceStreamDestinationFn().stream, { mimeType: "audio/mpeg" });
    } catch (_error) {
      return null;
    }
  }
  function startPerformanceRecording() {
    ensureAudioContextFn();
    if (!getAudioContextFn2() || !getPerformanceStreamDestinationFn() || perfState.isRecording) return;
    setPerformanceWidgetCollapsed(false);
    revokePerformanceDownloadUrls();
    refreshPerformanceDownloads();
    resetPerformanceCaptureBuffers();
    perfState.mp3Recorder = createPerformanceMp3Recorder();
    if (perfState.mp3Recorder) {
      perfState.mp3Recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          perfState.mp3Chunks.push(event.data);
        }
      };
      perfState.mp3Recorder.start();
    }
    perfState.isRecording = true;
    setPerformanceTapConnectionFn(true);
    perfState.startTimeMs = Date.now();
    setPerformanceStatus("performance.status.capturing");
    updatePerformanceTimer();
    perfState.timerId = window.setInterval(updatePerformanceTimer, 200);
    updatePerformanceUi();
  }
  function stopPerformanceRecording() {
    if (!perfState.isRecording) return;
    perfState.isRecording = false;
    setPerformanceTapConnectionFn(false);
    if (perfState.timerId) {
      window.clearInterval(perfState.timerId);
      perfState.timerId = null;
    }
    updatePerformanceTimer();
    updatePerformanceUi();
    const finalize = () => {
      const sampleRate = getAudioContextFn2()?.sampleRate || 44100;
      const left = mergeFloatChunks(perfState.leftChunks, perfState.recordedSamples);
      const right = mergeFloatChunks(perfState.rightChunks, perfState.recordedSamples);
      if (left.length === 0) {
        setPerformanceStatus("performance.status.noSound");
        return;
      }
      const wavBlob = encodeWavFromStereo(left, right, sampleRate);
      perfState.wavUrl = URL.createObjectURL(wavBlob);
      if (perfState.mp3Chunks.length > 0) {
        const mp3Blob = new Blob(perfState.mp3Chunks, { type: "audio/mpeg" });
        perfState.mp3Url = URL.createObjectURL(mp3Blob);
      } else {
        perfState.mp3Url = "";
      }
      refreshPerformanceDownloads();
      setPerformanceStatus(perfState.mp3Url ? "performance.status.capturedBoth" : "performance.status.capturedWav");
    };
    if (perfState.mp3Recorder && perfState.mp3Recorder.state === "recording") {
      perfState.mp3Recorder.onstop = () => {
        perfState.mp3Recorder = null;
        finalize();
      };
      perfState.mp3Recorder.stop();
    } else {
      perfState.mp3Recorder = null;
      finalize();
    }
  }
  function refreshPerformanceMp3Hint() {
    performanceMp3Hint.textContent = supportsPerformanceMp3() ? t("performance.mp3.supported") : t("performance.mp3.unsupported");
  }
  function bindPerformanceEvents() {
    togglePerformanceWidgetButton.addEventListener("click", () => {
      const isCollapsed = performanceWidget.classList.contains("collapsed");
      setPerformanceWidgetCollapsed(!isCollapsed);
    });
    performanceStartButton.addEventListener("click", startPerformanceRecording);
    performanceStopButton.addEventListener("click", stopPerformanceRecording);
  }

  // src/sequencer.js
  var SEQUENCER_STEPS = 32;
  var SEQUENCER_ROWS = 8;
  var DEFAULT_BPM = 120;
  var LOOK_AHEAD = 0.1;
  var SCHEDULE_INTERVAL = 25;
  var EXPORT_LOOPS = 2;
  var EXPORT_TAIL = 2;
  var sequencerState = {
    bpm: DEFAULT_BPM,
    isPlaying: false,
    currentStep: -1,
    grid: Array.from({ length: SEQUENCER_ROWS }, () => new Uint8Array(SEQUENCER_STEPS)),
    schedulerTimerId: null,
    nextStepTime: 0,
    isExporting: false
  };
  var apiRef = null;
  var elementsRef = null;
  var toastTimer = null;
  function initSequencer(elements, api) {
    apiRef = api;
    elementsRef = elements;
    buildGrid(elements.gridContainer);
    bindEvents(elements);
  }
  function buildGrid(container) {
    container.innerHTML = "";
    for (let row = 0; row < SEQUENCER_ROWS; row++) {
      const rowEl = document.createElement("div");
      rowEl.className = "seq-row";
      rowEl.dataset.row = row;
      const label = document.createElement("span");
      label.className = "seq-row-label";
      label.textContent = row + 1;
      rowEl.appendChild(label);
      for (let col = 0; col < SEQUENCER_STEPS; col++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "seq-cell";
        cell.dataset.row = row;
        cell.dataset.col = col;
        if (col % 16 === 0 && col > 0) {
          cell.classList.add("seq-cell--measure-start");
        } else if (col % 4 === 0 && col > 0) {
          cell.classList.add("seq-cell--beat-start");
        }
        rowEl.appendChild(cell);
      }
      container.appendChild(rowEl);
    }
  }
  function bindEvents(elements) {
    elements.gridContainer.addEventListener("click", (e) => {
      const cell = e.target.closest(".seq-cell");
      if (!cell) return;
      const row = parseInt(cell.dataset.row, 10);
      const col = parseInt(cell.dataset.col, 10);
      sequencerState.grid[row][col] = sequencerState.grid[row][col] ? 0 : 1;
      cell.classList.toggle("seq-cell--on", Boolean(sequencerState.grid[row][col]));
    });
    elements.bpmInput.addEventListener("change", () => {
      let bpm = parseInt(elements.bpmInput.value, 10) || DEFAULT_BPM;
      if (bpm < 40 || bpm > 240) {
        bpm = clamp(bpm, 40, 240);
        showToast(t("sequencer.bpmRange"));
      }
      sequencerState.bpm = bpm;
      elements.bpmInput.value = bpm;
    });
    elements.bpmInput.addEventListener("input", () => {
      sequencerState.bpm = clamp(parseInt(elements.bpmInput.value, 10) || DEFAULT_BPM, 40, 240);
    });
    elements.playBtn.addEventListener("click", () => startSequencer());
    elements.stopBtn.addEventListener("click", () => stopSequencer());
    elements.clearBtn.addEventListener("click", () => clearGrid());
    elements.exportBtn.addEventListener("click", () => exportSequence());
    elements.toggleBtn.addEventListener("click", () => {
      toggleCollapsed(elements);
    });
    elements.panel.querySelector(".sequencer-head h2").addEventListener("click", () => {
      toggleCollapsed(elements);
    });
  }
  function toggleCollapsed(elements) {
    elements.panel.classList.toggle("seq-collapsed");
    elements.toggleBtn.textContent = elements.panel.classList.contains("seq-collapsed") ? "+" : "\u2013";
  }
  function startSequencer() {
    if (sequencerState.isPlaying) return;
    apiRef.ensureAudioRunning().then(() => {
      const ctx = apiRef.getAudioContext();
      if (!ctx) return;
      sequencerState.isPlaying = true;
      sequencerState.currentStep = -1;
      sequencerState.nextStepTime = ctx.currentTime + 0.05;
      elementsRef.playBtn.classList.add("seq-btn--active");
      scheduleStep();
    });
  }
  function stopSequencer() {
    sequencerState.isPlaying = false;
    sequencerState.currentStep = -1;
    if (sequencerState.schedulerTimerId !== null) {
      clearTimeout(sequencerState.schedulerTimerId);
      sequencerState.schedulerTimerId = null;
    }
    apiRef.stopAllDrumPads();
    if (elementsRef) {
      elementsRef.playBtn.classList.remove("seq-btn--active");
      const cells = elementsRef.gridContainer.querySelectorAll(".seq-cell.seq-cell--current");
      cells.forEach((c) => c.classList.remove("seq-cell--current"));
    }
  }
  function scheduleStep() {
    if (!sequencerState.isPlaying) return;
    const ctx = apiRef.getAudioContext();
    if (!ctx) return;
    while (sequencerState.nextStepTime < ctx.currentTime + LOOK_AHEAD) {
      sequencerState.currentStep = (sequencerState.currentStep + 1) % SEQUENCER_STEPS;
      const step = sequencerState.currentStep;
      const time = sequencerState.nextStepTime;
      for (let row = 0; row < SEQUENCER_ROWS; row++) {
        if (sequencerState.grid[row][step]) {
          apiRef.triggerDrumPadShot(row, time);
        }
      }
      const delay = Math.max(0, (time - ctx.currentTime) * 1e3);
      const capturedStep = step;
      setTimeout(() => updateStepHighlight(capturedStep), delay);
      const secondsPerStep = 60 / sequencerState.bpm / 4;
      sequencerState.nextStepTime += secondsPerStep;
    }
    sequencerState.schedulerTimerId = setTimeout(scheduleStep, SCHEDULE_INTERVAL);
  }
  function updateStepHighlight(step) {
    if (!elementsRef) return;
    const prev = elementsRef.gridContainer.querySelectorAll(".seq-cell.seq-cell--current");
    prev.forEach((c) => c.classList.remove("seq-cell--current"));
    const cells = elementsRef.gridContainer.querySelectorAll(`.seq-cell[data-col="${step}"]`);
    cells.forEach((c) => c.classList.add("seq-cell--current"));
  }
  function clearGrid() {
    for (let r = 0; r < SEQUENCER_ROWS; r++) {
      for (let c = 0; c < SEQUENCER_STEPS; c++) {
        sequencerState.grid[r][c] = 0;
      }
    }
    if (elementsRef) {
      const cells = elementsRef.gridContainer.querySelectorAll(".seq-cell");
      cells.forEach((c) => c.classList.remove("seq-cell--on"));
    }
  }
  function showToast(message) {
    let toast = document.getElementById("seqToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "seqToast";
      toast.className = "seq-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("seq-toast--visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("seq-toast--visible");
    }, 3e3);
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function exportSequence() {
    if (sequencerState.isExporting) return;
    sequencerState.isExporting = true;
    elementsRef.exportBtn.classList.add("seq-btn--loading");
    const sampleRate = 44100;
    const secondsPerStep = 60 / sequencerState.bpm / 4;
    const totalSteps = SEQUENCER_STEPS * EXPORT_LOOPS;
    const renderDuration = totalSteps * secondsPerStep + EXPORT_TAIL;
    const renderSamples = Math.ceil(renderDuration * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, renderSamples, sampleRate);
    const masterGain = offlineCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(offlineCtx.destination);
    for (let loop = 0; loop < EXPORT_LOOPS; loop++) {
      for (let col = 0; col < SEQUENCER_STEPS; col++) {
        const stepTime = (loop * SEQUENCER_STEPS + col) * secondsPerStep;
        for (let row = 0; row < SEQUENCER_ROWS; row++) {
          if (!sequencerState.grid[row][col]) continue;
          const pad = drumState.pads[row];
          if (!pad || !pad.buffer) continue;
          const source = offlineCtx.createBufferSource();
          source.buffer = pad.buffer;
          const pitchSemitones = clamp(pad.pitchSemitones ?? 0, -24, 24);
          source.playbackRate.value = Math.pow(2, pitchSemitones / 12);
          const gain = offlineCtx.createGain();
          const padVolume = clamp(pad.volume, 0, 3);
          const padAdsr = pad.adsr;
          if (padAdsr.enabled) {
            const attackEnd = stepTime + padAdsr.attack;
            const decayEnd = attackEnd + padAdsr.decay;
            const sustainTarget = Math.max(padAdsr.sustain * padVolume, 1e-4);
            gain.gain.setValueAtTime(1e-4, stepTime);
            if (padAdsr.attack > 0) {
              gain.gain.exponentialRampToValueAtTime(Math.max(padVolume, 1e-4), attackEnd);
            } else {
              gain.gain.setValueAtTime(Math.max(padVolume, 1e-4), stepTime);
            }
            if (padAdsr.decay > 0) {
              gain.gain.exponentialRampToValueAtTime(sustainTarget, decayEnd);
            }
          } else {
            gain.gain.setValueAtTime(padVolume, stepTime);
          }
          source.connect(gain);
          gain.connect(masterGain);
          const startOffset = clamp(
            pad.sampleStartNorm * pad.buffer.duration,
            0,
            Math.max(0, pad.buffer.duration - 1e-3)
          );
          source.start(stepTime, startOffset);
        }
      }
    }
    try {
      const renderedBuffer = await offlineCtx.startRendering();
      const left = renderedBuffer.getChannelData(0);
      const right = renderedBuffer.numberOfChannels > 1 ? renderedBuffer.getChannelData(1) : left;
      const wavBlob = encodeWavFromStereo(left, right, sampleRate);
      downloadBlob(wavBlob, "sequencer.wav");
      showToast(t("sequencer.exportSuccess"));
    } catch (err) {
      console.error("Sequencer export error:", err);
      showToast(t("sequencer.exportError"));
    }
    sequencerState.isExporting = false;
    elementsRef.exportBtn.classList.remove("seq-btn--loading");
  }
  function updateSequencerRowLabels() {
  }

  // src/main.js
  var fileInput = document.getElementById("sampleFile");
  var loadSampleButton = document.getElementById("loadSampleButton");
  var openRecordModalButton = document.getElementById("openRecordModalButton");
  var langBtns = document.querySelectorAll(".locale-btn[data-lang]");
  var volumeControl = document.getElementById("volumeControl");
  var volumeValue = document.getElementById("volumeValue");
  var drumVolumeControl = document.getElementById("drumVolumeControl");
  var drumVolumeValue = document.getElementById("drumVolumeValue");
  var recordModal2 = document.getElementById("recordModal");
  var waveformCanvas2 = document.getElementById("waveform");
  var waveEditorHelp = document.querySelector(".wave-editor-help");
  var changeSampleButton = document.getElementById("changeSampleButton");
  var drumPadVolumeInput = document.getElementById("drumPadVolumeInput");
  var drumPadVolumeSlider = document.getElementById("drumPadVolumeSlider");
  var drumPadPitchInput = document.getElementById("drumPadPitchInput");
  var drumPadPitchSlider = document.getElementById("drumPadPitchSlider");
  var sampleStartInput2 = document.getElementById("sampleStartInput");
  var sampleStartSlider2 = document.getElementById("sampleStartSlider");
  var keyboardRoot2 = document.getElementById("pianoKeyboard");
  var keyboardOctaveBtns2 = document.querySelectorAll(".keyboard-octave-btn");
  var performanceWidget2 = document.getElementById("performanceWidget");
  var editionSwitchBtns = document.querySelectorAll(".edition-switch-btn[data-page]");
  var editionPanels = document.querySelectorAll("[data-edition-page]");
  var drumPadButtons = Array.from(document.querySelectorAll(".drum-pad[data-drum-pad-index]"));
  var sampleSourceModal = document.getElementById("sampleSourceModal");
  var closeSampleSourceModalButton = document.getElementById("closeSampleSourceModalButton");
  var sampleSourceLoadButton = document.getElementById("sampleSourceLoadButton");
  var sampleSourceRecordButton = document.getElementById("sampleSourceRecordButton");
  var sampleSourcePadLabel = document.getElementById("sampleSourcePadLabel");
  var seqGridContainer = document.getElementById("sequencerGrid");
  var seqBpmInput = document.getElementById("seqBpmInput");
  var seqPlayBtn = document.getElementById("seqPlayBtn");
  var seqStopBtn = document.getElementById("seqStopBtn");
  var seqClearBtn = document.getElementById("seqClearBtn");
  var adsrEnabledInput2 = document.getElementById("adsrEnabled");
  var attackControl2 = document.getElementById("attackControl");
  var decayControl2 = document.getElementById("decayControl");
  var sustainControl2 = document.getElementById("sustainControl");
  var releaseControl2 = document.getElementById("releaseControl");
  var attackInput2 = document.getElementById("attackInput");
  var decayInput2 = document.getElementById("decayInput");
  var sustainInput2 = document.getElementById("sustainInput");
  var releaseInput2 = document.getElementById("releaseInput");
  var chromaticEditorSnapshot = {
    playback: {
      sampleStartNorm: playbackState.sampleStartNorm,
      loopEnabled: playbackState.loopEnabled,
      loopStartNorm: playbackState.loopStartNorm,
      loopEndNorm: playbackState.loopEndNorm
    },
    adsr: {
      enabled: adsrState.enabled,
      attack: adsrState.attack,
      decay: adsrState.decay,
      sustain: adsrState.sustain,
      release: adsrState.release
    },
    loadedBuffer: audio.loadedBuffer,
    renderedBuffer: audio.renderedBuffer
  };
  var sampleLoadTarget = {
    edition: "chromatic",
    padIndex: 0
  };
  var sampleSourcePadIndex = 0;
  initStatusElements({
    sampleName: document.getElementById("sampleName"),
    recordStatus: document.getElementById("recordStatus"),
    performanceStatus: document.getElementById("performanceStatus")
  });
  initWaveform(waveformCanvas2);
  initAdsr({
    adsrGraphCanvas: document.getElementById("adsrGraph"),
    adsrPanel: document.querySelector(".adsr-panel"),
    adsrToggleLabel: document.getElementById("adsrToggleLabel"),
    adsrModeBadge: document.getElementById("adsrModeBadge"),
    adsrEnabledInput: adsrEnabledInput2,
    attackControl: attackControl2,
    decayControl: decayControl2,
    sustainControl: sustainControl2,
    releaseControl: releaseControl2,
    attackInput: attackInput2,
    decayInput: decayInput2,
    sustainInput: sustainInput2,
    releaseInput: releaseInput2
  });
  initFilter({
    filterPanel: document.querySelector(".filter-panel"),
    filterToggleLabel: document.getElementById("filterToggleLabel"),
    filterModeLp: document.getElementById("filterModeLp"),
    filterModeHp: document.getElementById("filterModeHp"),
    filterEnabledInput: document.getElementById("filterEnabled"),
    freqControl: document.getElementById("freqControl"),
    resoControl: document.getElementById("resoControl"),
    freqInput: document.getElementById("freqInput"),
    resoInput: document.getElementById("resoInput"),
    filterGraphCanvas: document.getElementById("filterGraph")
  }, { getAudioContext });
  initPlayback({
    loopEnabledInput: document.getElementById("loopEnabled"),
    loopToggleLabel: document.getElementById("loopToggleLabel"),
    resetPlaybackPointsButton: document.getElementById("resetPlaybackPoints"),
    sampleStartInput: sampleStartInput2,
    loopStartInput: document.getElementById("loopStartInput"),
    loopEndInput: document.getElementById("loopEndInput"),
    sampleStartSlider: sampleStartSlider2,
    loopStartSlider: document.getElementById("loopStartSlider"),
    loopEndSlider: document.getElementById("loopEndSlider")
  });
  initKeyboard({ keyboardRoot: keyboardRoot2, keyboardOctaveBtns: keyboardOctaveBtns2 }, {
    startNote,
    stopNote,
    stopAllNotes,
    startDrumPad,
    stopDrumPad,
    stopAllDrumPads,
    getWaveformCanvas,
    getWaveformCtx,
    getEditionPage: () => editionState.current,
    isRecordModalOpen,
    closeRecordModal
  });
  initRecord({
    recordModal: recordModal2,
    closeRecordModalButton: document.getElementById("closeRecordModalButton"),
    refreshRecordInputsButton: document.getElementById("refreshRecordInputsButton"),
    recordInputSelect: document.getElementById("recordInputSelect"),
    recordStartButton: document.getElementById("recordStartButton"),
    recordStopButton: document.getElementById("recordStopButton"),
    recordTimer: document.getElementById("recordTimer"),
    recordPermissionHint: document.getElementById("recordPermissionHint")
  }, {
    loadSample: (buffer, label) => loadArrayBufferIntoTarget(buffer, label),
    stopAllNotes
  });
  initPerformance({
    performanceWidget: performanceWidget2,
    togglePerformanceWidgetButton: document.getElementById("togglePerformanceWidgetButton"),
    performanceStartButton: document.getElementById("performanceStartButton"),
    performanceStopButton: document.getElementById("performanceStopButton"),
    performanceTimer: document.getElementById("performanceTimer"),
    downloadPerformanceWav: document.getElementById("downloadPerformanceWav"),
    downloadPerformanceMp3: document.getElementById("downloadPerformanceMp3"),
    performanceMp3Hint: document.getElementById("performanceMp3Hint")
  }, {
    ensureAudioContext,
    getAudioContext,
    getPerformanceStreamDestination,
    setPerformanceTapConnection
  });
  initSequencer({
    panel: document.querySelector(".sequencer-panel"),
    gridContainer: seqGridContainer,
    bpmInput: seqBpmInput,
    playBtn: seqPlayBtn,
    stopBtn: seqStopBtn,
    clearBtn: seqClearBtn,
    exportBtn: document.getElementById("seqExportBtn"),
    toggleBtn: document.getElementById("seqToggleBtn")
  }, {
    ensureAudioRunning,
    getAudioContext,
    triggerDrumPadShot,
    stopAllDrumPads
  });
  function getSelectedDrumPad() {
    return drumState.pads[drumState.selectedPadIndex];
  }
  function setSampleLoadTargetForChromatic() {
    sampleLoadTarget.edition = "chromatic";
    sampleLoadTarget.padIndex = 0;
  }
  function setSampleLoadTargetForDrum(padIndex) {
    sampleLoadTarget.edition = "drum";
    sampleLoadTarget.padIndex = clamp(Number.parseInt(padIndex, 10) || 0, 0, drumState.pads.length - 1);
  }
  function syncVolumeUi() {
    const percent = Math.round(outputState.volume * 100);
    if (volumeControl) volumeControl.value = String(percent);
    if (volumeValue) volumeValue.textContent = `${percent}%`;
    if (drumVolumeControl) drumVolumeControl.value = String(percent);
    if (drumVolumeValue) drumVolumeValue.textContent = `${percent}%`;
  }
  function setMasterVolumeFromControl(control) {
    outputState.volume = clamp((Number.parseFloat(control.value) || 0) / 100, 0, 3);
    syncVolumeUi();
    applyOutputVolume();
    redrawWaveform();
  }
  function updateDrumSampleVolumeUi() {
    const selectedPad = getSelectedDrumPad();
    const percent = Math.round(clamp(selectedPad.volume, 0, 3) * 100);
    drumPadVolumeInput.value = String(percent);
    drumPadVolumeSlider.value = String(percent);
  }
  function updateDrumSampleVolumeFromControl(sourceControl) {
    const percent = clamp(Number.parseFloat(sourceControl.value) || 0, 0, 300);
    drumPadVolumeInput.value = String(Math.round(percent));
    drumPadVolumeSlider.value = String(Math.round(percent));
    const selectedPad = getSelectedDrumPad();
    selectedPad.volume = percent / 100;
    updateDrumPadButtonUi(selectedPad.index);
    if (editionState.current === "drum" && selectedPad.buffer) {
      redrawWaveform();
    }
  }
  function updateDrumPadPitchUi() {
    const selectedPad = getSelectedDrumPad();
    const semitones = Math.round(clamp(selectedPad.pitchSemitones ?? 0, -24, 24));
    drumPadPitchInput.value = String(semitones);
    drumPadPitchSlider.value = String(semitones);
  }
  function updateDrumPadPitchFromControl(sourceControl) {
    const semitones = Math.round(clamp(Number.parseFloat(sourceControl.value) || 0, -24, 24));
    drumPadPitchInput.value = String(semitones);
    drumPadPitchSlider.value = String(semitones);
    const selectedPad = getSelectedDrumPad();
    selectedPad.pitchSemitones = semitones;
  }
  function updateWaveformHelpForEdition() {
    if (!waveEditorHelp) return;
    const key = editionState.current === "drum" ? "waveform.helpDrum" : "waveform.help";
    waveEditorHelp.dataset.i18nHtml = key;
    waveEditorHelp.innerHTML = t(key);
  }
  function snapshotChromaticEditorState() {
    chromaticEditorSnapshot.playback.sampleStartNorm = playbackState.sampleStartNorm;
    chromaticEditorSnapshot.playback.loopEnabled = playbackState.loopEnabled;
    chromaticEditorSnapshot.playback.loopStartNorm = playbackState.loopStartNorm;
    chromaticEditorSnapshot.playback.loopEndNorm = playbackState.loopEndNorm;
    chromaticEditorSnapshot.adsr.enabled = adsrState.enabled;
    chromaticEditorSnapshot.adsr.attack = adsrState.attack;
    chromaticEditorSnapshot.adsr.decay = adsrState.decay;
    chromaticEditorSnapshot.adsr.sustain = adsrState.sustain;
    chromaticEditorSnapshot.adsr.release = adsrState.release;
    chromaticEditorSnapshot.loadedBuffer = audio.loadedBuffer;
    chromaticEditorSnapshot.renderedBuffer = audio.renderedBuffer;
  }
  function applyAdsrValuesToControls(adsrValues) {
    adsrEnabledInput2.checked = Boolean(adsrValues.enabled);
    attackControl2.value = Number(adsrValues.attack).toFixed(2);
    decayControl2.value = Number(adsrValues.decay).toFixed(2);
    sustainControl2.value = Number(adsrValues.sustain).toFixed(2);
    releaseControl2.value = Number(adsrValues.release).toFixed(2);
    attackInput2.value = Number(adsrValues.attack).toFixed(2);
    decayInput2.value = Number(adsrValues.decay).toFixed(2);
    sustainInput2.value = String(Math.round(clamp(adsrValues.sustain, 0, 1) * 100));
    releaseInput2.value = Number(adsrValues.release).toFixed(2);
  }
  function restoreChromaticEditorState() {
    playbackState.sampleStartNorm = chromaticEditorSnapshot.playback.sampleStartNorm;
    playbackState.loopEnabled = chromaticEditorSnapshot.playback.loopEnabled;
    playbackState.loopStartNorm = chromaticEditorSnapshot.playback.loopStartNorm;
    playbackState.loopEndNorm = chromaticEditorSnapshot.playback.loopEndNorm;
    applyAdsrValuesToControls(chromaticEditorSnapshot.adsr);
    updateAdsrStateFromInputs("slider");
    audio.loadedBuffer = chromaticEditorSnapshot.loadedBuffer;
    audio.renderedBuffer = chromaticEditorSnapshot.renderedBuffer;
    updatePlaybackUi();
    if (audio.renderedBuffer) {
      redrawWaveform();
    } else {
      drawEmptyWaveform();
    }
  }
  function drawPadEmptyWave(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(120, Math.floor(canvas.clientWidth || 160));
    const height = Math.max(48, Math.floor(canvas.clientHeight || 56));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }
  function updatePadShortcutLabels() {
    const useAzerty = lang.layout === "azerty";
    drumPadButtons.forEach((button) => {
      const shortcutLabel = button.querySelector(".drum-pad-shortcut");
      if (!shortcutLabel) return;
      const qwertyKey = button.dataset.drumKeyQwerty || "";
      const azertyKey = button.dataset.drumKeyAzerty || qwertyKey;
      shortcutLabel.textContent = useAzerty ? azertyKey : qwertyKey;
    });
  }
  function updateDrumPadButtonUi(padIndex) {
    const button = drumPadButtons.find((item) => Number.parseInt(item.dataset.drumPadIndex, 10) === padIndex);
    const pad = drumState.pads[padIndex];
    if (!button || !pad) return;
    const title = button.querySelector(".drum-pad-title");
    const waveCanvas = button.querySelector(".drum-pad-wave");
    button.classList.toggle("selected", padIndex === drumState.selectedPadIndex);
    button.classList.toggle("has-sample", Boolean(pad.buffer));
    if (title) {
      title.textContent = pad.label || `Pad ${padIndex + 1}`;
    }
    if (!waveCanvas) return;
    if (pad.buffer) {
      drawMiniWaveformFromStart(waveCanvas, pad.buffer, pad.sampleStartNorm, pad.volume);
    } else {
      drawPadEmptyWave(waveCanvas);
    }
  }
  function refreshDrumPadButtons() {
    for (let padIndex = 0; padIndex < drumState.pads.length; padIndex += 1) {
      updateDrumPadButtonUi(padIndex);
    }
    updateSequencerRowLabels();
  }
  function persistSelectedPadFromEditors() {
    if (editionState.current !== "drum") return;
    const pad = getSelectedDrumPad();
    pad.sampleStartNorm = playbackState.sampleStartNorm;
    pad.volume = clamp((Number.parseFloat(drumPadVolumeSlider.value) || 0) / 100, 0, 3);
    pad.pitchSemitones = Math.round(clamp(Number.parseFloat(drumPadPitchSlider.value) || 0, -24, 24));
    pad.adsr.enabled = adsrState.enabled;
    pad.adsr.attack = adsrState.attack;
    pad.adsr.decay = adsrState.decay;
    pad.adsr.sustain = adsrState.sustain;
    pad.adsr.release = adsrState.release;
    updateDrumPadButtonUi(pad.index);
  }
  function loadSelectedDrumPadIntoEditors() {
    const pad = getSelectedDrumPad();
    playbackState.sampleStartNorm = pad.sampleStartNorm;
    playbackState.loopEnabled = false;
    playbackState.loopStartNorm = 0;
    playbackState.loopEndNorm = 1;
    applyAdsrValuesToControls(pad.adsr);
    updateAdsrStateFromInputs("slider");
    audio.loadedBuffer = pad.buffer;
    audio.renderedBuffer = pad.buffer;
    updateDrumSampleVolumeUi();
    updateDrumPadPitchUi();
    updatePlaybackUi();
    if (pad.buffer) {
      redrawWaveform();
    } else {
      drawEmptyWaveform();
    }
  }
  function selectDrumPad(padIndex) {
    const parsed = Number.parseInt(padIndex, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed >= drumState.pads.length) return;
    if (editionState.current === "drum") {
      persistSelectedPadFromEditors();
    }
    drumState.selectedPadIndex = parsed;
    sampleSourcePadIndex = parsed;
    refreshDrumPadButtons();
    if (editionState.current === "drum") {
      setSampleLoadTargetForDrum(parsed);
      loadSelectedDrumPadIntoEditors();
    }
  }
  function openSampleSourceModalForPad(padIndex) {
    selectDrumPad(padIndex);
    sampleSourcePadIndex = padIndex;
    sampleSourcePadLabel.textContent = t("sampleSource.padLabel", { index: padIndex + 1 });
    sampleSourceModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
  function closeSampleSourceModal() {
    sampleSourceModal.classList.add("hidden");
    if (!isRecordModalOpen()) {
      document.body.classList.remove("modal-open");
    }
  }
  async function loadDrumPadFromArrayBuffer(padIndex, arrayBuffer, label) {
    ensureAudioContext();
    await ensureAudioRunning();
    const context = getAudioContext();
    if (!context) throw new Error("AudioContext unavailable");
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const pad = drumState.pads[padIndex];
    pad.buffer = decoded;
    pad.label = label;
    pad.sampleStartNorm = 0;
    setSampleStatus("sample.loaded", { label });
    updateDrumPadButtonUi(padIndex);
    if (editionState.current === "drum" && drumState.selectedPadIndex === padIndex) {
      loadSelectedDrumPadIntoEditors();
    }
  }
  function resetChromaticSampleOnDecodeError() {
    stopAllNotes();
    audio.loadedBuffer = null;
    audio.renderedBuffer = null;
    playbackState.sampleStartNorm = 0;
    playbackState.loopEnabled = false;
    playbackState.loopStartNorm = 0;
    playbackState.loopEndNorm = 1;
    wave.activeMarker = null;
    wave.pointerId = null;
    wave.priorityMidi = null;
    setSampleStatus("sample.decodeError");
    drawEmptyWaveform();
    updatePlaybackUi();
  }
  async function loadArrayBufferIntoTarget(arrayBuffer, label) {
    if (sampleLoadTarget.edition === "drum") {
      await loadDrumPadFromArrayBuffer(sampleLoadTarget.padIndex, arrayBuffer, label);
      setSampleLoadTargetForDrum(sampleLoadTarget.padIndex);
      return;
    }
    await loadSampleFromArrayBuffer(arrayBuffer, label, { redrawWaveform, updatePlaybackUi });
    setSampleLoadTargetForChromatic();
  }
  function applyDynamicTranslations() {
    refreshDynamicStatus();
    updateRecordingUi();
    updatePerformanceUi();
    updatePlaybackUi();
    updateFilterUi();
    updateWaveformHelpForEdition();
    updatePadShortcutLabels();
    refreshDrumPadButtons();
    updateAdsrStateFromInputs("slider");
    setPerformanceWidgetCollapsed(performanceWidget2.classList.contains("collapsed"));
    refreshPerformanceMp3Hint();
    redrawWaveform();
    refreshAudioInputDevicesPublic().catch(() => {
    });
    if (editionState.current === "drum") {
      sampleSourcePadLabel.textContent = t("sampleSource.padLabel", { index: drumState.selectedPadIndex + 1 });
      persistSelectedPadFromEditors();
    }
  }
  function getInitialEdition() {
    try {
      const saved = window.localStorage.getItem("miniSamplerEdition");
      if (saved === "chromatic" || saved === "drum") return saved;
    } catch (_error) {
    }
    return "chromatic";
  }
  function setEditionPage(page) {
    if (page !== "chromatic" && page !== "drum") return;
    const previousPage = editionState.current;
    if (previousPage === "chromatic" && page === "drum") {
      snapshotChromaticEditorState();
      stopAllNotes();
    }
    if (previousPage === "drum" && page === "chromatic") {
      persistSelectedPadFromEditors();
      stopAllDrumPads();
      stopSequencer();
      drumState.pointerIdToPadIndex.clear();
      keys.drumPressedKeyToPad.clear();
    }
    editionState.current = page;
    editionPanels.forEach((panel) => {
      const panelPages = (panel.dataset.editionPage || "").split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);
      const isActive = panelPages.includes(page);
      panel.classList.toggle("is-hidden-page", !isActive);
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
    editionSwitchBtns.forEach((btn) => {
      const isActive = btn.dataset.page === page;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    document.body.classList.toggle("edition-drum", page === "drum");
    document.body.classList.toggle("edition-chromatic", page === "chromatic");
    if (page === "drum") {
      setSampleLoadTargetForDrum(drumState.selectedPadIndex);
      loadSelectedDrumPadIntoEditors();
    } else {
      setSampleLoadTargetForChromatic();
      restoreChromaticEditorState();
    }
    updateWaveformHelpForEdition();
    try {
      window.localStorage.setItem("miniSamplerEdition", page);
    } catch (_error) {
    }
  }
  async function handleFileInputChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      await loadArrayBufferIntoTarget(arrayBuffer, file.name);
    } catch (error) {
      if (sampleLoadTarget.edition === "drum") {
        setSampleStatus("sample.decodeError");
        console.error(error);
      } else {
        resetChromaticSampleOnDecodeError();
        console.error(error);
      }
    } finally {
      event.target.value = "";
    }
  }
  function handleWaveformPointerDown(event) {
    if (!audio.renderedBuffer) {
      if (editionState.current === "drum") {
        openSampleSourceModalForPad(drumState.selectedPadIndex);
      } else {
        setSampleLoadTargetForChromatic();
        fileInput.click();
      }
      return;
    }
    const normX = waveformXToNorm(event.clientX);
    let markerId = getClosestWaveMarker(normX);
    if (editionState.current === "drum") {
      markerId = "sampleStart";
    } else if (!markerId) {
      markerId = playbackState.loopEnabled ? "loopStart" : "sampleStart";
    }
    waveformCanvas2.setPointerCapture(event.pointerId);
    wave.activeMarker = markerId;
    wave.pointerId = event.pointerId;
    applyMarkerNorm(markerId, normX);
    if (editionState.current === "drum") {
      persistSelectedPadFromEditors();
    }
  }
  function handleWaveformPointerMove(event) {
    if (wave.pointerId !== event.pointerId || !wave.activeMarker) return;
    const normX = waveformXToNorm(event.clientX);
    applyMarkerNorm(wave.activeMarker, normX);
    if (editionState.current === "drum") {
      persistSelectedPadFromEditors();
    }
  }
  function releaseWaveformPointer(event) {
    if (wave.pointerId !== event.pointerId) return;
    wave.activeMarker = null;
    wave.pointerId = null;
    if (waveformCanvas2.hasPointerCapture(event.pointerId)) {
      waveformCanvas2.releasePointerCapture(event.pointerId);
    }
  }
  function bindDrumPadEvents() {
    drumPadButtons.forEach((button) => {
      const padIndex = Number.parseInt(button.dataset.drumPadIndex, 10);
      button.addEventListener("pointerdown", (event) => {
        if (editionState.current !== "drum") return;
        selectDrumPad(padIndex);
        const pad = drumState.pads[padIndex];
        if (!pad.buffer) {
          openSampleSourceModalForPad(padIndex);
          return;
        }
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        drumState.pointerIdToPadIndex.set(event.pointerId, padIndex);
        startDrumPad(padIndex);
      });
      const releasePointer = (event) => {
        const storedPadIndex = drumState.pointerIdToPadIndex.get(event.pointerId);
        if (storedPadIndex == null) return;
        drumState.pointerIdToPadIndex.delete(event.pointerId);
        stopDrumPad(storedPadIndex);
        if (button.hasPointerCapture(event.pointerId)) {
          button.releasePointerCapture(event.pointerId);
        }
      };
      button.addEventListener("pointerup", releasePointer);
      button.addEventListener("pointercancel", releasePointer);
      button.addEventListener("lostpointercapture", releasePointer);
      button.addEventListener("click", (event) => {
        if (editionState.current !== "drum") return;
        if (event.detail !== 0) return;
        selectDrumPad(padIndex);
        const pad = drumState.pads[padIndex];
        if (!pad.buffer) {
          openSampleSourceModalForPad(padIndex);
          return;
        }
        startDrumPad(padIndex);
        window.setTimeout(() => stopDrumPad(padIndex), 120);
      });
    });
  }
  function bindDrumEditorSyncEvents() {
    [sampleStartInput2, sampleStartSlider2].forEach((control) => {
      control.addEventListener("input", () => {
        if (editionState.current !== "drum") return;
        persistSelectedPadFromEditors();
      });
      control.addEventListener("change", () => {
        if (editionState.current !== "drum") return;
        persistSelectedPadFromEditors();
      });
    });
    [
      drumPadVolumeInput,
      drumPadVolumeSlider,
      drumPadPitchInput,
      drumPadPitchSlider,
      adsrEnabledInput2,
      attackControl2,
      decayControl2,
      sustainControl2,
      releaseControl2,
      attackInput2,
      decayInput2,
      sustainInput2,
      releaseInput2
    ].forEach((control) => {
      control.addEventListener("input", () => {
        if (editionState.current !== "drum") return;
        persistSelectedPadFromEditors();
      });
      control.addEventListener("change", () => {
        if (editionState.current !== "drum") return;
        persistSelectedPadFromEditors();
      });
    });
  }
  fileInput.addEventListener("change", handleFileInputChange);
  langBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyLanguage(btn.dataset.lang, {
        syncLayout: setKeyboardLayout,
        onDynamicUpdate: applyDynamicTranslations
      });
      langBtns.forEach((b) => b.classList.toggle("active", b.dataset.lang === btn.dataset.lang));
    });
  });
  editionSwitchBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setEditionPage(btn.dataset.page);
    });
  });
  loadSampleButton.addEventListener("click", () => {
    setSampleLoadTargetForChromatic();
    fileInput.click();
  });
  openRecordModalButton.addEventListener("click", () => {
    setSampleLoadTargetForChromatic();
    openRecordModal();
  });
  changeSampleButton.addEventListener("click", () => {
    if (editionState.current !== "drum") return;
    openSampleSourceModalForPad(drumState.selectedPadIndex);
  });
  sampleSourceLoadButton.addEventListener("click", () => {
    setSampleLoadTargetForDrum(sampleSourcePadIndex);
    closeSampleSourceModal();
    fileInput.click();
  });
  sampleSourceRecordButton.addEventListener("click", () => {
    setSampleLoadTargetForDrum(sampleSourcePadIndex);
    closeSampleSourceModal();
    openRecordModal();
  });
  closeSampleSourceModalButton.addEventListener("click", closeSampleSourceModal);
  sampleSourceModal.addEventListener("pointerdown", (event) => {
    if (event.target === sampleSourceModal) {
      closeSampleSourceModal();
    }
  });
  if (volumeControl) {
    volumeControl.addEventListener("input", () => setMasterVolumeFromControl(volumeControl));
    volumeControl.addEventListener("change", () => setMasterVolumeFromControl(volumeControl));
  }
  if (drumVolumeControl) {
    drumVolumeControl.addEventListener("input", () => setMasterVolumeFromControl(drumVolumeControl));
    drumVolumeControl.addEventListener("change", () => setMasterVolumeFromControl(drumVolumeControl));
  }
  drumPadVolumeInput.addEventListener("input", () => updateDrumSampleVolumeFromControl(drumPadVolumeInput));
  drumPadVolumeInput.addEventListener("change", () => updateDrumSampleVolumeFromControl(drumPadVolumeInput));
  drumPadVolumeSlider.addEventListener("input", () => updateDrumSampleVolumeFromControl(drumPadVolumeSlider));
  drumPadVolumeSlider.addEventListener("change", () => updateDrumSampleVolumeFromControl(drumPadVolumeSlider));
  drumPadPitchInput.addEventListener("input", () => updateDrumPadPitchFromControl(drumPadPitchInput));
  drumPadPitchInput.addEventListener("change", () => updateDrumPadPitchFromControl(drumPadPitchInput));
  drumPadPitchSlider.addEventListener("input", () => updateDrumPadPitchFromControl(drumPadPitchSlider));
  drumPadPitchSlider.addEventListener("change", () => updateDrumPadPitchFromControl(drumPadPitchSlider));
  recordModal2.addEventListener("pointerdown", (event) => {
    if (event.target === recordModal2) closeRecordModal();
  });
  waveformCanvas2.addEventListener("pointerdown", handleWaveformPointerDown);
  waveformCanvas2.addEventListener("pointermove", handleWaveformPointerMove);
  waveformCanvas2.addEventListener("pointerup", releaseWaveformPointer);
  waveformCanvas2.addEventListener("pointercancel", releaseWaveformPointer);
  waveformCanvas2.addEventListener("lostpointercapture", releaseWaveformPointer);
  window.addEventListener("pointerdown", () => ensureAudioRunning(), { capture: true, passive: true });
  window.addEventListener("keydown", () => ensureAudioRunning(), { capture: true });
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleBlur);
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      refreshAudioInputDevicesPublic().catch((error) => console.error(error));
    });
  }
  bindDrumPadEvents();
  createKeyboard();
  setKeyboardLayout(lang.layout);
  setComputerKeyboardOctave(keys.computerOctave);
  bindKeyboardOctaveEvents();
  bindAdsrEvents();
  bindFilterEvents({ applyFilterState });
  bindPlaybackEvents();
  bindDrumEditorSyncEvents();
  bindRecordEvents();
  bindPerformanceEvents();
  resizeAdsrGraphCanvas();
  resizeFilterGraphCanvas();
  syncFilterControls();
  syncVolumeUi();
  updateFilterUi();
  renderFilterGraph();
  resizeWaveformCanvas();
  refreshDrumPadButtons();
  updatePadShortcutLabels();
  refreshPerformanceDownloads();
  setPerformanceWidgetCollapsed(true);
  setEditionPage(getInitialEdition());
  applyLanguage(lang.current, {
    syncLayout: setKeyboardLayout,
    onDynamicUpdate: applyDynamicTranslations
  });
  langBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.lang === lang.current));
  document.getElementById("recordPermissionHint").textContent = "";
  setRecordStatus("record.status.readyToRecord");
  refreshAudioInputDevicesPublic().catch((error) => {
    setRecordStatus("record.status.listInputsError");
    console.error(error);
  });
  window.addEventListener("resize", () => {
    resizeAdsrGraphCanvas();
    resizeFilterGraphCanvas();
    resizeWaveformCanvas();
    updateKeyboardGeometry();
    refreshDrumPadButtons();
    renderAdsrGraph();
    renderFilterGraph();
  });
})();
