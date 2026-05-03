import { perfState } from "./state.js";
import { mergeFloatChunks, encodeWavFromStereo } from "./utils.js";
import { t } from "./i18n.js";
import { setPerformanceStatus } from "./main-status.js";

let performanceWidget = null;
let togglePerformanceWidgetButton = null;
let performanceStartButton = null;
let performanceStopButton = null;
let performanceTimer = null;
let downloadPerformanceWav = null;
let downloadPerformanceMp3 = null;
let performanceMp3Hint = null;

let ensureAudioContextFn = null;
let getAudioContextFn = null;
let getPerformanceStreamDestinationFn = null;
let setPerformanceTapConnectionFn = null;

export function initPerformance(elements, { ensureAudioContext, getAudioContext, getPerformanceStreamDestination, setPerformanceTapConnection }) {
  performanceWidget = elements.performanceWidget;
  togglePerformanceWidgetButton = elements.togglePerformanceWidgetButton;
  performanceStartButton = elements.performanceStartButton;
  performanceStopButton = elements.performanceStopButton;
  performanceTimer = elements.performanceTimer;
  downloadPerformanceWav = elements.downloadPerformanceWav;
  downloadPerformanceMp3 = elements.downloadPerformanceMp3;
  performanceMp3Hint = elements.performanceMp3Hint;
  ensureAudioContextFn = ensureAudioContext;
  getAudioContextFn = getAudioContext;
  getPerformanceStreamDestinationFn = getPerformanceStreamDestination;
  setPerformanceTapConnectionFn = setPerformanceTapConnection;
}

function supportsPerformanceMp3() {
  return Boolean(window.MediaRecorder && MediaRecorder.isTypeSupported("audio/mpeg"));
}

function revokePerformanceDownloadUrls() {
  if (perfState.wavUrl) {
    URL.revokeObjectURL(perfState.wavUrl);
    perfState.wavUrl = "";
  }
  if (perfState.mp3Url) {
    URL.revokeObjectURL(perfState.mp3Url);
    perfState.mp3Url = "";
  }
}

function setDownloadLinkState(linkEl, url, filename) {
  if (!url) {
    linkEl.classList.add("disabled");
    linkEl.removeAttribute("href");
    linkEl.removeAttribute("download");
    return;
  }
  linkEl.classList.remove("disabled");
  linkEl.href = url;
  linkEl.download = filename;
}

export function refreshPerformanceDownloads() {
  setDownloadLinkState(downloadPerformanceWav, perfState.wavUrl, "performance.wav");
  setDownloadLinkState(downloadPerformanceMp3, perfState.mp3Url, "performance.mp3");
}

function updatePerformanceTimer() {
  if (!perfState.isRecording) {
    performanceTimer.textContent = "00:00";
    return;
  }
  const elapsed = Date.now() - perfState.startTimeMs;
  const totalSeconds = Math.max(0, Math.floor(elapsed / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  performanceTimer.textContent = `${minutes}:${seconds}`;
}

export function updatePerformanceUi() {
  performanceStartButton.disabled = perfState.isRecording;
  performanceStopButton.disabled = !perfState.isRecording;
  performanceStartButton.textContent = perfState.isRecording ? t("record.recording") : t("performance.start");
  performanceStartButton.classList.toggle("recording", perfState.isRecording);
  document.body.classList.toggle("is-recording", perfState.isRecording);
}

export function setPerformanceWidgetCollapsed(collapsed) {
  performanceWidget.classList.toggle("collapsed", collapsed);
  togglePerformanceWidgetButton.textContent = collapsed ? t("performance.toggle.open") : t("performance.toggle.collapse");
}

function resetPerformanceCaptureBuffers() {
  perfState.leftChunks = [];
  perfState.rightChunks = [];
  perfState.recordedSamples = 0;
  perfState.mp3Chunks = [];
}

function createPerformanceMp3Recorder() {
  if (!supportsPerformanceMp3() || !getPerformanceStreamDestinationFn()) return null;

  try {
    return new MediaRecorder(getPerformanceStreamDestinationFn().stream, { mimeType: "audio/mpeg" });
  } catch (_error) {
    return null;
  }
}

export function startPerformanceRecording() {
  ensureAudioContextFn();
  if (!getAudioContextFn() || !getPerformanceStreamDestinationFn() || perfState.isRecording) return;
  setPerformanceWidgetCollapsed(false);

  revokePerformanceDownloadUrls();
  refreshPerformanceDownloads();
  resetPerformanceCaptureBuffers();

  perfState.mp3Recorder = createPerformanceMp3Recorder();
  if (perfState.mp3Recorder) {
    perfState.mp3Recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        perfState.mp3Chunks.push(event.data);
      }
    };
    perfState.mp3Recorder.start();
  }

  perfState.isRecording = true;
  setPerformanceTapConnectionFn(true);
  perfState.startTimeMs = Date.now();
  setPerformanceStatus("performance.status.capturing");
  updatePerformanceTimer();
  perfState.timerId = window.setInterval(updatePerformanceTimer, 200);
  updatePerformanceUi();
}

export function stopPerformanceRecording() {
  if (!perfState.isRecording) return;

  perfState.isRecording = false;
  setPerformanceTapConnectionFn(false);
  if (perfState.timerId) {
    window.clearInterval(perfState.timerId);
    perfState.timerId = null;
  }
  updatePerformanceTimer();
  updatePerformanceUi();

  const finalize = () => {
    const sampleRate = getAudioContextFn()?.sampleRate || 44100;
    const left = mergeFloatChunks(perfState.leftChunks, perfState.recordedSamples);
    const right = mergeFloatChunks(perfState.rightChunks, perfState.recordedSamples);

    if (left.length === 0) {
      setPerformanceStatus("performance.status.noSound");
      return;
    }

    const wavBlob = encodeWavFromStereo(left, right, sampleRate);
    perfState.wavUrl = URL.createObjectURL(wavBlob);

    if (perfState.mp3Chunks.length > 0) {
      const mp3Blob = new Blob(perfState.mp3Chunks, { type: "audio/mpeg" });
      perfState.mp3Url = URL.createObjectURL(mp3Blob);
    } else {
      perfState.mp3Url = "";
    }

    refreshPerformanceDownloads();
    setPerformanceStatus(perfState.mp3Url ? "performance.status.capturedBoth" : "performance.status.capturedWav");
  };

  if (perfState.mp3Recorder && perfState.mp3Recorder.state === "recording") {
    perfState.mp3Recorder.onstop = () => {
      perfState.mp3Recorder = null;
      finalize();
    };
    perfState.mp3Recorder.stop();
  } else {
    perfState.mp3Recorder = null;
    finalize();
  }
}

export function refreshPerformanceMp3Hint() {
  performanceMp3Hint.textContent = supportsPerformanceMp3() ? t("performance.mp3.supported") : t("performance.mp3.unsupported");
}

export function bindPerformanceEvents() {
  togglePerformanceWidgetButton.addEventListener("click", () => {
    const isCollapsed = performanceWidget.classList.contains("collapsed");
    setPerformanceWidgetCollapsed(!isCollapsed);
  });

  performanceStartButton.addEventListener("click", startPerformanceRecording);
  performanceStopButton.addEventListener("click", stopPerformanceRecording);
}
