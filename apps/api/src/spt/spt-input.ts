import { BadRequestException } from '@nestjs/common';
import { evaluateSpt } from '@spt/geotechnical-engine';
import { expectedVersion, technicalInput, text, optionalText } from '../technical/technical-input';
import { object } from '../auth/auth-input';
export function parseSpt(body: unknown, editing: boolean) {
  const input = object(body);
  const allowed = new Set([
    'depthM',
    'recordType',
    'advances',
    'interruptionReason',
    'soil',
    'fieldDetails',
    'technicalVersion',
    ...(editing ? ['version'] : []),
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new BadRequestException('Unknown SPT field');
  if (typeof input.depthM !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(input.depthM))
    throw new BadRequestException('Invalid depth');
  if (editing && (!Number.isSafeInteger(input.version) || Number(input.version) < 1))
    throw new BadRequestException('Expected version required');
  const initialSoil = input.recordType === 'INITIAL_SOIL';
  if (input.recordType !== undefined && !initialSoil)
    throw new BadRequestException('Invalid record type');
  if (
    initialSoil &&
    (Number(input.depthM) !== 1 ||
      !Array.isArray(input.advances) ||
      input.advances.length ||
      input.interruptionReason)
  )
    throw new BadRequestException('The initial soil metre has no SPT readings');
  const evaluated = evaluateSpt({
    advances: input.advances,
    interruptionReason: input.interruptionReason,
  });
  if (evaluated.status === 'INVALID')
    throw new BadRequestException({ message: 'Invalid SPT readings', issues: evaluated.issues });
  const result = initialSoil
    ? {
        ...evaluated,
        status: 'NOT_TESTED' as const,
        reason: 'INITIAL_SOIL',
        nSpt: null,
        advances: [],
        interruptionReason: null,
        totalPenetrationMm: 0,
      }
    : evaluated;
  let soil:
    | {
        soilType: string;
        description: string;
        soilColor?: string | null;
        soilMoisture?: string | null;
      }
    | undefined;
  if (input.soil !== undefined) {
    const value = technicalInput(input.soil, [
      'soilType',
      'description',
      'soilColor',
      'soilMoisture',
    ]);
    soil = {
      soilType: text(value.soilType, 120),
      description: optionalText(value.description, 2000),
      ...(value.soilColor !== undefined
        ? {
            soilColor:
              value.soilColor === null || value.soilColor === ''
                ? null
                : text(value.soilColor, 120),
          }
        : {}),
      ...(value.soilMoisture !== undefined
        ? { soilMoisture: choice(value.soilMoisture, ['Seca', 'Úmida', 'Saturada']) }
        : {}),
    };
  }
  const fieldDetails =
    input.fieldDetails === undefined
      ? undefined
      : technicalInput(input.fieldDetails, ['executionMethod', 'sampleRecovery']);
  return {
    fieldDetails: fieldDetails
      ? {
          executionMethod: choice(fieldDetails.executionMethod, [
            'TC',
            'TH',
            'SP_TH',
            'CA',
            'SP_CA',
          ]),
          sampleRecovery: choice(fieldDetails.sampleRecovery, ['INTEGRA', 'PARCIAL', 'NENHUMA']),
        }
      : undefined,
    soil,
    technicalVersion: soil ? expectedVersion(input.technicalVersion) : undefined,
    depthM: input.depthM,
    advances: result.advances.map((advance) => ({ ...advance })),
    interruptionReason: result.interruptionReason,
    result,
    engineVersion: result.engineVersion,
    version: editing ? Number(input.version) : undefined,
  };
}

function choice(value: unknown, allowed: string[]) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !allowed.includes(value))
    throw new BadRequestException('Invalid field option');
  return value;
}
