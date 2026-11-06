import type { ReportSnapshot } from './types';
import { templateSince } from './template-version';

/** Logos are normalized PNG bytes, never remote URLs or executable markup. */
export function companyLogoFromProfile(profile: unknown): string | undefined {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return undefined;
  const value = (profile as { logoDataUrl?: unknown }).logoDataUrl;
  const prefix = 'data:image/png;base64,';
  return typeof value === 'string' &&
    value.length <= 400000 &&
    (value.length - prefix.length) % 4 === 0 &&
    /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)
    ? value
    : undefined;
}

export function snapshotCompanyLogo(snapshot: ReportSnapshot): string | undefined {
  return templateSince(snapshot.templateVersion, '0.8.13')
    ? companyLogoFromProfile(snapshot.tenant)
    : undefined;
}
