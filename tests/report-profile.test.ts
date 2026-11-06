import { test } from 'node:test';
import { snapshotCompanyLogo } from '../packages/report-templates/src/company-brand';
import assert from 'node:assert/strict';
import {
  sampledLayers,
  profileTermination,
  advanceLabel,
  engineeringProfiles,
} from '../packages/report-templates/src/engineering-profile';
import {
  renderInteractiveProfile,
  renderReport,
  TEMPLATE_VERSION,
  type ReportSnapshot,
} from '@spt/report-templates';
const hole: ReportSnapshot['holes'][number] = {
  id: 'hole',
  code: 'SP-01',
  technicalVersion: 1,
  executedDepthM: '21',
  waterLevelM: '0',
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
  layers: [{ fromM: '0', toM: '21', soilType: 'Areia', description: '<script>alert(1)</script>' }],
  tests: [1, 2, 3].map((depth) => ({
    depthM: String(depth),
    advances: [4, 6, 8].map((blows) => ({ blows, penetrationMm: 150 })),
    result: { nSpt: 14, status: 'VALID' },
    interruptionReason: null,
    engineVersion: '0.1.0',
  })),
};
const snapshot = {
  work: { name: 'Obra', clientName: null, address: null, city: null, state: null },
  tenant: { id: 'tenant', name: 'Empresa de teste' },
  report: { id: 'report', version: 1, notes: '' },
  templateVersion: '0.4.0',
  issueNumber: 1,
  holes: [hole],
} as ReportSnapshot;
test('reference display omits ordinary 15 cm and preserves partial penetration', () => {
  assert.equal(advanceLabel({ blows: 8, penetrationMm: 150 }), '8');
  assert.equal(advanceLabel({ blows: 30, penetrationMm: 70 }), '30/7');
  assert.equal(advanceLabel(void 0), '\u2014');
});
test('depth sheets paginate, escape soil descriptions and distinguish water zero from unknown', () => {
  const html = engineeringProfiles(snapshot, hole);
  assert.equal((html.match(/class="page engineering excel-profile"/g) || []).length, 2);
  assert.ok(html.includes('Trecho 2/2'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('0 m \u2014 horário'));
  assert.ok(!html.includes('Não informado (não equivale a NE)'));
  assert.ok(
    engineeringProfiles(snapshot, { ...hole, waterLevelM: null }).includes(
      'Não informado (não equivale a NE)',
    ),
  );
});
test('special records never become graph zeros and interrupt both resistance curves', () => {
  const normal = engineeringProfiles(snapshot, { ...hole, executedDepthM: '5' });
  const special = engineeringProfiles(snapshot, {
    ...hole,
    executedDepthM: '5',
    tests: hole.tests.map((t, i) =>
      i === 1
        ? {
            ...t,
            result: { nSpt: null, status: 'PARTIAL' },
            interruptionReason: 'Parcial',
            advances: [{ blows: 30, penetrationMm: 70 }],
          }
        : t,
    ),
  });
  assert.equal((normal.match(/r="2"/g) || []).length, 6);
  assert.equal((special.match(/r="2"/g) || []).length, 4);
  assert.ok(special.includes('>30/7</text>'));
  assert.ok(special.includes('N-SPT não definido'));
  assert.ok(!special.includes('NaN'));
});
test('reference layout groups four photos per sheet, numbers all sheets and keeps the map last', () => {
  const s = {
    ...snapshot,
    createdAt: '2026-10-31',
    holes: [{ ...hole, executedDepthM: '5' }],
    photos: Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      boreholeId: hole.id,
      caption: 'Foto ' + i,
      objectKey: 'fixture',
      sha256: 'fixture',
      version: 1,
      crop: { x: 0, y: 0, width: 100, height: 100 },
    })),
    map: { zone: 25, hemisphere: 'S', points: [{ code: 'SP-01', x: 5e5, y: 9e6, selected: true }] },
  };
  const html = renderReport(s);
  assert.equal((html.match(/class="page photographic"/g) || []).length, 2);
  assert.ok(html.includes('4 / 4'));
  assert.ok(!html.includes('__SHEET__'));
  assert.ok(html.indexOf('class="page location"') > html.lastIndexOf('class="page photographic"'));
  assert.equal((html.match(/Imagem indisponível/g) || []).length, 5);
});
test('Excel profile always spans twenty metres and places the water marker at measured depth', () => {
  const html = engineeringProfiles(snapshot, { ...hole, executedDepthM: '5', waterLevelM: '1.8' });
  assert.ok(html.includes('data-depth-from="0" data-depth-to="20"'));
  assert.ok(html.includes('data-depth-m="1.8"'));
  assert.ok(html.includes('NA 1,8 m'));
  for (const field of [
    'PROFUNDIDADE DO NÍVEL D\u2019ÁGUA',
    'Após 12/24 h',
    'LAVAGEM POR TEMPO',
    'REVEST.',
    'MÉTODO',
    'Motivo da paralisação',
    'PESO:',
    'AMOSTRADOR',
  ])
    assert.ok(html.includes(field), field);
  assert.ok(!html.includes('>20,00</text>'));
  assert.ok(html.includes('>5,00</text>'));
  assert.ok(!html.includes('data-depth-to="5"'));
  const deeper = engineeringProfiles(snapshot, {
    ...hole,
    executedDepthM: '21',
    waterLevelM: '20',
  });
  assert.ok(deeper.includes('data-depth-from="20" data-depth-to="40"'));
  assert.equal((deeper.match(/class="water-marker"/g) || []).length, 1);
});
test('zero and twenty-metre boundary records appear once in the correct window', () => {
  const html = engineeringProfiles(snapshot, {
    ...hole,
    executedDepthM: '40',
    layers: [],
    tests: [0, 20, 20.1, 40].map((depth) => ({ ...hole.tests[0], depthM: String(depth) })),
  });
  for (const depth of [0, 20, 20.1, 40]) {
    assert.equal(html.split(`class="spt-record" data-depth-m="${depth}"`).length - 1, 1);
  }
  assert.equal((html.match(/r="2"/g) || []).length, 8);
  const sheets = html.split('class="page engineering excel-profile"');
  assert.ok(sheets[1].includes('data-depth-m="0"'));
  assert.ok(sheets[1].includes('data-depth-m="20"'));
  assert.ok(!sheets[1].includes('data-depth-m="20.1"'));
  assert.ok(sheets[2].includes('data-depth-m="40"'));
  assert.match(html, /cx="[^"]+" cy="80" r="2"/);
  assert.match(html, /x="491" y="89"[^>]*>4<\/text>/);
});
test('long tokens wrap inside the description column without dropping characters', () => {
  const token = 'W'.repeat(115);
  const html = engineeringProfiles(snapshot, {
    ...hole,
    executedDepthM: '5',
    tests: Array.from({ length: 20 }, (_, i) => ({ ...hole.tests[0], depthM: String(i + 1) })),
    layers: [{ fromM: '0', toM: '20', soilType: token, description: 'fim' }],
  });
  const lines = Array.from(html.matchAll(/<text x="210"[^>]*>([^<]*)<\/text>/g), (m) => m[1]);
  assert.equal(lines.join('').replace(/ /g, ''), token + '.fim');
  assert.ok(lines.every((line) => (line.match(/W/g) || []).length <= 24));
});
test('thin layers move complete descriptions to explicitly paginated continuations', () => {
  const token = 'Z'.repeat(5e3);
  const html = engineeringProfiles(snapshot, {
    ...hole,
    executedDepthM: '5',
    tests: [{ ...hole.tests[0], depthM: '0.1' }],
    layers: [{ fromM: '0', toM: '0.1', soilType: 'Areia', description: token }],
  });
  const profile = html.split('class="page engineering description-continuation"')[0];
  assert.ok(!profile.includes('<text x="210"'));
  const pages = html.split('class="page engineering description-continuation"').slice(1);
  assert.ok(pages.length >= 2);
  assert.equal((pages.join('').match(/Z/g) || []).length, 5e3);
  pages.forEach((page, i) => {
    assert.ok(page.includes(`Complemento de descrições · 0\u201320 m · ${i + 1}/${pages.length}`));
    assert.ok(page.includes('<footer class="responsibility">'));
    assert.ok((page.match(/min-height:13px/g) || []).length <= 40);
  });
});
test('ten-pixel technical text fits four lines in a two-metre layer without metre rules crossing it', () => {
  const html = engineeringProfiles(snapshot, {
    ...hole,
    executedDepthM: '2',
    tests: hole.tests.slice(0, 2),
    layers: [{ fromM: '0', toM: '2', soilType: 'Areia', description: 'W'.repeat(70) }],
  });
  const description = Array.from(
    html.matchAll(/<text x="210" y="([^"]+)"[^>]*font-size="10"[^>]*>([^<]*)<\/text>/g),
  );
  assert.equal(description.length, 4);
  assert.deepEqual(
    description.map((match) => Number(match[1])),
    [91, 103, 115, 127],
  );
  assert.ok(!html.includes('description-continuation'));
  assert.ok(html.includes('M330 105.5H636'));
  assert.ok(!html.includes('M90 105.5H636'));
  assert.ok(html.includes('stroke="#999" stroke-width=".55"'));
  assert.ok(html.includes('Trecho 1/1'));
});
test('two-decimal depth labels fit the fixed column and boundary water symbols stay in the body', () => {
  for (const water of [0, 20, 40]) {
    const html = engineeringProfiles(snapshot, {
      ...hole,
      executedDepthM: '40',
      waterLevelM: String(water),
    });
    assert.equal((html.match(/class="water-symbol"/g) || []).length, 1);
    const symbol = html.match(/class="water-symbol" d="M660 ([\d.]+)H684l-12 (-?8)z"/);
    assert.ok(symbol);
    const base = Number(symbol[1]),
      tip = base + Number(symbol[2]);
    assert.ok(Math.min(base, tip) >= 80);
    assert.ok(Math.max(base, tip) <= 590);
    assert.equal(base, water === 0 ? 80 : 590);
    assert.ok(!html.includes('>0,00</text>'));
    assert.ok(html.includes('>20,00</text>'));
    assert.ok(html.includes('font-size="9.5"'));
  }
});
test('resistance axis uses readable 1/2/5 steps without altering resistance values', () => {
  for (const [maximum, expected] of [
    [14, [0, 10, 20, 30, 40, 50]],
    [52, [0, 10, 20, 30, 40, 50, 60]],
    [84, [0, 20, 40, 60, 80, 100]],
  ] as Array<[number, number[]]>) {
    const html = engineeringProfiles(snapshot, {
      ...hole,
      executedDepthM: '5',
      tests: [
        {
          ...hole.tests[0],
          advances: [
            { blows: 1, penetrationMm: 150 },
            { blows: 1, penetrationMm: 150 },
            { blows: maximum - 1, penetrationMm: 150 },
          ],
          result: { nSpt: maximum, status: 'VALID' },
        },
      ],
    });
    const ticks = Array.from(
      html.matchAll(/<text[^>]*class="n-tick"[^>]*>([^<]*)<\/text>/g),
      (match) => Number(match[1]),
    );
    assert.deepEqual(ticks, expected);
    assert.equal((html.match(/class="n-grid"/g) || []).length, expected.length * 2 - 1);
    assert.ok(html.includes(`>${maximum}</text>`));
  }
});
test('twenty long interruption observations move intact to bounded technical supplements', () => {
  const reasons = Array.from(
    { length: 20 },
    (_, i) => `${String(i).padStart(2, '0')}:` + 'Z'.repeat(497),
  );
  const html = engineeringProfiles(snapshot, {
    ...hole,
    executedDepthM: '20',
    layers: [],
    tests: reasons.map((reason, i) => ({
      ...hole.tests[0],
      depthM: String(i + 1),
      interruptionReason: reason,
      result: { nSpt: null, status: 'PARTIAL' },
    })),
  });
  const [profile, ...pages] = html.split('class="page engineering description-continuation"');
  assert.equal((profile.match(/ver complemento técnico identificado/g) || []).length, 1);
  assert.ok(!profile.includes('ZZZZ'));
  assert.ok(pages.length > 1);
  assert.equal((pages.join('').match(/Z/g) || []).length, 20 * 497);
  assert.equal((pages.join('').match(/N-SPT não definido/g) || []).length, 20);
  for (let i = 0; i < 20; i++)
    assert.ok(
      pages
        .join('')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .includes(`${i + 1} m \u2014 ${String(i).padStart(2, '0')}:`),
    );
  pages.forEach((page) => {
    assert.ok(page.includes('Complemento técnico'));
    assert.ok((page.match(/min-height:13px/g) || []).length <= 40);
    assert.ok(page.includes('<footer class="responsibility">'));
  });
});
test('classification stops at the last sampled metre and does not bridge missing tests', () => {
  const h = { ...hole, executedDepthM: '5', tests: [hole.tests[0], hole.tests[2]] };
  assert.deepEqual(
    sampledLayers(h).map((l) => [l.fromM, l.toM]),
    [
      ['0', '1'],
      ['2', '3'],
    ],
  );
  assert.deepEqual(sampledLayers({ ...h, tests: [] }), []);
  assert.deepEqual(sampledLayers({ ...h, tests: [{ ...hole.tests[0], advances: [] }] }), []);
  const html = engineeringProfiles(snapshot, h);
  assert.ok(!html.includes('data-to-m="5"'));
  assert.equal((html.match(/class="sampled-layer"/g) || []).length, 2);
});
test('only consecutive metres with identical soil and description merge', () => {
  const layers = [
    { fromM: '0', toM: '1', soilType: 'Areia', description: 'Fina, marrom.' },
    { fromM: '1', toM: '2', soilType: 'Areia', description: 'Fina, marrom.' },
    { fromM: '2', toM: '3', soilType: 'Areia', description: 'Fina, cinza.' },
  ];
  const before = JSON.stringify(layers);
  assert.deepEqual(
    sampledLayers({ ...hole, layers }).map((l) => [l.fromM, l.toM, l.description]),
    [
      ['0', '2', 'Fina, marrom.'],
      ['2', '3', 'Fina, cinza.'],
    ],
  );
  assert.equal(JSON.stringify(layers), before);
});
test('zero clears the header rule with uniform metre spacing and depths and elevations align with SPT baselines', () => {
  const html = engineeringProfiles(snapshot, {
    ...hole,
    executedDepthM: '5',
    officialCoordinate: { ...hole.officialCoordinate, altitudeM: '263.35' },
  });
  const labels = (kind: string) =>
    new Map<string, number>(
      Array.from(
        html.matchAll(
          new RegExp(
            '<text x="[^"]+" y="([^"]+)"[^>]*class="' + kind + '" data-depth-m="([^"]+)"[^>]*>',
            'g',
          ),
        ),
        (m) => [m[2]!, Number(m[1])],
      ),
    );
  const depths = labels('depth-tick'),
    elevations = labels('cota-tick');
  assert.ok(!depths.has('0'));
  assert.equal(depths.get('2')! - depths.get('1')!, 25.5);
  assert.equal(depths.get('5')! - depths.get('4')!, 25.5);
  for (const t of hole.tests) {
    const record = html.match(
      new RegExp('class="spt-record" data-depth-m="' + t.depthM + '"><text x="491" y="([^"]+)"'),
    );
    assert.ok(record);
    assert.equal(depths.get(t.depthM), Number(record[1]));
    assert.equal(elevations.get(t.depthM), Number(record[1]));
  }
  assert.equal(elevations.size, 5);
  for (let depth = 1; depth <= 5; depth++)
    assert.equal(elevations.get(String(depth)), depths.get(String(depth)));
  assert.ok(html.includes('>260,35</text>'));
});
test('classification text is centered and no redundant executed-depth rule crosses the sheet', () => {
  const html = engineeringProfiles(snapshot, { ...hole, executedDepthM: '5' });
  assert.match(html, /<text x="210"[^>]*text-anchor="middle"[^>]*font-size="10"/);
  assert.ok(!html.includes('class="executed-limit"'));
  assert.ok(html.includes('<b>Limite:</b> 5 m'));
});
test('terminal 30/6 ends the displayed profile at 3.06 without zero or deeper metre marks', () => {
  const h = {
    ...hole,
    executedDepthM: '4',
    tests: [
      ...hole.tests,
      {
        ...hole.tests[0],
        depthM: '4',
        advances: [{ blows: 30, penetrationMm: 60 }],
        interruptionReason: 'Furo paralisado no avanço.',
        result: { nSpt: null, status: 'INTERRUPTED' },
      },
    ],
  };
  const before = JSON.stringify(h);
  assert.deepEqual(profileTermination(h), { depth: 3.06, row: 4, partial: true });
  const html = engineeringProfiles(snapshot, h);
  const depths = Array.from(
    html.matchAll(/class="depth-tick" data-depth-m="([^\"]+)"/g),
    (m) => m[1],
  );
  assert.deepEqual(depths, ['1', '2', '3', '3.06']);
  assert.ok(html.includes('>3,06</text>'));
  assert.ok(html.includes('>30/6</text>'));
  assert.ok(!html.includes('30/6 cm'));
  assert.ok(html.includes('<b>Limite:</b> 3,06 m'));
  assert.ok(!html.includes('M330 207.5H636'));
  assert.equal(JSON.stringify(h), before);
  const deeper = {
    ...h,
    executedDepthM: '7',
    tests: [{ ...h.tests.at(-1)!, depthM: '7', advances: [{ blows: 30, penetrationMm: 140 }] }],
  };
  assert.equal(profileTermination(deeper).depth, 6.14);
});
test('new report versions print recorded execution methods without changing legacy snapshots', () => {
  const recorded = structuredClone(hole);
  recorded.tests[0].fieldDetails = { executionMethod: 'SP_TH' };
  const latest = engineeringProfiles({ ...snapshot, templateVersion: '0.8.1' }, recorded);
  assert.match(latest, /SP\+TH/);
  assert.doesNotMatch(
    engineeringProfiles({ ...snapshot, templateVersion: '0.8.0' }, recorded),
    /SP\+TH/,
  );
});
test('current profile leaves undefined N-SPT blank while retaining partial blows and historical rendering', () => {
  const partial = structuredClone(hole);
  partial.tests[1] = {
    ...partial.tests[1],
    result: { nSpt: null, status: 'INTERRUPTED' },
    advances: [{ blows: 30, penetrationMm: 140 }],
    interruptionReason: 'Parcial',
  };
  const html = engineeringProfiles({ ...snapshot, templateVersion: '0.8.2' }, partial);
  assert.doesNotMatch(html, /non-definitive-result|>ND</);
  assert.match(html, />30\/14<\/text>/);
  assert.match(
    engineeringProfiles({ ...snapshot, templateVersion: '0.8.1' }, partial),
    /non-definitive-result/,
  );
});
test('current layer descriptions center the whole multiline block vertically and horizontally', () => {
  const h = structuredClone(hole);
  h.executedDepthM = '3';
  h.layers = [
    {
      fromM: '0',
      toM: '2',
      soilType: 'Argila arenosa',
      description:
        'Amarela, com fragmentos finos e observações adicionais para conferir várias linhas.',
    },
    { fromM: '2', toM: '3', soilType: 'Silte arenoso', description: 'Variegado.' },
  ];
  const html = engineeringProfiles({ ...snapshot, templateVersion: '0.8.3' }, h);
  let checked = 0;
  for (const group of html.matchAll(/<g class="sampled-layer"[^>]*>(.*?)<\/g>/gs)) {
    const rect = group[1].match(/<rect x="29" y="([\d.]+)" width="26" height="([\d.]+)"/);
    assert.ok(rect);
    const lines = [
      ...group[1].matchAll(
        /<text x="210" y="([\d.]+)" text-anchor="middle"[^>]*dominant-baseline="central"/g,
      ),
    ].map((m) => Number(m[1]));
    assert.ok(lines.length > 0);
    assert.ok(
      Math.abs((lines[0]! + lines.at(-1)!) / 2 - (Number(rect[1]) + Number(rect[2]) / 2)) < 1e-6,
    );
    checked++;
  }
  assert.equal(checked, 2);
  assert.doesNotMatch(html, /non-definitive-result|>ND</);
  assert.doesNotMatch(
    engineeringProfiles({ ...snapshot, templateVersion: '0.8.2' }, h),
    /dominant-baseline="central"/,
  );
});
test('summation columns use the same blue and red as their curve and legend', () => {
  const html = engineeringProfiles({ ...snapshot, templateVersion: '0.8.4' }, hole);
  assert.match(html, /<text x="583"[^>]*fill="#2155b5"[^>]*>10<\/text>/);
  assert.match(html, /<text x="618"[^>]*fill="#c62828"[^>]*>14<\/text>/);
  assert.match(html, /<g fill="#2155b5" stroke="#2155b5"/);
  assert.match(html, /<g fill="#c62828" stroke="#c62828"/);
  assert.match(html, /style="color:#c62828"/);
  const legacy = engineeringProfiles({ ...snapshot, templateVersion: '0.8.3' }, hole);
  assert.doesNotMatch(legacy, /#c62828/);
  assert.doesNotMatch(html, /non-definitive-result|>ND</);
});
test('interactive sheet exposes scriptless accessible records and real page ranges without changing emitted profiles', () => {
  const sheet = renderInteractiveProfile(snapshot, {
    coordinateMissing: true,
    fieldDateMissing: true,
  });
  assert.equal(sheet.pageCount, sheet.pages.length);
  assert.equal(sheet.pages[0].kind, 'profile');
  assert.equal(sheet.pages[0].fromM, '0');
  assert.equal(sheet.pages[0].toM, '20');
  assert.ok(sheet.html.includes('data-sheet-selection="test"'));
  assert.ok(sheet.html.includes('tabindex="0"'));
  assert.ok(sheet.html.includes('Não informadas'));
  assert.ok(!sheet.html.includes('<script>'));
  assert.ok(!engineeringProfiles(snapshot, hole).includes('data-sheet-selection'));
});
test('new soil-state report content splits different states without rewriting raw descriptions or previous templates', () => {
  const classifiedHole = {
    ...hole,
    executedDepthM: '2',
    layers: [{ fromM: '0', toM: '2', soilType: 'Argila arenosa', description: 'Marrom.' }],
    tests: [1, 2].map((depth, index) => ({
      ...hole.tests[0],
      depthM: String(depth),
      result: { status: 'CONVENTIONAL', nSpt: index === 0 ? 19 : 20 },
    })),
  };
  const before = JSON.stringify(classifiedHole);
  const layers = sampledLayers(classifiedHole, true);
  assert.equal(layers.length, 2);
  assert.match(layers[0].description, /^Rija\./);
  assert.match(layers[1].description, /^Muito rija\./);
  assert.equal(JSON.stringify(classifiedHole), before);
  const latest = engineeringProfiles({ ...snapshot, templateVersion: '0.8.5' }, classifiedHole);
  const previous = engineeringProfiles({ ...snapshot, templateVersion: '0.8.4' }, classifiedHole);
  assert.ok(latest.includes('Muito rija'));
  assert.ok(!previous.includes('Muito rija'));
  assert.ok(latest.includes('#c62828'));
  const partial = {
    ...classifiedHole,
    tests: classifiedHole.tests.map((test2) => ({
      ...test2,
      result: { status: 'REQUIRES_REVIEW', nSpt: null },
    })),
  };
  assert.ok(!sampledLayers(partial, true).some((layer) => layer.description.includes('rija')));
});
test('new profile joins soil state and appearance with commas while historical descriptions retain their punctuation', () => {
  const h = {
    ...hole,
    executedDepthM: '1',
    layers: [
      {
        fromM: '0',
        toM: '1',
        soilType: 'Argila arenosa',
        description: 'Marrom com veios variegados',
      },
    ],
    tests: [{ ...hole.tests[0], depthM: '1', result: { status: 'CONVENTIONAL', nSpt: 20 } }],
  };
  const latest = engineeringProfiles({ ...snapshot, templateVersion: '0.8.6' }, h);
  const previous = engineeringProfiles({ ...snapshot, templateVersion: '0.8.5' }, h);
  assert.ok(latest.includes('Argila arenosa, muito rija,'));
  assert.ok(!latest.includes('Argila arenosa. Muito rija.'));
  assert.ok(previous.includes('Argila arenosa. Muito rija.'));
  assert.equal(h.layers[0].description, 'Marrom com veios variegados');
});
test('current profile keeps resistance grid full-height, adds metre method rules and includes initial soil without blows', () => {
  const h = {
    ...hole,
    executedDepthM: '3',
    tests: [
      {
        depthM: '1',
        advances: [],
        interruptionReason: null,
        result: { status: 'NOT_TESTED', nSpt: null },
        engineVersion: '0.1.0',
      },
      ...hole.tests.filter((t) => Number(t.depthM) > 1),
    ],
  };
  const html = engineeringProfiles({ ...snapshot, templateVersion: '0.8.7' }, h);
  assert.ok(html.includes('class="method-grid"'));
  assert.ok(html.includes('V590'));
  assert.ok(html.includes('M330 590H476'));
  assert.ok(html.includes('data-from-m="0"'));
  const previous = engineeringProfiles({ ...snapshot, templateVersion: '0.8.6' }, h);
  assert.ok(!previous.includes('class="method-grid"'));
  assert.ok(!previous.includes('M330 590H476'));
});
test('partial measured pairs appear in current PDF curves without rewriting old templates or assigning NSPT', () => {
  const h = {
    ...hole,
    executedDepthM: '3',
    tests: [
      ...hole.tests.slice(0, 2),
      {
        ...hole.tests[2],
        advances: [
          { blows: 30, penetrationMm: 150 },
          { blows: 30, penetrationMm: 140 },
          { blows: 30, penetrationMm: 150 },
        ],
        result: { status: 'REQUIRES_REVIEW', nSpt: null },
      },
    ],
  };
  const current = engineeringProfiles({ ...snapshot, templateVersion: '0.8.8' }, h);
  assert.equal((current.match(/class="partial-reading" data-reading="60\/29"/g) || []).length, 2);
  assert.ok(current.includes('Losangos: leituras parciais'));
  assert.ok(
    !engineeringProfiles({ ...snapshot, templateVersion: '0.8.7' }, h).includes(
      'class="partial-reading"',
    ),
  );
  assert.equal(h.tests[2].result.nSpt, null);
});

test('partial labels at twenty-metre page boundaries stay inside the profile frame', () => {
  for (const depth of [20, 40]) {
    const h = {
      ...hole,
      executedDepthM: String(depth),
      tests: [
        {
          ...hole.tests[0]!,
          depthM: String(depth),
          advances: [
            { blows: 30, penetrationMm: 150 },
            { blows: 30, penetrationMm: 140 },
            { blows: 30, penetrationMm: 150 },
          ],
          result: { status: 'REQUIRES_REVIEW', nSpt: null },
        },
      ],
    };
    const html = engineeringProfiles({ ...snapshot, templateVersion: '0.8.8' }, h);
    const groups = html.match(/<g class="partial-reading"[^]*?<\/g>/g) || [];
    assert.equal(groups.length, 2);
    const baselines = groups.map((group) => {
      const label = group.match(/<text x="[^"]+" y="([^"]+)"/);
      assert.ok(label);
      return Number(label[1]);
    });
    for (const y of baselines) {
      assert.ok(y <= 585);
      assert.ok(y >= 88);
    }
    assert.ok(Math.abs(baselines[0]! - baselines[1]!) >= 10);
  }
});

test('current curves continue through the last partial metre without graph annotations or special markers', () => {
  const h = {
    ...hole,
    executedDepthM: '3',
    tests: [
      ...hole.tests.slice(0, 2),
      {
        ...hole.tests[2]!,
        advances: [
          { blows: 30, penetrationMm: 150 },
          { blows: 30, penetrationMm: 140 },
          { blows: 30, penetrationMm: 150 },
        ],
        result: { status: 'REQUIRES_REVIEW', nSpt: null },
      },
    ],
  };
  const html = engineeringProfiles({ ...snapshot, templateVersion: '0.8.9' }, h);
  const groups = html.match(/<g class="continuous-reading" data-depth-m="3">[^]*?<\/g>/g) || [];
  assert.equal(groups.length, 2);
  for (const group of groups) {
    assert.match(group, /<path d="M[^\"]+L/);
    assert.match(group, /<circle/);
    assert.ok(!group.includes('<text'));
  }
  assert.ok(!html.includes('class="partial-reading"'));
  assert.ok(!html.includes('Losangos:'));
  assert.equal(h.tests[2]!.result.nSpt, null);
});

test('new cover uses issue data and local date without changing approved profile geometry or old reports', () => {
  const current: ReportSnapshot = {
    ...snapshot,
    templateVersion: '0.8.10',
    createdAt: '2027-01-01T01:00:00Z',
    photos: [],
    map: {
      zone: 25,
      hemisphere: 'S',
      points: [{ code: 'SP-01', x: 500000, y: 9000000, selected: true }],
    },
    work: {
      ...snapshot.work,
      id: 'work',
      name: 'Obra <teste>',
      clientName: '<script>cliente</script>',
      city: 'Natal',
      state: 'RN',
    },
  };
  const html = renderReport(current);
  assert.equal((html.match(/class="page report-cover"/g) || []).length, 1);
  assert.ok(html.indexOf('class="page report-cover"') < html.indexOf('class="page engineering'));
  assert.ok(html.includes('31/12/2026'));
  assert.ok(html.includes('class="cover-year">2026</p>'));
  assert.ok(html.includes('Obra &lt;teste&gt;'));
  assert.ok(html.includes('&lt;script&gt;cliente&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  const legacy = { ...current, templateVersion: '0.8.9' };
  assert.ok(!renderReport(legacy).includes('class="page report-cover"'));
  assert.equal(
    engineeringProfiles(current, hole).replaceAll('0.8.10', '0.8.9'),
    engineeringProfiles(legacy, hole),
  );
  assert.ok(
    renderReport({
      ...current,
      work: { ...current.work, city: null, state: null, clientName: null },
    }).includes('Local não informado'),
  );
});

test('Metro identity changes branding and map palette without changing technical profile SVGs or legacy issues', () => {
  const current: ReportSnapshot = {
    ...snapshot,
    templateVersion: TEMPLATE_VERSION,
    createdAt: '2026-11-02T15:00:00Z',
    photos: [],
    work: { ...snapshot.work, id: 'work' },
    map: {
      zone: 25,
      hemisphere: 'S',
      points: [{ code: 'SP-01', x: 500000, y: 9000000, selected: true }],
    },
  };
  const legacy = { ...current, templateVersion: '0.8.10' };
  const html = renderReport(current),
    old = renderReport(legacy);
  assert.ok(html.includes('class="metro-report"'));
  assert.ok(html.includes('Azul: furo incluído'));
  assert.ok(html.includes('fill="#1600ff"'));
  assert.ok(!old.includes('class="metro-report"'));
  assert.ok(old.includes('Laranja: furo incluído'));
  assert.ok(old.includes('fill="#c45a16"'));
  const charts = (value: string) => value.match(/<svg[^>]*class="profile-chart"[\s\S]*?<\/svg>/g);
  assert.deepEqual(
    charts(engineeringProfiles(current, hole)),
    charts(engineeringProfiles(legacy, hole)),
  );
});

test('0.8.14 prints the recorded stop reason and explains measured curve points', () => {
  const stopped = {
    ...hole,
    executedDepthM: '1',
    tests: [
      {
        ...hole.tests[0],
        depthM: '1',
        interruptionReason: 'Impenetrável <ao> trépano',
        result: { status: 'INTERRUPTED', nSpt: null },
      },
    ],
  };
  const current = engineeringProfiles({ ...snapshot, templateVersion: '0.8.14' }, stopped);
  assert.ok(current.includes('<b>Motivo da paralisação:</b> Impenetrável &lt;ao&gt; trépano'));
  assert.ok(current.includes('que não é N-SPT'));
  const older = engineeringProfiles({ ...snapshot, templateVersion: '0.8.13' }, stopped);
  assert.ok(older.includes('<b>Motivo da paralisação:</b> não registrado'));
  assert.ok(!older.includes('que não é N-SPT'));
  const long = engineeringProfiles(
    { ...snapshot, templateVersion: '0.8.14' },
    { ...stopped, tests: [{ ...stopped.tests[0], interruptionReason: 'x'.repeat(200) }] },
  );
  assert.match(long, /Motivo da paralisação:<\/b> ver observações a /);
});

test('0.8.14 does not classify a metre shared by two soil groups', () => {
  const mixed = {
    ...hole,
    executedDepthM: '1',
    layers: [
      { fromM: '0', toM: '0.5', soilType: 'Areia fina', description: 'A.' },
      { fromM: '0.5', toM: '1', soilType: 'Argila arenosa', description: 'B.' },
    ],
    tests: [{ ...hole.tests[0], depthM: '1', result: { status: 'CONVENTIONAL', nSpt: 14 } }],
  };
  const classes = (singleGroupOnly: boolean) =>
    sampledLayers(mixed, true, false, false, singleGroupOnly).map((l) => l.description);
  assert.deepEqual(classes(true), ['A.', 'B.']);
  assert.match(classes(false)[0], /^Medianamente compacta\./);
  assert.match(classes(false)[1], /^Rija\./);
});

test('company branding remains active in versions after 0.8.13', () => {
  const logo = 'data:image/png;base64,iVBORw0KGgo=';
  const tenant = { ...snapshot.tenant, logoDataUrl: logo };
  for (const templateVersion of ['0.8.13', '0.8.14'])
    assert.equal(snapshotCompanyLogo({ ...snapshot, templateVersion, tenant }), logo);
  assert.equal(snapshotCompanyLogo({ ...snapshot, templateVersion: '0.8.12', tenant }), undefined);
});

// Emission reproduced from a real report: 30/15 + 30/1 in the fourth metre, stop at 3.16 m.
const partialStop: ReportSnapshot['holes'][number] = {
  ...hole,
  executedDepthM: '3.16',
  layers: [
    {
      fromM: '0',
      toM: '3.16',
      soilType: 'Argila arenosa',
      description: 'marrom com veios variegados',
    },
  ],
  tests: [
    { ...hole.tests[0], depthM: '1', advances: [], result: { nSpt: null, status: 'NOT_TESTED' } },
    { ...hole.tests[0], depthM: '2', result: { nSpt: 6, status: 'CONVENTIONAL' } },
    { ...hole.tests[0], depthM: '3', result: { nSpt: 46, status: 'CONVENTIONAL' } },
    {
      ...hole.tests[0],
      depthM: '4',
      advances: [
        { blows: 30, penetrationMm: 150 },
        { blows: 30, penetrationMm: 10 },
      ],
      result: { nSpt: null, status: 'PARTIAL' },
    },
  ],
};
const layerTexts = (html: string) =>
  Array.from(
    html.matchAll(/<text x="210" y="([^"]+)"[^>]*font-size="([^"]+)"[^>]*>([^<]*)<\/text>/g),
    (m) => ({ y: Number(m[1]), size: Number(m[2]), text: m[3] }),
  );

test('0.8.16 draws the partial terminal layer across its row without a supplement sheet', () => {
  const html = engineeringProfiles({ ...snapshot, templateVersion: '0.8.16' }, partialStop);
  assert.ok(!html.includes('description-continuation'));
  assert.ok(!html.includes('ver complemento'));
  const last = layerTexts(html).filter((line) => line.text.includes('veios'));
  assert.ok(last.length >= 1);
  // Row 3–4 spans y 156.5–182; the final layer text sits inside it.
  const finalLines = last.filter((line) => line.y > 156.5);
  assert.ok(finalLines.length >= 1);
  assert.ok(finalLines.every((line) => line.y < 182));
  assert.match(
    html,
    /data-from-m="3" data-to-m="3\.16"[^>]*>(<rect[^>]*>)?<rect x="29" y="156\.5" width="26" height="25\.5"/,
  );
  const legacy = engineeringProfiles({ ...snapshot, templateVersion: '0.8.15' }, partialStop);
  assert.ok(legacy.includes('description-continuation'));
});

test('0.8.16 shrinks a long description to fit its layer before using a supplement', () => {
  const long = {
    ...hole,
    executedDepthM: '2',
    tests: hole.tests.slice(0, 2),
    layers: [
      { fromM: '0', toM: '1', soilType: 'Argila arenosa', description: 'W'.repeat(40) },
      { fromM: '1', toM: '2', soilType: 'Areia', description: 'fina' },
    ],
  };
  const current = engineeringProfiles({ ...snapshot, templateVersion: '0.8.16' }, long);
  assert.ok(!current.includes('description-continuation'));
  const first = layerTexts(current).filter((line) => line.y < 105.5);
  assert.equal(
    first
      .map((line) => line.text)
      .join('')
      .replace(/ /g, ''),
    'Argilaarenosa,' + 'W'.repeat(40),
  );
  assert.ok(first.every((line) => line.size < 10 && line.size >= 6));
  assert.ok(layerTexts(current).some((line) => line.y > 105.5 && line.size === 10));
  assert.ok(
    engineeringProfiles({ ...snapshot, templateVersion: '0.8.15' }, long).includes(
      'description-continuation',
    ),
  );
  // Text that cannot fit even at the minimum size still keeps the explicit supplement.
  const huge = engineeringProfiles(
    { ...snapshot, templateVersion: '0.8.16' },
    {
      ...long,
      layers: [{ fromM: '0', toM: '2', soilType: 'Areia', description: 'Z'.repeat(5e3) }],
    },
  );
  assert.ok(huge.includes('description-continuation'));
});
