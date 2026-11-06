import { BadRequestException } from '@nestjs/common';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid request');
  return value as Record<string, unknown>;
}
/** Length in characters, the same rule used when an administrator creates an account. */
export function newPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    throw new BadRequestException({
      code: 'PASSWORD_LENGTH',
      message: 'New password must have 12 to 128 characters',
    });
  return value;
}
export function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value) > max)
    throw new BadRequestException('Invalid request');
  return value;
}
