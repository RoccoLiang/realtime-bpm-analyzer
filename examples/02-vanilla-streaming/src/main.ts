import { createRealtimeBpmAnalyzer, getBiquadFilter, type BpmAnalyzer, type BpmCandidates } from 'realtime-bpm-analyzer';
import {
  createEnergyMonitor,
  createSpectrumMonitor,
  type EnergySnapshot,
} from '../../shared/microphone-session';

// Get DOM elements
const audioUrlInput = document.getElementById('audioUrl') as HTMLInputElement;
const loadBtn = document.getElementById('loadBtn') as HTMLButtonElement;
const playBtn = document.getElementById('playBtn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const bpmDisplay = document.getElementById('bpmDisplay') as HTMLDivElement;
const bpmValue = document.getElementById('bpmValue') as HTMLDivElement;
const energyValue = document.getElementById('energyValue') as HTMLSpanElement;
const energyLevel = document.getElementById('energyLevel') as HTMLSpanElement;
const energyFill = document.getElementById('energyFill') as HTMLDivElement;
const spectrumCanvas = document.getElementById('spectrumCanvas') as HTMLCanvasElement;
const spectrumContext = spectrumCanvas.getContext('2d');

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  const current = audioContext ?? new AudioContext();
  audioContext = current;
  return current;
}

// State
let audioElement: HTMLAudioElement | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let bpmAnalyzer: BpmAnalyzer | null = null;
let biquadFilter: BiquadFilterNode | null = null;
let analyserNode: AnalyserNode | null = null;
let stopEnergyMonitor: (() => void) | null = null;
let stopSpectrumMonitor: (() => void) | null = null;

// Load audio from URL
loadBtn.addEventListener('click', async () => {
  const url = audioUrlInput.value.trim();
  if (!url) {
    showStatus('Please enter a valid URL', 'error');
    return;
  }

  try {
    // Clean up previous audio
    cleanup();

    showStatus('Loading audio...', 'analyzing');

    const audioCtx = getAudioContext();

    // Resume audio context if suspended
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // Create audio element
    audioElement = new Audio(url);
    audioElement.crossOrigin = 'anonymous';

    // Create BPM analyzer
    bpmAnalyzer = await createRealtimeBpmAnalyzer(audioCtx);

    // Create biquad filter for better audio processing
    biquadFilter = getBiquadFilter(audioCtx);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 1024;

    // Listen for BPM stable events
    bpmAnalyzer.on('bpmStable', (data: BpmCandidates) => {
      if (data.bpm.length > 0) {
        const primaryBpm = data.bpm[0].tempo;
        displayBpm(primaryBpm);
        showStatus(`Stable BPM detected: ${Math.round(primaryBpm)}`, 'playing');
      }
    });

    // Create media source and connect the audio graph
    mediaSource = audioCtx.createMediaElementSource(audioElement);
    
    // Connect: source → filter → analyzer → destination
    mediaSource.connect(biquadFilter);
    mediaSource.connect(analyserNode);
    biquadFilter.connect(bpmAnalyzer.node);
    mediaSource.connect(audioCtx.destination);
    stopEnergyMonitor = createEnergyMonitor(analyserNode, onEnergySnapshot);
    stopSpectrumMonitor = createSpectrumMonitor(analyserNode, drawSpectrum);

    // Wait for audio to be ready
    await new Promise<void>((resolve, reject) => {
      audioElement!.addEventListener('canplay', () => resolve(), { once: true });
      audioElement!.addEventListener('error', (e) => reject(e), { once: true });
    });

    showStatus('Audio loaded - ready to play!', 'playing');
    enableControls(true);
  } catch (error) {
    console.error('Error loading audio:', error);
    showStatus(
      `Error: ${error instanceof Error ? error.message : 'Failed to load audio'}`,
      'error'
    );
    cleanup();
  }
});

// Play audio
playBtn.addEventListener('click', async () => {
  if (!audioElement) return;

  try {
    const audioCtx = audioContext;
    if (audioCtx?.state === 'suspended') {
      await audioCtx.resume();
    }
    await audioElement.play();
    showStatus('Playing and analyzing...', 'playing');
  } catch (error) {
    console.error('Error playing audio:', error);
    showStatus('Failed to play audio', 'error');
  }
});

// Pause audio
pauseBtn.addEventListener('click', () => {
  if (!audioElement) return;
  audioElement.pause();
  showStatus('Paused', 'analyzing');
});

// Stop audio
stopBtn.addEventListener('click', () => {
  cleanup();
  showStatus('Stopped', 'analyzing');
  hideBpm();
  enableControls(false);
});

// Example URL clicks
document.querySelectorAll('.example-link').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    audioUrlInput.value = (e.target as HTMLAnchorElement).textContent || '';
  });
});

// Helper functions
function showStatus(message: string, type: 'analyzing' | 'playing' | 'error') {
  statusElement.textContent = message;
  statusElement.className = `status visible ${type}`;
}

function displayBpm(bpm: number) {
  bpmValue.textContent = Math.round(bpm).toString();
  bpmDisplay.classList.add('visible');
}

function onEnergySnapshot(snapshot: EnergySnapshot) {
  const score = Math.round(snapshot.score);
  energyValue.textContent = String(score);
  energyLevel.textContent = snapshot.level;
  energyFill.style.width = `${score}%`;
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
  spectrumContext.fillStyle = '#10121a';
  spectrumContext.fillRect(0, 0, width, height);

  const bars = 48;
  const step = Math.max(1, Math.floor(bins.length / bars));
  const barWidth = width / bars;

  for (let i = 0; i < bars; i++) {
    const value = bins[i * step] / 255;
    const barHeight = value * height;
    const x = i * barWidth;
    const y = height - barHeight;
    spectrumContext.fillStyle = 'hsl(' + (120 - value * 120) + ' 85% 55%)';
    spectrumContext.fillRect(x + 1, y, barWidth - 2, barHeight);
  }
}

function clearSpectrum() {
  if (!spectrumContext) return;
  const { width, height } = spectrumCanvas;
  spectrumContext.clearRect(0, 0, width, height);
  spectrumContext.fillStyle = '#10121a';
  spectrumContext.fillRect(0, 0, width, height);
}

clearSpectrum();

function hideBpm() {
  bpmDisplay.classList.remove('visible');
  bpmValue.textContent = '--';
}

function enableControls(enabled: boolean) {
  playBtn.disabled = !enabled;
  pauseBtn.disabled = !enabled;
  stopBtn.disabled = !enabled;
}

function cleanup() {
  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
    audioElement = null;
  }

  if (mediaSource) {
    mediaSource.disconnect();
    mediaSource = null;
  }

  if (biquadFilter) {
    biquadFilter.disconnect();
    biquadFilter = null;
  }

  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }

  if (bpmAnalyzer) {
    bpmAnalyzer.disconnect();
    bpmAnalyzer = null;
  }

  if (stopEnergyMonitor) {
    stopEnergyMonitor();
    stopEnergyMonitor = null;
  }

  if (stopSpectrumMonitor) {
    stopSpectrumMonitor();
    stopSpectrumMonitor = null;
  }

  resetEnergy();
  clearSpectrum();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanup();
  void audioContext?.close();
  audioContext = null;
});
