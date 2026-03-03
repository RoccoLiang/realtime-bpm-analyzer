import {
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer,
  type BpmCandidates,
} from 'realtime-bpm-analyzer';

export type MicrophoneSession = {
  mediaStream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  bpmAnalyzer: BpmAnalyzer;
};

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
