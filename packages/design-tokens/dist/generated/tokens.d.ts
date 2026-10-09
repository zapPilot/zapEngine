export declare const tokens: {
  readonly mode: {
    readonly paper: {
      readonly ground: '#f4f4f1';
      readonly sheet: '#ffffff';
      readonly well: '#eaeae5';
      readonly ink: '#111111';
      readonly 'ink-2': '#45453f';
      readonly 'ink-3': '#5f5f59';
      readonly rule: 'rgba(17,17,17,.14)';
      readonly 'rule-2': 'rgba(17,17,17,.34)';
      readonly grid: 'rgba(17,17,17,.055)';
      readonly sign: '#2540f5';
      readonly 'sign-ink': '#2540f5';
      readonly 'on-sign': '#ffffff';
      readonly 'sign-wash': 'rgba(37,64,245,.07)';
      readonly up: '#0f6d41';
      readonly down: '#a83119';
      readonly alert: '#a83119';
      readonly 'alert-wash': 'rgba(168, 49, 25, 0.1)';
      readonly scrim: 'rgba(17, 17, 17, 0.4)';
    };
    readonly night: {
      readonly ground: '#0e0f11';
      readonly sheet: '#16171a';
      readonly well: '#1c1d21';
      readonly ink: '#eeeeea';
      readonly 'ink-2': '#b9b9b3';
      readonly 'ink-3': '#989892';
      readonly rule: 'rgba(238,238,234,.14)';
      readonly 'rule-2': 'rgba(238,238,234,.34)';
      readonly grid: 'rgba(238,238,234,.045)';
      readonly sign: '#4058ff';
      readonly 'sign-ink': '#9aa6ff';
      readonly 'on-sign': '#ffffff';
      readonly 'sign-wash': 'rgba(64,88,255,.14)';
      readonly up: '#5bd18b';
      readonly down: '#ff7a66';
      readonly alert: '#ff7a66';
      readonly 'alert-wash': 'rgba(255, 122, 102, 0.14)';
      readonly scrim: 'rgba(0, 0, 0, 0.72)';
    };
  };
  readonly sleeve: {
    readonly paper: {
      readonly spy: '#3d4350';
      readonly stable: '#2e7f6e';
      readonly eth: '#8e8ad8';
      readonly btc: '#e39b2d';
      readonly alt: '#cbbfae';
    };
    readonly night: {
      readonly spy: '#6e7686';
      readonly stable: '#3fa38b';
      readonly eth: '#a7a2ee';
      readonly btc: '#f3b54e';
      readonly alt: '#e3d9ca';
    };
  };
  readonly material: {
    readonly paper: {
      readonly top: '#ffffff';
      readonly front: '#e6e6e1';
      readonly left: '#d2d2cc';
      readonly edge: 'rgba(17,17,17,.2)';
      readonly 'ink-top': '#4a4a44';
      readonly 'ink-front': '#1c1c1a';
      readonly 'ink-left': '#0b0b0a';
      readonly floor: 'rgba(17,17,17,.08)';
      readonly shadow: 'rgba(17,17,17,.2)';
    };
    readonly night: {
      readonly top: '#2b2c31';
      readonly front: '#1f2024';
      readonly left: '#17181b';
      readonly edge: 'rgba(238,238,234,.16)';
      readonly 'ink-top': '#f4f4f0';
      readonly 'ink-front': '#c9c9c3';
      readonly 'ink-left': '#a3a39d';
      readonly floor: 'rgba(238,238,234,.065)';
      readonly shadow: 'rgba(0,0,0,.6)';
    };
  };
  readonly status: {
    readonly live: {
      readonly glyph: 'filled';
      readonly line: 'solid';
    };
    readonly 'in-development': {
      readonly glyph: 'half';
      readonly line: 'dashed';
    };
    readonly research: {
      readonly glyph: 'center-dot';
      readonly line: 'dashed';
    };
    readonly planned: {
      readonly glyph: 'dashed-ring';
      readonly line: 'dashed';
    };
  };
  readonly mark: {
    readonly viewBox: readonly [0, 0, 32, 32];
    readonly layers: readonly [
      {
        readonly id: 'arc';
        readonly kind: 'path';
        readonly d: 'M7.5 24.5A12 12 0 1 1 24.5 24.5';
        readonly role: 'ink';
        readonly strokeWidth: 2.2;
      },
      {
        readonly id: 'ticks';
        readonly kind: 'path';
        readonly d: 'M16 6.4v2.2M9.2 9.2l1.6 1.6M22.8 9.2l-1.6 1.6';
        readonly role: 'ink';
        readonly strokeWidth: 1.6;
      },
      {
        readonly id: 'needle';
        readonly kind: 'path';
        readonly d: 'M16 16l-3.3-7.6';
        readonly role: 'sign-ink';
        readonly strokeWidth: 2.2;
      },
      {
        readonly id: 'pivot';
        readonly kind: 'circle';
        readonly cx: 16;
        readonly cy: 16;
        readonly r: 2.6;
        readonly role: 'ink';
      },
    ];
  };
  readonly font: {
    readonly display: {
      readonly family: 'Archivo';
      readonly web: 'Archivo Variable';
      readonly fallback: '"Helvetica Neue", Helvetica, system-ui, sans-serif';
      readonly axes: {
        readonly wght: readonly [100, 900];
        readonly wdth: readonly [62, 125];
      };
    };
    readonly text: {
      readonly family: 'Archivo';
      readonly web: 'Archivo Variable';
      readonly fallback: '"Helvetica Neue", Helvetica, system-ui, sans-serif';
      readonly axes: {
        readonly wght: readonly [100, 900];
        readonly wdth: readonly [62, 125];
      };
    };
    readonly mono: {
      readonly family: 'Martian Mono';
      readonly web: 'Martian Mono Variable';
      readonly fallback: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
      readonly axes: {
        readonly wght: readonly [100, 800];
        readonly wdth: readonly [75, 112.5];
      };
    };
    readonly native: {
      readonly 'display-xl': {
        readonly family: 'Archivo DisplayXL';
        readonly source: 'Archivo';
        readonly weight: 660;
        readonly width: 112;
        readonly file: 'Archivo-DisplayXL.ttf';
      };
      readonly display: {
        readonly family: 'Archivo Display';
        readonly source: 'Archivo';
        readonly weight: 640;
        readonly width: 108;
        readonly file: 'Archivo-Display.ttf';
      };
      readonly heading: {
        readonly family: 'Archivo Heading';
        readonly source: 'Archivo';
        readonly weight: 640;
        readonly width: 106;
        readonly file: 'Archivo-Heading.ttf';
      };
      readonly text: {
        readonly family: 'Archivo Text';
        readonly source: 'Archivo';
        readonly weight: 400;
        readonly width: 100;
        readonly file: 'Archivo-Text.ttf';
      };
      readonly 'text-medium': {
        readonly family: 'Archivo TextMedium';
        readonly source: 'Archivo';
        readonly weight: 500;
        readonly width: 100;
        readonly file: 'Archivo-TextMedium.ttf';
      };
      readonly 'text-semibold': {
        readonly family: 'Archivo TextSemiBold';
        readonly source: 'Archivo';
        readonly weight: 600;
        readonly width: 100;
        readonly file: 'Archivo-TextSemiBold.ttf';
      };
      readonly mono: {
        readonly family: 'MartianMono Text';
        readonly source: 'MartianMono';
        readonly weight: 400;
        readonly width: 100;
        readonly file: 'MartianMono-Text.ttf';
      };
      readonly 'mono-medium': {
        readonly family: 'MartianMono Medium';
        readonly source: 'MartianMono';
        readonly weight: 500;
        readonly width: 100;
        readonly file: 'MartianMono-Medium.ttf';
      };
      readonly 'mono-semibold': {
        readonly family: 'MartianMono SemiBold';
        readonly source: 'MartianMono';
        readonly weight: 600;
        readonly width: 100;
        readonly file: 'MartianMono-SemiBold.ttf';
      };
      readonly data: {
        readonly family: 'MartianMono Data';
        readonly source: 'MartianMono';
        readonly weight: 500;
        readonly width: 87.5;
        readonly file: 'MartianMono-Data.ttf';
      };
    };
  };
  readonly type: {
    readonly 'display-xl': {
      readonly size: 104;
      readonly line: 99;
      readonly tracking: -0.035;
      readonly weight: 660;
      readonly width: 112;
      readonly family: 'display';
      readonly native: 'display-xl';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly display: {
      readonly size: 56;
      readonly line: 57;
      readonly tracking: -0.032;
      readonly weight: 640;
      readonly width: 108;
      readonly family: 'display';
      readonly native: 'display';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly title: {
      readonly size: 26;
      readonly line: 29;
      readonly tracking: -0.02;
      readonly weight: 640;
      readonly width: 108;
      readonly family: 'display';
      readonly native: 'display';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly heading: {
      readonly size: 19;
      readonly line: 26;
      readonly tracking: -0.01;
      readonly weight: 640;
      readonly width: 106;
      readonly family: 'display';
      readonly native: 'heading';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly 'body-lg': {
      readonly size: 17;
      readonly line: 27;
      readonly tracking: 0;
      readonly weight: 400;
      readonly width: 100;
      readonly family: 'text';
      readonly native: 'text';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly body: {
      readonly size: 15;
      readonly line: 24;
      readonly tracking: 0;
      readonly weight: 400;
      readonly width: 100;
      readonly family: 'text';
      readonly native: 'text';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly 'body-sm': {
      readonly size: 13;
      readonly line: 20;
      readonly tracking: 0;
      readonly weight: 400;
      readonly width: 100;
      readonly family: 'text';
      readonly native: 'text';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly caption: {
      readonly size: 12;
      readonly line: 18;
      readonly tracking: 0;
      readonly weight: 400;
      readonly width: 100;
      readonly family: 'text';
      readonly native: 'text';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly action: {
      readonly size: 15;
      readonly line: 20;
      readonly tracking: 0;
      readonly weight: 600;
      readonly width: 100;
      readonly family: 'text';
      readonly native: 'text-semibold';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly label: {
      readonly size: 11;
      readonly line: 16;
      readonly tracking: 0.08;
      readonly weight: 500;
      readonly width: 100;
      readonly family: 'mono';
      readonly native: 'mono-medium';
      readonly case: 'uppercase';
      readonly numeric: 'normal';
    };
    readonly 'data-lg': {
      readonly size: 42;
      readonly line: 42;
      readonly tracking: -0.03;
      readonly weight: 500;
      readonly width: 87.5;
      readonly family: 'mono';
      readonly native: 'data';
      readonly case: 'none';
      readonly numeric: 'tabular-nums';
    };
    readonly 'data-md': {
      readonly size: 16;
      readonly line: 20;
      readonly tracking: -0.01;
      readonly weight: 500;
      readonly width: 100;
      readonly family: 'mono';
      readonly native: 'mono-medium';
      readonly case: 'none';
      readonly numeric: 'tabular-nums';
    };
    readonly data: {
      readonly size: 12;
      readonly line: 18;
      readonly tracking: 0;
      readonly weight: 400;
      readonly width: 100;
      readonly family: 'mono';
      readonly native: 'mono';
      readonly case: 'none';
      readonly numeric: 'tabular-nums';
    };
    readonly headline: {
      readonly size: 36;
      readonly line: 38;
      readonly tracking: -0.035;
      readonly weight: 640;
      readonly width: 108;
      readonly family: 'display';
      readonly native: 'display';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
    readonly verdict: {
      readonly size: 64;
      readonly line: 60;
      readonly tracking: -0.04;
      readonly weight: 660;
      readonly width: 112;
      readonly family: 'display';
      readonly native: 'display-xl';
      readonly case: 'none';
      readonly numeric: 'normal';
    };
  };
  readonly radius: {
    readonly tag: 2;
    readonly control: 6;
    readonly panel: 8;
    readonly sheet: 12;
    readonly round: 999;
  };
  readonly line: {
    readonly hair: 1;
    readonly strong: 1.5;
    readonly rail: 3;
    readonly 'sheet-offset': 8;
  };
  readonly space: readonly [4, 8, 12, 16, 24, 32, 48, 64, 104];
  readonly shadow: {
    readonly overlay: {
      readonly paper: {
        readonly css: '0 16px 64px rgba(17, 17, 17, 0.16)';
        readonly elevation: 12;
      };
      readonly night: {
        readonly css: '0 16px 64px rgba(0, 0, 0, 0.6)';
        readonly elevation: 12;
      };
    };
  };
  readonly duration: {
    readonly fast: 100;
    readonly normal: 160;
    readonly slow: 240;
    readonly ambient: 1200;
  };
  readonly easing: {
    readonly enter: readonly [0.2, 0, 0, 1];
    readonly exit: readonly [0.4, 0, 1, 1];
    readonly scene: readonly [0.16, 1, 0.3, 1];
  };
  readonly motion: {
    readonly 'press-scale': 0.98;
  };
  readonly breakpoint: {
    readonly medium: 768;
    readonly expanded: 1024;
  };
  readonly container: {
    readonly narrow: 480;
    readonly measure: 560;
    readonly reading: 720;
    readonly dashboard: 1120;
    readonly page: 1312;
  };
  readonly gutter: {
    readonly compact: 20;
    readonly medium: 32;
    readonly expanded: 40;
  };
  readonly size: {
    readonly hit: 44;
    readonly control: {
      readonly sm: 32;
      readonly md: 48;
      readonly lg: 56;
    };
    readonly icon: {
      readonly xs: 14;
      readonly sm: 16;
      readonly md: 20;
      readonly lg: 24;
      readonly xl: 28;
    };
    readonly sidenav: 248;
  };
};
//# sourceMappingURL=tokens.d.ts.map
