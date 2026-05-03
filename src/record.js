import { recordingState } from "./state.js";
import { t } from "./i18n.js";
import { setRecordStatus } from "./main-status.js";

let recordModal = null;
let closeRecordModalButton = null;
let refreshRecordInputsButton = null;
let recordInputSelect = null;
let recordStartButton = null;
let recordStopButton = null;
let recordTimer = null;
let recordPermissionHint = null;

let loadSampleFn = null;
let stopAllNotesFn = null;

export function initRecord(elements, { loadSample, stopAllNotes }) {
  recordModal = elements.recordModal;
  closeRecordModalButton = elements.closeRecordModalButton;
  refreshRecordInputsButton = elements.refreshRecordInputsButton;
  recordInputSelect = elements.recordInputSelect;
  recordStartButton = elements.recordStartButton;
  recordStopButton = elements.recordStopButton;
  recordTimer = elements.recordTimer;
  recordPermissionHint = elements.recordPermissionHint;
  loadSampleFn = loadSample;
  stopAllNotesFn = stopAllNotes;
}

export function isRecordModalOpen() {
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
  const totalSeconds = Math.max(0, Math.floor(elapsed / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  recordTimer.textContent = `${minutes}:${seconds}`;
}

export function updateRecordingUi() {
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

  const exactConstraints = selectedId
    ? { audio: { deviceId: { exact: selectedId } } }
    : { audio: true };

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
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function openRecordModal() {
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

export function closeRecordModal() {
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
    recordingState.mediaRecorder = mimeType
      ? new MediaRecorder(recordingState.mediaStream, { mimeType })
      : new MediaRecorder(recordingState.mediaStream);

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
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
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

export function bindRecordEvents() {
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

export function refreshAudioInputDevicesPublic() {
  return refreshAudioInputDevices();
}
