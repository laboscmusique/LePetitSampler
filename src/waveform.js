import { playbackState, audio, wave, editionState, drumState } from "./state.js";
import { clamp } from "./utils.js";
import { t } from "./i18n.js";

let waveformCanvas = null;
let canvasCtx = null;

export function initWaveform(canvas) {
  waveformCanvas = canvas;
  canvasCtx = canvas.getContext("2d");
}

export function getWaveformCanvas() {
  return waveformCanvas;
}

export function getWaveformCtx() {
  return canvasCtx;
}

export function drawEmptyWaveform() {
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

export function drawWaveform(audioBuffer) {
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
    { id: "loopEnd", x: playbackState.loopEndNorm * width, color: "#2a7aa8", label: t("waveform.loopOut") },
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

export function redrawWaveform() {
  if (audio.renderedBuffer) {
    drawWaveform(audio.renderedBuffer);
  } else {
    drawEmptyWaveform();
  }
}

export function resizeWaveformCanvas() {
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

export function waveformXToNorm(clientX) {
  const rect = waveformCanvas.getBoundingClientRect();
  const x = clamp(clientX - rect.left, 0, rect.width);
  if (rect.width <= 0) return 0;
  return x / rect.width;
}

export function getClosestWaveMarker(normX) {
  const markers = [
    { id: "sampleStart", norm: playbackState.sampleStartNorm },
    { id: "loopStart", norm: playbackState.loopStartNorm },
    { id: "loopEnd", norm: playbackState.loopEndNorm },
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

export function drawMiniWaveformFromStart(canvas, audioBuffer, startNorm = 0, gain = 1) {
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
