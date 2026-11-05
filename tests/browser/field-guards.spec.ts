import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';

test('open edits lock the shell, the last-metre flag keeps a valid N-SPT and new metres use the next depth', async ({
  page,
}) => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const tenant = await db.tenant.create({ data: { name: 'Guardas do registro de campo' } });
  const password = crypto.randomUUID() + '!';
  const user = await db.user.create({
    data: {
      email: crypto.randomUUID() + '@example.invalid',
      passwordHash: await hashPassword(password),
    },
  });
  try {
    await db.membership.create({
      data: { tenantId: tenant.id, userId: user.id, role: 'ENGINEER' },
    });
    const work = await db.work.create({ data: { tenantId: tenant.id, name: 'Obra das guardas' } });
    await db.borehole.create({
      data: {
        tenantId: tenant.id,
        workId: work.id,
        code: 'SP-01',
        reviewNote: 'Confira o solo do segundo metro.',
      },
    });
    const beforeUnloadBlocked = () =>
      page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });
    const button = (name: string) => page.getByRole('button', { name, exact: true });
    const depth = page.getByLabel('Profundidade inicial do ensaio em metros');
    const result = page.getByRole('region', { name: 'Resultado do ensaio', exact: true });
    const logo = button('Metro — Gestão Inteligente, início').first();

    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre na sua conta');
    await expect(page.locator('a[href="/"]')).toHaveCount(0);
    await expect(button('Metro — Gestão Inteligente, início')).toHaveCount(0);
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByLabel('ID da empresa', { exact: true }).fill(tenant.id);
    await button('Entrar').click();
    await button(work.name).click();
    await button('Abrir furo SP-01').click();
    await button('Registro de campo').click();
    await expect(page.getByText('Confira o solo do segundo metro.', { exact: true })).toBeVisible();

    await button('Registrar metro').click();
    await expect(depth).toHaveValue('1');
    const menu = page.getByRole('navigation', { name: 'Área de trabalho', exact: true });
    await expect(menu.getByRole('button', { name: 'Obras', exact: true })).toBeDisabled();
    for (const name of ['Segurança da conta', 'Abrir perfil', 'Sair da conta'])
      await expect(button(name)).toBeDisabled();
    await expect(logo).toBeDisabled();
    const notifications = page.locator('.notifications summary');
    await expect(notifications).toHaveAttribute('aria-disabled', 'true');
    await expect(button('Sair da conta')).toHaveAccessibleDescription(/Salve ou cancele/);
    await expect(page.getByRole('status').filter({ hasText: 'edição aberta' })).toBeVisible();
    expect(await beforeUnloadBlocked()).toBe(true);
    await page.getByLabel('Tipo de solo', { exact: true }).fill('   ');
    await button('Salvar metro').click();
    await expect(depth).toBeVisible();
    await expect(result).toHaveCount(0);
    await page.getByLabel('Tipo de solo', { exact: true }).fill('Argila arenosa');
    await button('Salvar metro').click();
    await expect(button('Sair da conta')).toBeEnabled();
    await expect(notifications).not.toHaveAttribute('aria-disabled', 'true');
    expect(await beforeUnloadBlocked()).toBe(false);

    await button('Registrar metro').click();
    await expect(depth).toHaveValue('2');
    for (const [index, blows] of ['4', '6', '8'].entries()) {
      await page.getByLabel(`Golpes do ${index + 1}º avanço`, { exact: true }).fill(blows);
      await page.getByLabel(`Penetração do ${index + 1}º avanço em cm`, { exact: true }).fill('15');
    }
    await page.getByLabel('Último metro do furo', { exact: true }).check();
    await page.getByLabel('Tipo de solo', { exact: true }).fill('Areia siltosa');
    await button('Salvar metro').click();
    await expect(result).toContainText('N-SPT: 14');
    await expect(result).not.toContainText('Ensaio interrompido');

    await button('Registrar metro').click();
    await expect(depth).toHaveValue('3');
    await page.getByLabel('Golpes do 1º avanço', { exact: true }).fill('30');
    await page.getByLabel('Penetração do 1º avanço em cm', { exact: true }).fill('6');
    await page.getByLabel('Último metro do furo', { exact: true }).check();
    await page.getByLabel('Tipo de solo', { exact: true }).fill('Areia siltosa');
    await button('Salvar metro').click();
    await expect(result).toContainText('Ensaio interrompido');

    await button('Corrigir registro a 3 m').click();
    const reason = page.getByLabel('Motivo de interrupção (opcional)', { exact: true });
    await expect(reason).toHaveValue('Encerramento registrado em campo');
    await page.getByLabel('Último metro do furo', { exact: true }).uncheck();
    await expect(reason).toHaveValue('');
    await button('Cancelar').click();

    await page
      .getByLabel('Reabrir metro para edição', { exact: true })
      .selectOption({ label: '1 m — salvo' });
    await expect(depth).toHaveValue('1');
    await button('Cancelar').click();
    await button('Registrar metro').click();
    await expect(depth).toHaveValue('4');
    await button('Cancelar').click();

    await logo.click();
    await expect(page.getByRole('heading', { name: 'Obras', exact: true })).toBeVisible();
    await expect(button('Sair da conta')).toBeEnabled();
  } finally {
    await db.technicalEvent.deleteMany({ where: { tenantId: tenant.id } });
    await db.soilLayer.deleteMany({ where: { tenantId: tenant.id } });
    await db.sptTest.deleteMany({ where: { tenantId: tenant.id } });
    await db.borehole.deleteMany({ where: { tenantId: tenant.id } });
    await db.work.deleteMany({ where: { tenantId: tenant.id } });
    await db.authSession.deleteMany({ where: { userId: user.id } });
    await db.membership.deleteMany({ where: { tenantId: tenant.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.tenant.delete({ where: { id: tenant.id } });
    await db.$disconnect();
  }
});
