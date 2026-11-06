import type { Borehole, SoilLayer, SptTest, TechnicalEvent } from '@prisma/client';
import type { FieldChecklistItem } from '@spt/api-contracts';

/** Database rows behind TechnicalDetail; tests/api-contracts.test.ts checks their JSON form. */
export interface TechnicalDetailRows {
  hole: Borehole;
  tests: SptTest[];
  checklist: FieldChecklistItem[];
  layers: SoilLayer[];
  events: TechnicalEvent[];
}

/** Database rows behind SptMetreRecord. */
export type SptMetreRows = SptTest & { soil: SoilLayer[] };
