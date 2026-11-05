import { mapBackground } from '@spt/map-reference';
import { validateReportLayout } from './report-preflight';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { PrivateStorage } from '@spt/private-storage';
import {
  canonicalJson,
  renderReport,
  ReportSnapshot,
  TEMPLATE_VERSION,
  PRINT_LAYOUT,
} from '@spt/report-templates';
interface Job {
  id: string;
  tenantId: string;
  workId: string;
  reportId: string;
  leaseToken: string;
  snapshot: ReportSnapshot;
  snapshotHash: string;
  attempts: number;
}
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export async function processNextReport(
  db: PrismaClient,
  options: { channel?: string; capturePath?: string; onlyJobId?: string } = {},
) {
  const [row] = await db.$queryRaw<
    Array<{ job: Job | null }>
  >`SELECT claim_report_job(${options.onlyJobId ?? null}::uuid) AS job`;
  const job = row?.job;
  if (!job) return false;
  const started = Date.now();
  let heartbeat: ReturnType<typeof setInterval> | undefined,
    pdfTimeout: ReturnType<typeof setTimeout> | undefined,
    storage: PrivateStorage | undefined,
    browser: Awaited<ReturnType<typeof chromium.launch>> | undefined,
    permanent = false;
  try {
    const snapshot = job.snapshot;
    if (
      hash(canonicalJson(snapshot)) !== job.snapshotHash ||
      snapshot.schemaVersion !== 1 ||
      ![
        TEMPLATE_VERSION,
        '0.8.10',
        '0.8.9',
        '0.8.8',
        '0.8.7',
        '0.8.6',
        '0.8.5',
        '0.8.4',
        '0.8.3',
        '0.8.2',
        '0.8.1',
        '0.8.0',
        '0.7.0',
        '0.7.1',
        '0.7.2',
      ].includes(snapshot.templateVersion) ||
      !Array.isArray(snapshot.holes) ||
      !snapshot.holes.length ||
      snapshot.holes.length > 20 ||
      !Array.isArray(snapshot.photos) ||
      snapshot.photos.length > 40
    ) {
      permanent = true;
      throw Error('Invalid snapshot');
    }
    heartbeat = setInterval(() => {
      void db.$queryRaw`SELECT renew_report_job(${job.id}::uuid,${job.leaseToken}::uuid)`.catch(
        () => {},
      );
    }, 30000);
    storage = new PrivateStorage();
    const photos: Record<string, string> = {};
    for (let offset = 0; offset < snapshot.photos.length; offset += 4) {
      await Promise.all(
        snapshot.photos.slice(offset, offset + 4).map(async (p) => {
          if (!p.objectKey.startsWith(job.tenantId + '/' + job.workId + '/photos/')) {
            permanent = true;
            throw Error('Invalid photo scope');
          }
          const original = await storage!.get(p.objectKey, 8 * 1024 * 1024);
          if (hash(original) !== p.sha256) {
            permanent = true;
            throw Error('Photo integrity failed');
          }
          const metadata = await sharp(original, { limitInputPixels: 25000000 }).metadata(),
            swap = [5, 6, 7, 8].includes(metadata.orientation ?? 1),
            width = (swap ? metadata.height : metadata.width)!,
            height = (swap ? metadata.width : metadata.height)!;
          const left = Math.min(width - 1, Math.floor(p.crop.x * width)),
            top = Math.min(height - 1, Math.floor(p.crop.y * height));
          const cropped = await sharp(original, { limitInputPixels: 25000000 })
            .timeout({ seconds: 5 })
            .rotate()
            .extract({
              left,
              top,
              width: Math.max(1, Math.min(width - left, Math.round(p.crop.width * width))),
              height: Math.max(1, Math.min(height - top, Math.round(p.crop.height * height))),
            })
            .resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 92 })
            .toBuffer();
          photos[p.id] = 'data:image/jpeg;base64,' + cropped.toString('base64');
        }),
      );
    }
    browser = await chromium.launch({
      channel: options.channel ?? process.env.PDF_BROWSER_CHANNEL,
      headless: true,
    });
    const context = await browser.newContext({
      serviceWorkers: 'block',
      javaScriptEnabled: false,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const imagery = [
      TEMPLATE_VERSION,
      '0.8.10',
      '0.8.9',
      '0.8.8',
      '0.8.7',
      '0.8.6',
      '0.8.5',
      '0.8.4',
      '0.8.3',
      '0.8.2',
      '0.8.1',
      '0.8.0',
    ].includes(snapshot.templateVersion)
      ? await mapBackground(snapshot.map)
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
      permanent = true;
      throw error;
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
      footerTemplate:
        '<div style="font-family:Arial,sans-serif;font-size:8px;width:100%;text-align:center;color:#555">Metro · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: {
        top: PRINT_LAYOUT.margins.top + 'mm',
        bottom: PRINT_LAYOUT.margins.bottom + 'mm',
        left: PRINT_LAYOUT.margins.left + 'mm',
        right: PRINT_LAYOUT.margins.right + 'mm',
      },
    });
    clearTimeout(pdfTimeout);
    if (pdf.length > 20 * 1024 * 1024) {
      permanent = true;
      throw Error('PDF size limit');
    }
    const sha = hash(pdf),
      key = `${job.tenantId}/${job.workId}/reports/${job.id}/${sha}.pdf`;
    await storage.put(key, pdf, 'application/pdf');
    const stored = await storage.get(key);
    if (hash(stored) !== sha) throw Error('Stored PDF integrity failed');
    const [published] = await db.$queryRaw<
      Array<{ ok: boolean }>
    >`SELECT publish_report_job(${job.id}::uuid,${job.leaseToken}::uuid,${key},${sha}) AS ok`;
    console.log(
      JSON.stringify({
        event: 'report_job_finished',
        jobId: job.id,
        tenantId: job.tenantId,
        attempt: job.attempts,
        published: published.ok,
        durationMs: Date.now() - started,
        browserVersion: browser.version(),
      }),
    );
  } catch (error) {
    await db.$queryRaw`SELECT fail_report_job(${job.id}::uuid,${job.leaseToken}::uuid,${permanent})`;
    console.error(
      JSON.stringify({
        event: 'report_job_failed',
        reason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown generation error',
        jobId: job.id,
        tenantId: job.tenantId,
        attempt: job.attempts,
        permanent,
        durationMs: Date.now() - started,
      }),
    );
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (pdfTimeout) clearTimeout(pdfTimeout);
    await browser?.close();
    storage?.close();
  }
  return true;
}
