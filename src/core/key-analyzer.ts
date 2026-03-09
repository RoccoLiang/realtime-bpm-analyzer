/* eslint-disable @typescript-eslint/array-type, unicorn/no-new-array */
import type {KeyCandidates, KeyDetectOptions, KeyRoot, KeyMode} from './types';

// Constants
const keyDetectionMinSeconds = 2;
const keyConfidenceThreshold = 0.6;
const chromaVectorSize = 12;
const minFreq = 50;
const maxFreq = 2000;

/**
 * Krumhansl-Schmuckler key profiles - major
 * Each row represents the typical pitch class distribution for keys C through B
 */
const majorProfiles: readonly (readonly number[])[] = [
  [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  [6.33, 2.68, 3.52, 2.54, 4.8, 3.98, 2.27, 4.26, 2.73, 3.17, 2.41, 2.63],
  [6.31, 2.21, 3.12, 2.83, 4.1, 3.9, 2.38, 4.83, 2.77, 2.92, 2.34, 2.67],
  [6.36, 2.29, 3.41, 2.41, 4.43, 4.04, 2.46, 5.01, 2.44, 3.74, 2.48, 2.81],
  [6.28, 2.26, 3.32, 2.33, 4.07, 4, 2.35, 4.93, 2.67, 2.95, 2.27, 2.7],
  [6.38, 2.64, 3.35, 2.32, 4.12, 4.03, 2.77, 4.83, 2.89, 3.31, 2.74, 2.69],
  [6.3, 2.35, 3.44, 2.28, 4.34, 3.95, 2.44, 5.22, 2.64, 3.14, 2.33, 2.62],
  [6.4, 2.2, 3.44, 2.36, 4.51, 3.97, 2.36, 5.17, 2.51, 3.65, 2.33, 2.77],
  [6.34, 2.6, 3.49, 2.41, 4.72, 3.94, 2.31, 4.47, 2.65, 3.03, 2.51, 2.73],
  [6.28, 2.27, 3.45, 2.48, 4.38, 4.04, 2.3, 4.89, 2.58, 3.03, 2.17, 2.79],
  [6.34, 2.58, 3.5, 2.4, 4.67, 3.89, 2.46, 4.53, 2.69, 3.28, 2.34, 2.79],
  [6.33, 2.32, 3.58, 2.29, 4.4, 4.08, 2.56, 5.04, 2.36, 3.5, 2.43, 2.7],
];

/**
 * Krumhansl-Schmuckler key profiles - minor
 * Each row represents the typical pitch class distribution for keys C through B
 */
const minorProfiles: readonly (readonly number[])[] = [
  [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
  [6.28, 2.37, 3.32, 5.43, 2.71, 3.43, 2.5, 4.9, 3.8, 2.83, 2.91, 3.36],
  [6.37, 2.63, 3.41, 5.36, 2.51, 3.47, 2.63, 4.93, 3.8, 2.9, 3.07, 3.23],
  [6.28, 2.27, 3.3, 5.54, 2.53, 3.45, 2.56, 4.75, 3.93, 2.81, 2.83, 3.4],
  [6.35, 2.5, 3.45, 5.4, 2.63, 3.56, 2.55, 4.8, 3.91, 2.79, 3.19, 3.24],
  [6.38, 2.67, 3.27, 5.3, 2.51, 3.55, 2.61, 4.75, 3.82, 2.84, 2.96, 3.16],
  [6.32, 2.4, 3.36, 5.32, 2.55, 3.62, 2.58, 4.85, 3.76, 2.79, 2.91, 3.32],
  [6.32, 2.53, 3.48, 5.39, 2.6, 3.47, 2.61, 4.85, 3.95, 2.84, 3.01, 3.25],
  [6.28, 2.45, 3.4, 5.44, 2.7, 3.46, 2.5, 4.79, 3.86, 2.76, 2.91, 3.3],
  [6.38, 2.56, 3.44, 5.39, 2.64, 3.52, 2.64, 4.81, 3.96, 2.84, 2.98, 3.26],
  [6.27, 2.3, 3.36, 5.53, 2.64, 3.52, 2.49, 4.79, 3.85, 2.71, 2.92, 3.39],
  [6.35, 2.56, 3.46, 5.34, 2.62, 3.55, 2.61, 4.8, 3.92, 2.85, 3.06, 3.19],
];

/**
 * Note names in chromatic order
 */
const noteNames: readonly KeyRoot[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// Frequency cache to avoid recomputation
const pitchClassFrequenciesCache = new Map<number, Map<KeyRoot, number[]>>();

/**
 * Get or generate pitch class frequencies for a given sample rate
 * Uses caching to avoid recomputation
 */
function getPitchClassFrequencies(sampleRate: number): Map<KeyRoot, number[]> {
  let cache = pitchClassFrequenciesCache.get(sampleRate);
  if (cache) {
    return cache;
  }

  cache = new Map<KeyRoot, number[]>();

  for (let semitone = 0; semitone < chromaVectorSize; semitone++) {
    const baseFreq = 440 * (2 ** ((semitone - 9) / 12)); // A4 = 440Hz
    const harmonics: number[] = [];

    // Generate harmonics up to maxFreq
    let harmonic = 1;
    let freq = baseFreq * harmonic;
    while (freq <= maxFreq && freq >= minFreq) {
      harmonics.push(freq);
      harmonic++;
      freq = baseFreq * harmonic;
    }

    // Add lower octave
    if (baseFreq / 2 >= minFreq) {
      harmonics.unshift(baseFreq / 2);
    }

    cache.set(noteNames[semitone], harmonics);
  }

  pitchClassFrequenciesCache.set(sampleRate, cache);
  return cache;
}

/**
 * Compute DFT magnitude for specific frequencies
 */
function computeDftMagnitudes(
  signal: Float32Array,
  sampleRate: number,
  frequencies: number[],
): number[] {
  const n = signal.length;
  const magnitudes: number[] = [];

  for (const freq of frequencies) {
    const omega = (2 * Math.PI * freq) / sampleRate;
    let real = 0;
    let imag = 0;

    for (let i = 0; i < n; i++) {
      const coefCos = Math.cos(omega * i);
      const coefSin = Math.sin(omega * i);
      real += signal[i] * coefCos;
      imag -= signal[i] * coefSin;
    }

    magnitudes.push(Math.hypot(real, imag) / n);
  }

  return magnitudes;
}

/**
 * Compute chromagram from audio signal
 */
function computeChroma(signal: Float32Array, sampleRate: number): number[] {
  const pitchFreqs = getPitchClassFrequencies(sampleRate);
  const chroma: number[] = [];

  for (const freqs of Array.from(pitchFreqs.values())) {
    const magnitudes = computeDftMagnitudes(signal, sampleRate, freqs);
    const total = magnitudes.reduce((sum, m) => sum + m, 0);
    chroma.push(total);
  }

  // Normalize
  const maxMag = Math.max(...chroma);
  if (maxMag > 0) {
    return chroma.map(m => m / maxMag);
  }

  return chroma.map(() => 0);
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // eslint-disable-next-line unicorn/no-for-loop
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / Math.hypot(normA, normB);
}

/**
 * Internal key detection implementation
 */
function detectKeyInternal(options: KeyDetectOptions): KeyCandidates {
  const {audioSampleRate, channelData, fftSize = 2048} = options;

  // Input validation: return default for empty data
  if (!channelData || channelData.length === 0) {
    const defaultChroma = new Array(chromaVectorSize).fill(0);
    return {
      key: 'C',
      mode: 'major',
      confidence: 0,
      chroma: defaultChroma as readonly number[],
    };
  }

  // Limit fftSize to prevent memory issues
  const safeFftSize = Math.min(fftSize, 16384);
  const segmentLength = Math.min(safeFftSize * 4, channelData.length);
  const segment = channelData.slice(0, segmentLength);

  const chroma = computeChroma(segment, audioSampleRate);

  let bestKey: KeyRoot = 'C';
  let bestMode: KeyMode = 'major';
  let bestConfidence = -1;

  // Pre-allocate buffer to avoid repeated allocation
  const shiftedChroma: number[] = [];

  for (let keyIndex = 0; keyIndex < 12; keyIndex++) {
    // Rotate chroma vector
    for (let i = 0; i < chromaVectorSize; i++) {
      shiftedChroma[i] = chroma[(i + keyIndex) % 12];
    }

    // Compare with major profile
    const majorProfile = majorProfiles[keyIndex];
    const majorSimilarity = cosineSimilarity(shiftedChroma, majorProfile);

    if (majorSimilarity > bestConfidence) {
      bestConfidence = majorSimilarity;
      bestKey = noteNames[keyIndex];
      bestMode = 'major';
    }

    // Compare with minor profile
    const minorProfile = minorProfiles[keyIndex];
    const minorSimilarity = cosineSimilarity(shiftedChroma, minorProfile);

    if (minorSimilarity > bestConfidence) {
      bestConfidence = minorSimilarity;
      bestKey = noteNames[keyIndex];
      bestMode = 'minor';
    }
  }

  // Normalize confidence to 0-1 range
  const normalizedConfidence = Math.min(1, Math.max(0, (bestConfidence + 1) / 2));

  return {
    key: bestKey,
    mode: bestMode,
    confidence: normalizedConfidence,
    chroma: chroma as readonly number[],
  };
}

/**
 * Detect musical key from audio signal (async wrapper for API compatibility)
 */
export async function detectKey(options: KeyDetectOptions): Promise<KeyCandidates> {
  return detectKeyInternal(options);
}

/**
 * Synchronous key detection for offline analysis
 */
export function detectKeySync(options: KeyDetectOptions): KeyCandidates {
  return detectKeyInternal(options);
}
