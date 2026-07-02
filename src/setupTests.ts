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

