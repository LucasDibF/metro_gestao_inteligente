import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';
import { mkdir } from 'node:fs/promises';
test('native analysis synchronizes curves, layers, water and partial termination without an embedded sheet', async ({
  page,
}) => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const password = crypto.randomUUID();
  const tenant = await db.tenant.create({ data: { name: 'Engenharia de verificação' } });
  const user = await db.user.create({
    data: {
      email: crypto.randomUUID() + '@example.invalid',
      passwordHash: await hashPassword(password),
    },
  });
  const work = await db.work.create({ data: { tenantId: tenant.id, name: 'Análise de campo' } });
  const hole = await db.borehole.create({
    data: {
      tenantId: tenant.id,
      workId: work.id,
      code: 'SP-01',
      executedDepthM: '7',
      fieldDate: new Date('2026-11-01'),
      waterLevelM: '3.2',
    },
  });
  try {
    await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'VIEWER' } });
    const scope = { tenantId: tenant.id, workId: work.id, boreholeId: hole.id };
    for (const [index, values] of [
      [2, 3, 3],
      [4, 5, 6],
      [6, 6, 7],
      [10, 11, 9],
      [15, 13, 16],
      [22, 23, 22],
      [30],
    ].entries()) {
      const partial = index === 6;
      await db.sptTest.create({
        data: {
          ...scope,
          depthM: index + 1,
          advances: values.map((blows) => ({
            blows,
            penetrationMm: partial ? 140 : index === 5 && blows === 23 ? 140 : 150,
          })),
          result: {
            status: partial || index === 5 ? 'REQUIRES_REVIEW' : 'CONVENTIONAL',
            nSpt: partial || index === 5 ? null : values[1] + values[2],
          },
          fieldDetails: {
            executionMethod: index < 3 ? 'SP_TH' : 'SP_CA',
            sampleRecovery: 'PARCIAL',
          },
          engineVersion: '0.1.0',
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    }
    for (const [fromM, toM, soilType, soilColor] of [
      [0, 1, 'Argila arenosa', 'Amarela'],
      [1, 2, 'Argila arenosa', 'Amarela'],
      [2, 4, 'Argila siltosa', 'Marrom'],
      [4, 6.14, 'Silte arenoso', 'Variegado'],
    ] as const)
      await db.soilLayer.create({
        data: {
          ...scope,
          fromM,
          toM,
          soilType,
          soilColor,
          soilMoisture: 'Úmida',
          description: 'Descrição sintética para conferência visual e interativa.',
        },
      });
    await page.setViewportSize({ width: 1600, height: 1200 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByLabel('ID da empresa', { exact: true }).fill(tenant.id);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('button', { name: work.name, exact: true }).click();
    await page.getByRole('button', { name: 'Abrir furo SP-01', exact: true }).click();
    await page.getByRole('button', { name: 'Análise geotécnica', exact: true }).click();
    const analysis = page.getByRole('region', { name: 'Análise do furo', exact: true });
    await expect(analysis.locator('iframe')).toHaveCount(0);
    await expect(analysis.getByText('NA 3,2 m', { exact: true })).toBeVisible();
    await expect(analysis.getByText('Fim 6,14 m', { exact: true })).toBeVisible();
    await expect(analysis.locator('.analysis-curve-final [data-reading="45/29"]')).toHaveCount(1);
    await expect(analysis.locator('.analysis-curve-first [data-reading="30/14"]')).toHaveCount(1);
    await expect(analysis.locator('.analysis-partial-point, .analysis-partial-label')).toHaveCount(
      0,
    );
    const lastPoint = analysis.locator('.analysis-curve-first [data-reading="30/14"]');
    await expect(lastPoint.locator('..').locator('.analysis-draw-curve')).toHaveCount(1);
    await expect(lastPoint.locator('..').locator('text')).toHaveCount(0);

    await analysis.locator('.analysis-graph').screenshot({
      path: 'apps/web/.impeccable/review/partial-graph-desktop.png',
      animations: 'disabled',
    });
    const alignment = await analysis.evaluate((root) => {
      const center = (rect: DOMRect) => rect.top + rect.height / 2;
      return [1, 2].flatMap((depth) => {
        const reading = root
          .querySelector(`[aria-label="Consultar ensaio a ${depth} m"]`)!
          .getBoundingClientRect();
        const blows = root
          .querySelector(`[aria-label="Consultar ensaio a ${depth} m"] strong`)!
          .getBoundingClientRect();
        const layer = root
          .querySelector(`[aria-label="Consultar camada de ${depth - 1} a ${depth} m"]`)!
          .getBoundingClientRect();
        const point = root
          .querySelector(
            `.analysis-curve-final g[aria-label^="Consultar curva 2 a ${depth} m:"] .analysis-point`,
          )!
          .getBoundingClientRect();
        const method = root
          .querySelectorAll('.analysis-method-track > span')
          [depth - 1].getBoundingClientRect();
        const tick = Array.from(root.querySelectorAll('.analysis-depth-track > span'))
          .find((node) => node.textContent === String(depth))!
          .getBoundingClientRect();
        return [
          Math.abs(reading.top - layer.top),
          Math.abs(reading.bottom - layer.bottom),
          Math.abs(center(blows) - center(layer)),
          Math.abs(center(point) - center(layer)),
          Math.abs(center(method) - center(layer)),
          Math.abs(center(tick) - layer.bottom),
        ];
      });
    });
    for (const difference of alignment) expect(difference).toBeLessThanOrEqual(1);
    const point = page.getByRole('button', {
      name: 'Consultar curva 2 a 3 m: 13 golpes',
      exact: true,
    });
    await point.focus();
    await point.press('Enter');
    await expect(page.getByRole('heading', { name: 'Ensaio a 3 m', exact: true })).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'Detalhes da análise selecionada', exact: true }),
    ).toContainText('Consistência: Rija');
    await expect(
      page.getByRole('button', { name: 'Corrigir registro selecionado', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '1º + 2º avanço', exact: true }).click();
    await expect(analysis.locator('.analysis-curve-first')).toHaveCount(0);
    await page.getByRole('button', { name: '1º + 2º avanço', exact: true }).click();
    await page.getByRole('button', { name: 'Consultar camada de 2 a 4 m', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Camada de 2 a 4 m', exact: true }),
    ).toBeVisible();
    await mkdir('apps/web/.impeccable/review', { recursive: true });
    await page.getByText('Critérios de compacidade e consistência', { exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Muito rija', exact: true })).toBeVisible();
    await analysis.locator('.soil-state-reference').screenshot({
      path: 'apps/web/.impeccable/review/soil-state-reference.png',
      animations: 'disabled',
    });
    await page.getByText('Critérios de compacidade e consistência', { exact: true }).click();

    await analysis.screenshot({
      path: 'apps/web/.impeccable/review/soil-state-desktop.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Mudar para tema escuro', exact: true }).click();
    await analysis.locator('.analysis-canvas').screenshot({
      path: 'apps/web/.impeccable/review/soil-state-dark.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Mudar para tema claro', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 1100 });
    await page.getByRole('button', { name: 'Registro de campo', exact: true }).click();
    await page.getByRole('button', { name: 'Análise geotécnica', exact: true }).click();
    await expect(page.getByLabel('Zoom do perfil', { exact: true })).toHaveText('100%');

    await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
    await analysis.screenshot({
      path: 'apps/web/.impeccable/review/soil-state-mobile.png',
      animations: 'disabled',
    });
    await analysis.locator('.sheet-viewport').evaluate((node) => {
      node.scrollLeft = 500;
    });
    await analysis.screenshot({
      path: 'apps/web/.impeccable/review/analysis-mobile-graph.png',
      animations: 'disabled',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
    await page.getByLabel('Consultar metro', { exact: true }).selectOption('7');
    await expect(page.getByText('Encerramento medido:', { exact: false })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Detalhes do metro selecionado', exact: true }),
    ).toContainText('6,14 m');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
    expect(
      await analysis
        .locator('.analysis-draw-curve')
        .first()
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none');
    await db.sptTest.create({
      data: {
        ...scope,
        depthM: 0,
        advances: [0, 0, 0].map((blows) => ({ blows, penetrationMm: 150 })),
        result: { status: 'CONVENTIONAL', nSpt: 0 },
        engineVersion: '0.1.0',
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    const firstLayer = await db.soilLayer.findFirstOrThrow({
      where: { boreholeId: hole.id, fromM: 0 },
    });
    await db.soilLayer.update({ where: { id: firstLayer.id }, data: { fromM: '0.1' } });
    await db.soilLayer.create({
      data: {
        ...scope,
        fromM: 0,
        toM: '0.1',
        soilType: 'Areia fina',
        description: 'Camada fina de teste.',
      },
    });
    await page.setViewportSize({ width: 1600, height: 1200 });
    await page.getByRole('button', { name: 'Atualizar análise', exact: true }).click();
    const surface = page.getByRole('button', { name: 'Consultar ensaio a 0 m', exact: true });
    await expect(surface).toBeVisible();
    await surface.click();
    await expect(page.getByRole('heading', { name: 'Ensaio a 0 m', exact: true })).toBeVisible();
    const thin = page.getByRole('button', { name: 'Consultar camada de 0 a 0,1 m', exact: true });
    expect(
      await thin.evaluate(
        (node) =>
          node.getBoundingClientRect().height /
          Number(
            node
              .closest('.analysis-canvas')
              ?.getAttribute('style')
              ?.match(/scale\(([^)]+)/)?.[1] ?? 1,
          ),
      ),
    ).toBeCloseTo(6.4, 0);
    await analysis.screenshot({
      path: 'apps/web/.impeccable/review/analysis-boundaries-desktop.png',
      animations: 'disabled',
    });
  } finally {
    await db.sptTest.deleteMany({ where: { boreholeId: hole.id } });
    await db.soilLayer.deleteMany({ where: { boreholeId: hole.id } });
    await db.borehole.delete({ where: { id: hole.id } });
    await db.work.delete({ where: { id: work.id } });
    await db.authSession.deleteMany({ where: { userId: user.id } });
    await db.membership.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.tenant.delete({ where: { id: tenant.id } });
    await db.$disconnect();
  }
});
