import { ConflictException } from '@nestjs/common';
import type { Prisma, ProfessionalProfile } from '@prisma/client';
import type { TenantContext } from '../database/tenant-database.service';

export type RequiredProfileField = 'fullName' | 'creaNumber' | 'creaUf' | 'professionalTitle';
const requiredFields: readonly RequiredProfileField[] = [
  'fullName',
  'creaNumber',
  'creaUf',
  'professionalTitle',
];

/** Server form of the ProfessionalProfile contract; tests/api-contracts.test.ts checks its JSON. */
export interface ProfessionalProfileRows {
  fullName: string | null;
  creaNumber: string | null;
  creaUf: string | null;
  professionalTitle: string | null;
  phone: string | null;
  professionalEmail: string | null;
  version: number;
  updatedAt: Date | null;
  complete: boolean;
  missingFields: RequiredProfileField[];
}
/** The copy an approval writes on the hole. */
export interface ReviewerCopy {
  reviewerName: string;
  reviewerRegistration: string;
  reviewerTitle: string;
}

export function professionalProfileView(row: ProfessionalProfile | null): ProfessionalProfileRows {
  const fields = {
    fullName: row?.fullName ?? null,
    creaNumber: row?.creaNumber ?? null,
    creaUf: row?.creaUf ?? null,
    professionalTitle: row?.professionalTitle ?? null,
    phone: row?.phone ?? null,
    professionalEmail: row?.professionalEmail ?? null,
  };
  const missingFields = requiredFields.filter((field) => fields[field] === null);
  return {
    ...fields,
    version: row?.version ?? 0,
    updatedAt: row?.updatedAt ?? null,
    complete: missingFields.length === 0,
    missingFields,
  };
}
/** The registration as the report prints it, e.g. "CREA-SP 123456". */
export function reviewerRegistration(creaUf: string, creaNumber: string): string {
  return `CREA-${creaUf} ${creaNumber}`;
}
export function readOwnProfile(
  tx: Prisma.TransactionClient,
  c: TenantContext,
): Promise<ProfessionalProfile | null> {
  return tx.professionalProfile.findUnique({
    where: { tenantId_userId: { tenantId: c.tenantId, userId: c.userId } },
  });
}
/**
 * Reads the approver's own profile inside the approval transaction. Without a complete profile
 * the approval fails with PROFESSIONAL_PROFILE_INCOMPLETE and the missing fields.
 */
export async function reviewerFromProfile(
  tx: Prisma.TransactionClient,
  c: TenantContext,
): Promise<ReviewerCopy> {
  const row = await readOwnProfile(tx, c);
  if (!row?.fullName || !row.creaNumber || !row.creaUf || !row.professionalTitle)
    throw new ConflictException({
      code: 'PROFESSIONAL_PROFILE_INCOMPLETE',
      message: 'Complete the professional profile before approving',
      missingFields: professionalProfileView(row).missingFields,
    });
  return {
    reviewerName: row.fullName,
    reviewerRegistration: reviewerRegistration(row.creaUf, row.creaNumber),
    reviewerTitle: row.professionalTitle,
  };
}
