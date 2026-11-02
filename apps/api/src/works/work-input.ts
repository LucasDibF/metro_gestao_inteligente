import { BadRequestException } from '@nestjs/common';
import { object } from '../auth/auth-input';
const states = new Set(
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '),
);
export interface WorkInput {
  name: string;
  initialBoreholeCount?: number;
  initialFolderName?: string | null;
  clientName: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
}
export function parseWork(value: unknown, editing = false): WorkInput & { version?: number } {
  const input = object(value);
  const allowed = new Set([
    'name',
    'clientName',
    'city',
    'state',
    'address',
    ...(editing ? ['version'] : ['initialBoreholeCount', 'initialFolderName']),
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new BadRequestException('Unknown work field');
  function field(key: string, max: number, required = false): string | null {
    const value = input[key];
    if (value === undefined || value === null) {
      if (required) throw new BadRequestException('Work name is required');
      return null;
    }
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim()))
      throw new BadRequestException('Invalid work field');
    return value.trim() || null;
  }
  const state = field('state', 2)?.toUpperCase() ?? null;
  if (state && !states.has(state)) throw new BadRequestException('Invalid state');
  if (editing && (!Number.isSafeInteger(input.version) || Number(input.version) < 1))
    throw new BadRequestException('Expected version is required');
  const count = input.initialBoreholeCount ?? 0;
  if (!editing && (!Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > 200))
    throw new BadRequestException('Initial borehole count must be between 0 and 200');
  const folderName = editing ? null : field('initialFolderName', 120);
  if (folderName && !count) throw new BadRequestException('A folder requires initial boreholes');
  return {
    ...(!editing ? { initialBoreholeCount: Number(count), initialFolderName: folderName } : {}),
    name: field('name', 200, true)!,
    clientName: field('clientName', 200),
    city: field('city', 120),
    state,
    address: field('address', 500),
    ...(editing ? { version: Number(input.version) } : {}),
  };
}
