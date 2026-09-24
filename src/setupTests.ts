// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock @react-pdf/renderer to avoid ESM parsing issues in node_modules during tests
jest.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: any) => children || null,
  Page: ({ children }: any) => children || null,
  Text: ({ children }: any) => children || null,
  View: ({ children }: any) => children || null,
  Image: () => null,
  StyleSheet: {
    create: (styles: any) => styles,
  },
  Font: {
    register: () => {},
  },
  pdf: () => ({
    toBlob: async () => new Blob(),
  }),
}));

// Mock @google/genai to avoid ESM parsing issues in node_modules during tests
// (its browser build ships raw `import` syntax Jest can't transform out of
// the box). Real usage is server-only (require, CJS) or in src/ai/liveSession.ts,
// which is intentionally untested here — see that file's header comment.
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(),
}));

