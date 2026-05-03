import { t } from "./i18n.js";
import { statusState, lang } from "./state.js";

let sampleNameEl = null;
let recordStatusEl = null;
let performanceStatusEl = null;

export function initStatusElements({ sampleName, recordStatus, performanceStatus }) {
  sampleNameEl = sampleName;
  recordStatusEl = recordStatus;
  performanceStatusEl = performanceStatus;
}

export function setSampleStatus(key, params = {}) {
  statusState.sample = { key, params };
  if (sampleNameEl) sampleNameEl.textContent = t(key, params);
}

export function setRecordStatus(key, params = {}) {
  statusState.record = { key, params };
  if (recordStatusEl) recordStatusEl.textContent = t(key, params);
}

export function setPerformanceStatus(key, params = {}) {
  statusState.performance = { key, params };
  if (performanceStatusEl) performanceStatusEl.textContent = t(key, params);
}

export function refreshDynamicStatus() {
  setSampleStatus(statusState.sample.key, statusState.sample.params);
  setRecordStatus(statusState.record.key, statusState.record.params);
  setPerformanceStatus(statusState.performance.key, statusState.performance.params);
}
