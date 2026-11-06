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
