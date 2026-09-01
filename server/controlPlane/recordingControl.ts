import { EventEmitter } from 'node:events';
import { logInfo } from '../observability/logger.js';

let recordingActive = process.env.RECORDING_ENABLED !== 'false';
const recordingEmitter = new EventEmitter();

export function isRecordingActive(): boolean {
  return recordingActive;
}

export function setRecordingActive(active: boolean): void {
  const previous = recordingActive;
  recordingActive = active;
  if (previous !== active) {
    logInfo('recording_toggle_changed', { enabled: active });
    recordingEmitter.emit('change', active);
  }
}

export function onRecordingToggleChange(listener: (active: boolean) => void): () => void {
  recordingEmitter.on('change', listener);
  return () => {
    recordingEmitter.off('change', listener);
  };
}

export function resetRecordingControlForTests(defaultActive = true): void {
  recordingActive = defaultActive;
  recordingEmitter.removeAllListeners();
}
