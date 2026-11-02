import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';
import { mkdir } from 'node:fs/promises';

test('folders and boreholes can be organized and edited inside a work', async ({ page }) => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const password = crypto.randomUUID() + '!';
  let userId: string | undefined;
  let tenantId: string | undefined;
  let workId: string | undefined;
  try {
    const user = await db.user.create({
      data: {
        email: `${crypto.randomUUID()}@example.invalid`,
        passwordHash: await hashPassword(password),
      },
    });
    userId = user.id;
    tenantId = (
      await db.tenant.create({
        data: {
          name: 'Empresa de verificação',
          memberships: { create: { userId, role: 'ADMIN', additionalRoles: ['ENGINEER'] } },
        },
      })
    ).id;
    workId = (await db.work.create({ data: { tenantId, name: 'Residencial das Palmeiras' } })).id;
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByLabel('ID da empresa', { exact: true }).fill(tenantId);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('button', { name: 'Residencial das Palmeiras', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pastas', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Criar pasta', exact: true }).click();
    await page.getByLabel('Nome da pasta', { exact: true }).fill('Etapa 1');
    await page.getByRole('button', { name: 'Salvar pasta', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Renomear Etapa 1' })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir pasta Etapa 1', exact: true }).click();
    await page.getByRole('button', { name: 'Cadastrar furo', exact: true }).click();
    await page.getByLabel('Identificação do furo', { exact: true }).fill('sp-01');
    await page.getByLabel('Pasta', { exact: true }).selectOption({ label: 'Etapa 1' });
    await page.getByLabel('Profundidade planejada em metros (opcional)').fill('12.50');
    await page.getByRole('button', { name: 'Salvar furo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'SP-01', exact: true })).toBeVisible();
    const captures = 'apps/web/.impeccable/review';
    await mkdir(captures, { recursive: true });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: `${captures}/hierarchy-desktop.png` });
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.setViewportSize({
      width: 390,
      height: Math.max(1200, await page.evaluate(() => document.documentElement.scrollHeight)),
    });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: `${captures}/hierarchy-mobile.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Abrir furo SP-01', exact: true }).click();
    await page.getByRole('button', { name: 'Editar identificação', exact: true }).click();
    await page.getByLabel('Identificação do furo', { exact: true }).fill('SP-02');
    await page.getByLabel('Pasta', { exact: true }).selectOption('');
    await page.getByRole('button', { name: 'Salvar identificação', exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: 'Caminho de navegação', exact: true }),
    ).toContainText('SP-02');
    await page.getByRole('button', { name: 'Voltar aos furos', exact: true }).click();
    const returnToRoot = page.getByRole('button', { name: 'Voltar às pastas', exact: true });
    if (await returnToRoot.isVisible()) await returnToRoot.click();
    await expect(page.getByRole('heading', { name: 'SP-02', exact: true })).toBeVisible();
    await expect(page.getByText(/Sem pasta · 12,5 m planejados/)).toBeVisible();
    await page.getByRole('button', { name: 'Renomear Etapa 1' }).click();
    await page.getByLabel('Nome da pasta', { exact: true }).fill('Etapa A');
    await page.getByRole('button', { name: 'Salvar pasta', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Renomear Etapa A' })).toBeVisible();
    const longCode = 'A'.repeat(60);
    await page.getByRole('button', { name: 'Cadastrar furo', exact: true }).click();
    await page.getByLabel('Identificação do furo', { exact: true }).fill(longCode);
    await page.getByRole('button', { name: 'Salvar furo', exact: true }).click();
    await expect(page.getByRole('heading', { name: longCode, exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 1400 });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.setViewportSize({
      width: 390,
      height: Math.max(1400, await page.evaluate(() => document.documentElement.scrollHeight)),
    });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: `${captures}/hierarchy-mobile-long.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Voltar às obras' }).click();
    await expect(page.getByRole('heading', { name: 'Obras', exact: true })).toBeVisible();
  } finally {
    if (workId) {
      await db.borehole.deleteMany({ where: { workId } });
      await db.folder.deleteMany({ where: { workId } });
      await db.work.delete({ where: { id: workId } });
    }
    if (userId) {
      await db.authSession.deleteMany({ where: { userId } });
      await db.membership.deleteMany({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    }
    if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
    await db.$disconnect();
  }
});
