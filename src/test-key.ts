import type { KeyInput } from './shortcuts';

// A keystroke for the tests: name the parts you are pressing, everything else is up. Only the test files
// import this — spelling out all six fields at every call site is the thing it exists to avoid.
export function key(overrides: Partial<KeyInput>): KeyInput {
  return { key: '', code: '', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...overrides };
}
