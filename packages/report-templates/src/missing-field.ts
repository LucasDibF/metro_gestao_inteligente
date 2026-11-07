import { templateSince } from './template-version';

/** Value printed for a field without data: "NI" up to 0.8.16, blank from 0.8.17. */
export function missingFieldValue(templateVersion: string): string {
  return templateSince(templateVersion, '0.8.17') ? '' : 'NI';
}

/**
 * Labelled fields without data, joined by " · ".
 * Up to 0.8.16 each label carries "NI" ("Peso: NI · Queda: NI"); from 0.8.17 only the
 * labels remain ("Peso: · Queda:"), so no trailing space follows an empty value.
 */
export function missingFieldLabels(templateVersion: string, labels: readonly string[]): string {
  const value = missingFieldValue(templateVersion);
  return labels.map((label) => (value ? `${label}: ${value}` : `${label}:`)).join(' · ');
}

/**
 * Header and cover wording for a missing value ("Não informado", "Não informada"):
 * kept up to 0.8.16, blank from 0.8.17 so only the field label remains.
 */
export function missingFieldWording(templateVersion: string, legacyWording: string): string {
  return templateSince(templateVersion, '0.8.17') ? '' : legacyWording;
}
