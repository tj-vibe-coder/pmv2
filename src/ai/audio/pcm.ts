/** Clips to [-1, 1] and encodes as little-endian signed 16-bit PCM. */
export function float32ToPcm16Le(input: Float32Array): ArrayBuffer {
  const out = new ArrayBuffer(input.length * 2);
  const view = new DataView(out);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return out;
}

/** Decodes little-endian signed 16-bit PCM back to floats in [-1, 1]. */
export function pcm16LeToFloat32(input: ArrayBuffer): Float32Array {
  const view = new DataView(input);
  const out = new Float32Array(input.byteLength / 2);
  for (let i = 0; i < out.length; i += 1) {
    const sample = view.getInt16(i * 2, true);
    out[i] = sample < 0 ? sample / 0x8000 : sample / 0x7fff;
  }
  return out;
}

/** Linear-interpolation resample from sourceRate to targetRate (mono). */
export function downsampleMono(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (targetRate === sourceRate) return input;
  if (targetRate > sourceRate) {
    throw new Error('downsampleMono only supports downsampling (targetRate must be <= sourceRate)');
  }
  const ratio = sourceRate / targetRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j];
      count += 1;
    }
    out[i] = count > 0 ? sum / count : input[Math.min(start, input.length - 1)];
  }
  return out;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
