import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';
test('workspace filters works, searches global reports and opens review notifications on desktop and mobile', async ({
  page,
}) => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  let tenantId: string | undefined, userId: string | undefined, workId: string | undefined;
  try {
    const password = crypto.randomUUID() + '!';
    const user = await db.user.create({
      data: {
        email: crypto.randomUUID() + '@example.invalid',
        passwordHash: await hashPassword(password),
      },
    });
    userId = user.id;
    const tenant = await db.tenant.create({
      data: {
        name: 'Empresa workspace',
        memberships: { create: { userId, role: 'ADMIN', additionalRoles: ['ENGINEER'] } },
      },
    });
    tenantId = tenant.id;
    const work = await db.work.create({
      data: { tenantId, name: 'Obra do painel', clientName: 'Contratante de teste' },
    });
    workId = work.id;
    const hole = await db.borehole.create({ data: { tenantId, workId, code: 'SP-01' } });
    await db.technicalEvent.create({
      data: {
        tenantId,
        workId,
        boreholeId: hole.id,
        actorId: userId,
        technicalVersion: 1,
        action: 'REVIEW_REJECT',
      },
    });
    await db.report.create({
      data: {
        tenantId,
        workId,
        title: 'Relatório de conferência',
        composition: { holeIds: [hole.id], photoIds: [], showOtherBoreholes: false },
      },
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByLabel('ID da empresa', { exact: true }).fill(tenantId);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('definition').first()).toContainText('1');
    await page.getByLabel('Situação da obra', { exact: true }).selectOption('APPROVED');
    await expect(page.getByRole('heading', { name: 'Nenhuma obra encontrada' })).toBeVisible();
    await page.getByLabel('Situação da obra', { exact: true }).selectOption('IN_FIELD');
    await expect(page.getByRole('button', { name: work.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Relatórios', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Central de relatórios' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Relatório de conferência' })).toBeVisible();
    await page.getByLabel('Situação da emissão mais recente').selectOption('READY');
    await expect(page.getByRole('heading', { name: 'Nenhum relatório encontrado' })).toBeVisible();
    await page.getByLabel('Situação da emissão mais recente').selectOption('UNISSUED');
    await page.getByLabel('Buscar por relatório, obra ou contratante').fill('Contratante');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Relatório de conferência' })).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: 'apps/web/.impeccable/review/report-center-desktop.png',
    });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(page.locator('.workspace-header')).toHaveCount(1);
    await page.screenshot({
      animations: 'disabled',
      path: 'apps/web/.impeccable/review/report-center-mobile.png',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .getByRole('button', { name: 'Abrir relatórios da obra Obra do painel', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: /Relatórios/ }).first()).toBeVisible();
    await page.getByLabel('Notificações, 1 não lidas', { exact: true }).click();
    await expect(page.getByRole('region', { name: 'Atividades recentes' })).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: 'apps/web/.impeccable/review/notifications-mobile.png',
    });
    await page.getByRole('button', { name: /Não lida · Furo devolvido para correção/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Furo · SP-01', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Revisão técnica', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Conferência do furo' })).toBeVisible();
    expect(await db.notificationRead.count({ where: { tenantId, userId } })).toBe(1);
  } finally {
    if (tenantId) {
      const where = { tenantId };
      await db.notificationRead.deleteMany({ where });
      await db.report.deleteMany({ where });
      await db.technicalEvent.deleteMany({ where });
      await db.borehole.deleteMany({ where });
      await db.work.deleteMany({ where });
      await db.authSession.deleteMany({ where });
      await db.membership.deleteMany({ where });
    }
    if (userId) await db.user.delete({ where: { id: userId } });
    if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
    await db.$disconnect();
  }
});
