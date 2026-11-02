import type { Profile } from './client';
export type Role = Profile['role'];
export const roleNames: Record<Role, string> = {
  ADMIN: 'Administrador',
  ENGINEER: 'Engenheiro',
  OPERATOR: 'Sondador',
  COMMERCIAL: 'Comercial',
  VIEWER: 'Consulta',
};
export function hasRole(profile: Pick<Profile, 'role' | 'additionalRoles'>, ...roles: Role[]) {
  return [profile.role, ...(profile.additionalRoles ?? [])].some((role) => roles.includes(role));
}
export function canRecordField(profile: Profile, state?: string) {
  return hasRole(profile, 'ENGINEER') || (hasRole(profile, 'OPERATOR') && state === 'DRAFT');
}

export function canOpenFuroSection(
  profile: Profile,
  section: 'overview' | 'field' | 'analysis' | 'review' | 'photos' | 'identification',
) {
  if (section === 'overview') return true;
  if (section === 'identification') return hasRole(profile, 'ENGINEER');
  if (section === 'review') return hasRole(profile, 'ENGINEER');
  if (section === 'analysis') return hasRole(profile, 'ENGINEER', 'VIEWER');
  return hasRole(profile, 'ENGINEER', 'OPERATOR', 'VIEWER');
}
