import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  companyLogoFromProfile,
  TEMPLATE_VERSION,
  type ReportSnapshot,
} from '@spt/report-templates';
import { sheetHeader } from '../packages/report-templates/src/sheet-layout';
import { reportCover } from '../packages/report-templates/src/report-cover';
const logo =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE2sAAAAASUVORK5CYII=';
const snapshot = {
  templateVersion: TEMPLATE_VERSION,
  createdAt: '2026-11-03T12:00:00Z',
  issueNumber: 1,
  tenant: { id: 'tenant', name: 'Empresa <&>', logoDataUrl: logo },
  work: {
    id: 'work',
    name: 'Obra',
    clientName: 'Cliente',
    city: 'Palmas',
    state: 'TO',
    address: null,
  },
  report: { id: 'report', title: 'Relatório', notes: '', version: 1 },
  holes: [],
} as unknown as ReportSnapshot;
test('company identity accepts bounded normalized PNG only, without remote image requests or markup', () => {
  assert.equal(companyLogoFromProfile({ logoDataUrl: logo }), logo);
  for (const value of [
    null,
    [],
    { logoDataUrl: 'https://example.com/logo.png' },
    { logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { logoDataUrl: 'data:image/png;base64,AAAA' },
    { logoDataUrl: logo + 'A'.repeat(400000) },
  ])
    assert.equal(companyLogoFromProfile(value), undefined);
});
test('new cover and headers use company logo; absent logo falls back to company name without Metro identity', () => {
  const header = sheetHeader(snapshot, 'Registro fotográfico'),
    cover = reportCover(snapshot);
  assert.ok(header.includes(`src="${logo}"`));
  assert.ok(header.includes('alt="Empresa &lt;&amp;&gt;"'));
  assert.ok(cover.includes(`src="${logo}"`));
  assert.ok(!header.includes('aria-label="Metro"'));
  assert.ok(!cover.includes('class="report-platform"'));
  const missing = { ...snapshot, tenant: { id: 'tenant', name: 'Empresa sem logo' } };
  assert.ok(
    sheetHeader(missing, 'Perfil individual').includes('<strong>Empresa sem logo</strong>'),
  );
  assert.ok(!sheetHeader(missing, 'Perfil individual').includes('aria-label="Metro"'));
  assert.ok(!reportCover(missing).includes('class="report-platform"'));
});
test('older snapshots retain their historical branding even when an optional logo is present', () => {
  const old = { ...snapshot, templateVersion: '0.8.12' },
    plain = {
      ...snapshot,
      templateVersion: '0.8.12',
      tenant: { id: snapshot.tenant.id, name: snapshot.tenant.name },
    };
  assert.equal(sheetHeader(old, 'Perfil'), sheetHeader(plain, 'Perfil'));
  assert.equal(reportCover(old), reportCover(plain));
  assert.ok(sheetHeader(old, 'Perfil').includes('aria-label="Metro"'));
});
