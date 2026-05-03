import { lang, keys } from "./state.js";
import { KEYBOARD_LAYOUTS, DRUM_KEYBOARD_LAYOUTS, MIN_WHITE_KEY_WIDTH, BLACK_KEY_RATIO } from "./constants.js";
import { visualNotes, whiteKeyCount } from "./utils.js";

let keyboardRoot = null;
let keyboardOctaveBtns = null;
let startNoteFn = null;
let stopNoteFn = null;
let stopAllNotesFn = null;
let startDrumPadFn = null;
let stopDrumPadFn = null;
let stopAllDrumPadsFn = null;
let getWaveformCanvasFn = null;
let getWaveformCtxFn = null;
let getEditionPageFn = () => "chromatic";
let isRecordModalOpenFn = () => false;
let closeRecordModalFn = () => {};

let drumLayoutKeyToPad = new Map();

export function initKeyboard(elements, {
  startNote,
  stopNote,
  stopAllNotes,
  startDrumPad,
  stopDrumPad,
  stopAllDrumPads,
  getWaveformCanvas,
  getWaveformCtx,
  getEditionPage,
  isRecordModalOpen,
  closeRecordModal,
}) {
  keyboardRoot = elements.keyboardRoot;
  keyboardOctaveBtns = elements.keyboardOctaveBtns;
  startNoteFn = startNote;
  stopNoteFn = stopNote;
  stopAllNotesFn = stopAllNotes;
  startDrumPadFn = startDrumPad;
  stopDrumPadFn = stopDrumPad;
  stopAllDrumPadsFn = stopAllDrumPads;
  getWaveformCanvasFn = getWaveformCanvas;
  getWaveformCtxFn = getWaveformCtx;
  getEditionPageFn = getEditionPage;
  isRecordModalOpenFn = isRecordModalOpen;
  closeRecordModalFn = closeRecordModal;
}

function computerKeyboardBaseMidi() {
  return 24 + keys.computerOctave * 12;
}

function rebuildLayoutKeyToMidi() {
  const layoutKeys = KEYBOARD_LAYOUTS[lang.layout] || [];
  const drumLayoutKeys = DRUM_KEYBOARD_LAYOUTS[lang.layout] || DRUM_KEYBOARD_LAYOUTS.qwerty;
  const baseMidi = computerKeyboardBaseMidi();
  const nextMap = new Map();
  const nextDrumMap = new Map();
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
  return note.type === "white" ? `${note.note} · ${shortcut}` : shortcut;
}

export function refreshKeyboardLabels() {
  for (const note of visualNotes) {
    const keyEl = keys.keyElements.get(note.midi);
    if (!keyEl) continue;

    const shortcut = getShortcutForMidi(note.midi);
    keyEl.textContent = createKeyLabel(note, shortcut);
    keyEl.classList.toggle("note-only", !shortcut);
    keyEl.title = shortcut ? `${note.note} (${shortcut})` : note.note;
  }
}

export function updateKeyboardGeometry() {
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

    keyEl.style.fontSize = note.type === "white"
      ? `${Math.max(9, Math.min(12, Math.round(keys.whiteKeyWidth * 0.24)))}px`
      : `${Math.max(9, Math.min(11, Math.round(keys.whiteKeyWidth * 0.24)))}px`;
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
      waveformCtx: getWaveformCtxFn(),
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

export function createKeyboard() {
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

export function setKeyboardLayout(layoutName) {
  if (!(layoutName in KEYBOARD_LAYOUTS)) return;
  lang.layout = layoutName;
  clearAllPressedStates();
  rebuildLayoutKeyToMidi();
  refreshKeyboardLabels();
}

export function setComputerKeyboardOctave(nextValue) {
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

export function handleKeyDown(event) {
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
    waveformCtx: getWaveformCtxFn(),
  });
}

export function handleKeyUp(event) {
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

export function handleBlur() {
  clearAllPressedStates();
}

export function bindKeyboardOctaveEvents() {
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
