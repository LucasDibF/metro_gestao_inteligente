import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';
import { mkdir } from 'node:fs/promises';

// Captures go to an ignored folder unless a reviewer points PROFILE_CAPTURES elsewhere.
const captures = process.env.PROFILE_CAPTURES ?? 'apps/web/.impeccable/review/professional-profile';
const desktop = { width: 1440, height: 1000 };
const mobile = { width: 390, height: 844 };

async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
}
/** Saves the page at desktop and phone widths and checks the phone layout fits. */
async function capture(page: Page, name: string): Promise<void> {
  for (const [size, label] of [
    [desktop, 'desktop'],
    [mobile, 'movel'],
  ] as const) {
    // Grow the viewport to the page instead of a full-page shot, which repeats sticky bars.
    await page.setViewportSize(size);
    if (size === mobile) expect(await noHorizontalOverflow(page)).toBe(true);
    const height = await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return document.body.scrollHeight;
    });
    await page.setViewportSize({ width: size.width, height: Math.max(size.height, height) });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: `${captures}/${name}-${label}.png`, animations: 'disabled' });
  }
  await page.setViewportSize(desktop);
}

test('an engineer completes the professional profile to approve, and the hole keeps the copy', async ({
  page,
}) => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const tenant = await db.tenant.create({ data: { name: 'Perfil do responsável técnico' } });
  const password = crypto.randomUUID() + '!';
  const users: Array<{ id: string; email: string }> = [];
  try {
    await mkdir(captures, { recursive: true });
    const hash = await hashPassword(password);
    for (const role of ['ENGINEER', 'OPERATOR', 'VIEWER'] as const) {
      const user = await db.user.create({
        data: { email: crypto.randomUUID() + '@example.invalid', passwordHash: hash },
      });
      users.push(user);
      await db.membership.create({ data: { tenantId: tenant.id, userId: user.id, role } });
    }
    const [engineer] = users;
    const work = await db.work.create({ data: { tenantId: tenant.id, name: 'Obra do perfil' } });
    const hole = await db.borehole.create({
      data: {
        tenantId: tenant.id,
        workId: work.id,
        code: 'SP-01',
        reviewState: 'IN_REVIEW',
        executedDepthM: '1',
        fieldDate: new Date('2026-11-06'),
      },
    });
    await db.sptTest.create({
      data: {
        tenantId: tenant.id,
        workId: work.id,
        boreholeId: hole.id,
        depthM: '1',
        advances: [],
        result: { status: 'NOT_TESTED', nSpt: null },
        engineVersion: '0.1.0',
        createdBy: engineer.id,
        updatedBy: engineer.id,
      },
    });
    await db.soilLayer.create({
      data: {
        tenantId: tenant.id,
        workId: work.id,
        boreholeId: hole.id,
        fromM: '0',
        toM: '1',
        soilType: 'Argila arenosa',
        description: '',
      },
    });
    async function login(email: string) {
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByLabel('ID da empresa', { exact: true }).fill(tenant.id);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: tenant.name })).toBeVisible();
    }
    async function openReview() {
      await page.getByRole('button', { name: work.name, exact: true }).click();
      await page.getByRole('button', { name: 'Abrir furo SP-01', exact: true }).click();
      await page.getByRole('button', { name: 'Revisão técnica', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Revisão técnica', exact: true }),
      ).toBeVisible();
    }
    const approve = page.getByRole('button', { name: 'Aprovar tecnicamente', exact: true });
    const blocked = page.getByText('Complete seu perfil profissional para aprovar este furo.');
    const field = (label: string) => page.getByLabel(label, { exact: true });
    const save = page.getByRole('button', { name: 'Salvar perfil', exact: true });

    await page.setViewportSize(desktop);
    await page.goto('/');
    await login(engineer.email);
    await openReview();
    // Without a profile the approval is blocked, says what is missing and leads to the page.
    await expect(blocked).toBeVisible();
    await expect(page.getByText(/Falta preencher: nome completo, número do CREA/)).toBeVisible();
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAccessibleDescription(/Complete seu perfil profissional/);
    await capture(page, 'aprovacao-bloqueada');

    await page.getByRole('button', { name: 'Completar perfil profissional', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Perfil profissional', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByText('Perfil incompleto', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Você ainda não cadastrou seu perfil profissional.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText(/não saem no PDF do relatório/)).toBeVisible();
    await expect(field('Nome completo')).toHaveValue('');
    await capture(page, 'perfil-vazio');

    // The form names each problem on its field and focuses the first one, before any request.
    await field('Nome completo').fill('Ana Souza');
    await expect(page.getByText(/Há uma edição aberta/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Obras', exact: true })).toBeDisabled();
    await field('Título profissional').fill('Engenheira Civil');
    await field('Número do CREA').fill('CREA-SP 506123');
    await field('Email profissional (opcional)').fill('ana@empresa');
    let requests = 0;
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().endsWith('/perfil-profissional')) requests++;
    });
    await save.click();
    await expect(field('UF do CREA')).toHaveAttribute('aria-invalid', 'true');
    await expect(field('Número do CREA')).toBeFocused();
    await expect(field('Número do CREA')).toHaveAccessibleDescription(
      /Só o número.*Informe só o número do CREA/,
    );
    await expect(field('UF do CREA')).toHaveAccessibleDescription(
      'Selecione a UF do CREA junto com o número.',
    );
    await expect(field('Email profissional (opcional)')).toHaveAccessibleDescription(
      'Informe um email válido, como nome@empresa.com.br.',
    );
    expect(requests).toBe(0);
    await capture(page, 'perfil-erros');

    // A field the server rejects is shown on that field; a stale version asks to reload.
    await field('Número do CREA').fill('506.123.456-d');
    await field('UF do CREA').selectOption('SP');
    await field('Email profissional (opcional)').fill('Ana.Souza@Empresa.com.br');
    await field('Telefone (opcional)').fill('(11) 98765-4321');
    await page.route('**/api/v1/perfil-profissional', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({
            status: 400,
            json: { code: 'PROFESSIONAL_PROFILE_INVALID', field: 'phone', message: 'Phone' },
          })
        : route.continue(),
    );
    await save.click();
    await expect(field('Telefone (opcional)')).toHaveAccessibleDescription(
      /Com DDD\..*Informe o telefone com DDD/,
    );
    await expect(field('Telefone (opcional)')).toBeFocused();
    await page.unroute('**/api/v1/perfil-profissional');
    await page.route('**/api/v1/perfil-profissional', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 409, json: { code: 'RECORD_VERSION_CONFLICT' } })
        : route.continue(),
    );
    await save.click();
    await expect(page.getByRole('alert')).toContainText('Este registro foi alterado.');
    await expect(
      page.getByRole('button', { name: 'Recarregar perfil e descartar alterações', exact: true }),
    ).toBeVisible();
    await page.unroute('**/api/v1/perfil-profissional');

    await save.click();
    await expect(
      page.getByText('Perfil salvo. Seus dados já valem nas próximas aprovações.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Perfil completo', { exact: true })).toBeVisible();
    await expect(field('Número do CREA')).toHaveValue('506123456-D');
    await expect(field('Email profissional (opcional)')).toHaveValue('ana.souza@empresa.com.br');
    await expect(page.getByText(/Há uma edição aberta/)).toHaveCount(0);
    await capture(page, 'perfil-completo');

    // Back at the review the data comes from the profile, read-only, with a way to edit it.
    await page.getByRole('button', { name: 'Voltar à revisão do furo SP-01', exact: true }).click();
    const reviewer = page.getByRole('region', {
      name: 'Responsável técnico na aprovação',
      exact: true,
    });
    await expect(reviewer).toContainText('Ana Souza');
    await expect(reviewer).toContainText('Engenheira Civil');
    await expect(reviewer).toContainText('CREA-SP 506123456-D');
    await expect(
      reviewer.getByRole('button', { name: 'Editar perfil', exact: true }),
    ).toBeVisible();
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(field('Nome do responsável técnico')).toHaveCount(0);
    await field('Parecer ou observações da revisão').fill('Conferido.');
    await capture(page, 'aprovacao-com-perfil');

    // The profile loses its title in another tab: the server refuses and the block comes back.
    await db.professionalProfile.update({
      where: { tenantId_userId: { tenantId: tenant.id, userId: engineer.id } },
      data: { professionalTitle: null },
    });
    await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Complete seu perfil profissional');
    await expect(page.getByText('Falta preencher: título profissional.')).toBeVisible();
    await expect(approve).toBeDisabled();
    await page.getByRole('button', { name: 'Completar perfil profissional', exact: true }).click();
    await field('Título profissional').fill('Engenheira Civil');
    await save.click();
    await expect(page.getByText('Perfil completo', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Voltar à revisão do furo SP-01', exact: true }).click();
    await approve.click();
    await field('Parecer ou observações da revisão').fill('Conferido.');
    await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
    const copy = 'Responsável: Ana Souza · Engenheira Civil · Registro: CREA-SP 506123456-D';
    await expect(
      page.locator('strong').filter({ hasText: /^Aprovado tecnicamente$/ }),
    ).toBeVisible();
    await expect(page.getByText(copy, { exact: true })).toBeVisible();
    expect(
      await db.borehole.findUniqueOrThrow({
        where: { id: hole.id },
        select: { reviewerName: true, reviewerTitle: true, reviewerRegistration: true },
      }),
    ).toEqual({
      reviewerName: 'Ana Souza',
      reviewerTitle: 'Engenheira Civil',
      reviewerRegistration: 'CREA-SP 506123456-D',
    });

    // A later profile change does not rewrite the approved hole.
    await page.getByRole('button', { name: 'Perfil profissional', exact: true }).click();
    await field('Nome completo').fill('Ana Souza Lima');
    await save.click();
    await expect(page.getByText(/Perfil salvo\./)).toBeVisible();
    await page.getByRole('button', { name: 'Obras', exact: true }).click();
    await openReview();
    await expect(page.getByText(copy, { exact: true })).toBeVisible();
    await expect(reviewer).toHaveCount(0);
    await capture(page, 'furo-aprovado');

    // Sondador and Consulta have no profile page, and the API refuses their direct request.
    for (const other of users.slice(1)) {
      await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
      await login(other.email);
      await expect(page.getByRole('button', { name: 'Perfil profissional' })).toHaveCount(0);
      await page.setViewportSize(mobile);
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Obras' })).toBeVisible();
      await expect(
        page.getByRole('dialog').getByRole('button', { name: 'Perfil profissional' }),
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Fechar menu', exact: true }).click();
      await page.setViewportSize(desktop);
      await expect(page.getByLabel('Nome completo', { exact: true })).toHaveCount(0);
      const session = await page.request.post('/api/v1/auth/login', {
        data: { email: other.email, password, tenantId: tenant.id },
      });
      const { accessToken } = (await session.json()) as { accessToken: string };
      const direct = await page.request.get('/api/v1/perfil-profissional', {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      expect(direct.status()).toBe(403);
    }
  } finally {
    const ids = users.map((u) => u.id);
    await db.technicalEvent.deleteMany({ where: { tenantId: tenant.id } });
    await db.soilLayer.deleteMany({ where: { tenantId: tenant.id } });
    await db.sptTest.deleteMany({ where: { tenantId: tenant.id } });
    await db.borehole.deleteMany({ where: { tenantId: tenant.id } });
    await db.work.deleteMany({ where: { tenantId: tenant.id } });
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.professionalProfile.deleteMany({ where: { tenantId: tenant.id } });
    await db.membership.deleteMany({ where: { tenantId: tenant.id } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.tenant.delete({ where: { id: tenant.id } });
    await db.$disconnect();
  }
});
