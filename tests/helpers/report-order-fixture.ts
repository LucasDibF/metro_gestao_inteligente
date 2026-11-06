import { TEMPLATE_VERSION, type ReportSnapshot } from '@spt/report-templates';

export function pageOrderFixture(): ReportSnapshot {
  const coordinate = {
    eastingM: '500000',
    northingM: '9000000',
    zone: 22,
    hemisphere: 'S',
    datum: 'SIRGAS2000',
    latitude: -9,
    longitude: -51,
    reference: 'Dados fictícios para validação',
    altitudeM: null,
  };
  return {
    schemaVersion: 1,
    templateVersion: TEMPLATE_VERSION,
    createdAt: '2026-11-05T12:00:00Z',
    issueNumber: 1,
    tenant: { id: 'test-company', name: 'Empresa fictícia · Teste de sequência' },
    work: {
      id: 'test-work',
      name: 'Validação da ordem das folhas',
      clientName: 'Cliente fictício',
      city: 'Anápolis',
      state: 'GO',
      address: null,
    },
    report: {
      id: 'test-report',
      title: 'Relatório SPT · Ordem das folhas',
      notes: 'Documento fictício para conferência da sequência.',
      version: 1,
    },
    holes: ['SP01', 'SP02'].map((code, index) => ({
      id: 'hole-' + index,
      code,
      technicalVersion: 1,
      executedDepthM: '2',
      waterLevelM: '1.2',
      fieldDate: '2026-11-05',
      reviewerName: 'Responsável fictício',
      reviewerRegistration: 'DEMO',
      reviewedAt: '2026-11-05',
      reviewNote: null,
      officialCoordinate: { ...coordinate, eastingM: String(500000 + index * 20) },
      tests: [1, 2].map((depth) => ({
        depthM: String(depth),
        advances:
          depth === 1
            ? []
            : [
                { blows: 3, penetrationMm: 150 },
                { blows: 4, penetrationMm: 150 },
                { blows: 5, penetrationMm: 150 },
              ],
        result: {
          status: depth === 1 ? 'NOT_TESTED' : 'CONVENTIONAL',
          nSpt: depth === 1 ? null : 9,
        },
        interruptionReason: null,
        engineVersion: '0.1.0',
      })),
      layers: [
        { fromM: '0', toM: '2', soilType: 'Argila arenosa', soilColor: 'Marrom', description: '' },
      ],
    })),
    // Intentionally reversed: photo order must follow its hole, not this array.
    photos: [1, 0].map((index) => ({
      id: 'photo-' + index,
      boreholeId: 'hole-' + index,
      caption: 'Fotografia fictícia · SP0' + (index + 1),
      objectKey: 'unused',
      sha256: 'unused',
      version: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })),
    map: {
      zone: 22,
      hemisphere: 'S',
      points: [0, 1].map((i) => ({
        code: 'SP0' + (i + 1),
        x: 500000 + i * 20,
        y: 9000000,
        selected: true,
      })),
    },
  };
}
