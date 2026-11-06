import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/** The photo categories a borehole photo can be filed under; none means OTHER. */
export function photoPurpose(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'OTHER';
  if (
    typeof value !== 'string' ||
    !['SITE', 'EXECUTION', 'SAMPLE_1', 'SAMPLE_2', 'OTHER'].includes(value)
  )
    throw new BadRequestException('Invalid photo purpose');
  return value;
}

/** Accepts only a single-frame JPEG or PNG of at most 25 megapixels. */
export async function inspectPhoto(
  buffer: Buffer,
): Promise<{ mime: string; width: number; height: number }> {
  try {
    const meta = await sharp(buffer, { limitInputPixels: 25000000, failOn: 'warning' })
      .timeout({ seconds: 5 })
      .metadata();
    if (
      !['jpeg', 'png'].includes(meta.format ?? '') ||
      !meta.width ||
      !meta.height ||
      (meta.pages && meta.pages > 1)
    )
      throw Error();
    return {
      mime: meta.format === 'jpeg' ? 'image/jpeg' : 'image/png',
      width: meta.width,
      height: meta.height,
    };
  } catch {
    throw new BadRequestException(
      'Photo must be a valid single-frame JPEG or PNG, at most 25 megapixels',
    );
  }
}
