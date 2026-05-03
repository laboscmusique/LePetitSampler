import { lang, keys, outputState, audio, playbackState, wave, adsrState, drumState, editionState } from "./state.js";
import { clamp } from "./utils.js";
import { applyLanguage, t } from "./i18n.js";
import {
  ensureAudioContext,
  ensureAudioRunning,
  applyFilterState,
  applyOutputVolume,
  loadSampleFromArrayBuffer,
  getAudioContext,
  getPerformanceStreamDestination,
  setPerformanceTapConnection,
  stopAllNotes,
  startNote,
  stopNote,
  startDrumPad,
  stopDrumPad,
  stopAllDrumPads,
  triggerDrumPadShot,
} from "./audio-engine.js";
import {
  initWaveform,
  getWaveformCanvas,
  getWaveformCtx,
  resizeWaveformCanvas,
  redrawWaveform,
  drawEmptyWaveform,
  waveformXToNorm,
  getClosestWaveMarker,
  drawMiniWaveformFromStart,
} from "./waveform.js";
import { initAdsr, resizeAdsrGraphCanvas, renderAdsrGraph, updateAdsrStateFromInputs, bindAdsrEvents } from "./adsr.js";
import { initFilter, resizeFilterGraphCanvas, renderFilterGraph, syncFilterControls, updateFilterUi, bindFilterEvents } from "./filter.js";
import { initPlayback, updatePlaybackUi, bindPlaybackEvents, applyMarkerNorm } from "./playback.js";
import {
  initKeyboard,
  createKeyboard,
  setKeyboardLayout,
  setComputerKeyboardOctave,
  updateKeyboardGeometry,
  handleKeyDown,
  handleKeyUp,
  handleBlur,
  bindKeyboardOctaveEvents,
} from "./keyboard.js";
import {
  initRecord,
  openRecordModal,
  closeRecordModal,
  isRecordModalOpen,
  updateRecordingUi,
  bindRecordEvents,
  refreshAudioInputDevicesPublic,
} from "./record.js";
import {
  initPerformance,
  updatePerformanceUi,
  setPerformanceWidgetCollapsed,
  refreshPerformanceMp3Hint,
  refreshPerformanceDownloads,
  bindPerformanceEvents,
} from "./performance.js";
import { initStatusElements, setSampleStatus, setRecordStatus, refreshDynamicStatus } from "./main-status.js";
import { initSequencer, stopSequencer, updateSequencerRowLabels } from "./sequencer.js";

const fileInput = document.getElementById("sampleFile");
const loadSampleButton = document.getElementById("loadSampleButton");
const openRecordModalButton = document.getElementById("openRecordModalButton");
const langBtns = document.querySelectorAll(".locale-btn[data-lang]");
const volumeControl = document.getElementById("volumeControl");
const volumeValue = document.getElementById("volumeValue");
const drumVolumeControl = document.getElementById("drumVolumeControl");
const drumVolumeValue = document.getElementById("drumVolumeValue");
const recordModal = document.getElementById("recordModal");
const waveformCanvas = document.getElementById("waveform");
const waveEditorHelp = document.querySelector(".wave-editor-help");
const changeSampleButton = document.getElementById("changeSampleButton");
const drumPadVolumeInput = document.getElementById("drumPadVolumeInput");
const drumPadVolumeSlider = document.getElementById("drumPadVolumeSlider");
const drumPadPitchInput = document.getElementById("drumPadPitchInput");
const drumPadPitchSlider = document.getElementById("drumPadPitchSlider");
const sampleStartInput = document.getElementById("sampleStartInput");
const sampleStartSlider = document.getElementById("sampleStartSlider");
const keyboardRoot = document.getElementById("pianoKeyboard");
const keyboardOctaveBtns = document.querySelectorAll(".keyboard-octave-btn");
const performanceWidget = document.getElementById("performanceWidget");
const editionSwitchBtns = document.querySelectorAll(".edition-switch-btn[data-page]");
const editionPanels = document.querySelectorAll("[data-edition-page]");
const drumPadButtons = Array.from(document.querySelectorAll(".drum-pad[data-drum-pad-index]"));
const sampleSourceModal = document.getElementById("sampleSourceModal");
const closeSampleSourceModalButton = document.getElementById("closeSampleSourceModalButton");
const sampleSourceLoadButton = document.getElementById("sampleSourceLoadButton");
const sampleSourceRecordButton = document.getElementById("sampleSourceRecordButton");
const sampleSourcePadLabel = document.getElementById("sampleSourcePadLabel");

const seqGridContainer = document.getElementById("sequencerGrid");
const seqBpmInput = document.getElementById("seqBpmInput");
const seqPlayBtn = document.getElementById("seqPlayBtn");
const seqStopBtn = document.getElementById("seqStopBtn");
const seqClearBtn = document.getElementById("seqClearBtn");

const adsrEnabledInput = document.getElementById("adsrEnabled");
const attackControl = document.getElementById("attackControl");
const decayControl = document.getElementById("decayControl");
const sustainControl = document.getElementById("sustainControl");
const releaseControl = document.getElementById("releaseControl");
const attackInput = document.getElementById("attackInput");
const decayInput = document.getElementById("decayInput");
const sustainInput = document.getElementById("sustainInput");
const releaseInput = document.getElementById("releaseInput");

const chromaticEditorSnapshot = {
  playback: {
    sampleStartNorm: playbackState.sampleStartNorm,
    loopEnabled: playbackState.loopEnabled,
    loopStartNorm: playbackState.loopStartNorm,
    loopEndNorm: playbackState.loopEndNorm,
  },
  adsr: {
    enabled: adsrState.enabled,
    attack: adsrState.attack,
    decay: adsrState.decay,
    sustain: adsrState.sustain,
    release: adsrState.release,
  },
  loadedBuffer: audio.loadedBuffer,
  renderedBuffer: audio.renderedBuffer,
};

const sampleLoadTarget = {
  edition: "chromatic",
  padIndex: 0,
};

let sampleSourcePadIndex = 0;

initStatusElements({
  sampleName: document.getElementById("sampleName"),
  recordStatus: document.getElementById("recordStatus"),
  performanceStatus: document.getElementById("performanceStatus"),
});

initWaveform(waveformCanvas);

initAdsr({
  adsrGraphCanvas: document.getElementById("adsrGraph"),
  adsrPanel: document.querySelector(".adsr-panel"),
  adsrToggleLabel: document.getElementById("adsrToggleLabel"),
  adsrModeBadge: document.getElementById("adsrModeBadge"),
  adsrEnabledInput,
  attackControl,
  decayControl,
  sustainControl,
  releaseControl,
  attackInput,
  decayInput,
  sustainInput,
  releaseInput,
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
  filterGraphCanvas: document.getElementById("filterGraph"),
}, { getAudioContext });

initPlayback({
  loopEnabledInput: document.getElementById("loopEnabled"),
  loopToggleLabel: document.getElementById("loopToggleLabel"),
  resetPlaybackPointsButton: document.getElementById("resetPlaybackPoints"),
  sampleStartInput,
  loopStartInput: document.getElementById("loopStartInput"),
  loopEndInput: document.getElementById("loopEndInput"),
  sampleStartSlider,
  loopStartSlider: document.getElementById("loopStartSlider"),
  loopEndSlider: document.getElementById("loopEndSlider"),
});

initKeyboard({ keyboardRoot, keyboardOctaveBtns }, {
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
  closeRecordModal,
});

initRecord({
  recordModal,
  closeRecordModalButton: document.getElementById("closeRecordModalButton"),
  refreshRecordInputsButton: document.getElementById("refreshRecordInputsButton"),
  recordInputSelect: document.getElementById("recordInputSelect"),
  recordStartButton: document.getElementById("recordStartButton"),
  recordStopButton: document.getElementById("recordStopButton"),
  recordTimer: document.getElementById("recordTimer"),
  recordPermissionHint: document.getElementById("recordPermissionHint"),
}, {
  loadSample: (buffer, label) => loadArrayBufferIntoTarget(buffer, label),
  stopAllNotes,
});

initPerformance({
  performanceWidget,
  togglePerformanceWidgetButton: document.getElementById("togglePerformanceWidgetButton"),
  performanceStartButton: document.getElementById("performanceStartButton"),
  performanceStopButton: document.getElementById("performanceStopButton"),
  performanceTimer: document.getElementById("performanceTimer"),
  downloadPerformanceWav: document.getElementById("downloadPerformanceWav"),
  downloadPerformanceMp3: document.getElementById("downloadPerformanceMp3"),
  performanceMp3Hint: document.getElementById("performanceMp3Hint"),
  }, {
  ensureAudioContext,
  getAudioContext,
  getPerformanceStreamDestination,
  setPerformanceTapConnection,
});

initSequencer({
  panel: document.querySelector(".sequencer-panel"),
  gridContainer: seqGridContainer,
  bpmInput: seqBpmInput,
  playBtn: seqPlayBtn,
  stopBtn: seqStopBtn,
  clearBtn: seqClearBtn,
  exportBtn: document.getElementById("seqExportBtn"),
  toggleBtn: document.getElementById("seqToggleBtn"),
}, {
  ensureAudioRunning,
  getAudioContext,
  triggerDrumPadShot,
  stopAllDrumPads,
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

function setSampleLoadTargetForCurrentEdition() {
  if (editionState.current === "drum") {
    setSampleLoadTargetForDrum(drumState.selectedPadIndex);
  } else {
    setSampleLoadTargetForChromatic();
  }
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
  adsrEnabledInput.checked = Boolean(adsrValues.enabled);
  attackControl.value = Number(adsrValues.attack).toFixed(2);
  decayControl.value = Number(adsrValues.decay).toFixed(2);
  sustainControl.value = Number(adsrValues.sustain).toFixed(2);
  releaseControl.value = Number(adsrValues.release).toFixed(2);
  attackInput.value = Number(adsrValues.attack).toFixed(2);
  decayInput.value = Number(adsrValues.decay).toFixed(2);
  sustainInput.value = String(Math.round(clamp(adsrValues.sustain, 0, 1) * 100));
  releaseInput.value = Number(adsrValues.release).toFixed(2);
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
  setPerformanceWidgetCollapsed(performanceWidget.classList.contains("collapsed"));
  refreshPerformanceMp3Hint();
  redrawWaveform();
  refreshAudioInputDevicesPublic().catch(() => {});

  if (editionState.current === "drum") {
    sampleSourcePadLabel.textContent = t("sampleSource.padLabel", { index: drumState.selectedPadIndex + 1 });
    persistSelectedPadFromEditors();
  }
}

function getInitialEdition() {
  try {
    const saved = window.localStorage.getItem("miniSamplerEdition");
    if (saved === "chromatic" || saved === "drum") return saved;
  } catch (_error) {}
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
    const panelPages = (panel.dataset.editionPage || "")
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
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
  } catch (_error) {}
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

  waveformCanvas.setPointerCapture(event.pointerId);
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
  if (waveformCanvas.hasPointerCapture(event.pointerId)) {
    waveformCanvas.releasePointerCapture(event.pointerId);
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
  [sampleStartInput, sampleStartSlider].forEach((control) => {
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
    adsrEnabledInput,
    attackControl,
    decayControl,
    sustainControl,
    releaseControl,
    attackInput,
    decayInput,
    sustainInput,
    releaseInput,
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
      onDynamicUpdate: applyDynamicTranslations,
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

recordModal.addEventListener("pointerdown", (event) => {
  if (event.target === recordModal) closeRecordModal();
});

waveformCanvas.addEventListener("pointerdown", handleWaveformPointerDown);
waveformCanvas.addEventListener("pointermove", handleWaveformPointerMove);
waveformCanvas.addEventListener("pointerup", releaseWaveformPointer);
waveformCanvas.addEventListener("pointercancel", releaseWaveformPointer);
waveformCanvas.addEventListener("lostpointercapture", releaseWaveformPointer);

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
  onDynamicUpdate: applyDynamicTranslations,
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
