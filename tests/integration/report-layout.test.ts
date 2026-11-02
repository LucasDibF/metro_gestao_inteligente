import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import sharp from 'sharp';
import {
  renderReport,
  TEMPLATE_VERSION,
  PRINT_LAYOUT,
  type ReportSnapshot,
} from '@spt/report-templates';
import { validateReportLayout } from '../../apps/worker/src/report-preflight';
function fixture(): ReportSnapshot {
  const coordinate = {
    eastingM: '250000',
    northingM: '9350000',
    zone: 25,
    hemisphere: 'S',
    datum: 'SIRGAS2000',
    latitude: -5,
    longitude: -35,
    reference: 'Teste',
    altitudeM: null,
  };
  return {
    schemaVersion: 1,
    templateVersion: TEMPLATE_VERSION,
    createdAt: '2026-11-01T00:30:00Z',
    issueNumber: 1,
    tenant: { id: 'tenant', name: 'Empresa de teste' },
    work: {
      id: 'work',
      name: 'Obra de teste',
      clientName: 'Cliente de teste',
      city: 'Cidade',
      state: 'RN',
      address: null,
    },
    report: { id: 'report', title: 'Relatório de teste', notes: '', version: 1 },
    holes: [
      {
        id: 'hole',
        code: 'SP-01',
        technicalVersion: 1,
        executedDepthM: '5',
        waterLevelM: '0',
        fieldDate: '2026-10-31',
        reviewerName: 'Responsável de teste',
        reviewerRegistration: 'DEMO',
        reviewedAt: '2026-10-31',
        reviewNote: null,
        officialCoordinate: coordinate,
        tests: [
          {
            depthM: '0',
            advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
            result: { nSpt: 14, status: 'CONVENTIONAL' },
            interruptionReason: null,
            engineVersion: '0.1.0',
          },
        ],
        layers: [{ fromM: '0', toM: '5', soilType: 'Areia', description: 'Descrição de teste.' }],
      },
    ],
    photos: [],
    map: {
      zone: 25,
      hemisphere: 'S',
      points: [{ code: 'SP-01', x: 250000, y: 9350000, selected: true }],
    },
  };
}
test('report pages fit approved A4 geometry with long content, zero origin and continuations; preflight rejects overflow and missing images', async () => {
  const browser = await chromium.launch({
    channel: process.platform === 'darwin' ? 'chrome' : undefined,
    headless: true,
  });
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    const page = await context.newPage();
    await page.setViewportSize({
      width: Math.ceil((PRINT_LAYOUT.contentWidthMm * 96) / 25.4),
      height: 1000,
    });
    await page.emulateMedia({ media: 'print' });
    const altitude = fixture();
    altitude.holes[0].officialCoordinate.altitudeM = '263.35';
    const longCover = fixture();
    longCover.tenant.name = 'Empresa de investigação geotécnica '.repeat(6).slice(0, 200);
    longCover.work.name = 'Projeto de implantação de infraestrutura '.repeat(6).slice(0, 200);
    longCover.work.clientName = 'Contratante '.repeat(19).slice(0, 200);
    longCover.work.city = 'W'.repeat(120);
    // Stress the cover in isolation: legacy profile headers have their own established limits.
    await page.setContent(renderReport(longCover), { waitUntil: 'load' });
    await page.evaluate(() => {
      document.querySelectorAll('.page:not(.report-cover)').forEach((element) => element.remove());
    });
    await validateReportLayout(page);
    assert.ok((await page.locator('.report-cover').innerText()).includes(longCover.work.name));
    const scenarios: ReportSnapshot[] = [fixture(), altitude];
    const photos = fixture();
    photos.photos = Array.from({ length: 4 }, (_, i) => ({
      id: String(i),
      boreholeId: 'hole',
      caption: 'Legenda técnica de teste. '.repeat(21).slice(0, 500),
      objectKey: 'unused',
      sha256: 'unused',
      version: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    }));
    scenarios.push(photos);
    const extendedAddress = fixture();
    extendedAddress.work.address =
      'Distrito industrial, setor de implantação e acesso pela via principal da área de investigação';
    extendedAddress.holes[0].tests[0].interruptionReason = 'Furo paralisado no avanço.';
    scenarios.push(extendedAddress);

    const map = fixture();
    map.map.points = Array.from({ length: 40 }, (_, i) => ({
      code: 'W'.repeat(58) + String(i).padStart(2, '0'),
      x: 250000 + i,
      y: 9350000 + i,
      selected: i === 0,
    }));
    scenarios.push(map);
    const thin = fixture();
    thin.holes[0].layers = [
      { fromM: '0', toM: '0.10', soilType: 'Areia', description: 'W'.repeat(1900) },
      { fromM: '0.10', toM: '5', soilType: 'Argila', description: 'Outra camada.' },
    ];
    scenarios.push(thin);
    const jpeg =
      'data:image/jpeg;base64,' +
      (
        await sharp({ create: { width: 16, height: 16, channels: 3, background: '#527747' } })
          .jpeg()
          .toBuffer()
      ).toString('base64');
    for (const s of scenarios) {
      for (const imagery of [
        undefined,
        {
          state: 'ready' as const,
          background: {
            image: jpeg,
            scene: 'CBERS4A_WPM_PCA_RGB321_20260924_206_133',
            date: '2026-09-24',
            pixelSizeM: 2,
          },
        },
        { state: 'unavailable' as const, reason: 'coverage' as const },
      ]) {
        const html = renderReport(s, {}, imagery);
        await page.setContent(html, { waitUntil: 'load' });
        await validateReportLayout(page);
        assert.equal(
          await page.evaluate(() =>
            Array.from(document.querySelectorAll<SVGTextElement>('.cota-tick')).every((t) => {
              const b = t.getBBox();
              return b.x >= 0.5 && b.x + b.width <= 27.5;
            }),
          ),
          true,
        );
        assert.ok(!html.includes('__SHEET__'));
        assert.ok(html.includes('31/10/2026'));
        assert.ok(html.includes('>14</text>'));
      }
    }
    await page.setContent(renderReport(fixture()));
    await page.evaluate(() => {
      (document.querySelector('.page') as HTMLElement).style.height = '400mm';
    });
    await assert.rejects(validateReportLayout(page), /exceeds printable height/);
    await page.setContent(
      renderReport(fixture()).replace('</body>', '<img src="data:image/jpeg;base64,AAAA"></body>'),
    );
    await assert.rejects(validateReportLayout(page));
    await context.close();
  } finally {
    await browser.close();
  }
});
