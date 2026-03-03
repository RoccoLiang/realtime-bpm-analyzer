import { type BpmCandidates } from 'realtime-bpm-analyzer';
import {
  getMicrophoneErrorMessage,
  startMicrophoneSession,
  stopMicrophoneSession,
  type MicrophoneSession,
} from '../../shared/microphone-session';

// Get DOM elements
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const bpmDisplay = document.getElementById('bpmDisplay') as HTMLDivElement;
const bpmValue = document.getElementById('bpmValue') as HTMLDivElement;

// State
let audioContext: AudioContext | null = null;
let microphoneSession: MicrophoneSession | null = null;

// Start listening to microphone
startBtn.addEventListener('click', async () => {
  try {
    showStatus('Starting microphone...', 'analyzing');

    const audioCtx = audioContext ?? new AudioContext();
    audioContext = audioCtx;

    microphoneSession = await startMicrophoneSession(audioCtx, onBpmStable);

    // Update UI
    startBtn.disabled = true;
    stopBtn.disabled = false;
    showStatus('Listening for music - play something!', 'success');
  } catch (error) {
    console.error('Error accessing microphone:', error);

    showStatus(getMicrophoneErrorMessage(error), 'error');
    void cleanup();
  }
});

function onBpmStable(data: BpmCandidates) {
  if (data.bpm.length > 0) {
    const primaryBpm = data.bpm[0].tempo;
    displayBpm(primaryBpm);
    showStatus(`Stable BPM detected: ${Math.round(primaryBpm)}`, 'success');
  }
}

// Stop listening
stopBtn.addEventListener('click', async () => {
  await disconnect();
  showStatus('Stopped listening', 'analyzing');
  hideBpm();
});

// Helper functions
function showStatus(message: string, type: 'analyzing' | 'success' | 'error') {
  statusElement.textContent = message;
  statusElement.className = `status visible ${type}`;
}

function displayBpm(bpm: number) {
  bpmValue.textContent = Math.round(bpm).toString();
  bpmDisplay.classList.add('visible');
}

function hideBpm() {
  bpmDisplay.classList.remove('visible');
  bpmValue.textContent = '--';
}

async function disconnect(): Promise<void> {
  if (microphoneSession) {
    stopMicrophoneSession(microphoneSession);
    microphoneSession = null;
  }

  if (audioContext && audioContext.state !== 'closed') {
    await audioContext.close();
    audioContext = null;
  }

  // Reset UI
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

async function cleanup() {
  await disconnect();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (microphoneSession) {
    stopMicrophoneSession(microphoneSession);
    microphoneSession = null;
  }

  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
});
