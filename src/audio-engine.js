import { keys, audio, adsrState, playbackState, outputState, filterState, wave, perfState, drumState } from "./state.js";
import { midiToPlaybackRate, clamp } from "./utils.js";
import { t } from "./i18n.js";
import { setSampleStatus } from "./main-status.js";

let audioContext = null;
let filterInputGain = null;
let filterNodeA = null;
let filterNodeB = null;
let masterOutputGain = null;
let performanceStreamDestination = null;
let performanceTapNode = null;
let performanceTapSink = null;
let performanceTapConnected = false;
let audioResumePromise = null;

export function getAudioContext() {
  return audioContext;
}

export function getMasterOutputGain() {
  return masterOutputGain;
}

export function getFilterNodes() {
  return { a: filterNodeA, b: filterNodeB };
}

export function getFilterInputGain() {
  return filterInputGain;
}

export function getPerformanceStreamDestination() {
  return performanceStreamDestination;
}

export function ensureAudioContext() {
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
      const right = inputBuffer.numberOfChannels > 1
        ? new Float32Array(inputBuffer.getChannelData(1))
        : new Float32Array(left);

      perfState.leftChunks.push(left);
      perfState.rightChunks.push(right);
      perfState.recordedSamples += left.length;
    };

    applyFilterState();
    applyOutputVolume();
  }
}

export function setPerformanceTapConnection(connected) {
  if (!masterOutputGain || !performanceTapNode || performanceTapConnected === connected) return;

  try {
    if (connected) {
      masterOutputGain.connect(performanceTapNode);
    } else {
      masterOutputGain.disconnect(performanceTapNode);
    }
    performanceTapConnected = connected;
  } catch (_error) {}
}

export async function ensureAudioRunning() {
  ensureAudioContext();
  if (!audioContext) return false;
  if (audioContext.state === "running") return true;
  if (audioContext.state === "closed") return false;

  if (!audioResumePromise) {
    audioResumePromise = audioContext.resume()
      .catch((error) => { console.error(error); })
      .finally(() => { audioResumePromise = null; });
  }

  await audioResumePromise;
  return audioContext.state === "running";
}

export function applyFilterState() {
  if (!filterNodeA || !filterNodeB || !audioContext) return;
  [filterNodeA, filterNodeB].forEach((node) => {
    node.type = filterState.type;
    node.frequency.setValueAtTime(filterState.freq, audioContext.currentTime);
    node.Q.setValueAtTime(filterState.Q, audioContext.currentTime);
  });
}

export function applyOutputVolume() {
  if (!masterOutputGain || !audioContext) return;
  masterOutputGain.gain.setValueAtTime(outputState.volume, audioContext.currentTime);
}

export function isMidiInputHeld(midi) {
  for (const heldMidi of keys.pressedKeyToMidi.values()) {
    if (heldMidi === midi) return true;
  }
  for (const heldMidi of keys.pointerIdToMidi.values()) {
    if (heldMidi === midi) return true;
  }
  return false;
}

export function updatePriorityMidi(releasedMidi) {
  if (releasedMidi !== wave.priorityMidi) return;
  wave.priorityMidi = null;
  for (const m of keys.activeVoices.keys()) {
    if (wave.priorityMidi === null || m < wave.priorityMidi) {
      wave.priorityMidi = m;
    }
  }
}

export function getPlayheadNorm() {
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
      posInBuffer = loopStart + ((posInBuffer - loopStart) % loopLength);
    }
  }

  return clamp(posInBuffer / audio.loadedBuffer.duration, 0, 1);
}

export function startPlayheadAnimation(canvasEl, ctx) {
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

export function normalizePlaybackState() {
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
  if (duration <= 0) return 0.001;
  return clamp(0.01 / duration, 0.001, 0.05);
}

export function startNote(midi, { onSampleMissing, waveformCanvas, waveformCtx }) {
  if (!audio.loadedBuffer) {
    if (onSampleMissing) onSampleMissing();
    return;
  }

  if (keys.activeVoices.has(midi)) return;

  ensureAudioContext();
  if (audioContext.state !== "running") {
    ensureAudioRunning().then((isReady) => {
      if (isReady && !keys.activeVoices.has(midi) && isMidiInputHeld(midi)) {
        startNote(midi, { onSampleMissing, waveformCanvas, waveformCtx });
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
    Math.max(0, audio.loadedBuffer.duration - 0.001),
  );
  source.start(now, startOffset);
  keys.activeVoices.set(midi, {
    source,
    gain,
    startTime: now,
    startOffset,
    playbackRate: source.playbackRate.value,
  });
  setKeyActive(midi, true);

  if (wave.priorityMidi === null) {
    wave.priorityMidi = midi;
  }
  startPlayheadAnimation(waveformCanvas, waveformCtx);
}

export function stopNote(midi) {
  const voice = keys.activeVoices.get(midi);
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
    try { voice.source.stop(now + adsrState.release + 0.02); } catch (_err) {}
  } else {
    param.setValueAtTime(0, now);
    try { voice.source.stop(now + 0.005); } catch (_err) {}
  }

  keys.activeVoices.delete(midi);
  updatePriorityMidi(midi);
  window.setTimeout(() => {
    if (!keys.activeVoices.has(midi)) {
      setKeyActive(midi, false);
    }
  }, 65);
}

export function stopAllNotes() {
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

export function startDrumPad(padIndex, { onSampleMissing } = {}) {
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
    try { previousVoice.source.stop(audioContext.currentTime + 0.002); } catch (_error) {}
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
    const sustainTarget = Math.max(padAdsr.sustain * padVolume, 0.0001);

    gain.gain.setValueAtTime(0.0001, now);
    if (padAdsr.attack > 0) {
      gain.gain.exponentialRampToValueAtTime(Math.max(padVolume, 0.0001), attackEnd);
    } else {
      gain.gain.setValueAtTime(Math.max(padVolume, 0.0001), now);
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
    Math.max(0, pad.buffer.duration - 0.001),
  );
  source.start(now, startOffset);

  drumState.activeVoices.set(padIndex, {
    source,
    gain,
    adsrEnabled: padAdsr.enabled,
    release: padAdsr.release,
  });

  setDrumPadActive(padIndex, true);
}

export function stopDrumPad(padIndex) {
  const voice = drumState.activeVoices.get(padIndex);
  if (!voice || !audioContext) {
    setDrumPadActive(padIndex, false);
    return;
  }

  const now = audioContext.currentTime;
  const param = voice.gain.gain;
  const currentGain = Math.max(param.value, 0.0001);

  param.cancelScheduledValues(now);
  param.setValueAtTime(currentGain, now);

  if (voice.adsrEnabled && voice.release > 0) {
    param.exponentialRampToValueAtTime(0.0001, now + voice.release);
    try { voice.source.stop(now + voice.release + 0.02); } catch (_error) {}
  } else {
    param.setValueAtTime(0, now);
    try { voice.source.stop(now + 0.005); } catch (_error) {}
  }

  drumState.activeVoices.delete(padIndex);
  window.setTimeout(() => {
    if (!drumState.activeVoices.has(padIndex)) {
      setDrumPadActive(padIndex, false);
    }
  }, 65);
}

export function stopAllDrumPads() {
  for (const padIndex of Array.from(drumState.activeVoices.keys())) {
    stopDrumPad(padIndex);
  }
  if (drumState.sequencerVoices) {
    for (const voice of drumState.sequencerVoices.values()) {
      try { voice.source.stop(); } catch (_e) {}
    }
    drumState.sequencerVoices.clear();
  }
}

export function triggerDrumPadShot(padIndex, when, stepDuration) {
  const pad = drumState.pads[padIndex];
  if (!pad || !pad.buffer || !audioContext) return;

  const prev = drumState.sequencerVoices?.get(padIndex);
  if (prev) {
    try { prev.source.stop(when); } catch (_e) {}
  }
  if (!drumState.sequencerVoices) drumState.sequencerVoices = new Map();

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
    const sustainTarget = Math.max(padAdsr.sustain * padVolume, 0.0001);

    gain.gain.setValueAtTime(0.0001, startTime);
    if (padAdsr.attack > 0) {
      gain.gain.exponentialRampToValueAtTime(Math.max(padVolume, 0.0001), attackEnd);
    } else {
      gain.gain.setValueAtTime(Math.max(padVolume, 0.0001), startTime);
    }

    if (padAdsr.decay > 0) {
      gain.gain.exponentialRampToValueAtTime(sustainTarget, decayEnd);
    }

    if (stepDuration && padAdsr.release > 0) {
      const releaseStart = startTime + stepDuration;
      gain.gain.setValueAtTime(Math.max(sustainTarget, 0.0001), releaseStart);
      gain.gain.exponentialRampToValueAtTime(0.0001, releaseStart + padAdsr.release);
    }
  } else {
    gain.gain.setValueAtTime(padVolume, startTime);
  }

  source.connect(gain);
  gain.connect(masterOutputGain || audioContext.destination);

  const startOffset = clamp(
    pad.sampleStartNorm * pad.buffer.duration,
    0,
    Math.max(0, pad.buffer.duration - 0.001),
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

export async function loadSampleFromArrayBuffer(arrayBuffer, label, { redrawWaveform, updatePlaybackUi }) {
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
  if (redrawWaveform) redrawWaveform(audio.loadedBuffer);
  if (updatePlaybackUi) updatePlaybackUi();
}
