import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

// Get DOM elements
const audioFileInput = document.getElementById('audioFile') as HTMLInputElement;
const statusElement = document.getElementById('status') as HTMLDivElement;
const bpmDisplay = document.getElementById('bpmDisplay') as HTMLDivElement;
const bpmValue = document.getElementById('bpmValue') as HTMLDivElement;

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

    // Get the top BPM candidate
    const topTempo = tempos[0];

    if (topTempo) {
      displayBpm(topTempo.tempo);
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

window.addEventListener('beforeunload', () => {
  void audioContext?.close();
  audioContext = null;
});
