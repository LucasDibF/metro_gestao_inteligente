type Depth = { toString(): string } | string | number | null;
export function fieldChecklist(
  hole: {
    fieldDate: unknown;
    executedDepthM: Depth;
    officialCoordinateId: string | null;
    reviewState: string;
    technicalVersion: number;
    approvedVersion: number | null;
  },
  tests: Array<{ depthM: Depth; advances: unknown; result: unknown }>,
  layers: Array<{ fromM: Depth; toM: Depth }>,
  readyPhotos: number,
) {
  let end = 0,
    coverage = layers.length > 0;
  for (const layer of layers) {
    if (Number(layer.fromM) !== end) coverage = false;
    end = Number(layer.toM);
  }
  coverage = coverage && end === Number(hole.executedDepthM);
  return [
    {
      id: 'date',
      label: 'Data de campo preenchida',
      complete: Boolean(hole.fieldDate),
      stage: 'review',
    },
    {
      id: 'depth',
      label: 'Profundidade executada informada',
      complete: hole.executedDepthM !== null && Number(hole.executedDepthM) > 0,
      stage: 'review',
    },
    { id: 'tests', label: 'Ensaios registrados', complete: tests.length > 0, stage: 'review' },
    {
      id: 'advances',
      label: 'Avanços preenchidos ou interrupção registrada',
      complete:
        tests.length > 0 &&
        tests.every(
          (t) =>
            Array.isArray(t.advances) &&
            (t.advances.length > 0 ||
              (Number(t.depthM) === 1 &&
                (t.result as { status?: string }).status === 'NOT_TESTED')) &&
            (t.result as { status?: string }).status !== 'INCOMPLETE',
        ),
      stage: 'review',
    },
    {
      id: 'bounds',
      label: 'Ensaios dentro da profundidade executada',
      complete:
        hole.executedDepthM !== null &&
        tests.every((t) => Number(t.depthM) <= Number(hole.executedDepthM)),
      stage: 'review',
    },
    {
      id: 'soil',
      label: 'Solo descrito sem lacunas até o encerramento',
      complete: coverage,
      stage: 'review',
    },
    {
      id: 'coordinate',
      label: 'Coordenada oficial definida para o PDF',
      complete: Boolean(hole.officialCoordinateId),
      stage: 'issue',
    },
    {
      id: 'approval',
      label: 'Aprovação técnica válida para emitir',
      complete: hole.reviewState === 'APPROVED' && hole.approvedVersion === hole.technicalVersion,
      stage: 'issue',
    },
    {
      id: 'photos',
      label: 'Fotografias processadas disponíveis',
      complete: readyPhotos > 0,
      stage: 'recommended',
    },
  ];
}
