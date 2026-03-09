import {findPeaksAtThreshold, computeBpm} from './analyzer';
import {detectKeySync} from './key-analyzer';
import type {
  RealTimeBpmAnalyzerOptions,
  RealTimeBpmAnalyzerParameters,
  ValidPeaks,
  NextIndexPeaks,
  BpmCandidates,
  Threshold,
  RealtimeFindPeaksOptions,
  RealtimeAnalyzeChunkOptions,
  KeyCandidates,
  ProcessorOutputEvent,
} from './types';
import {
  generateValidPeaksModel,
  generateNextIndexPeaksModel,
  descendingOverThresholds,
} from './utils';
import * as consts from './consts';

/**
 * Initial value of key parameters of the analyzer
 */
const initialValue = {
  minValidThreshold: () => consts.minValidThreshold,
  validPeaks: () => generateValidPeaksModel(),
  nextIndexPeaks: () => generateNextIndexPeaksModel(),
  skipIndexes: () => 1,
  effectiveBufferTime: () => 0,
  accumulatedAudioData: () => new Float32Array(0),
  lastStableKey: undefined,
};

/**
 * Core analyzer class for real-time BPM detection.
 *
 * This class manages the state and logic for analyzing audio chunks in real-time
 * to detect beats per minute. It's used internally by the AudioWorklet processor.
 *
 * @remarks
 * Most users should use {@link createRealtimeBpmAnalyzer} instead of instantiating
 * this class directly. This class is primarily for internal use or advanced scenarios.
 *
 * @group Classes
 */
export class RealTimeBpmAnalyzer {
  /**
   * Default configuration
   */
  options: RealTimeBpmAnalyzerOptions = {
    continuousAnalysis: false,
    stabilizationTime: 20000,
    muteTimeInIndexes: 10000,
    debug: false,
    keyStabilizationTime: consts.defaultKeyStabilizationTime,
    enableKeyDetection: true,
  };

  /**
   * Minimum valid threshold, below this level result would be irrelevant.
   */
  minValidThreshold: Threshold = initialValue.minValidThreshold();
  /**
   * Contain all valid peaks
   */
  validPeaks: ValidPeaks = initialValue.validPeaks();
  /**
   * Next index (+10000 ...) to take care about peaks
   */
  nextIndexPeaks: NextIndexPeaks = initialValue.nextIndexPeaks();
  /**
   * Number / Position of chunks
   */
  skipIndexes: number = initialValue.skipIndexes();
  effectiveBufferTime: number = initialValue.effectiveBufferTime();
  /**
   * Computed values
   */
  computedStabilizationTimeInSeconds = 0;
  /**
   * Key detection - accumulated audio data
   */
  accumulatedAudioData: Float32Array = initialValue.accumulatedAudioData();
  /**
   * Last stable key detected
   */
  lastStableKey: KeyCandidates | undefined = initialValue.lastStableKey;
  /**
   * Key stabilization time in seconds
   */
  computedKeyStabilizationTimeInSeconds = 0;
  /**
   * Audio sample rate for key detection
   */
  audioSampleRate = 44100;

  /**
   * Key detection throttling - private fields must be declared after public fields
   */
  private lastKeyDetectionTime = 0;
  private keyDetectionInProgress = false;

  constructor(options: RealTimeBpmAnalyzerParameters = {}) {
    Object.assign(this.options, options);
    this.updateComputedValues();
  }

  /**
   * Update the computed values
   */
  updateComputedValues() {
    this.computedStabilizationTimeInSeconds = this.options.stabilizationTime / 1000;
    this.computedKeyStabilizationTimeInSeconds = this.options.keyStabilizationTime / 1000;
  }

  /**
   * Reset BPM computation properties to get a fresh start
   */
  reset(): void {
    this.minValidThreshold = initialValue.minValidThreshold();
    this.validPeaks = initialValue.validPeaks();
    this.nextIndexPeaks = initialValue.nextIndexPeaks();
    this.skipIndexes = initialValue.skipIndexes();
    this.effectiveBufferTime = initialValue.effectiveBufferTime();
    this.accumulatedAudioData = initialValue.accumulatedAudioData();
    this.lastStableKey = initialValue.lastStableKey;
  }

  /**
   * Remve all validPeaks between the minThreshold pass in param to optimize the weight of datas
   * @param minThreshold - Value between 0.9 and 0.2
   */
  async clearValidPeaks(minThreshold: Threshold): Promise<void> {
    this.minValidThreshold = minThreshold;

    await descendingOverThresholds(async threshold => {
      if (threshold < minThreshold && this.validPeaks[threshold] !== undefined) {
        delete this.validPeaks[threshold]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
        delete this.nextIndexPeaks[threshold]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
      }

      return false;
    });
  }

  /**
   * Attach this function to an audioprocess event on a audio/video node to compute BPM / Tempo in realtime
   * @param options - RealtimeAnalyzeChunkOptions
   * @param options.audioSampleRate - Audio sample rate (44100)
   * @param options.channelData - Channel data
   * @param options.bufferSize - Buffer size (4096)
   * @param options.postMessage - Function to post a message to the processor node
   */
  async analyzeChunk({audioSampleRate, channelData, bufferSize, postMessage}: RealtimeAnalyzeChunkOptions): Promise<void> {
    try {
      // Input validation
      if (!channelData || channelData.length === 0 || audioSampleRate <= 0) {
        return;
      }

      if (this.options.debug) {
        postMessage({type: 'analyzeChunk', data: channelData});
      }

      // We are summing up the size of each analyzed chunks in order to compute later if we reached the stabilizationTime
      // Ex: effectiveBufferTime / audioSampleRate = timeInSeconds (1000000/44100=22s)
      this.effectiveBufferTime += bufferSize;

      // Compute the maximum index with all previous chunks
      const currentMaxIndex = bufferSize * this.skipIndexes;

      // Compute the minimum index with all previous chunks
      const currentMinIndex = currentMaxIndex - bufferSize;

      // Mutate nextIndexPeaks and validPeaks if possible
      await this.findPeaks({
        audioSampleRate,
        channelData,
        bufferSize,
        currentMinIndex,
        currentMaxIndex,
        postMessage,
      });

      // Increment chunk
      this.skipIndexes++;

      const data: BpmCandidates = await computeBpm({audioSampleRate, data: this.validPeaks});
      const {threshold} = data;
      postMessage({type: 'bpm', data});

      // If the results found have a "high" threshold, the BPM is considered stable/strong
      if (this.minValidThreshold < threshold) {
        postMessage({type: 'bpmStable', data});
        await this.clearValidPeaks(threshold);
      }

      // Key detection with throttling
      if (this.options.enableKeyDetection) {
        await this.processKeyDetection(audioSampleRate, channelData, postMessage);
      }

      // After x time, we reinit the analyzer
      if (this.options.continuousAnalysis && this.effectiveBufferTime / audioSampleRate > this.computedStabilizationTimeInSeconds) {
        this.reset();
        postMessage({type: 'analyzerReset'});
      }
    } catch (error) {
      // Error handling to prevent AudioWorklet crash
      postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Unknown error in analyzeChunk',
          error: error instanceof Error ? error : new Error(String(error)),
        },
      });
    }
  }

  /**
   * Process key detection with throttling and error handling
   */
  private async processKeyDetection(
    audioSampleRate: number,
    channelData: Float32Array,
    postMessage: (data: ProcessorOutputEvent) => void,
  ): Promise<void> {
    const now = performance.now();

    // Throttling: avoid running key detection on every chunk
    if (now - this.lastKeyDetectionTime < consts.keyDetectionIntervalMs) {
      return;
    }

    // Prevent parallel execution
    if (this.keyDetectionInProgress) {
      return;
    }

    this.keyDetectionInProgress = true;
    this.lastKeyDetectionTime = now;

    try {
      // Accumulate audio data with memory limit
      const maxSamples = audioSampleRate * consts.maxAudioBufferSeconds;
      const newLength = Math.min(
        this.accumulatedAudioData.length + channelData.length,
        maxSamples,
      );

      if (this.accumulatedAudioData.length < maxSamples) {
        const newBuffer = new Float32Array(newLength);
        newBuffer.set(this.accumulatedAudioData, 0);
        const remaining = newLength - this.accumulatedAudioData.length;
        newBuffer.set(channelData.slice(0, remaining), this.accumulatedAudioData.length);
        this.accumulatedAudioData = newBuffer;
      }

      // Check if enough audio has been accumulated
      const minSamples = audioSampleRate * consts.keyDetectionMinSeconds;
      if (this.accumulatedAudioData.length < minSamples) {
        return;
      }

      const effectiveTime = this.effectiveBufferTime / audioSampleRate;

      // Execute key detection
      const keyData = detectKeySync({
        audioSampleRate,
        channelData: this.accumulatedAudioData,
      });

      postMessage({type: 'key', data: keyData});

      // Determine stable key
      const {key, mode, confidence} = keyData;
      const isConfidentEnough = confidence > consts.keyConfidenceThreshold;
      const isTimeReached = effectiveTime >= this.computedKeyStabilizationTimeInSeconds;
      const hasKeyChanged = !this.lastStableKey
        || this.lastStableKey.key !== key
        || this.lastStableKey.mode !== mode;

      if (isConfidentEnough && isTimeReached && hasKeyChanged) {
        this.lastStableKey = keyData;
        postMessage({type: 'keyStable', data: keyData});
      }
    } catch (keyError) {
      // Key detection failure should not affect main flow
      postMessage({
        type: 'error',
        data: {
          message: keyError instanceof Error ? keyError.message : 'Key detection failed',
          error: keyError instanceof Error ? keyError : new Error(String(keyError)),
        },
      });
    } finally {
      this.keyDetectionInProgress = false;
    }
  }

  /**
   * Find the best threshold with enought peaks
   * @param options - Options for finding peaks
   * @param options.audioSampleRate - Sample rate
   * @param options.channelData - Channel data
   * @param options.bufferSize - Buffer size
   * @param options.currentMinIndex - Current minimum index
   * @param options.currentMaxIndex - Current maximum index
   * @param options.postMessage - Function to post a message to the processor node
   */
  // eslint-disable-next-line @typescript-eslint/member-ordering
  async findPeaks({
    audioSampleRate,
    channelData,
    bufferSize,
    currentMinIndex,
    currentMaxIndex,
    postMessage,
  }: RealtimeFindPeaksOptions): Promise<void> {
    await descendingOverThresholds(async threshold => {
      if (this.nextIndexPeaks[threshold] >= currentMaxIndex) {
        return false;
      }

      /**
       * Get the next index in the next chunk
       */
      const offsetForNextPeak = this.nextIndexPeaks[threshold] % bufferSize; // 0 - 4095

      const {peaks, threshold: atThreshold} = findPeaksAtThreshold({audioSampleRate, data: channelData, threshold, offset: offsetForNextPeak});

      /**
       * Loop over peaks
       */
      if (peaks.length === 0) {
        return false;
      }

      for (const relativeChunkPeak of peaks) {
        const index = currentMinIndex + relativeChunkPeak;

        /**
         * Add current Index + muteTimeInIndexes (10000/44100=0.22s)
         */
        this.nextIndexPeaks[atThreshold] = index + this.options.muteTimeInIndexes;

        /**
         * Store valid relativeChunkPeak Indexes
         */
        this.validPeaks[atThreshold].push(index);

        if (this.options.debug) {
          postMessage({
            type: 'validPeak',
            data: {
              threshold: atThreshold,
              index,
            },
          });
        }
      }

      return false;
    }, this.minValidThreshold);
  }
}
