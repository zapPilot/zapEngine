// Type definitions for Google Analytics gtag
declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js' | 'set',
      targetId: string,
      config?: Record<string, string | number | boolean>
    ) => void;
  }
}

export {};
