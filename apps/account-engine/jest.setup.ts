Object.defineProperty(global, 'TextEncoder', {
  value: TextEncoder,
  writable: true,
});

Object.defineProperty(global, 'TextDecoder', {
  value: TextDecoder,
  writable: true,
});

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
