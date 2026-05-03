import { filterState } from "./state.js";
import { clamp, sliderToFreq, freqToSlider } from "./utils.js";
import { t } from "./i18n.js";

let filterPanel = null;
let filterToggleLabel = null;
let filterModeLp = null;
let filterModeHp = null;
let filterEnabledInput = null;
let freqControl = null;
let resoControl = null;
let freqInput = null;
let resoInput = null;
let filterGraphCanvas = null;
let filterGraphCtx = null;

let getAudioContextFn = null;

export function initFilter(elements, { getAudioContext }) {
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
  getAudioContextFn = getAudioContext;
}

export function resizeFilterGraphCanvas() {
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

export function renderFilterGraph() {
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

  const sr = getAudioContextFn?.()?.sampleRate || 44100;
  const numPoints = innerWidth;
  const minLog = Math.log(20);
  const maxLog = Math.log(20000);
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

export function syncFilterControls() {
  freqControl.value = String(freqToSlider(filterState.freq));
  resoControl.value = filterState.Q.toFixed(2);
  freqInput.value = String(Math.round(filterState.freq));
  resoInput.value = filterState.Q.toFixed(1);
}

function updateFilterFromControls() {
  filterState.freq = clamp(sliderToFreq(freqControl.value), 20, 20000);
  filterState.Q = clamp(Number.parseFloat(resoControl.value) || 1, 0.1, 30);
  syncFilterControls();
  renderFilterGraph();
}

function updateFilterFromManualInputs() {
  filterState.freq = clamp(Number.parseFloat(freqInput.value) || 1000, 20, 20000);
  filterState.Q = clamp(Number.parseFloat(resoInput.value) || 1, 0.1, 30);
  syncFilterControls();
  renderFilterGraph();
}

export function bindFilterEvents({ applyFilterState }) {
  [freqControl, resoControl].forEach((control) => {
    control.addEventListener("input", () => {
      updateFilterFromControls();
      applyFilterState();
    });
    control.addEventListener("change", () => {
      updateFilterFromControls();
      applyFilterState();
    });
  });

  [freqInput, resoInput].forEach((input) => {
    input.addEventListener("input", () => {
      updateFilterFromManualInputs();
      applyFilterState();
    });
    input.addEventListener("change", () => {
      updateFilterFromManualInputs();
      applyFilterState();
    });
  });

  filterEnabledInput.addEventListener("input", () => {
    filterState.enabled = filterEnabledInput.checked;
    updateFilterUiState();
    syncFilterControls();
    renderFilterGraph();
    applyFilterState();
  });
  filterEnabledInput.addEventListener("change", () => {
    filterState.enabled = filterEnabledInput.checked;
    updateFilterUiState();
    syncFilterControls();
    renderFilterGraph();
    applyFilterState();
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
}

export function updateFilterUi() {
  updateFilterUiState();
  syncFilterControls();
}
