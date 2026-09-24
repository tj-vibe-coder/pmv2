// AudioWorkletProcessor that forwards raw mono Float32 microphone frames to
// the main thread via postMessage. Downsampling/PCM16 encoding happens on
// the main thread (src/ai/audio/pcm.ts) so this stays minimal and testable
// only by inspection — AudioWorkletGlobalScope doesn't run under jsdom/Jest.
class IoctAssistCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (channel && channel.length > 0) {
      // Copy out of the reusable Worklet buffer before posting — the
      // underlying Float32Array is recycled by the audio thread on the next
      // render quantum.
      this.port.postMessage(channel.slice());
    }
    return true;
  }
}

registerProcessor('ioct-assist-capture', IoctAssistCaptureProcessor);
