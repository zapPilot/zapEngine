import { tokens } from '@zapengine/design-tokens/tokens';
import type { InvestSector } from '@/integration/investSectorModel';
export function sectorColor(sector: InvestSector): string {
  return tokens.sleeve.night[sector.colorKey];
}
