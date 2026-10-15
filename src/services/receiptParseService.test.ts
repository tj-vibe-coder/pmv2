import { detectCropFromServer } from './receiptParseService';
test('crop request times out so unavailable Gemini does not block manual cropping', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  })) as jest.Mock;
  try {
    const result = detectCropFromServer('preview', 'image/jpeg').then(() => 'unexpected success', error => error.message);
    jest.advanceTimersByTime(12000);
    expect(await result).toBe('aborted');
  } finally { jest.useRealTimers(); }
});
