// Served copy of src/ai/audio/ioct-assist-capture.worklet.js — CRA cannot
// serve arbitrary src/ files as raw browser URLs (AudioWorklet.addModule
// requires a fetchable URL, not a bundled import), so this file must be kept
// byte-identical to the canonical source under src/ai/audio/. If you edit
// one, edit both.
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
