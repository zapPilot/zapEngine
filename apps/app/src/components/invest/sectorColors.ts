import { tokens } from '@zapengine/design-tokens/tokens';
import type { InvestSector } from '@/integration/investSectorModel';
export function sectorColor(sector: InvestSector): string {
  return tokens.color.pillar[sector.colorKey];
}
