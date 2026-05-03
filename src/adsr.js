import { adsrState } from "./state.js";
import { clamp } from "./utils.js";
import { t } from "./i18n.js";

let adsrGraphCanvas = null;
let adsrGraphCtx = null;

let adsrPanel = null;
let adsrToggleLabel = null;
let adsrModeBadge = null;
let adsrEnabledInput = null;
let attackControl = null;
let decayControl = null;
let sustainControl = null;
let releaseControl = null;
let attackInput = null;
let decayInput = null;
let sustainInput = null;
let releaseInput = null;

export function initAdsr(elements) {
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

export function resizeAdsrGraphCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.max(300, Math.floor(adsrGraphCanvas.clientWidth));
  const displayHeight = Math.max(130, Math.floor(adsrGraphCanvas.clientHeight));

  adsrGraphCanvas.width = Math.floor(displayWidth * dpr);
  adsrGraphCanvas.height = Math.floor(displayHeight * dpr);
  adsrGraphCtx.setTransform(1, 0, 0, 1, 0, 0);
  adsrGraphCtx.scale(dpr, dpr);
}

export function renderAdsrGraph() {
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

export function updateAdsrStateFromInputs(source = "slider") {
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

export function bindAdsrEvents() {
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
