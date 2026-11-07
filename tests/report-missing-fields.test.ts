import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineeringProfiles } from '../packages/report-templates/src/engineering-profile';
import {
  missingFieldLabels,
  missingFieldValue,
  missingFieldWording,
} from '../packages/report-templates/src/missing-field';
import { renderReport } from '../packages/report-templates/src/index';
import { TEMPLATE_VERSION, type ReportSnapshot } from '@spt/report-templates';

type Hole = ReportSnapshot['holes'][number];

/** Hole without altitude, water level or casing, one known and one unknown execution method. */
const holeWithoutFieldData: Hole = {
  id: 'hole',
  code: 'SP-01',
  technicalVersion: 1,
  executedDepthM: '24',
  waterLevelM: null,
  fieldDate: '2026-10-31',
  reviewerName: 'Teste',
  reviewerRegistration: 'DEMO',
  reviewedAt: '2026-10-31',
  reviewNote: null,
  officialCoordinate: {
    eastingM: '500000',
    northingM: '9000000',
    zone: 25,
    hemisphere: 'S',
    datum: 'SIRGAS2000',
    latitude: 0,
    longitude: 0,
    reference: 'Teste',
    altitudeM: null,
  },
  layers: [{ fromM: '0', toM: '24', soilType: 'Areia', description: 'fina' }],
  tests: [1, 2, 3].map((depth) => ({
    depthM: String(depth),
    advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
    result: { nSpt: 14, status: 'VALID' },
    interruptionReason: null,
    engineVersion: '0.1.0',
    fieldDetails:
      depth === 2 ? { executionMethod: 'TC' } : depth === 3 ? { executionMethod: 'XX' } : undefined,
  })),
};

function snapshotFor(templateVersion: string): ReportSnapshot {
  return {
    work: { name: 'Obra', clientName: null, address: null, city: null, state: null },
    tenant: { id: 'tenant', name: 'Empresa de teste' },
    report: { id: 'report', version: 1, notes: '' },
    templateVersion,
    issueNumber: 1,
    holes: [holeWithoutFieldData],
  } as ReportSnapshot;
}

function renderProfile(templateVersion: string, hole: Hole = holeWithoutFieldData): string {
  return engineeringProfiles(snapshotFor(templateVersion), hole, { coordinateMissing: true });
}

const isolatedNi = /\bNI\b/g;

test('0.8.17 and later templates leave missing values blank', () => {
  assert.equal(missingFieldValue(TEMPLATE_VERSION), '');
  assert.equal(missingFieldValue('0.8.17'), '');
  assert.equal(missingFieldValue('0.8.16'), 'NI');
  assert.equal(missingFieldLabels('0.8.17', ['Peso', 'Queda']), 'Peso: · Queda:');
  assert.equal(missingFieldLabels('0.8.16', ['Peso', 'Queda']), 'Peso: NI · Queda: NI');
});

test('0.8.17 profile keeps every field label and prints no NI for missing data', () => {
  const html = renderProfile('0.8.17');
  assert.equal((html.match(/class="page engineering excel-profile"/g) ?? []).length, 2);
  assert.deepEqual(html.match(isolatedNi), null);
  for (const label of [
    '>PESO: · QUEDA:</text>',
    '>REVESTIMENTO (DIÂMETRO):</text>',
    '>AMOSTRADOR / Ø INT. / Ø EXT.:</text>',
    '<td>Início: · Término:</td>',
    '<td>Tipologia: · Km: · Lote:</td>',
    '<td>Posição / eixo: · Desloc.:</td>',
    '<td>Fiscal:</td>',
    '<br>Trado: · Lavagem:<br>Prof. revestimento:</p>',
    '<tr><td>Cadastrada*</td><td></td><td></td></tr>',
    '<tr><td>Inicial</td><td></td><td></td></tr>',
    '<tr><td>Após 12/24 h</td><td></td><td></td></tr>',
    '<tr><td>0 a 10 min</td><td></td></tr>',
    '<tr><td>10 a 20 min</td><td></td></tr>',
    '<tr><td>20 a 30 min</td><td></td></tr>',
  ])
    assert.ok(html.includes(label), label);
  assert.ok(!html.includes('NI = não informado'));
  assert.ok(html.includes('<p class="excel-note">NE = não encontrado (não inferido).'));
  // Real information and other missing-data wording stay as they were.
  assert.ok(html.includes('<b>Coordenadas UTM:</b> Não informadas'));
  assert.ok(html.includes('Equipamento e conformidade normativa: não confirmados.'));
  assert.ok(html.includes('Não informado (não equivale a NE)'));
  // No empty SVG text is drawn for missing elevation, casing or method.
  assert.ok(!/<text [^>]*><\/text>/.test(html));
  assert.ok(!html.includes('class="cota-tick"'));
  assert.ok(html.includes('font-size="7">TC</text>'));
});

test('0.8.17 still prints the values that were recorded', () => {
  const html = renderProfile('0.8.17', {
    ...holeWithoutFieldData,
    waterLevelM: '2.5',
    officialCoordinate: { ...holeWithoutFieldData.officialCoordinate, altitudeM: '100' },
  });
  assert.ok(html.includes('<tr><td>Cadastrada*</td><td></td><td>2,5</td></tr>'));
  assert.ok(html.includes('class="cota-tick"'));
  assert.deepEqual(html.match(isolatedNi), null);
});

test('0.8.16 and earlier keep printing NI exactly as before', () => {
  const html = renderProfile('0.8.16');
  // Per sheet: 25 fixed fields, elevation and casing; methods: two on sheet 1, one on sheet 2.
  assert.equal((html.match(isolatedNi) ?? []).length, 57);
  for (const legacy of [
    '>PESO: NI · QUEDA: NI</text>',
    '>REVESTIMENTO (DIÂMETRO): NI</text>',
    '>AMOSTRADOR / Ø INT. / Ø EXT.: NI</text>',
    '<td>Início: NI · Término: NI</td>',
    '<td>Tipologia: NI · Km: NI · Lote: NI</td>',
    '<td>Posição / eixo: NI · Desloc.: NI</td>',
    '<td>Fiscal: NI</td>',
    '<br>Trado: NI · Lavagem: NI<br>Prof. revestimento: NI</p>',
    '<tr><td>Cadastrada*</td><td>NI</td><td>NI</td></tr>',
    '<tr><td>Inicial</td><td>NI</td><td>NI</td></tr>',
    '<tr><td>Após 12/24 h</td><td>NI</td><td>NI</td></tr>',
    '<tr><td>0 a 10 min</td><td>NI</td></tr>',
    '<p class="excel-note">NI = não informado; NE = não encontrado (não inferido).',
    'font-size="9.5">NI</text>',
    'font-size="7">NI</text>',
  ])
    assert.ok(html.includes(legacy), legacy);
  for (const version of ['0.4.0', '0.8.0', '0.8.15'])
    assert.ok(renderProfile(version).includes('<td>Fiscal: NI</td>'), version);
});

/** Full issue without client, city, state, address or altitude. */
function issueWithoutWorkData(templateVersion: string): ReportSnapshot {
  return {
    ...snapshotFor(templateVersion),
    schemaVersion: 1,
    createdAt: '2026-11-06T15:00:00Z',
    work: { id: 'work', name: 'Obra', clientName: null, address: null, city: null, state: null },
    report: { id: 'report', title: 'Relatório', version: 1, notes: '' },
    photos: [],
    map: {
      zone: 25,
      hemisphere: 'S',
      points: [{ code: 'SP-01', x: 500000, y: 9000000, selected: true }],
    },
  };
}

function fieldDatePreview(templateVersion: string): string {
  return engineeringProfiles(snapshotFor(templateVersion), holeWithoutFieldData, {
    interactive: true,
    fieldDateMissing: true,
  });
}

test('missing header and cover wording is blank from 0.8.17', () => {
  assert.equal(missingFieldWording('0.8.17', 'Não informado'), '');
  assert.equal(missingFieldWording('0.8.16', 'Não informado'), 'Não informado');
});

test('0.8.17 header and cover keep their labels and print no "não informado"', () => {
  const html = renderReport(issueWithoutWorkData('0.8.17'));
  for (const label of [
    '<td><b>Cliente:</b> </td>',
    '<td><b>Local:</b> </td>',
    '<td><b>Cota (m):</b> </td>',
    '<div><dt>Cliente</dt><dd></dd></div>',
  ])
    assert.ok(html.includes(label), label);
  // The cover location is a phrase without a label: nothing is drawn in its place.
  assert.ok(!html.includes('class="cover-location"'));
  assert.ok(html.includes('class="cover-year">2026</p>'));
  assert.ok(!html.includes('Local não informado'));
  assert.ok(!html.includes('Não informada'));
  assert.ok(!html.includes('Cliente:</b> Não informado'));
  assert.ok(!html.includes('Local:</b> Não informado'));
  assert.ok(!html.includes('<dd>Não informado</dd>'));
  assert.deepEqual(html.match(isolatedNi), null);
  // A blank client name is treated as missing on the cover, as before.
  const blankClient = renderReport({
    ...issueWithoutWorkData('0.8.17'),
    work: { ...issueWithoutWorkData('0.8.17').work, clientName: '  ' },
  });
  assert.ok(blankClient.includes('<div><dt>Cliente</dt><dd></dd></div>'));
  // Recorded data is still printed.
  const located = renderReport({
    ...issueWithoutWorkData('0.8.17'),
    work: {
      ...issueWithoutWorkData('0.8.17').work,
      clientName: 'Cliente X',
      city: 'Natal',
      state: 'RN',
    },
  });
  assert.ok(located.includes('<p class="cover-location">Natal - RN</p>'));
  assert.ok(located.includes('<td><b>Local:</b> Natal · RN</td>'));
  assert.ok(located.includes('<div><dt>Cliente</dt><dd>Cliente X</dd></div>'));
  const preview = fieldDatePreview('0.8.17');
  assert.ok(preview.includes('<td><b>Data de campo:</b> </td>'));
  assert.ok(!preview.includes('Não informada'));
});

test('0.8.16 header and cover keep the historical "não informado" wording', () => {
  const html = renderReport(issueWithoutWorkData('0.8.16'));
  for (const legacy of [
    '<td><b>Cliente:</b> Não informado</td>',
    '<td><b>Local:</b> Não informado</td>',
    '<td><b>Cota (m):</b> Não informada</td>',
    '<div><dt>Cliente</dt><dd>Não informado</dd></div>',
    '<p class="cover-location">Local não informado</p>',
  ])
    assert.ok(html.includes(legacy), legacy);
  assert.ok(fieldDatePreview('0.8.16').includes('<td><b>Data de campo:</b> Não informada</td>'));
});
