import { companyLogoFromProfile, type ReportSnapshot } from '@spt/report-templates';
export function reportCompany(tenant: {
  id: string;
  name: string;
  profile: unknown;
}): ReportSnapshot['tenant'] {
  const logoDataUrl = companyLogoFromProfile(tenant.profile);
  return { id: tenant.id, name: tenant.name, ...(logoDataUrl ? { logoDataUrl } : {}) };
}
