import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderReport } from '../packages/report-templates/src/index';
import {
  responsibilityPages,
  reviewerIdentity,
} from '../packages/report-templates/src/reviewer-identity';
import { sheetFooter } from '../packages/report-templates/src/sheet-layout';
import {
  SUPPORTED_TEMPLATE_VERSIONS,
  TEMPLATE_VERSION,
  templateSince,
} from '../packages/report-templates/src/template-version';
import type { ReportSnapshot } from '@spt/report-templates';

type Hole = ReportSnapshot['holes'][number];

function hole(code: string, reviewerTitle?: string | null): Hole {
  return {
    id: 'hole-' + code,
    code,
    technicalVersion: 1,
    executedDepthM: '3',
    waterLevelM: null,
    fieldDate: '2026-11-06',
    reviewerName: 'Ana Souza',
    reviewerRegistration: 'CREA-SP 5061234567',
    ...(reviewerTitle === undefined ? {} : { reviewerTitle }),
    reviewedAt: '2026-11-06',
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
      altitudeM: '10',
    },
    layers: [{ fromM: '0', toM: '3', soilType: 'Areia', description: 'fina' }],
    tests: [1, 2, 3].map((depth) => ({
      depthM: String(depth),
      advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
      result: { nSpt: 14, status: 'VALID' },
      interruptionReason: null,
      engineVersion: '0.1.0',
    })),
  };
}

function issue(templateVersion: string, holes: Hole[]): ReportSnapshot {
  return {
    schemaVersion: 1,
    templateVersion,
    createdAt: '2026-11-06T15:00:00Z',
    issueNumber: 1,
    tenant: { id: 'tenant', name: 'Empresa de teste' },
    work: {
      id: 'work',
      name: 'Obra',
      clientName: 'Cliente',
      address: null,
      city: 'Natal',
      state: 'RN',
    },
    report: { id: 'report', title: 'Relatório', version: 1, notes: '' },
    holes,
    photos: [],
    map: {
      zone: 25,
      hemisphere: 'S',
      points: holes.map((h, i) => ({
        code: h.code,
        x: 500000 + i * 10,
        y: 9000000,
        selected: true,
      })),
    },
  };
}

const titled = 'Ana Souza — Engenheira Civil';
const count = (html: string, text: string) => html.split(text).length - 1;

test('0.8.18 is the current template and prints the title after the reviewer name', () => {
  assert.equal(TEMPLATE_VERSION, '0.8.18');
  assert.equal(reviewerIdentity('0.8.18', hole('SP-01', 'Engenheira Civil')), titled);
  assert.equal(reviewerIdentity('0.8.17', hole('SP-01', 'Engenheira Civil')), 'Ana Souza');
});

test('0.8.18 shows the title in every sheet footer of the hole', () => {
  const snapshot = issue('0.8.18', [hole('SP-01', 'Engenheira Civil')]);
  const footer = sheetFooter(snapshot, snapshot.holes[0]);
  assert.ok(
    footer.includes(`<b>Responsável técnico pelos dados</b><br>${titled}<br>CREA-SP 5061234567`),
    footer,
  );
  const html = renderReport(snapshot);
  const sheets = count(html, '<b>Responsável técnico pelos dados</b><br>Ana Souza');
  assert.ok(sheets >= 1);
  assert.equal(count(html, `<b>Responsável técnico pelos dados</b><br>${titled}<br>`), sheets);
});

test('0.8.18 shows the title in the technical responsibility table', () => {
  const holes = ['SP-01', 'SP-02', 'SP-03', 'SP-04'].map((code, i) =>
    hole(code, i === 3 ? null : 'Engenheira Civil'),
  );
  const html = renderReport(issue('0.8.18', holes));
  assert.ok(html.includes('class="page responsible-continuation"'));
  for (const code of ['SP-01', 'SP-02', 'SP-03'])
    assert.ok(
      html.includes(`<tr><td>${code}</td><td>${titled}</td><td>CREA-SP 5061234567</td></tr>`),
      code,
    );
  // A hole approved before titles existed shows the name alone.
  assert.ok(html.includes('<tr><td>SP-04</td><td>Ana Souza</td><td>CREA-SP 5061234567</td></tr>'));
});

test('a hole without a title prints only the name, with no placeholder', () => {
  for (const reviewerTitle of [undefined, null, '', '   ']) {
    const snapshot = issue('0.8.18', [hole('SP-01', reviewerTitle)]);
    const footer = sheetFooter(snapshot, snapshot.holes[0]);
    assert.ok(
      footer.includes('<b>Responsável técnico pelos dados</b><br>Ana Souza<br>CREA-SP'),
      String(reviewerTitle),
    );
    const html = renderReport(snapshot);
    assert.ok(!html.includes('Ana Souza — '), String(reviewerTitle));
    assert.ok(!/undefined|null|não informado/i.test(footer), String(reviewerTitle));
  }
});

test('the reviewer title is escaped as HTML', () => {
  const snapshot = issue('0.8.18', [hole('SP-01', '<img src=x onerror=alert(1)> & "Civil"')]);
  const html = renderReport(snapshot);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(
    html.includes('Ana Souza — &lt;img src=x onerror=alert(1)&gt; &amp; &quot;Civil&quot;'),
  );
});

test('templates before 0.8.18 render byte for byte as before, with or without a title', () => {
  const earlier = SUPPORTED_TEMPLATE_VERSIONS.filter((v) => !templateSince(v, '0.8.18'));
  assert.ok(earlier.includes('0.8.17') && earlier.includes('0.7.0'));
  for (const version of earlier)
    for (const holes of [1, 4]) {
      const codes = Array.from({ length: holes }, (_, i) => 'SP-0' + (i + 1));
      const withoutField = renderReport(
        issue(
          version,
          codes.map((code) => hole(code)),
        ),
      );
      const withTitle = renderReport(
        issue(
          version,
          codes.map((code) => hole(code, 'Engenheira Civil')),
        ),
      );
      assert.equal(withTitle, withoutField, `${version} with ${holes} hole(s)`);
      assert.ok(!withTitle.includes('Engenheira Civil'), version);
    }
});

test('the responsibility table keeps six rows a page unless long titles would overflow it', () => {
  const sizes = (version: string, holes: Hole[]) =>
    responsibilityPages(version, holes).map((page) => page.length);
  const codes = Array.from({ length: 13 }, (_, i) => 'SP-' + String(i + 1).padStart(2, '0'));
  const short = codes.map((code) => hole(code, 'Engenheira Civil'));
  assert.deepEqual(sizes('0.8.18', short), [6, 6, 1]);
  const longest = codes.map((code) => ({
    ...hole(code, 'T'.repeat(120)),
    reviewerName: 'N'.repeat(200),
  }));
  // 323 characters a row: three rows stay within six of the longest names.
  assert.deepEqual(sizes('0.8.18', longest), [3, 3, 3, 3, 1]);
  // Five short rows leave no room for a sixth with the longest name and title.
  assert.deepEqual(sizes('0.8.18', [...short.slice(0, 5), longest[0]]), [5, 1]);
  assert.deepEqual(sizes('0.8.18', [longest[0], ...short.slice(0, 4)]), [5]);
  // Earlier templates always paginate six rows, whatever the title.
  for (const version of ['0.8.17', '0.8.0'])
    assert.deepEqual(sizes(version, longest), [6, 6, 1], version);
  assert.deepEqual(sizes('0.8.18', []), []);
});
