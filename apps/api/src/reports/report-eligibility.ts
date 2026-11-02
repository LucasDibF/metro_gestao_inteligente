import { BadRequestException } from '@nestjs/common';
type Hole = {
  code: string;
  reviewState: string;
  approvedVersion: number | null;
  technicalVersion: number;
  officialCoordinateId: string | null;
};
export function validateReportEligibility(holes: Hole[], selectedCount: number) {
  if (holes.length !== selectedCount)
    throw new BadRequestException({
      code: 'REPORT_HOLE_UNAVAILABLE',
      message: 'Selected borehole unavailable',
    });
  const unapproved = holes.filter(
    (h) => h.reviewState !== 'APPROVED' || h.approvedVersion !== h.technicalVersion,
  );
  if (unapproved.length)
    throw new BadRequestException({
      code: 'REPORT_NOT_APPROVED',
      message: 'Current technical approval required',
      holeCodes: unapproved.map((h) => h.code),
    });
  const missing = holes.filter((h) => !h.officialCoordinateId);
  if (missing.length)
    throw new BadRequestException({
      code: 'REPORT_COORDINATES_REQUIRED',
      message: 'Official coordinates required',
      holeCodes: missing.map((h) => h.code),
    });
}
