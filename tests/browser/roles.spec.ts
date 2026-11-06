import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';
import { mkdir } from 'node:fs/promises';
test('administration creates access, commerce maintains clients, and operator submits a locked field record', async ({
  page,
}) => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const tenant = await db.tenant.create({ data: { name: 'Fluxo de responsabilidades' } });
  const password = crypto.randomUUID() + '!';
  const ids: string[] = [];
  try {
    const hash = await hashPassword(password),
      users = [];
    for (const role of ['ADMIN', 'OPERATOR', 'ENGINEER'] as const) {
      const user = await db.user.create({
        data: { email: crypto.randomUUID() + '@example.invalid', passwordHash: hash },
      });
      ids.push(user.id);
      await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role } });
      users.push(user);
    }
    const work = await db.work.create({ data: { tenantId: tenant.id, name: 'Obra de campo' } });
    await db.workAssignment.create({
      data: {
        workId: work.id,
        tenantId: tenant.id,
        operatorId: users[1].id,
        assignedBy: users[0].id,
      },
    });
    const hole = await db.borehole.create({
      data: { tenantId: tenant.id, workId: work.id, code: 'SP-01' },
    });
    async function login(email: string) {
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByLabel('ID da empresa', { exact: true }).fill(tenant.id);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    }
    async function logout() {
      await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/');
    await login(users[0].email);
    await expect(page.getByRole('button', { name: 'Cadastrar obra', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Acessos', exact: true }).click();
    await page.getByRole('button', { name: 'Criar login', exact: true }).click();
    const mail = crypto.randomUUID() + '@example.invalid';
    await page.getByLabel('Email do usuário', { exact: true }).fill(mail);
    await page.getByLabel('Senha inicial', { exact: true }).fill(password);
    await page.getByLabel('Sondador', { exact: true }).uncheck();
    await page.getByLabel('Comercial', { exact: true }).check();
    await page.getByRole('button', { name: 'Salvar acesso', exact: true }).click();
    await expect(page.getByRole('heading', { name: mail, exact: true })).toBeVisible();
    ids.push((await db.user.findUniqueOrThrow({ where: { email: mail } })).id);
    await mkdir('apps/web/.impeccable/review', { recursive: true });
    const geometry = await page.evaluate(() => ({
      main: document.querySelector('main')!.getBoundingClientRect().left,
      side: document.querySelector('.workspace-sidebar')!.getBoundingClientRect().right,
      bodyMargin: getComputedStyle(document.querySelector('.workspace-body')!).marginLeft,
      scrollX: scrollX,
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(geometry.main).toBeGreaterThanOrEqual(geometry.side);
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);

    await page.screenshot({
      path: 'apps/web/.impeccable/review/access-desktop.png',
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Editar acesso ' + mail, exact: true }).click();
    await page.screenshot({
      path: 'apps/web/.impeccable/review/access-mobile.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1100 });
    await logout();
    await login(mail);
    await expect(page.getByRole('button', { name: 'Acessos', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Clientes', exact: true }).click();
    await page.getByRole('button', { name: 'Cadastrar cliente', exact: true }).click();
    await page.getByLabel('Nome ou razão social', { exact: true }).fill('Cliente comercial');
    await page.getByLabel('Email (opcional)', { exact: true }).fill('cliente@example.invalid');
    await page.getByRole('button', { name: 'Salvar cliente', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Cliente comercial', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: 'apps/web/.impeccable/review/clients-desktop.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Obras', exact: true }).click();
    await page.getByRole('button', { name: 'Cadastrar obra', exact: true }).click();
    await page.getByLabel('Nome da obra', { exact: true }).fill('Obra comercial em lote');
    await page.getByLabel('Quantidade de furos', { exact: true }).fill('3');
    await page.getByLabel('Pasta dos furos (opcional)', { exact: true }).fill('Campanha 1');
    await page.screenshot({
      path: 'apps/web/.impeccable/review/work-batch-desktop.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Salvar obra', exact: true }).click();
    await page.getByRole('button', { name: 'Obra comercial em lote', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir pasta Campanha 1', exact: true }).click();
    for (const code of ['SP-01', 'SP-02', 'SP-03'])
      await expect(page.getByRole('heading', { name: code, exact: true })).toBeVisible();
    await expect(page.getByText('Furos sem pasta', { exact: true })).toHaveCount(0);
    await logout();
    await login(users[1].email);
    await expect(page.getByRole('button', { name: 'Clientes', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: work.name, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cadastrar furo', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir furo SP-01', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Relatórios da obra', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Abrir furo SP-01', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Revisão técnica', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Análise geotécnica', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Registrar metro', exact: true }).click();
    await expect(page.getByLabel('Golpes do 1º avanço', { exact: true })).toHaveCount(0);
    await page.getByLabel('Tipo de solo', { exact: true }).fill('Argila arenosa');
    await expect(
      page.getByLabel('Descrição do solo (opcional)', { exact: true }),
    ).not.toHaveAttribute('required', '');
    await page.locator('.spt-editor').screenshot({
      path: 'apps/web/.impeccable/review/initial-soil-desktop.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Salvar metro', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar metro', exact: true }).click();
    await page
      .getByRole('button', { name: 'Repetir tipo e cor do metro anterior', exact: true })
      .click();
    await expect(page.getByLabel('Tipo de solo', { exact: true })).toHaveValue('Argila arenosa');
    await page.getByLabel('Golpes do 1º avanço', { exact: true }).fill('30');
    await page.getByLabel('Penetração do 1º avanço em cm', { exact: true }).fill('6');
    await page
      .getByRole('button', {
        name: 'Marcar 2º avanço e seguintes como não executados',
        exact: true,
      })
      .click();
    await page.getByLabel('Último metro do furo', { exact: true }).check();
    await page.getByRole('button', { name: 'Salvar metro', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Resultado do ensaio', exact: true }),
    ).toContainText('Ensaio interrompido');
    await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
    await page.getByRole('button', { name: 'Editar dados de campo', exact: true }).click();
    await page.getByLabel('Data de campo', { exact: true }).fill('2026-11-02');
    await page.getByLabel('Profundidade executada em metros', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Salvar dados de campo', exact: true }).click();
    await page.getByRole('button', { name: 'Registro de campo', exact: true }).click();
    await page.getByRole('button', { name: 'Enviar para análise', exact: true }).click();
    await page
      .getByLabel('Observações para o engenheiro', { exact: true })
      .fill('Execução concluída.');
    await expect(page.getByRole('button', { name: 'Visão geral', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Registrar metro', exact: true })).toHaveCount(0);
    await page.route(
      '**/tecnico/enviar-revisao',
      async (route) => {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'RECORD_VERSION_CONFLICT' }),
        });
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Confirmar envio para análise', exact: true }).click();
    await expect(
      page
        .getByRole('alert')
        .getByText('Este registro foi alterado. Recarregue os dados antes de salvar novamente.'),
    ).toBeVisible();
    await expect(page.getByLabel('Observações para o engenheiro', { exact: true })).toHaveValue(
      'Execução concluída.',
    );
    await page.screenshot({
      path: 'apps/web/.impeccable/review/field-submission-desktop.png',
      animations: 'disabled',
    });
    const fieldMobile = await page.context().newPage();
    await fieldMobile.setViewportSize({ width: 390, height: 844 });
    await fieldMobile.goto('/');
    await fieldMobile.getByLabel('Email', { exact: true }).fill(users[1].email);
    await fieldMobile.getByLabel('Senha', { exact: true }).fill(password);
    await fieldMobile.getByLabel('ID da empresa', { exact: true }).fill(tenant.id);
    await fieldMobile.getByRole('button', { name: 'Entrar', exact: true }).click();
    await fieldMobile.getByRole('button', { name: work.name, exact: true }).click();
    await fieldMobile.getByRole('button', { name: 'Abrir furo SP-01', exact: true }).click();
    await fieldMobile.getByRole('button', { name: 'Enviar para análise', exact: true }).click();
    await fieldMobile
      .getByLabel('Observações para o engenheiro', { exact: true })
      .fill('Execução concluída.');
    await fieldMobile
      .getByLabel('Observações para o engenheiro', { exact: true })
      .scrollIntoViewIfNeeded();
    await fieldMobile.screenshot({
      path: 'apps/web/.impeccable/review/field-submission-mobile.png',
      animations: 'disabled',
    });
    expect(
      await fieldMobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await fieldMobile.close();
    await page.getByRole('button', { name: 'Confirmar envio para análise', exact: true }).click();
    await page.getByRole('button', { name: 'Registro de campo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Registrar metro', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Corrigir registro a 1 m', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('Registro enviado para análise.', { exact: false })).toBeVisible();
    await page.screenshot({
      path: 'apps/web/.impeccable/review/field-locked-desktop.png',
      animations: 'disabled',
    });
    await logout();
    await login(users[2].email);
    await page.getByRole('button', { name: work.name, exact: true }).click();
    await page.getByRole('button', { name: 'Abrir furo SP-01', exact: true }).click();
    await page.getByRole('button', { name: 'Revisão técnica', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Aprovar tecnicamente', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: 'apps/web/.impeccable/review/review-desktop.png',
      animations: 'disabled',
    });
    const mobile = await page.context().newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto('/');
    await mobile.getByLabel('Email', { exact: true }).fill(users[2].email);
    await mobile.getByLabel('Senha', { exact: true }).fill(password);
    await mobile.getByLabel('ID da empresa', { exact: true }).fill(tenant.id);
    await mobile.getByRole('button', { name: 'Entrar', exact: true }).click();
    await mobile.getByRole('button', { name: work.name, exact: true }).click();
    await mobile.getByRole('button', { name: 'Abrir furo SP-01', exact: true }).click();
    await mobile.getByRole('button', { name: 'Revisão técnica', exact: true }).click();
    await expect(
      mobile.getByRole('button', { name: 'Aprovar tecnicamente', exact: true }),
    ).toBeVisible();
    expect(await mobile.locator('.workspace-header:visible').count()).toBe(1);
    await mobile.screenshot({
      path: 'apps/web/.impeccable/review/review-mobile-fresh.png',
      animations: 'disabled',
    });
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await mobile.getByRole('button', { name: 'Identificação', exact: true }).click();
    await expect(
      mobile.getByRole('heading', { name: 'Identificação e planejamento', exact: true }),
    ).toBeVisible();
    await mobile.locator('.technical-screen').screenshot({
      path: 'apps/web/.impeccable/review/identification-mobile.png',
      animations: 'disabled',
    });
    await mobile.close();
  } finally {
    const newUsers = await db.membership.findMany({
      where: { tenantId: tenant.id },
      select: { userId: true },
    });
    const allIds = [...new Set([...ids, ...newUsers.map((m) => m.userId)])];
    await db.$executeRaw`DELETE FROM membership_events WHERE tenant_id=${tenant.id}::uuid`;
    await db.technicalEvent.deleteMany({ where: { tenantId: tenant.id } });
    await db.soilLayer.deleteMany({ where: { tenantId: tenant.id } });
    await db.sptTest.deleteMany({ where: { tenantId: tenant.id } });
    await db.borehole.deleteMany({ where: { tenantId: tenant.id } });
    await db.folder.deleteMany({ where: { tenantId: tenant.id } });
    await db.workAssignment.deleteMany({ where: { tenantId: tenant.id } });
    await db.work.deleteMany({ where: { tenantId: tenant.id } });
    await db.client.deleteMany({ where: { tenantId: tenant.id } });
    await db.authSession.deleteMany({ where: { userId: { in: allIds } } });
    await db.membership.deleteMany({ where: { tenantId: tenant.id } });
    await db.user.deleteMany({ where: { id: { in: allIds } } });
    await db.tenant.delete({ where: { id: tenant.id } });
    await db.$disconnect();
  }
});
