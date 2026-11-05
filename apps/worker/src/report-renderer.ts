import { chromium } from 'playwright';
import { inpeMapBackground } from '@spt/map-reference';
import { escapeHtml, renderReport, PRINT_LAYOUT, type ReportSnapshot } from '@spt/report-templates';
import { templateSince } from '@spt/report-templates';
import { validateReportLayout } from './report-preflight';
export class PermanentReportError extends Error {}
export interface ReportRenderOptions {
  channel?: string;
  capturePath?: string;
}
export async function renderReportPdf(
  snapshot: ReportSnapshot,
  photos: Record<string, string>,
  options: ReportRenderOptions = {},
) {
  const browser = await chromium.launch({
    channel: options.channel ?? process.env.PDF_BROWSER_CHANNEL,
    headless: true,
  });
  let pdfTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      javaScriptEnabled: false,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const imagery = templateSince(snapshot.templateVersion, '0.8.0')
      ? await inpeMapBackground(snapshot.map)
      : undefined;
    await page.setContent(renderReport(snapshot, photos, imagery), {
      waitUntil: 'load',
      timeout: 60000,
    });
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({
      width: Math.ceil((PRINT_LAYOUT.contentWidthMm * 96) / 25.4),
      height: Math.ceil((PRINT_LAYOUT.contentHeightMm * 96) / 25.4),
    });
    try {
      await validateReportLayout(page);
    } catch (error) {
      throw new PermanentReportError(
        error instanceof Error ? error.message : 'Invalid report layout',
      );
    }
    if (options.capturePath) await page.screenshot({ path: options.capturePath, fullPage: true });
    pdfTimeout = setTimeout(() => {
      void browser?.close();
    }, 60000);
    const pdf = await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: templateSince(snapshot.templateVersion, '0.8.13')
        ? `<div style="font-family:Arial,sans-serif;font-size:8px;width:100%;text-align:center;color:#555">${escapeHtml(snapshot.tenant.name)} · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`
        : '<div style="font-family:Arial,sans-serif;font-size:8px;width:100%;text-align:center;color:#555">Metro · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: {
        top: PRINT_LAYOUT.margins.top + 'mm',
        bottom: PRINT_LAYOUT.margins.bottom + 'mm',
        left: PRINT_LAYOUT.margins.left + 'mm',
        right: PRINT_LAYOUT.margins.right + 'mm',
      },
    });
    clearTimeout(pdfTimeout);
    if (pdf.length > 20 * 1024 * 1024) {
      throw new PermanentReportError('PDF size limit');
    }
    return { pdf, browserVersion: browser.version() };
  } finally {
    if (pdfTimeout) clearTimeout(pdfTimeout);
    await browser.close();
  }
}
