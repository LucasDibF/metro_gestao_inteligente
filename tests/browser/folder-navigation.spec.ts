import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';
import { mkdir } from 'node:fs/promises';

test('folders contain their boreholes and new records inherit the opened folder', async ({
  page,
}) => {
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
    const work = await db.work.create({ data: { name: 'Obra de verificação', tenantId } });
    workId = work.id;
    const folder = await db.folder.create({ data: { name: 'CEARÁ MIRIM', workId, tenantId } });
    await db.folder.create({ data: { name: 'CONCREMAT', workId, tenantId } });
    for (let index = 3; index <= 21; index++) {
      await db.folder.create({ data: { name: `Pasta ${index}`, workId, tenantId } });
    }
    const longName = 'A'.repeat(120);
    await db.folder.create({ data: { name: longName, workId, tenantId } });
    await db.borehole.createMany({
      data: [
        { code: 'SP-01', folderId: folder.id, workId, tenantId },
        { code: 'SP-02', folderId: folder.id, workId, tenantId },
        { code: 'SP-03', workId, tenantId },
      ],
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByLabel('ID da empresa', { exact: true }).fill(tenantId);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('button', { name: work.name, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'SP-03', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SP-01', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Abrir pasta CEARÁ MIRIM', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'SP-01', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SP-02', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SP-03', exact: true })).toHaveCount(0);
    const treeFolder = page.getByRole('button', { name: 'Abrir pasta CEARÁ MIRIM', exact: true });
    await expect(treeFolder).toHaveAttribute('aria-expanded', 'true');
    await treeFolder.focus();
    await page.keyboard.press('Enter');
    await expect(treeFolder).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByRole('button', { name: 'Abrir ensaios de SP-01 na árvore', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(treeFolder).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Abrir pasta CONCREMAT', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Furos em CONCREMAT', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Abrir ensaios de SP-01 na árvore', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Furo · SP-01', exact: true })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Caminho de navegação', exact: true }),
    ).toContainText('CEARÁ MIRIM');
    await page.getByRole('button', { name: 'Voltar aos furos', exact: true }).click();

    const captures = 'apps/web/.impeccable/review';
    await mkdir(captures, { recursive: true });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ animations: 'disabled', path: `${captures}/folder-desktop.png` });
    await page
      .getByRole('navigation', { name: 'Árvore de pastas e furos', exact: true })
      .screenshot({ animations: 'disabled', path: `${captures}/folder-tree-desktop.png` });
    await page.setViewportSize({ width: 390, height: 1500 });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ animations: 'disabled', path: `${captures}/folder-mobile.png` });
    await page
      .getByRole('navigation', { name: 'Árvore de pastas e furos', exact: true })
      .screenshot({ animations: 'disabled', path: `${captures}/folder-tree-mobile.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Cadastrar furo', exact: true }).click();
    await expect(page.getByLabel('Pasta', { exact: true })).toHaveValue(folder.id);
    await page.getByLabel('Identificação do furo', { exact: true }).fill('SP-04');
    await page.getByRole('button', { name: 'Salvar furo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'SP-04', exact: true })).toBeVisible();
    expect(
      (await db.borehole.findFirstOrThrow({ where: { code: 'SP-04', workId } })).folderId,
    ).toBe(folder.id);
    await page.getByRole('button', { name: 'Abrir furo SP-04', exact: true }).click();
    await page.getByRole('button', { name: 'Editar identificação', exact: true }).click();
    await page.getByRole('button', { name: 'Carregar mais pastas', exact: true }).click();
    await page.getByLabel('Pasta', { exact: true }).selectOption({ label: 'Pasta 21' });
    await page.getByRole('button', { name: 'Salvar identificação', exact: true }).click();
    await expect(page.getByText('Identificação salva.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Análise geotécnica', exact: true }).click();
    await page.getByRole('button', { name: 'Voltar aos furos', exact: true }).click();
    const destination = await db.folder.findFirstOrThrow({ where: { name: 'Pasta 21', workId } });
    expect(
      (await db.borehole.findFirstOrThrow({ where: { code: 'SP-04', workId } })).folderId,
    ).toBe(destination.id);
    const returnToRoot = page.getByRole('button', { name: 'Voltar às pastas', exact: true });
    if (await returnToRoot.isVisible()) await returnToRoot.click();
    await expect(page.getByRole('heading', { name: 'SP-03', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SP-04', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Abrir pasta CONCREMAT', exact: true }).click();
    await expect(
      page.getByText('Nenhum furo cadastrado nesta pasta.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Voltar às pastas', exact: true }).click();
    const moreFolders = page.getByRole('button', { name: 'Carregar mais pastas', exact: true });
    if (await moreFolders.isVisible()) await moreFolders.click();
    await expect(
      page.getByRole('button', { name: `Abrir pasta ${longName}`, exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: `Abrir pasta ${longName}`, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `Furos em ${longName}`, exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
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
