import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { hashPassword } from '../../apps/api/src/auth/password';
const { generate } = createRequire(`${process.cwd()}/apps/api/package.json`)('otplib') as {
  generate(input: { secret: string }): Promise<string>;
};

test('login and MFA work through the browser on desktop and mobile', async ({ page }) => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const email = `browser-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID() + '!';
  let userId: string | undefined;
  let tenantId: string | undefined;
  const captures = 'apps/web/.impeccable/review';
  try {
    const user = await admin.user.create({
      data: { email, passwordHash: await hashPassword(password) },
    });
    userId = user.id;
    const tenant = await admin.tenant.create({
      data: {
        name: 'Empresa de verificação',
        memberships: { create: { userId, role: 'ADMIN', additionalRoles: ['ENGINEER'] } },
      },
    });
    tenantId = tenant.id;
    await mkdir(captures, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    let automaticSessions = 0;
    await page.route('**/auth/dev-status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true }),
      }),
    );
    await page.route('**/auth/dev-session', (route) => {
      automaticSessions++;
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar no ambiente de teste', exact: true }),
    ).toBeVisible();
    expect(automaticSessions).toBe(0);
    await page.getByRole('button', { name: 'Entrar no ambiente de teste', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('O acesso de teste não está disponível');
    expect(automaticSessions).toBe(1);
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();

    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ animations: 'disabled', path: `${captures}/desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ animations: 'disabled', path: `${captures}/mobile.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    async function login(code?: string) {
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByLabel('ID da empresa', { exact: true }).fill(tenant.id);
      if (code) {
        await page.getByText('Uso autenticação em duas etapas', { exact: true }).click();
        await page
          .getByLabel('Código do autenticador ou de recuperação', { exact: true })
          .fill(code);
      }
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    }
    await login();
    await expect(page.getByRole('heading', { name: tenant.name })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Menu principal' })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: `${captures}/navigation-mobile.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Mudar para tema escuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Cadastrar obra', exact: true })).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    await page.screenshot({ animations: 'disabled', path: `${captures}/theme-dark-mobile.png` });
    await page.getByRole('button', { name: 'Mudar para tema claro' }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    await expect(page.locator('.drawer-content')).toHaveCSS('animation-name', 'none');
    await page.getByRole('button', { name: 'Fechar menu', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({
      width: 390,
      height: Math.max(844, await page.evaluate(() => document.documentElement.scrollHeight)),
    });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    if (await page.getByRole('button', { name: 'Abrir menu', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Segurança da conta', exact: true }).click();
    await page.screenshot({ animations: 'disabled', path: `${captures}/security-mobile.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ animations: 'disabled', path: `${captures}/security-desktop.png` });
    await page.getByRole('button', { name: 'Recolher menu', exact: true }).click();
    await expect(page.locator('.workspace-sidebar')).toHaveCSS('width', '64px');
    await page.screenshot({ animations: 'disabled', path: `${captures}/navigation-compact.png` });
    await page.getByRole('button', { name: 'Expandir menu', exact: true }).click();
    await expect(page.locator('.workspace-sidebar')).toHaveCSS('width', '256px');
    await page.getByRole('button', { name: 'Mudar para tema escuro' }).click();
    await expect(
      page.getByRole('button', { name: 'Configurar autenticação em duas etapas', exact: true }),
    ).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.screenshot({ animations: 'disabled', path: `${captures}/theme-dark-desktop.png` });
    await page.getByRole('button', { name: 'Mudar para tema claro' }).click();
    await page.getByLabel('Confirme sua senha').fill('incorrect-password');
    await page.getByRole('button', { name: 'Configurar autenticação em duas etapas' }).click();
    await expect(page.getByRole('alert')).toContainText('Sua sessão continua ativa');
    await expect(page.getByRole('heading', { name: tenant.name })).toBeVisible();
    await page.getByLabel('Confirme sua senha').fill(password);
    await page.getByRole('button', { name: 'Configurar autenticação em duas etapas' }).click();
    const secret = await page.getByLabel('Chave de configuração').inputValue();
    await page.getByLabel('Confirme sua senha').fill(password);
    await page
      .getByLabel('Código do autenticador', { exact: true })
      .fill(await generate({ secret }));
    await page.getByRole('button', { name: 'Confirmar e ativar MFA' }).click();
    await expect(
      page.getByRole('heading', { name: 'Guarde seus códigos de recuperação' }),
    ).toBeVisible();
    const recoveryCodes = await page.locator('.recovery-codes code').allTextContents();
    const recovery = recoveryCodes[0];
    await expect(page.locator('.recovery-codes code')).toHaveCount(10);
    await page.getByLabel('Guardei os códigos em um local seguro.').check();
    await page.getByRole('button', { name: 'Voltar ao acesso' }).click();
    await login(recovery!);
    if (await page.getByRole('button', { name: 'Abrir menu', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Segurança da conta', exact: true }).click();
    await expect(page.getByText('MFA ativado', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter(
          (key) => !['spt.theme', 'spt.sidebarCollapsed'].includes(key),
        ),
      ),
    ).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
    await login(recovery!);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
    await page
      .getByLabel('Código do autenticador ou de recuperação', { exact: true })
      .fill(recoveryCodes[1]);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    if (await page.getByRole('button', { name: 'Abrir menu', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Segurança da conta', exact: true }).click();
    await expect(page.getByText('MFA ativado', { exact: true })).toBeVisible();
    await page.getByLabel('Confirme sua senha').fill(password);
    await page
      .getByLabel('Código do autenticador ou de recuperação', { exact: true })
      .fill(recoveryCodes[2]);
    await page.getByRole('button', { name: 'Desativar MFA e sair' }).click();
    await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
    await login();
    if (await page.getByRole('button', { name: 'Abrir menu', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Segurança da conta', exact: true }).click();
    await expect(page.getByText('MFA desativado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
  } finally {
    if (userId) {
      await admin.mfaCredential.deleteMany({ where: { userId } });
      await admin.authSession.deleteMany({ where: { userId } });
      await admin.membership.deleteMany({ where: { userId } });
      await admin.user.delete({ where: { id: userId } });
    }
    if (tenantId) await admin.tenant.delete({ where: { id: tenantId } });
    await admin.$disconnect();
  }
});

test('password change checks the current password and keeps the session', async ({ page }) => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const email = `browser-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomUUID() + '!';
  const newPassword = crypto.randomUUID() + '!';
  const user = await admin.user.create({
    data: { email, passwordHash: await hashPassword(password) },
  });
  const tenant = await admin.tenant.create({
    data: {
      name: 'Empresa da troca de senha',
      memberships: { create: { userId: user.id, role: 'ADMIN' } },
    },
  });
  try {
    async function login(secret: string) {
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(secret);
      await page.getByLabel('ID da empresa', { exact: true }).fill(tenant.id);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('heading', { name: tenant.name })).toBeVisible();
    }
    async function fill(current: string, next: string, confirmation = next) {
      await page.getByLabel('Senha atual', { exact: true }).fill(current);
      await page.getByLabel('Nova senha', { exact: true }).fill(next);
      await page.getByLabel('Confirme a nova senha', { exact: true }).fill(confirmation);
      await page.getByRole('button', { name: 'Alterar senha', exact: true }).click();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await login(password);
    await page.getByRole('button', { name: 'Segurança da conta', exact: true }).click();

    await fill(password, newPassword, newPassword + 'x');
    await expect(page.getByRole('alert')).toContainText('A confirmação não corresponde');

    await fill('senha-atual-incorreta', newPassword);
    await expect(page.getByRole('alert')).toContainText('A senha atual não confere');
    await expect(page.getByRole('heading', { name: tenant.name })).toBeVisible();

    await fill(password, newPassword);
    await expect(page.getByRole('status')).toContainText('Senha alterada');
    await expect(page.getByLabel('Senha atual', { exact: true })).toHaveValue('');
    await expect(page.getByRole('heading', { name: tenant.name })).toBeVisible();

    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
    await login(newPassword);
  } finally {
    await admin.authSession.deleteMany({ where: { userId: user.id } });
    await admin.membership.deleteMany({ where: { userId: user.id } });
    await admin.user.delete({ where: { id: user.id } });
    await admin.tenant.delete({ where: { id: tenant.id } });
    await admin.$disconnect();
  }
});
