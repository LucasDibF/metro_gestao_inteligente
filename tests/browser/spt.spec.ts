import { processNextPhoto } from '../../apps/worker/src/photo-worker';
import sharp from 'sharp';
import { PrivateStorage } from '@spt/private-storage';
import { processNextReport } from '../../apps/worker/src/report-worker';
import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../../apps/api/src/auth/password';
import { mkdir } from 'node:fs/promises';

test('SPT entry saves 4/6/8 as14, recalculates edits and keeps partial readings without a definitive result', async ({
  page,
}) => {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
  });
  const password = crypto.randomUUID() + '!';
  const users: Array<{ id: string; email: string }> = [];
  let tenantId: string | undefined;
  let workId: string | undefined;
  let holeId: string | undefined;
  let additionalHoleId: string | undefined;
  try {
    const hash = await hashPassword(password);
    tenantId = (await db.tenant.create({ data: { name: 'Empresa de verificação' } })).id;
    for (const role of ['ADMIN', 'VIEWER', 'ENGINEER'] as const) {
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
    holeId = (await db.borehole.create({ data: { tenantId, workId, code: 'SP-01' } })).id;
    additionalHoleId = (await db.borehole.create({ data: { tenantId, workId, code: 'SP-02' } })).id;
    // Preserve editing of an imported legacy first-metre draft; new first metres use soil-only flow.
    await db.sptTest.create({
      data: {
        tenantId,
        workId,
        boreholeId: holeId,
        depthM: '1',
        advances: [],
        result: { status: 'INCOMPLETE', nSpt: null, reason: 'INSUFFICIENT_ADVANCES' },
        engineVersion: '0.1.0',
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    });
    async function open(index: number) {
      await page.getByLabel('Email', { exact: true }).fill(users[index].email);
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await page.getByLabel('ID da empresa', { exact: true }).fill(tenantId!);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('button', { name: work.name, exact: true }).click();
      await page.getByRole('button', { name: 'Abrir furo SP-01', exact: true }).click();
      await page.getByRole('button', { name: 'Registro de campo', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Registro de campo · SP-01', exact: true }),
      ).toBeVisible();
    }
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('/');
    await open(0);
    await page.getByRole('button', { name: 'Corrigir registro a 1 m', exact: true }).click();
    await expect(page.getByLabel('Profundidade inicial do ensaio em metros')).toHaveValue('1');
    await expect(page.getByLabel('Golpes do 1º avanço', { exact: true })).toHaveValue('');
    await expect(
      page.getByRole('button', { name: 'Diminuir golpes do 1º avanço', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Aumentar golpes do 1º avanço', exact: true }).click();
    await page.getByRole('button', { name: 'Diminuir golpes do 1º avanço', exact: true }).click();
    await expect(page.getByLabel('Golpes do 1º avanço', { exact: true })).toHaveValue('0');
    await expect(page.getByLabel('Golpes do 2º avanço', { exact: true })).toHaveValue('');
    for (const [i, value] of [4, 6, 8].entries()) {
      await page.getByLabel(`Golpes do ${i + 1}º avanço`, { exact: true }).fill(String(value));
      await page
        .getByRole('button', { name: `Usar 15 cm no ${i + 1}º avanço`, exact: true })
        .click();
      await expect(
        page.getByLabel(`Penetração do ${i + 1}º avanço em cm`, { exact: true }),
      ).toHaveValue('15');
    }
    await page.getByLabel('Cor do solo', { exact: true }).fill('Marrom');
    await page.getByLabel('Umidade do solo', { exact: true }).selectOption('Úmida');
    await page.getByLabel('Método de execução deste metro', { exact: true }).selectOption('SP_TH');
    await page.getByLabel('Tipo de solo', { exact: true }).fill('Areia siltosa');
    await page
      .getByLabel('Descrição do solo (opcional)', { exact: true })
      .fill('Marrom, com fragmentos finos.');
    const captures = 'apps/web/.impeccable/review';
    await mkdir(captures, { recursive: true });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.setViewportSize({
      width: 1440,
      height: Math.max(1200, await page.evaluate(() => document.documentElement.scrollHeight)),
    });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: `${captures}/spt-form-desktop.png` });
    await page.setViewportSize({
      width: 390,
      height: Math.max(1400, await page.evaluate(() => document.documentElement.scrollHeight)),
    });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.setViewportSize({
      width: 390,
      height: Math.max(1400, await page.evaluate(() => document.documentElement.scrollHeight)),
    });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: `${captures}/spt-form-mobile.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Golpes do 3º avanço', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Salvar metro', exact: true }).click();
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page.getByRole('alert')).toBeInViewport();
    await page.getByRole('button', { name: 'Salvar metro', exact: true }).click();
    await expect(page.getByRole('alert')).toBeInViewport();
    await page.getByLabel('Golpes do 3º avanço', { exact: true }).fill('8');
    await page.getByRole('button', { name: 'Salvar e próximo metro', exact: true }).click();
    await expect(page.getByLabel('Profundidade inicial do ensaio em metros')).toHaveValue('2');
    await expect(page.getByLabel('Tipo de solo', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Golpes do 1º avanço', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Penetração do 1º avanço em cm', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const result = page.getByRole('region', { name: 'Resultado do ensaio', exact: true });
    await expect(result).toContainText('N-SPT: 14');
    await expect(result).toContainText(
      'Areia siltosa, medianamente compacta, marrom, úmida, marrom, com fragmentos finos.',
    );
    await expect(page.getByRole('heading', { name: 'Ensaio a 1 m', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector('main')!.getBoundingClientRect().left >=
            document.querySelector('.workspace-sidebar')!.getBoundingClientRect().right,
        ),
      )
      .toBe(true);
    await result.screenshot({ animations: 'disabled', path: `${captures}/spt-result-comma.png` });
    await page.screenshot({ path: `${captures}/spt-result-desktop.png` });
    await page.getByRole('button', { name: 'Corrigir registro a 1 m', exact: true }).click();
    await expect(page.getByLabel('Cor do solo', { exact: true })).toHaveValue('Marrom');
    await expect(page.getByLabel('Umidade do solo', { exact: true })).toHaveValue('Úmida');
    await expect(page.getByLabel('Método de execução deste metro', { exact: true })).toHaveValue(
      'SP_TH',
    );
    await page.getByLabel('Golpes do 3º avanço', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'Salvar metro', exact: true }).click();
    await expect(result).toContainText('N-SPT: 16');
    await page.getByRole('button', { name: 'Corrigir registro a 1 m', exact: true }).click();
    await page.getByLabel('Penetração do 3º avanço em cm', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'Salvar metro', exact: true }).click();
    await expect(result).toContainText('Revisão técnica necessária');
    await expect(result).toContainText('N-SPT: Não calculado');
    const saved = await db.sptTest.findFirstOrThrow({ where: { boreholeId: holeId } });
    expect(saved.advances).toEqual([
      { blows: 4, penetrationMm: 150 },
      { blows: 6, penetrationMm: 150 },
      { blows: 10, penetrationMm: 100 },
    ]);
    expect(saved.version).toBe(4);
    expect(saved.fieldDetails).toEqual({ executionMethod: 'SP_TH' });
    expect((await db.soilLayer.findFirstOrThrow({ where: { boreholeId: holeId } })).soilColor).toBe(
      'Marrom',
    );
    expect(saved.engineVersion).toBe('0.1.0');
    expect(await db.soilLayer.count({ where: { boreholeId: holeId } })).toBe(1);
    expect(
      (await db.soilLayer.findFirstOrThrow({ where: { boreholeId: holeId } })).description,
    ).toBe('Marrom, com fragmentos finos.');
    for (const depthM of ['2', '3', '4', '5'])
      await db.sptTest.create({
        data: {
          tenantId,
          workId,
          boreholeId: holeId,
          depthM,
          advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
          result: { status: 'CONVENTIONAL', nSpt: 14, reason: null },
          engineVersion: '0.1.0',
          createdBy: users[0].id,
          updatedBy: users[0].id,
        },
      });
    await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
    await page.getByRole('button', { name: 'Análise geotécnica', exact: true }).click();
    const sheetFrame = page;
    await sheetFrame.getByRole('button', { name: 'Consultar ensaio a 1 m', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Corrigir registro selecionado', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Aumentar zoom do perfil', exact: true }).click();
    await page.getByRole('button', { name: 'Ajustar à largura', exact: true }).click();
    await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
    await page.getByRole('button', { name: 'Editar dados de campo', exact: true }).click();
    await page.getByLabel('Data de campo', { exact: true }).fill('2026-10-31');
    await page.getByLabel('Profundidade executada em metros', { exact: true }).fill('5');
    await page.getByLabel('Nível d’água em metros (opcional)', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Salvar dados de campo', exact: true }).click();
    await expect(page.getByText('Dados salvos.', { exact: true })).toBeVisible();
    await page.getByText('Ajustar camadas de solo', { exact: true }).click();
    await page.getByRole('button', { name: 'Adicionar camada', exact: true }).click();
    await page.getByLabel('De (m)', { exact: true }).fill('1');
    await page.getByLabel('Até (m)', { exact: true }).fill('5');
    await page.getByLabel('Tipo de solo', { exact: true }).fill('Areia siltosa');
    await page
      .getByLabel('Descrição da camada (opcional)', { exact: true })
      .fill('Marrom, com fragmentos finos.');
    await page.getByRole('button', { name: 'Salvar camada', exact: true }).click();
    await expect(page.getByText('Dados salvos.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fotografias', exact: true }).click();
    await page.getByRole('button', { name: 'Adicionar fotografia', exact: true }).click();
    const image = await sharp({
      create: { width: 320, height: 200, channels: 3, background: '#285440' },
    })
      .png()
      .toBuffer();
    await page
      .getByLabel('Fotografia JPEG ou PNG (até 8 MB)', { exact: true })
      .setInputFiles({ name: 'foto-sintetica.png', mimeType: 'image/png', buffer: image });
    await page.getByLabel('Finalidade da fotografia', { exact: true }).selectOption('SITE');
    await page
      .getByLabel('Legenda da fotografia (opcional)', { exact: true })
      .fill('Registro sintético de campo');
    await page.getByRole('button', { name: 'Enviar fotografia', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Registro sintético de campo', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Revisão técnica', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Conferência do furo', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Análise geotécnica', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Análise do furo', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
    const uploadedPhoto = await db.boreholePhoto.findFirstOrThrow({
      where: { boreholeId: holeId },
    });
    expect(uploadedPhoto.purpose).toBe('SITE');
    const photoWorker = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.WORKER_DATABASE_URL }),
    });
    try {
      await processNextPhoto(photoWorker, uploadedPhoto.id);
    } finally {
      await photoWorker.$disconnect();
    }
    await page.getByRole('button', { name: 'Adicionar coordenada executada', exact: true }).click();
    await page.getByLabel('Este (m)', { exact: true }).fill('500000');
    await page.getByLabel('Norte (m)', { exact: true }).fill('9400000');
    await page.getByLabel('Fuso UTM', { exact: true }).fill('25');
    await page
      .getByLabel('Origem da coordenada', { exact: true })
      .fill('Referência sintética de teste');
    await page.getByRole('button', { name: 'Salvar coordenada', exact: true }).click();
    await page.getByRole('button', { name: 'Usar como oficial executada', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Executada · Oficial', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Revisão técnica', exact: true }).click();
    await page.getByRole('button', { name: 'Enviar para análise', exact: true }).click();
    await page
      .getByLabel('Parecer ou observações da revisão', { exact: true })
      .fill('Dados de campo conferidos.');
    await page.getByRole('button', { name: 'Confirmar envio para análise', exact: true }).click();
    await expect(page.locator('strong').filter({ hasText: /^Aguardando revisão$/ })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1700 });
    await page.setViewportSize({
      width: 1440,
      height: Math.max(1700, await page.evaluate(() => document.documentElement.scrollHeight)),
    });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: `${captures}/technical-desktop.png` });
    await page.getByRole('button', { name: 'Análise geotécnica', exact: true }).click();
    await page
      .getByRole('region', { name: 'Análise do furo', exact: true })
      .screenshot({ path: `${captures}/sheet-desktop.png` });
    await page.setViewportSize({ width: 390, height: 2000 });
    await page.setViewportSize({
      width: 390,
      height: Math.max(2000, await page.evaluate(() => document.documentElement.scrollHeight)),
    });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: `${captures}/technical-mobile.png` });
    await page.getByRole('button', { name: 'Revisão técnica', exact: true }).click();
    await page
      .getByRole('region', { name: 'Conferência do furo', exact: true })
      .screenshot({ animations: 'disabled', path: `${captures}/checklist-mobile.png` });
    await page.getByRole('button', { name: 'Análise geotécnica', exact: true }).click();
    await page
      .getByRole('region', { name: 'Análise do furo', exact: true })
      .screenshot({ animations: 'disabled', path: `${captures}/profile-mobile.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    const zoomBefore = Number(
      (await page.getByLabel('Zoom do perfil', { exact: true }).innerText()).replace('%', ''),
    );
    await page.getByRole('button', { name: 'Diminuir zoom do perfil', exact: true }).click();
    expect(
      Number(
        (await page.getByLabel('Zoom do perfil', { exact: true }).innerText()).replace('%', ''),
      ),
    ).toBeLessThan(zoomBefore);
    await page.getByRole('button', { name: 'Ver detalhes', exact: true }).click();
    await page.getByLabel('Consultar metro', { exact: true }).selectOption('1');
    await expect(
      page.getByRole('region', { name: 'Detalhes do metro selecionado', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await open(2);
    await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
    await page.getByRole('button', { name: 'Revisão técnica', exact: true }).click();
    await page.getByRole('button', { name: 'Aprovar tecnicamente', exact: true }).click();
    await page
      .getByLabel('Nome do responsável técnico', { exact: true })
      .fill('Engenheira de teste');
    await page.getByLabel('Registro profissional', { exact: true }).fill('TESTE-123');
    await page
      .getByLabel('Parecer ou observações da revisão', { exact: true })
      .fill('Caso sintético conferido para homologação.');
    await page.getByRole('button', { name: 'Confirmar aprovação', exact: true }).click();
    await expect(
      page.locator('strong').filter({ hasText: /^Aprovado tecnicamente$/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Registro de campo', exact: true }).click();
    await page.getByRole('button', { name: 'Voltar aos furos', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Relatórios da obra', exact: true }).click();
    await page.getByRole('button', { name: 'Criar relatório', exact: true }).click();
    await page
      .getByLabel('Título do relatório', { exact: true })
      .fill('Relatório sintético completo');
    await page.getByRole('checkbox', { name: 'SP-01', exact: true }).check();
    await page
      .getByRole('checkbox', { name: 'SP-01 · Registro sintético de campo', exact: true })
      .check();
    await page.getByRole('checkbox', { name: 'SP-02', exact: true }).check();
    await page.getByRole('button', { name: 'Retirar furo SP-01', exact: true }).click();
    await expect(page.getByText('Fotografia indisponível', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Retirar fotografia 1', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'SP-01', exact: true }).check();
    const selectedPhoto = page.getByRole('checkbox', {
      name: 'SP-01 · Registro sintético de campo',
      exact: true,
    });
    await expect(selectedPhoto).not.toBeChecked();
    await selectedPhoto.check();
    await page.getByRole('checkbox', { name: 'SP-02', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Salvar composição', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Emissões · Relatório sintético completo', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByAltText('Prévia do croqui com os furos selecionados em azul'),
    ).toBeVisible();
    await expect(page.getByText('Google Maps não configurado.', { exact: false })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Abrir localização no Google Maps' }),
    ).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\//);

    // Exercise the configured browser frame without contacting Google or using credentials.
    await page.route('https://www.google.com/maps/embed/v1/view?**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="pt-BR"><body>Mapa Google simulado para teste de interface</body></html>',
      }),
    );
    let imageryReady = false;
    const mapImage =
      'data:image/jpeg;base64,' + (await sharp(image).jpeg().toBuffer()).toString('base64');
    await page.route('**/croqui', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      // Preserve errors from requests already in flight when the account is logged out.
      if (!response.ok()) return route.fulfill({ response });
      const data = await response.json();
      data.imagery = !imageryReady
        ? { state: 'unavailable', reason: 'coverage' }
        : {
            state: 'ready',
            date: '2026-09-24',
            pixelSizeM: 2,
            scene: 'CBERS4A_WPM_PCA_RGB321_20260924_206_133',
          };
      if (imageryReady)
        data.svg = data.svg.replace(
          '<path d="M555',
          `<image href="${mapImage}" width="600" height="520"/><path d="M555`,
        );

      data.google.embedUrl =
        'https://www.google.com/maps/embed/v1/view?key=synthetic-browser-key&center=-5,-35&maptype=satellite';
      await route.fulfill({ response, json: data });
    });
    await page.getByRole('button', { name: 'Ajustar enquadramento', exact: true }).click();
    await page.getByLabel('Abrangência do croqui em metros', { exact: true }).fill('100');
    await page.getByRole('button', { name: 'Salvar enquadramento', exact: true }).click();
    await expect(page.getByText('Composição 2 · 1 furo', { exact: true })).toBeVisible();
    await expect(
      page
        .frameLocator('iframe[title="Google Maps — referência de localização"]')
        .getByText('Mapa Google simulado para teste de interface'),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Não foi encontrada imagem INPE com cobertura útil completa nas cenas consultadas.',
        { exact: false },
      ),
    ).toBeVisible();
    imageryReady = true;
    await page.getByRole('button', { name: 'Tentar carregar imagem INPE', exact: true }).click();
    await expect(page.getByText('Fonte: INPE / CBERS-4A', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Licença CC BY 4.0', exact: true })).toBeVisible();
    const generate = page.getByRole('button', { name: 'Gerar PDF de homologação', exact: true });
    await expect(generate).toHaveCSS('background-color', 'rgb(35, 107, 69)');
    await generate.screenshot({
      path: 'apps/web/.impeccable/review/generate-report-green.png',
      animations: 'disabled',
    });
    await generate.click();
    await expect(
      page.getByRole('heading', { name: 'Emissão 1 · Na fila', exact: true }),
    ).toBeVisible();
    const issue = await db.reportIssue.findFirstOrThrow({ where: { workId } });
    const worker = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.WORKER_DATABASE_URL }),
    });
    try {
      await processNextReport(worker, {
        channel: process.platform === 'darwin' ? 'chrome' : undefined,
        onlyJobId: issue.id,
      });
    } finally {
      await worker.$disconnect();
    }
    // The screen follows the worker automatically; no manual refresh is required.
    await expect(
      page.getByRole('heading', { name: 'Emissão 1 · PDF disponível', exact: true }),
    ).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar PDF emissão 1', exact: true }).click();
    const pdfDownload = await downloaded;
    expect(pdfDownload.suggestedFilename()).toBe('sondagem-emissao-1.pdf');
    await pdfDownload.saveAs('apps/web/.impeccable/review/field-workflow.pdf');
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: `${captures}/reports-desktop.png` });
    await page.setViewportSize({ width: 390, height: 2100 });
    await page.evaluate(() => {
      scrollTo(0, 0);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: `${captures}/reports-mobile.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // The report center downloads the same issue through the shared PDF helper.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Relatórios', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Central de relatórios' })).toBeVisible();
    const centerDownloaded = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Baixar PDF Relatório sintético completo', exact: true })
      .click();
    expect((await centerDownloaded).suggestedFilename()).toBe('sondagem-emissao-1.pdf');
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await open(1);
    await expect(page.getByRole('button', { name: 'Registrar metro', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Corrigir registro a 1 m', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Ensaio a 1 m', exact: true })).toBeVisible();
  } finally {
    if (workId) {
      const storage = new PrivateStorage();
      try {
        const objects = await db.boreholePhoto.findMany({ where: { workId } });
        const issues = await db.reportIssue.findMany({ where: { workId } });
        await Promise.allSettled(
          [
            ...objects.flatMap((p) => [p.objectKey, p.thumbnailKey]),
            ...issues.flatMap((i) => (i.objectKey ? [i.objectKey] : [])),
          ].map((key) => storage.remove(key)),
        );
      } finally {
        storage.close();
      }
      await db.report.updateMany({ where: { workId }, data: { currentIssueId: null } });
      await db.reportIssue.deleteMany({ where: { workId } });
      await db.report.deleteMany({ where: { workId } });
      await db.boreholePhoto.deleteMany({ where: { workId } });
      await db.borehole.updateMany({ where: { workId }, data: { officialCoordinateId: null } });
      await db.boreholeCoordinate.deleteMany({ where: { workId } });
    }
    if (holeId) {
      await db.soilLayer.deleteMany({ where: { boreholeId: holeId } });
      await db.sptTest.deleteMany({ where: { boreholeId: holeId } });
      await db.technicalEvent.deleteMany({ where: { boreholeId: holeId } });
      await db.borehole.delete({ where: { id: holeId } });
    }
    if (additionalHoleId) await db.borehole.delete({ where: { id: additionalHoleId } });
    if (workId) await db.work.delete({ where: { id: workId } });
    const ids = users.map((u) => u.id);
    await db.authSession.deleteMany({ where: { userId: { in: ids } } });
    await db.membership.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
    await db.$disconnect();
  }
});
