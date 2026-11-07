import { BadRequestException } from '@nestjs/common';
import { object } from '../auth/auth-input';

/** The 27 Brazilian state codes, the same list the database CHECK accepts. */
export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export interface ProfessionalProfileFields {
  fullName: string | null;
  creaNumber: string | null;
  creaUf: string | null;
  professionalTitle: string | null;
  phone: string | null;
  professionalEmail: string | null;
}
export interface ProfessionalProfileUpdate {
  fields: ProfessionalProfileFields;
  /** 0 creates the profile; otherwise the version the client read. */
  version: number;
}
type FieldName = keyof ProfessionalProfileFields;
const accepted: ReadonlyArray<FieldName | 'version'> = [
  'fullName',
  'creaNumber',
  'creaUf',
  'professionalTitle',
  'phone',
  'professionalEmail',
  'version',
];
/** CREA number without the state: 3 to 12 digits, optionally `-` or `/` and a 1–2 character suffix. */
const creaPattern = /^\d{3,12}(?:[-/][0-9A-Z]{1,2})?$/;
const phonePattern = /^\+?[\d ().-]+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(field: FieldName, message: string): never {
  throw new BadRequestException({ code: 'PROFESSIONAL_PROFILE_INVALID', field, message });
}
/** Trimmed text with inner whitespace collapsed; empty or blank becomes null. */
function optionalText(value: unknown, field: FieldName, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid(field, 'Text expected');
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length > max) invalid(field, `At most ${max} characters`);
  if (/\p{Cc}/u.test(normalized)) invalid(field, 'Control characters are not accepted');
  return normalized;
}
function creaNumber(value: unknown): string | null {
  const text = optionalText(value, 'creaNumber', 40);
  if (text === null) return null;
  const normalized = text.replace(/[\s.]/g, '').toUpperCase();
  if (!creaPattern.test(normalized))
    invalid('creaNumber', 'Registration number: digits, optionally with a suffix such as -D');
  return normalized;
}
function creaUf(value: unknown): string | null {
  const text = optionalText(value, 'creaUf', 40);
  if (text === null) return null;
  const normalized = text.toUpperCase();
  if (!(BRAZILIAN_STATES as readonly string[]).includes(normalized))
    invalid('creaUf', 'Unknown Brazilian state');
  return normalized;
}
function phone(value: unknown): string | null {
  const text = optionalText(value, 'phone', 30);
  if (text === null) return null;
  const digits = text.replace(/\D/g, '').length;
  if (!phonePattern.test(text) || digits < 10 || digits > 13)
    invalid('phone', 'Phone with area code: 10 to 13 digits');
  return text;
}
function email(value: unknown): string | null {
  const text = optionalText(value, 'professionalEmail', 254);
  if (text === null) return null;
  const normalized = text.toLowerCase();
  if (!emailPattern.test(normalized)) invalid('professionalEmail', 'Invalid e-mail');
  return normalized;
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new BadRequestException('Expected version required');
  return Number(value);
}

/**
 * PUT replaces the whole profile: an absent, null or blank field is stored as null. The owner
 * always comes from the session, so `tenantId` or `userId` in the body is an unknown field.
 */
export function professionalProfileInput(body: unknown): ProfessionalProfileUpdate {
  const value = object(body);
  if (Object.keys(value).some((key) => !accepted.includes(key as FieldName)))
    throw new BadRequestException('Unknown professional profile field');
  const fields: ProfessionalProfileFields = {
    fullName: optionalText(value.fullName, 'fullName', 200),
    creaNumber: creaNumber(value.creaNumber),
    creaUf: creaUf(value.creaUf),
    professionalTitle: optionalText(value.professionalTitle, 'professionalTitle', 120),
    phone: phone(value.phone),
    professionalEmail: email(value.professionalEmail),
  };
  if (fields.creaNumber !== null && fields.creaUf === null)
    invalid('creaUf', 'The state is required with the CREA number');
  if (fields.creaUf !== null && fields.creaNumber === null)
    invalid('creaNumber', 'The CREA number is required with the state');
  return { fields, version: version(value.version) };
}
