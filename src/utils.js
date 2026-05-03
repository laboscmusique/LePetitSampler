import { BASE_MIDI, VISUAL_MIN_MIDI, VISUAL_MAX_MIDI, NOTE_NAMES } from "./constants.js";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createNote(midi) {
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    midi,
    note: `${NOTE_NAMES[noteIndex]}${octave}`,
    type: NOTE_NAMES[noteIndex].includes("#") ? "black" : "white",
  };
}

export const visualNotes = Array.from(
  { length: VISUAL_MAX_MIDI - VISUAL_MIN_MIDI + 1 },
  (_, idx) => createNote(VISUAL_MIN_MIDI + idx),
);

export const whiteKeyCount = visualNotes.filter((note) => note.type === "white").length;

export function midiToPlaybackRate(midi) {
  return Math.pow(2, (midi - BASE_MIDI) / 12);
}

export function sliderToFreq(sliderVal) {
  return 20 * Math.pow(1000, Number.parseFloat(sliderVal) / 1000);
}

export function freqToSlider(freq) {
  return Math.round(1000 * Math.log(Math.max(freq, 20) / 20) / Math.log(1000));
}

export function formatClockFromMs(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function mergeFloatChunks(chunks, totalLength) {
  const out = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function encodeWavFromStereo(left, right, sampleRate) {
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

export function normalizedEventKey(key) {
  if (!key || key.length !== 1) return null;
  return key.toLowerCase();
}
