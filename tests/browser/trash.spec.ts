import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';
import { mkdir } from 'node:fs/promises';

test('trash confirmation preserves records and restores parents before children', async ({
  page,
}) => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const password = crypto.randomUUID() + '!';
  const users: Array<{ id: string; email: string }> = [];
  let tenantId: string | undefined;
  let workId: string | undefined;
  try {
    const hash = await hashPassword(password);
    tenantId = (await db.tenant.create({ data: { name: 'Empresa de verificação' } })).id;
    for (const role of ['ADMIN', 'VIEWER'] as const) {
      const user = await db.user.create({
        data: { email: `${crypto.randomUUID()}@example.invalid`, passwordHash: hash },
      });
      users.push(user);
      await db.membership.create({
        data: {
          tenantId,
          userId: user.id,
          role,
          additionalRoles: role === 'ADMIN' ? ['ENGINEER'] : [],
        },
      });
    }
    const work = await db.work.create({ data: { tenantId, name: 'Residencial das Palmeiras' } });
    workId = work.id;
    const folder = await db.folder.create({ data: { tenantId, workId, name: 'Etapa 1' } });
    await db.borehole.create({
      data: { tenantId, workId, folderId: folder.id, code: 'SP-01', plannedDepthM: '12.50' },
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/');
    async function login(index: number) {
      await page.getByLabel('Email', { exact: true }).fill(users[index].email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByLabel('ID da empresa', { exact: true }).fill(tenantId!);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Obras', exact: true })).toBeVisible();
    }
    async function remove(label: string) {
      await page
        .getByRole('button', { name: `Mover ${label} para a lixeira`, exact: true })
        .click();
      await page
        .getByRole('group', { name: `Confirmar exclusão de ${label}` })
        .getByRole('button', { name: 'Confirmar envio', exact: true })
        .click();
    }
    await login(0);
    await page.getByRole('button', { name: work.name, exact: true }).click();
    await page.getByRole('button', { name: 'Abrir pasta Etapa 1', exact: true }).click();
    await page.getByRole('button', { name: 'Mover SP-01 para a lixeira', exact: true }).click();
    await page.getByRole('button', { name: 'Cancelar envio' }).click();
    await expect(page.getByRole('heading', { name: 'SP-01', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Voltar às pastas', exact: true }).click();
    await remove('Etapa 1');
    await expect(page.getByRole('alert')).toContainText('Envie primeiro');
    await page.getByRole('button', { name: 'Cancelar envio' }).click();
    await page.getByRole('button', { name: 'Abrir pasta Etapa 1', exact: true }).click();
    await remove('SP-01');
    await page.getByRole('button', { name: 'Voltar às pastas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'SP-01', exact: true })).toHaveCount(0);
    await remove('Etapa 1');
    await expect(page.getByRole('button', { name: 'Renomear Etapa 1' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Voltar às obras' }).click();
    await remove(work.name);
    await expect(page.getByRole('button', { name: work.name, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Lixeira', exact: true }).click();
    await expect(page.getByRole('heading', { name: work.name, exact: true })).toBeVisible();
    const captures = 'apps/web/.impeccable/review';
    await mkdir(captures, { recursive: true });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: `${captures}/trash-desktop.png` });
    await page.setViewportSize({ width: 390, height: 1100 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: `${captures}/trash-mobile.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByLabel('Tipo de registro').selectOption('furos');
    await page.getByRole('button', { name: 'Restaurar SP-01', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Restaure primeiro');
    await page.getByLabel('Tipo de registro').selectOption('obras');
    await page.getByRole('button', { name: `Restaurar ${work.name}`, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'foi restaurado' })).toContainText(
      'foi restaurado',
    );
    await page.getByLabel('Tipo de registro').selectOption('pastas');
    await page.getByRole('button', { name: 'Restaurar Etapa 1', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'foi restaurado' })).toContainText(
      'foi restaurado',
    );
    await page.getByLabel('Tipo de registro').selectOption('furos');
    await page.getByRole('button', { name: 'Restaurar SP-01', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'foi restaurado' })).toContainText(
      'foi restaurado',
    );
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await page.getByRole('button', { name: 'Obras', exact: true }).click();
    await page.getByRole('button', { name: work.name, exact: true }).click();
    await page.getByRole('button', { name: 'Abrir pasta Etapa 1', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'SP-01', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await login(1);
    await expect(page.getByRole('button', { name: 'Lixeira', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: `Mover ${work.name} para a lixeira`, exact: true }),
    ).toHaveCount(0);
  } finally {
    if (workId) {
      await db.borehole.deleteMany({ where: { workId } });
      await db.folder.deleteMany({ where: { workId } });
      await db.work.delete({ where: { id: workId } });
    }
    const ids = users.map((u) => u.id);
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.membership.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
    await db.$disconnect();
  }
});
