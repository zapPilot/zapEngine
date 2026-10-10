import type { InterestId } from '../types.js';

// Words the promo film (apps/video kokode-promo) adds on screen. The four tiles
// are the pilot workflows of INTEREST, shortened to fit a tile; the console is
// an illustrative screen, so every scene showing it carries screenImage.

export interface PromoUi {
  readonly tiles: readonly {
    readonly id: InterestId;
    readonly label: string;
  }[];
  /** One word per beat of the montage. */
  readonly pills: readonly string[];
  /** Sidebar heading above the tiles. */
  readonly workflows: string;
  readonly greeting: string;
}

export const PROMO_UI: PromoUi = {
  tiles: [
    { id: 'referral', label: '紹介状' },
    { id: 'search', label: '院内文書' },
    { id: 'materials', label: '説明用の図' },
    { id: 'voice', label: '音声から文書' },
  ],
  pills: ['聞く。', '下書き。', '院内で。'],
  workflows: '業務',
  greeting: 'どの業務から始めますか？',
};
