export const ASSET_GLYPH_PATHS = {
  btc: 'M12 3v18M16 3v18M7 6h8a3 3 0 0 1 0 6H7m0 0h9a3 3 0 0 1 0 6H7M9 6v12',
  eth: 'M12 2 5 12l7 4 7-4-7-10ZM5 15l7 7 7-7-7 4-7-4Z',
  stable:
    'M5 5a10 10 0 0 0 0 14m14-14a10 10 0 0 1 0 14M15 7H10a3 3 0 0 0 0 5h4a3 3 0 0 1 0 5H9m3-12v14',
  spy: 'M3 21V12h4v9m3 0V4h4v17m3 0V8h4v13',
} as const;
export type Sleeve = keyof typeof ASSET_GLYPH_PATHS;
