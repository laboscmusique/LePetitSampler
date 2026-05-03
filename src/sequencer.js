import { drumState } from "./state.js";
import { clamp, encodeWavFromStereo } from "./utils.js";
import { t } from "./i18n.js";

export const SEQUENCER_STEPS = 32;
export const SEQUENCER_ROWS = 8;
const DEFAULT_BPM = 120;
const LOOK_AHEAD = 0.1;
const SCHEDULE_INTERVAL = 25;
const EXPORT_LOOPS = 2;
const EXPORT_TAIL = 2;

export const sequencerState = {
  bpm: DEFAULT_BPM,
  isPlaying: false,
  currentStep: -1,
  grid: Array.from({ length: SEQUENCER_ROWS }, () => new Uint8Array(SEQUENCER_STEPS)),
  schedulerTimerId: null,
  nextStepTime: 0,
  isExporting: false,
};

let apiRef = null;
let elementsRef = null;
let toastTimer = null;

export function initSequencer(elements, api) {
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
  elements.toggleBtn.textContent = elements.panel.classList.contains("seq-collapsed") ? "+" : "–";
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

export function stopSequencer() {
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
    const secondsPerStep = 60.0 / sequencerState.bpm / 4;

    for (let row = 0; row < SEQUENCER_ROWS; row++) {
      if (sequencerState.grid[row][step]) {
        apiRef.triggerDrumPadShot(row, time, secondsPerStep);
      }
    }

    const delay = Math.max(0, (time - ctx.currentTime) * 1000);
    const capturedStep = step;
    setTimeout(() => updateStepHighlight(capturedStep), delay);

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
  }, 3000);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportSequence() {
  if (sequencerState.isExporting) return;
  sequencerState.isExporting = true;
  elementsRef.exportBtn.classList.add("seq-btn--loading");

  const sampleRate = 44100;
  const secondsPerStep = 60.0 / sequencerState.bpm / 4;
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
          const sustainTarget = Math.max(padAdsr.sustain * padVolume, 0.0001);

          gain.gain.setValueAtTime(0.0001, stepTime);
          if (padAdsr.attack > 0) {
            gain.gain.exponentialRampToValueAtTime(Math.max(padVolume, 0.0001), attackEnd);
          } else {
            gain.gain.setValueAtTime(Math.max(padVolume, 0.0001), stepTime);
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
          Math.max(0, pad.buffer.duration - 0.001),
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

export function updateSequencerRowLabels() {}
