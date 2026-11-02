import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';
import { mkdir } from 'node:fs/promises';

test('company works can be created, edited and searched; viewers cannot write', async ({
  page,
}) => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const password = crypto.randomUUID() + '!';
  const users: Array<{ id: string; email: string }> = [];
  let tenantId: string | undefined;
  try {
    tenantId = (await db.tenant.create({ data: { name: 'Empresa de verificação' } })).id;
    const hash = await hashPassword(password);
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
    async function login(index: number) {
      await page.getByLabel('Email', { exact: true }).fill(users[index].email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByLabel('ID da empresa', { exact: true }).fill(tenantId!);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Obras', exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await login(0);
    await expect(
      page.getByRole('heading', { name: 'Sua primeira obra começa aqui' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cadastrar obra', exact: true }).click();
    await page.getByLabel('Nome da obra', { exact: true }).fill('Residencial das Palmeiras');
    await page.getByLabel('Contratante (opcional)').fill('Construtora de verificação');
    await page.getByLabel('Município (opcional)').fill('Goiânia');
    await page.getByLabel('UF (opcional)').selectOption('GO');
    await page.getByRole('button', { name: 'Salvar obra' }).click();
    await expect(page.getByRole('heading', { name: 'Residencial das Palmeiras' })).toBeVisible();
    const captures = 'apps/web/.impeccable/review';
    await mkdir(captures, { recursive: true });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: `${captures}/works-desktop.png` });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: `${captures}/works-mobile.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Editar Residencial das Palmeiras' }).click();
    await page
      .getByLabel('Nome da obra', { exact: true })
      .fill('Residencial das Palmeiras — etapa 2');
    await page.getByRole('button', { name: 'Salvar obra' }).click();
    await expect(
      page.getByRole('heading', { name: 'Residencial das Palmeiras — etapa 2' }),
    ).toBeVisible();
    await page.getByLabel('Buscar por obra ou contratante').fill('Inexistente');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Nenhuma obra encontrada' })).toBeVisible();
    await page.getByLabel('Buscar por obra ou contratante').fill('etapa 2');
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Residencial das Palmeiras — etapa 2' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await login(1);
    await expect(page.getByRole('button', { name: 'Cadastrar obra', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Editar Residencial das Palmeiras — etapa 2' }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Ver dados Residencial das Palmeiras — etapa 2' })
      .click();
    await expect(page.getByLabel('Nome da obra', { exact: true })).toHaveValue(
      'Residencial das Palmeiras — etapa 2',
    );
    await expect(page.getByRole('button', { name: 'Salvar obra' })).toHaveCount(0);
  } finally {
    if (tenantId) await db.work.deleteMany({ where: { tenantId } });
    const ids = users.map((user) => user.id);
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.membership.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
    await db.$disconnect();
  }
});
