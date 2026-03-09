import { type BpmCandidates, type KeyCandidates } from 'realtime-bpm-analyzer';
import {
  createEnergyMonitor,
  createSpectrumMonitor,
  getMicrophoneErrorMessage,
  startMicrophoneSession,
  stopMicrophoneSession,
  type EnergySnapshot,
  type MicrophoneSession,
} from '../../shared/microphone-session';

// Get DOM elements
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const bpmDisplay = document.getElementById('bpmDisplay') as HTMLDivElement;
const bpmValue = document.getElementById('bpmValue') as HTMLDivElement;
const energyValue = document.getElementById('energyValue') as HTMLSpanElement;
const energyLevel = document.getElementById('energyLevel') as HTMLSpanElement;
const energyFill = document.getElementById('energyFill') as HTMLDivElement;
const spectrumCanvas = document.getElementById('spectrumCanvas') as HTMLCanvasElement;
const spectrumContext = spectrumCanvas.getContext('2d');
const keyDisplay = document.getElementById('keyDisplay') as HTMLDivElement;
const keyValue = document.getElementById('keyValue') as HTMLDivElement;
const keyConfidence = document.getElementById('keyConfidence') as HTMLDivElement;

// State
let audioContext: AudioContext | null = null;
let microphoneSession: MicrophoneSession | null = null;
let stopEnergyMonitor: (() => void) | null = null;
let stopSpectrumMonitor: (() => void) | null = null;

// Start listening to microphone
startBtn.addEventListener('click', async () => {
  try {
    showStatus('Initializing...', 'analyzing');

    const audioCtx = audioContext ?? new AudioContext();
    audioContext = audioCtx;

    microphoneSession = await startMicrophoneSession(audioCtx, onBpmStable, onKeyStable);
    stopEnergyMonitor = createEnergyMonitor(
      microphoneSession.analyser,
      onEnergySnapshot,
    );
    stopSpectrumMonitor = createSpectrumMonitor(
      microphoneSession.analyser,
      drawSpectrum,
    );

    // Update UI
    startBtn.disabled = true;
    stopBtn.disabled = false;
    showStatus('Listening for music...', 'success');
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
    showStatus(`BPM: ${Math.round(primaryBpm)}`, 'success');
  }
}

function onKeyStable(data: KeyCandidates) {
  displayKey(data);
}

function onEnergySnapshot(snapshot: EnergySnapshot) {
  const score = Math.round(snapshot.score);
  energyValue.textContent = String(score);
  energyLevel.textContent = snapshot.level;
  energyFill.style.width = `${score}%`;
}

// Stop listening
stopBtn.addEventListener('click', async () => {
  await disconnect();
  showStatus('Stopped', 'analyzing');
  hideBpm();
  hideKey();
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

function displayKey(key: KeyCandidates) {
  keyValue.textContent = `${key.key} ${key.mode}`;
  keyConfidence.textContent = `Confidence: ${Math.round(key.confidence * 100)}%`;
  keyDisplay.classList.add('visible');
}

function hideKey() {
  keyDisplay.classList.remove('visible');
  keyValue.textContent = '--';
  keyConfidence.textContent = '';
}

function resetEnergy() {
  energyValue.textContent = '0';
  energyLevel.textContent = 'Low';
  energyFill.style.width = '0%';
}

function drawSpectrum(bins: Uint8Array) {
  if (!spectrumContext) return;
  const { width, height } = spectrumCanvas;
  spectrumContext.clearRect(0, 0, width, height);
  spectrumContext.fillStyle = '#050508';
  spectrumContext.fillRect(0, 0, width, height);

  const bars = 48;
  const step = Math.max(1, Math.floor(bins.length / bars));
  const barWidth = width / bars;

  for (let i = 0; i < bars; i++) {
    const value = bins[i * step] / 255;
    const barHeight = value * height;
    const x = i * barWidth;
    const y = height - barHeight;
    
    // Cyberpunk gradient colors
    const hue = 180 + value * 60; // cyan to magenta
    spectrumContext.fillStyle = `hsla(${hue}, 100%, 60%, ${0.5 + value * 0.5})`;
    spectrumContext.fillRect(x + 1, y, barWidth - 2, barHeight);
    
    // Add glow effect
    if (value > 0.5) {
      spectrumContext.shadowBlur = 10;
      spectrumContext.shadowColor = `hsla(${hue}, 100%, 60%, 0.8)`;
      spectrumContext.fillRect(x + 1, y, barWidth - 2, barHeight);
      spectrumContext.shadowBlur = 0;
    }
  }
}

function clearSpectrum() {
  if (!spectrumContext) return;
  const { width, height } = spectrumCanvas;
  spectrumContext.clearRect(0, 0, width, height);
  spectrumContext.fillStyle = '#050508';
  spectrumContext.fillRect(0, 0, width, height);
}

clearSpectrum();

async function disconnect(): Promise<void> {
  if (stopSpectrumMonitor) {
    stopSpectrumMonitor();
    stopSpectrumMonitor = null;
  }

  if (stopEnergyMonitor) {
    stopEnergyMonitor();
    stopEnergyMonitor = null;
  }

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
  resetEnergy();
  clearSpectrum();
}

async function cleanup() {
  await disconnect();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (stopSpectrumMonitor) {
    stopSpectrumMonitor();
    stopSpectrumMonitor = null;
  }

  if (stopEnergyMonitor) {
    stopEnergyMonitor();
    stopEnergyMonitor = null;
  }

  if (microphoneSession) {
    stopMicrophoneSession(microphoneSession);
    microphoneSession = null;
  }

  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
});
