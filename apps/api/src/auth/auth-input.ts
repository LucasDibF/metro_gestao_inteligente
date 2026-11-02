import { BadRequestException } from '@nestjs/common';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid request');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > max)
    throw new BadRequestException('Invalid request');
  return value;
}
