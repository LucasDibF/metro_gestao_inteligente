import { BadRequestException } from '@nestjs/common';
import { object } from '../auth/auth-input';
export function technicalInput(body: unknown, fields: string[]): Record<string, unknown> {
  const value = object(body);
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw new BadRequestException('Unknown technical field');
  return value;
}
export function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new BadRequestException('Expected version required');
  return Number(value);
}
export function depth(value: unknown, nullable = false): string | null {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(value))
    throw new BadRequestException('Invalid depth');
  return value;
}
export function optionalText(value: unknown, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > max)
    throw new BadRequestException('Invalid text');
  return value.trim();
}
export function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new BadRequestException('Invalid text');
  return value.trim();
}
export interface FieldDataInput {
  version: number;
  executedDepthM: string | null;
  waterLevelM: string | null;
  fieldDate: Date | null;
}
/** PUT .../tecnico: executed depth, water level and field date, checked before any lock. */
export function fieldDataInput(body: unknown): FieldDataInput {
  const value = technicalInput(body, [
    'technicalVersion',
    'executedDepthM',
    'waterLevelM',
    'fieldDate',
  ]);
  const version = expectedVersion(value.technicalVersion),
    executedDepthM = depth(value.executedDepthM, true),
    waterLevelM = depth(value.waterLevelM, true);
  if (executedDepthM !== null && Number(executedDepthM) <= 0)
    throw new BadRequestException({
      code: 'EXECUTED_DEPTH_INVALID',
      message: 'Executed depth must be positive',
    });
  if (
    waterLevelM !== null &&
    executedDepthM !== null &&
    Number(waterLevelM) > Number(executedDepthM)
  )
    throw new BadRequestException({
      code: 'WATER_LEVEL_BELOW_DEPTH',
      message: 'Water level cannot exceed executed depth',
    });
  let fieldDate: Date | null = null;
  if (value.fieldDate !== null && value.fieldDate !== undefined && value.fieldDate !== '') {
    if (typeof value.fieldDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.fieldDate))
      throw new BadRequestException({
        code: 'FIELD_DATE_INVALID',
        message: 'Invalid field date',
      });
    fieldDate = new Date(value.fieldDate + 'T00:00:00Z');
    if (
      !Number.isFinite(fieldDate.getTime()) ||
      fieldDate.toISOString().slice(0, 10) !== value.fieldDate
    )
      throw new BadRequestException({
        code: 'FIELD_DATE_INVALID',
        message: 'Invalid field date',
      });
  }
  return { version, executedDepthM, waterLevelM, fieldDate };
}
