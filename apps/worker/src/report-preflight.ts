import type { Page } from 'playwright';
import { PRINT_LAYOUT } from '@spt/report-templates';

/** Reject automatic browser fragmentation rather than publishing orphan pages. */
export async function validateReportLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map(async (image) => {
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw Error('Report image unavailable');
      }),
    );
  });
  const issues = await page.evaluate(
    ({ width, height }) => {
      const sheets = Array.from(document.querySelectorAll<HTMLElement>('.page'));
      if (!sheets.length) return ['Missing report pages'];
      return sheets.flatMap((sheet, index) => {
        const box = sheet.getBoundingClientRect();
        const errors: string[] = [];
        if (box.height > height + 1) errors.push(`Sheet ${index + 1} exceeds printable height`);
        if (box.width > width + 1 || sheet.scrollWidth > width + 1)
          errors.push(`Sheet ${index + 1} exceeds printable width`);
        for (const svg of sheet.querySelectorAll<SVGSVGElement>('svg')) {
          const frame = svg.getBoundingClientRect();
          const labels = Array.from(
            svg.querySelectorAll<SVGGraphicsElement>('.map-point-label'),
          ).map((label) => label.getBoundingClientRect());
          if (
            labels.some((a, i) =>
              labels
                .slice(i + 1)
                .some(
                  (b) =>
                    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
                ),
            )
          )
            errors.push(`Sheet ${index + 1} has overlapping map labels`);

          for (const text of svg.querySelectorAll<SVGTextElement>('text')) {
            const bounds = text.getBoundingClientRect();
            if (
              bounds.left < frame.left - 1 ||
              bounds.right > frame.right + 1 ||
              bounds.top < frame.top - 1 ||
              bounds.bottom > frame.bottom + 1
            ) {
              errors.push(`Sheet ${index + 1} has SVG text outside its frame`);
              break;
            }
          }
        }
        return errors;
      });
    },
    {
      width: (PRINT_LAYOUT.contentWidthMm * 96) / 25.4,
      height: ((PRINT_LAYOUT.contentHeightMm - PRINT_LAYOUT.layoutSafetyMm) * 96) / 25.4,
    },
  );
  if (issues.length) throw Error(issues.join('; '));
}
