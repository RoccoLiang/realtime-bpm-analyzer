# 🎵 Realtime BPM Analyzer

[![npm](https://img.shields.io/npm/v/realtime-bpm-analyzer.svg)](https://www.npmjs.com/package/realtime-bpm-analyzer)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A dependency-free TypeScript library for real-time BPM (Tempo) and Musical Key detection using the Web Audio API.

## ✨ Features

- **Zero Dependencies** - Pure Web Audio API implementation
- **Real-time BPM Detection** - Analyze audio as it plays
- **Musical Key Detection** - Detect key (C, C#, D, etc.) and mode (major/minor)
- **Microphone Input** - Live audio analysis from microphone
- **Typed Events** - Full TypeScript support with autocomplete
- **Client-side Only** - 100% privacy-focused, no data leaves your browser
- **Cyberpunk UI** - Modern neon-styled example included

## 📦 Installation

```bash
npm install realtime-bpm-analyzer
```

## 🚀 Quick Start

```typescript
import { createRealtimeBpmAnalyzer } from 'realtime-bpm-analyzer';

const audioContext = new AudioContext();
const analyzer = await createRealtimeBpmAnalyzer(audioContext);

// Connect your audio source
audioSource.connect(analyzer.node);

// Listen for BPM detection
analyzer.on('bpm', (data) => {
  console.log('BPM:', data.bpm[0].tempo);
});

// Listen for Key detection
analyzer.on('key', (data) => {
  console.log('Key:', data.key, data.mode);
});

// Listen for stable results
analyzer.on('bpmStable', (data) => {
  console.log('Stable BPM:', data.bpm[0].tempo);
});

analyzer.on('keyStable', (data) => {
  console.log('Stable Key:', data.key, data.mode);
});
```

## 🎯 API

### `createRealtimeBpmAnalyzer(audioContext, options)`

Creates a real-time BPM analyzer instance.

**Parameters:**
- `audioContext` - Web Audio API AudioContext
- `options` - Optional configuration

**Options:**
```typescript
{
  continuousAnalysis: boolean,  // Continue after stable BPM (default: false)
  stabilizationTime: number,   // Time to stabilize BPM (default: 20000ms)
  muteTimeInIndexes: number,    // Silence between peaks (default: 10000)
  debug: boolean,              // Enable debug events (default: false)
  keyStabilizationTime: number, // Time to stabilize Key (default: 30000ms)
  enableKeyDetection: boolean,   // Enable Key detection (default: true)
}
```

### `analyzeFullBuffer(audioBuffer, options)`

Offline BPM analysis of a complete audio file.

```typescript
const tempos = await analyzeFullBuffer(audioBuffer);
console.log('Detected BPM:', tempos[0].tempo);
```

### `detectKey(audioBuffer)`

Detect Musical Key from audio data.

```typescript
import { detectKey } from 'realtime-bpm-analyzer';

const result = await detectKey({
  audioSampleRate: 44100,
  channelData: audioBuffer.getChannelData(0)
});

console.log('Key:', result.key, result.mode);  // "C major"
console.log('Confidence:', result.confidence);   // 0.85
console.log('Chroma:', result.chroma);          // [0.9, 0.1, ...]
```

## 🎨 Example

Run the Cyberpunk-styled microphone example:

```bash
./run.sh
```

This will start the real-time BPM and Key detection demo with:
- Neon cyberpunk UI
- Live spectrum analyzer
- Real-time BPM display
- Musical Key detection

## 📁 Project Structure

```
realtime-bpm-analyzer/
├── src/
│   ├── core/
│   │   ├── analyzer.ts       # Offline BPM analysis
│   │   ├── bpm-analyzer.ts  # Event emitter wrapper
│   │   ├── key-analyzer.ts  # Musical Key detection
│   │   ├── realtime-bpm-analyzer.ts  # Real-time processor
│   │   └── types.ts        # TypeScript types
│   └── index.ts            # Main exports
├── examples/
│   └── 03-vanilla-microphone/  # Demo example
├── bin/                    # Build scripts
└── run.sh                  # Entry point
```

## 🔧 Build

```bash
npm run build
```

## 📄 License

Apache-2.0 License - See [LICENSE](LICENSE) for details.

## 👏 Credits

Inspired by [Tornqvist's bpm-detective](https://github.com/tornqvist/bpm-detective) and [Joe Sullivan's algorithm](http://joesul.li/van/beat-detection-using-web-audio/).
