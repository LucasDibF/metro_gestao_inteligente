import { BadRequestException } from '@nestjs/common';
import { object } from '../auth/auth-input';
import { isUuid } from '../common/uuid';
/** A folder or borehole as the hierarchy forms send it. */
export interface HierarchyInput {
  name: string;
  code: string;
  folderId: string | null;
  plannedDepthM: string | null;
  version: number | undefined;
}
export function hierarchyInput(body: unknown, borehole: boolean, editing: boolean): HierarchyInput {
  const input = object(body);
  const allowed = new Set([
    ...(borehole ? ['code', 'folderId', 'plannedDepthM'] : ['name']),
    ...(editing ? ['version'] : []),
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new BadRequestException('Unknown field');
  const value = input[borehole ? 'code' : 'name'];
  if (typeof value !== 'string' || !value.trim() || value.trim().length > (borehole ? 60 : 120))
    throw new BadRequestException('Invalid name or code');
  if (editing && (!Number.isSafeInteger(input.version) || Number(input.version) < 1))
    throw new BadRequestException('Expected version required');
  const normalized = borehole ? value.trim().toUpperCase() : value.trim();
  if (normalized.length > (borehole ? 60 : 120))
    throw new BadRequestException('Invalid name or code');
  const folderId = input.folderId ?? null;
  if (borehole && folderId !== null && !isUuid(folderId))
    throw new BadRequestException('Invalid folder');
  const depth = input.plannedDepthM ?? null;
  if (
    borehole &&
    depth !== null &&
    (typeof depth !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(depth) || Number(depth) <= 0)
  )
    throw new BadRequestException('Invalid planned depth');
  return {
    name: value.trim(),
    code: normalized,
    folderId: folderId as string | null,
    plannedDepthM: depth as string | null,
    version: editing ? Number(input.version) : undefined,
  };
}
export function hierarchyPage(value?: string): number {
  if (
    value !== undefined &&
    (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 100000)
  )
    throw new BadRequestException('Invalid page');
  return Number(value ?? 1);
}
