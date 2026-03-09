import {
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer,
  type BpmCandidates,
  type KeyCandidates,
} from 'realtime-bpm-analyzer';

export type MicrophoneSession = {
  mediaStream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  bpmAnalyzer: BpmAnalyzer;
};

export type EnergyLevel = 'Low' | 'Medium' | 'High' | 'Peak';

export type EnergySnapshot = {
  score: number;
  rms: number;
  flux: number;
  lowBand: number;
  level: EnergyLevel;
};

type StopFn = () => void;

export function getMicrophoneErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Failed to access microphone';
  }

  if (error.name === 'NotAllowedError') {
    return 'Microphone access denied. Please allow microphone access.';
  }

  if (error.name === 'NotFoundError') {
    return 'No microphone found. Please connect a microphone.';
  }

  return error.message;
}

export async function startMicrophoneSession(
  audioContext: AudioContext,
  onBpmStable: (data: BpmCandidates) => void,
  onKeyStable?: (data: KeyCandidates) => void,
): Promise<MicrophoneSession> {
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const bpmAnalyzer = await createRealtimeBpmAnalyzer(audioContext);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;

  const source = audioContext.createMediaStreamSource(mediaStream);
  source.connect(analyser);
  source.connect(bpmAnalyzer.node);

  bpmAnalyzer.on('bpmStable', onBpmStable);

  if (onKeyStable) {
    bpmAnalyzer.on('keyStable', onKeyStable);
  }

  return {
    mediaStream,
    source,
    analyser,
    bpmAnalyzer,
  };
}

export function stopMicrophoneSession(session: MicrophoneSession): void {
  session.source.disconnect();
  session.analyser.disconnect();
  session.bpmAnalyzer.disconnect();
  session.mediaStream.getTracks().forEach(track => track.stop());
}

export function createEnergyMonitor(
  analyser: AnalyserNode,
  onEnergy: (energy: EnergySnapshot) => void,
): StopFn {
  const timeData = new Uint8Array(analyser.fftSize);
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  const previousFrequencyData = new Uint8Array(analyser.frequencyBinCount);
  const nyquist = analyser.context.sampleRate / 2;
  const lowBandEnd = Math.max(
    1,
    Math.floor((200 / nyquist) * analyser.frequencyBinCount),
  );

  let rafId = 0;

  const tick = () => {
    analyser.getByteTimeDomainData(timeData);
    analyser.getByteFrequencyData(frequencyData);

    let sumSquares = 0;
    for (const sample of timeData) {
      const normalized = (sample - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / timeData.length);

    let lowBandSum = 0;
    for (let i = 0; i < lowBandEnd; i++) {
      lowBandSum += frequencyData[i];
    }
    const lowBand = lowBandSum / (lowBandEnd * 255);

    let positiveDiff = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      const diff = frequencyData[i] - previousFrequencyData[i];
      if (diff > 0) {
        positiveDiff += diff;
      }
      previousFrequencyData[i] = frequencyData[i];
    }
    const flux = positiveDiff / (frequencyData.length * 255);

    const weighted = rms * 0.45 + flux * 0.35 + lowBand * 0.2;
    const score = Math.max(0, Math.min(100, weighted * 100));
    const level = getEnergyLevel(score);

    onEnergy({ score, rms, flux, lowBand, level });

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
  };
}

export function createSpectrumMonitor(
  analyser: AnalyserNode,
  onFrame: (bins: Uint8Array) => void,
): StopFn {
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  let rafId = 0;

  const tick = () => {
    analyser.getByteFrequencyData(frequencyData);
    onFrame(frequencyData);
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
  };
}

function getEnergyLevel(score: number): EnergyLevel {
  if (score < 25) {
    return 'Low';
  }

  if (score < 50) {
    return 'Medium';
  }

  if (score < 75) {
    return 'High';
  }

  return 'Peak';
}
