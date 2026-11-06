export interface BoreholeReader {
  role: string;
  additionalRoles: readonly string[];
}
const fieldBoreholeSelect = {
  id: true,
  workId: true,
  tenantId: true,
  folderId: true,
  code: true,
  plannedDepthM: true,
  deletedAt: true,
  deletedBy: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  executedDepthM: true,
  waterLevelM: true,
  fieldDate: true,
  technicalVersion: true,
  reviewState: true,
  approvedVersion: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNote: true,
  officialCoordinateId: true,
} as const;
const engineeringBoreholeSelect = {
  ...fieldBoreholeSelect,
  reviewerName: true,
  reviewerRegistration: true,
} as const;
/** The reviewer's name and registration are shown to engineers only. */
export function boreholeSelectFor(reader: BoreholeReader) {
  return [reader.role, ...reader.additionalRoles].includes('ENGINEER')
    ? engineeringBoreholeSelect
    : fieldBoreholeSelect;
}
