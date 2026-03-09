import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

// Get DOM elements
const audioFileInput = document.getElementById('audioFile') as HTMLInputElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const bpmDisplay = document.getElementById('bpmDisplay') as HTMLDivElement;
const bpmValue = document.getElementById('bpmValue') as HTMLDivElement;
const energyValue = document.getElementById('energyValue') as HTMLSpanElement;
const energyLevel = document.getElementById('energyLevel') as HTMLSpanElement;
const energyFill = document.getElementById('energyFill') as HTMLDivElement;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  const current = audioContext ?? new AudioContext();
  audioContext = current;
  return current;
}

// Handle file selection
audioFileInput.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    // Show analyzing status
    showStatus('Analyzing...', 'analyzing');
    hideBpm();

    const audioCtx = getAudioContext();

    // Resume audio context if suspended
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Decode audio data
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Analyze the full buffer to get BPM candidates
    const tempos = await analyzeFullBuffer(audioBuffer);
    const energy = estimateBufferEnergy(audioBuffer);

    // Get the top BPM candidate
    const topTempo = tempos[0];

    if (topTempo) {
      displayBpm(topTempo.tempo);
      displayEnergy(energy);
      showStatus('Analysis complete!', 'success');
    } else {
      showStatus('Could not detect BPM', 'error');
    }
  } catch (error) {
    console.error('Error analyzing audio:', error);
    showStatus(
      `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    );
  }
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

function displayEnergy(score: number) {
  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  energyValue.textContent = String(rounded);
  energyLevel.textContent = getEnergyLevel(rounded);
  energyFill.style.width = `${rounded}%`;
}

function getEnergyLevel(score: number): 'Low' | 'Medium' | 'High' | 'Peak' {
  if (score < 25) return 'Low';
  if (score < 50) return 'Medium';
  if (score < 75) return 'High';
  return 'Peak';
}

function estimateBufferEnergy(audioBuffer: AudioBuffer): number {
  const sampleRate = audioBuffer.sampleRate;
  const frameSize = 256;
  const step = 4096;
  const channelData = audioBuffer.getChannelData(0);
  const bins = frameSize / 2;
  const lowBandEnd = Math.max(1, Math.floor((200 / (sampleRate / 2)) * bins));

  let rmsSum = 0;
  let fluxSum = 0;
  let lowBandSum = 0;
  let frames = 0;
  let previousMag = new Float32Array(bins);

  for (let offset = 0; offset + frameSize < channelData.length; offset += step) {
    const frame = channelData.slice(offset, offset + frameSize);
    const rms = computeRms(frame);
    rmsSum += rms;

    const magnitude = computeMagnitude(frame);
    let positiveDiff = 0;
    let low = 0;

    for (let i = 0; i < magnitude.length; i++) {
      const diff = magnitude[i] - previousMag[i];
      if (diff > 0) positiveDiff += diff;
      previousMag[i] = magnitude[i];

      if (i < lowBandEnd) {
        low += magnitude[i];
      }
    }

    fluxSum += positiveDiff / magnitude.length;
    lowBandSum += low / lowBandEnd;
    frames++;
  }

  if (frames === 0) return 0;

  const rmsNorm = Math.min(1, rmsSum / frames);
  const fluxNorm = Math.min(1, fluxSum / frames);
  const lowNorm = Math.min(1, lowBandSum / frames);

  return (rmsNorm * 0.45 + fluxNorm * 0.35 + lowNorm * 0.2) * 100;
}

function computeRms(frame: Float32Array): number {
  let sum = 0;
  for (const sample of frame) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / frame.length);
}

function computeMagnitude(frame: Float32Array): Float32Array {
  const bins = frame.length / 2;
  const magnitude = new Float32Array(bins);

  for (let k = 0; k < bins; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < frame.length; n++) {
      const phase = (2 * Math.PI * k * n) / frame.length;
      real += frame[n] * Math.cos(phase);
      imag -= frame[n] * Math.sin(phase);
    }
    magnitude[k] = Math.min(1, Math.sqrt(real * real + imag * imag));
  }

  return magnitude;
}

window.addEventListener('beforeunload', () => {
  void audioContext?.close();
  audioContext = null;
});
