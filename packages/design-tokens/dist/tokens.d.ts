export declare const MODES: readonly ['paper', 'night'];
export type Mode = (typeof MODES)[number];
export type Bezier = readonly [number, number, number, number];
export type ModeRole =
  | 'ground'
  | 'sheet'
  | 'well'
  | 'ink'
  | 'ink-2'
  | 'ink-3'
  | 'rule'
  | 'rule-2'
  | 'grid'
  | 'sign'
  | 'sign-ink'
  | 'on-sign'
  | 'sign-wash'
  | 'up'
  | 'down'
  | 'alert'
  | 'alert-wash'
  | 'scrim';
export type ModeRoles = Record<ModeRole, string>;
export type Sleeve = 'spy' | 'stable' | 'eth' | 'btc' | 'alt';
export type Material =
  | 'top'
  | 'front'
  | 'left'
  | 'edge'
  | 'ink-top'
  | 'ink-front'
  | 'ink-left'
  | 'floor'
  | 'shadow';
export type Status = 'live' | 'in-development' | 'research' | 'planned';
export type FontRole = 'display' | 'text' | 'mono';
export type NativeFont =
  | 'display-xl'
  | 'display'
  | 'heading'
  | 'text'
  | 'text-medium'
  | 'text-semibold'
  | 'mono'
  | 'mono-medium'
  | 'mono-semibold'
  | 'data';
export type TypeRole =
  | 'headline'
  | 'verdict'
  | 'display-xl'
  | 'display'
  | 'title'
  | 'heading'
  | 'body-lg'
  | 'body'
  | 'body-sm'
  | 'caption'
  | 'action'
  | 'label'
  | 'data-lg'
  | 'data-md'
  | 'data';
export interface Typography {
  size: number;
  line: number;
  tracking: number;
  weight: number;
  width: number;
  family: FontRole;
  native: NativeFont;
  case: 'uppercase' | 'none';
  numeric: 'normal' | 'tabular-nums';
}
export interface FontInstance {
  family: string;
  source: 'Archivo' | 'MartianMono';
  weight: number;
  width: number;
  file: string;
}
export type MarkLayer =
  | {
      id: string;
      kind: 'path';
      d: string;
      role: 'ink' | 'sign-ink';
      strokeWidth: number;
    }
  | {
      id: string;
      kind: 'circle';
      cx: number;
      cy: number;
      r: number;
      role: 'ink' | 'sign-ink';
    };
export interface DesignTokens {
  mode: Record<Mode, ModeRoles>;
  sleeve: Record<Mode, Record<Sleeve, string>>;
  material: Record<Mode, Record<Material, string>>;
  status: Record<
    Status,
    {
      glyph: 'filled' | 'half' | 'center-dot' | 'dashed-ring';
      line: 'solid' | 'dashed';
    }
  >;
  mark: {
    viewBox: readonly [number, number, number, number];
    layers: readonly MarkLayer[];
  };
  font: Record<
    FontRole,
    {
      family: string;
      web: string;
      fallback: string;
      axes: {
        wght: readonly [number, number];
        wdth: readonly [number, number];
      };
    }
  > & {
    native: Record<NativeFont, FontInstance>;
  };
  type: Record<TypeRole, Typography>;
  radius: Record<'tag' | 'control' | 'panel' | 'sheet' | 'round', number>;
  line: Record<'hair' | 'strong' | 'rail' | 'sheet-offset', number>;
  space: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  shadow: {
    overlay: Record<
      Mode,
      {
        css: string;
        elevation: number;
      }
    >;
  };
  duration: Record<'fast' | 'normal' | 'slow' | 'ambient', number>;
  easing: Record<'enter' | 'exit' | 'scene', Bezier>;
  motion: {
    'press-scale': number;
  };
  breakpoint: {
    medium: number;
    expanded: number;
  };
  container: {
    narrow: number;
    measure: number;
    reading: number;
    dashboard: number;
    page: number;
  };
  gutter: {
    compact: number;
    medium: number;
    expanded: number;
  };
  size: {
    hit: number;
    control: Record<'sm' | 'md' | 'lg', number>;
    icon: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number>;
    sidenav: number;
  };
}
export declare function loadTokens(): DesignTokens;
//# sourceMappingURL=tokens.d.ts.map
