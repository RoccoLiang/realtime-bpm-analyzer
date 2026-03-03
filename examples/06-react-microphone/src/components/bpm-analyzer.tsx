import { useState, useEffect, useRef } from 'react';
import { type BpmCandidates } from 'realtime-bpm-analyzer';
import {
  getMicrophoneErrorMessage,
  startMicrophoneSession,
  stopMicrophoneSession,
  type MicrophoneSession,
} from '../../../shared/microphone-session';
import './bpm-analyzer.css';

function BpmAnalyzer() {
  const [bpm, setBpm] = useState<number | undefined>();
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | undefined>();
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneSessionRef = useRef<MicrophoneSession | null>(null);

  useEffect(() => {
    return () => {
      void disconnect().finally(() => {
        void audioContextRef.current?.close();
        audioContextRef.current = null;
      });
    };
  }, []);

  const disconnect = async () => {
    if (microphoneSessionRef.current) {
      stopMicrophoneSession(microphoneSessionRef.current);
      microphoneSessionRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      await audioContextRef.current.suspend();
    }

    setIsRecording(false);
    setBpm(undefined);
  };

  const handleStart = async () => {
    try {
      setError(undefined);

      const audioCtx = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      microphoneSessionRef.current = await startMicrophoneSession(
        audioCtx,
        (data: BpmCandidates) => {
          if (data.bpm.length > 0) {
            setBpm(data.bpm[0].tempo);
          }
        },
      );

      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);

      setError(getMicrophoneErrorMessage(err));
    }
  };

  const handleStop = () => {
    void disconnect();
  };

  return (
    <div className="bpm-analyzer">
      <div className="controls">
        <button 
          onClick={handleStart} 
          disabled={isRecording}
          className="start-btn"
        >
          🎤 Start Recording
        </button>
        <button 
          onClick={handleStop} 
          disabled={!isRecording}
        >
          ⏹ Stop
        </button>
      </div>

      {error && (
        <div className="status error">
          {error}
        </div>
      )}

      {isRecording && !error && bpm !== undefined && (
        <div className="status success">
          Stable BPM detected: {Math.round(bpm)}
        </div>
      )}

      {isRecording && !error && bpm === undefined && (
        <div className="status success">
          Listening for music - play something!
        </div>
      )}

      <div className={`bpm-display ${bpm !== undefined ? 'visible' : ''}`}>
        <div className="bpm-value">{bpm !== undefined ? Math.round(bpm) : '--'}</div>
        <div className="bpm-label">BPM</div>
      </div>
    </div>
  );
}

export default BpmAnalyzer;
