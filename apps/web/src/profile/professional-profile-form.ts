import type {
  ProfessionalProfile,
  ProfessionalProfileInput,
  ProfessionalProfileRequiredField,
} from '@spt/api-contracts';

export type { ProfessionalProfile, ProfessionalProfileRequiredField };
/** The editable fields of the professional profile, in the order the form shows them. */
export type ProfileFieldName = Exclude<keyof ProfessionalProfileInput, 'version'>;
/** What the form holds: plain text for every field, empty when not informed. */
export type ProfileFormValues = Record<ProfileFieldName, string>;
export type ProfileFieldErrors = Partial<Record<ProfileFieldName, string>>;

export const profileFieldOrder: readonly ProfileFieldName[] = [
  'fullName',
  'professionalTitle',
  'creaNumber',
  'creaUf',
  'phone',
  'professionalEmail',
];
/** Lower-case names used inside sentences ("Falta: nome completo e título profissional."). */
export const profileFieldNames: Record<ProfileFieldName, string> = {
  fullName: 'nome completo',
  creaNumber: 'número do CREA',
  creaUf: 'UF do CREA',
  professionalTitle: 'título profissional',
  phone: 'telefone',
  professionalEmail: 'email profissional',
};
/** Message shown on the field when the server or the form rejects it. */
export const profileFieldMessages: Record<ProfileFieldName, string> = {
  fullName: 'Confira o nome completo: use até 200 caracteres.',
  creaNumber:
    'Informe só o número do CREA, com o sufixo se houver (como 506123456-D). A UF fica no campo ao lado.',
  creaUf: 'Selecione a UF do CREA.',
  professionalTitle: 'Confira o título profissional: use até 120 caracteres.',
  phone: 'Informe o telefone com DDD, de 10 a 13 dígitos. Use números, espaço e + ( ) - .',
  professionalEmail: 'Informe um email válido, como nome@empresa.com.br.',
};
export const profileFieldLimits: Record<ProfileFieldName, number> = {
  fullName: 200,
  creaNumber: 40,
  creaUf: 2,
  professionalTitle: 120,
  phone: 30,
  professionalEmail: 254,
};
const creaPattern = /^\d{3,12}(?:[-/][0-9A-Z]{1,2})?$/;
const phonePattern = /^\+?[\d ().-]+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Joins names as Portuguese prose: "a", "a e b", "a, b e c". */
export function joinNames(names: readonly string[]): string {
  return names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
export function missingFieldsSentence(fields: readonly string[]): string {
  const names = fields
    .filter((field): field is ProfileFieldName => field in profileFieldNames)
    .map((field) => profileFieldNames[field]);
  return names.length ? joinNames(names) : '';
}
export function formValuesFrom(profile: ProfessionalProfile): ProfileFormValues {
  return {
    fullName: profile.fullName ?? '',
    creaNumber: profile.creaNumber ?? '',
    creaUf: profile.creaUf ?? '',
    professionalTitle: profile.professionalTitle ?? '',
    phone: profile.phone ?? '',
    professionalEmail: profile.professionalEmail ?? '',
  };
}
export function sameValues(left: ProfileFormValues, right: ProfileFormValues): boolean {
  return profileFieldOrder.every((field) => left[field] === right[field]);
}
const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim();

/**
 * Mirrors the server rules so the form can point at a field before sending. The server still
 * decides: its PROFESSIONAL_PROFILE_INVALID answer names the field the same way.
 */
export function validateProfile(values: ProfileFormValues): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  const crea = collapse(values.creaNumber).replace(/[\s.]/g, '').toUpperCase();
  const uf = collapse(values.creaUf);
  const phone = collapse(values.phone);
  const email = collapse(values.professionalEmail).toLowerCase();
  if (collapse(values.fullName).length > profileFieldLimits.fullName)
    errors.fullName = profileFieldMessages.fullName;
  if (collapse(values.professionalTitle).length > profileFieldLimits.professionalTitle)
    errors.professionalTitle = profileFieldMessages.professionalTitle;
  if (crea && !creaPattern.test(crea)) errors.creaNumber = profileFieldMessages.creaNumber;
  if (crea && !uf) errors.creaUf = 'Selecione a UF do CREA junto com o número.';
  if (uf && !crea) errors.creaNumber = 'Informe o número do CREA da UF selecionada.';
  const digits = phone.replace(/\D/g, '').length;
  if (
    phone &&
    (phone.length > profileFieldLimits.phone ||
      !phonePattern.test(phone) ||
      digits < 10 ||
      digits > 13)
  )
    errors.phone = profileFieldMessages.phone;
  if (email && (email.length > profileFieldLimits.professionalEmail || !emailPattern.test(email)))
    errors.professionalEmail = profileFieldMessages.professionalEmail;
  return errors;
}
/** The PUT body: every field is sent, and empty text becomes null so the server clears it. */
export function profileInput(values: ProfileFormValues, version: number): ProfessionalProfileInput {
  const text = (value: string): string | null => collapse(value) || null;
  return {
    fullName: text(values.fullName),
    creaNumber: text(values.creaNumber),
    creaUf: text(values.creaUf),
    professionalTitle: text(values.professionalTitle),
    phone: text(values.phone),
    professionalEmail: text(values.professionalEmail),
    version,
  };
}
/** How the registration is printed and copied to the borehole: "CREA-SP 506123456-D". */
export function creaRegistration(
  profile: Pick<ProfessionalProfile, 'creaNumber' | 'creaUf'>,
): string {
  return profile.creaNumber && profile.creaUf ? `CREA-${profile.creaUf} ${profile.creaNumber}` : '';
}
