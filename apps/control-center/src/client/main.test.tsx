// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  renderArg: null as unknown,
  rootElement: null as unknown,
  renderCalls: 0,
}));

vi.mock('react-dom/client', () => ({
  createRoot: (element: unknown) => {
    state.rootElement = element;
    return {
      render: (node: unknown) => {
        state.renderArg = node;
        state.renderCalls += 1;
      },
    };
  },
}));

vi.mock('./App.js', () => ({
  App: () => null,
}));

describe('client entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    state.renderArg = null;
    state.rootElement = null;
    state.renderCalls = 0;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders the app inside StrictMode when the root exists', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import('./main.js');

    const { StrictMode } = await import('react');
    const { App } = await import('./App.js');
    expect(state.rootElement).toBe(document.getElementById('root'));
    expect(state.renderCalls).toBe(1);
    const rendered = state.renderArg as {
      type: unknown;
      props: { children: { type: unknown; props: unknown } };
    };
    expect(rendered.type).toBe(StrictMode);
    expect(rendered.props.children.type).toBe(App);
  });

  it('throws when the root element is missing', async () => {
    document.body.innerHTML = '';
    await expect(import('./main.js')).rejects.toThrow('Missing root element');
    expect(state.renderCalls).toBe(0);
  });
});
