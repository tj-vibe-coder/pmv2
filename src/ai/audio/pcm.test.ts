import {
  float32ToPcm16Le,
  pcm16LeToFloat32,
  downsampleMono,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './pcm';

it('encodes float samples as little-endian signed 16-bit PCM and clips out-of-range values', () => {
  const input = new Float32Array([0, 1, -1, 2, -2, 0.5, -0.5]);
  const buffer = float32ToPcm16Le(input);
  const view = new DataView(buffer);
  expect(buffer.byteLength).toBe(input.length * 2);
  expect(view.getInt16(0, true)).toBe(0);
  expect(view.getInt16(2, true)).toBe(0x7fff);
  expect(view.getInt16(4, true)).toBe(-0x8000);
  expect(view.getInt16(6, true)).toBe(0x7fff); // clipped from 2
  expect(view.getInt16(8, true)).toBe(-0x8000); // clipped from -2
});

it('round-trips float32 -> PCM16 -> float32 within a small tolerance', () => {
  const input = new Float32Array([0, 0.25, -0.25, 0.75, -0.75]);
  const roundTripped = pcm16LeToFloat32(float32ToPcm16Le(input));
  for (let i = 0; i < input.length; i += 1) {
    expect(Math.abs(roundTripped[i] - input[i])).toBeLessThan(0.001);
  }
});

it('downsamples 48kHz to 16kHz producing roughly a third of the samples', () => {
  const sourceRate = 48000;
  const targetRate = 16000;
  const input = new Float32Array(4800); // 100ms at 48kHz
  for (let i = 0; i < input.length; i += 1) input[i] = Math.sin(i / 10);

  const output = downsampleMono(input, sourceRate, targetRate);
  const expectedLength = Math.floor(input.length / 3);
  expect(Math.abs(output.length - expectedLength)).toBeLessThanOrEqual(1);
});

it('downsampling a constant signal preserves its value', () => {
  const input = new Float32Array(4800).fill(0.42);
  const output = downsampleMono(input, 48000, 16000);
  for (let i = 0; i < output.length; i += 1) {
    expect(Math.abs(output[i] - 0.42)).toBeLessThan(1e-6);
  }
});

it('returns the input unchanged when source and target rates match', () => {
  const input = new Float32Array([0.1, 0.2, 0.3]);
  expect(downsampleMono(input, 16000, 16000)).toBe(input);
});

it('throws if asked to upsample (only downsampling is supported)', () => {
  const input = new Float32Array([0.1, 0.2]);
  expect(() => downsampleMono(input, 8000, 16000)).toThrow();
});

it('round-trips an ArrayBuffer through base64 unchanged', () => {
  const bytes = new Uint8Array([0, 1, 2, 255, 128, 64]);
  const base64 = arrayBufferToBase64(bytes.buffer);
  const roundTripped = new Uint8Array(base64ToArrayBuffer(base64));
  expect(Array.from(roundTripped)).toEqual(Array.from(bytes));
});
