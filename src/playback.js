import { playbackState, audio, wave } from "./state.js";
import { clamp } from "./utils.js";
import { t } from "./i18n.js";
import { normalizePlaybackState } from "./audio-engine.js";
import { redrawWaveform } from "./waveform.js";

let loopEnabledInput = null;
let loopToggleLabel = null;
let resetPlaybackPointsButton = null;
let sampleStartInput = null;
let loopStartInput = null;
let loopEndInput = null;
let sampleStartSlider = null;
let loopStartSlider = null;
let loopEndSlider = null;

export function initPlayback(elements) {
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

function minLoopGapNorm() {
  const duration = getDurationSeconds();
  if (duration <= 0) return 0.001;
  return clamp(0.01 / duration, 0.001, 0.05);
}

function syncPlaybackSliders() {
  sampleStartSlider.value = String(Math.round(playbackState.sampleStartNorm * 1000));
  loopStartSlider.value = String(Math.round(playbackState.loopStartNorm * 1000));
  loopEndSlider.value = String(Math.round(playbackState.loopEndNorm * 1000));
}

export function updatePlaybackUi() {
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

export function applyMarkerNorm(markerId, normValue) {
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

export function applyPlaybackSecondsInput(markerId, rawValue) {
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

export function bindPlaybackEvents() {
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
      const norm = Number.parseInt(slider.value, 10) / 1000;
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
