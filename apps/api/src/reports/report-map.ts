import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import proj4 from 'proj4';
import { TenantContext } from '../database/tenant-database.service';
import type { ReportMapRows } from './report-rows';
export type MapView = {
  centerX: number;
  centerY: number;
  spanM: number;
};
export function parseMapView(value: unknown): MapView | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid map view');
  const v = value as Record<string, unknown>;
  const { centerX, centerY, spanM } = v;
  if (
    Object.keys(v).some((k) => !['centerX', 'centerY', 'spanM'].includes(k)) ||
    !isFiniteNumber(centerX) ||
    !isFiniteNumber(centerY) ||
    !isFiniteNumber(spanM)
  )
    throw new BadRequestException('Invalid map view');
  if (Math.abs(centerX) > 20000000 || Math.abs(centerY) > 20000000 || spanM < 1 || spanM > 20000000)
    throw new BadRequestException('Invalid map extent');
  return { centerX, centerY, spanM };
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
export async function reportMap(
  tx: Prisma.TransactionClient,
  c: TenantContext,
  workId: string,
  holeIds: string[],
  showOthers: boolean,
  view?: MapView | null,
): Promise<ReportMapRows | null> {
  const selected = await tx.borehole.findMany({
    where: { tenantId: c.tenantId, workId, id: { in: holeIds }, deletedAt: null },
    include: { coordinates: true },
  });
  const first = holeIds.flatMap((id) => {
    const h = selected.find((v) => v.id === id);
    const coordinate = h?.coordinates.find((v) => v.id === h.officialCoordinateId);
    return coordinate ? [coordinate] : [];
  })[0];
  if (!first) return null;
  const context = showOthers
    ? await tx.borehole.findMany({
        where: { tenantId: c.tenantId, workId, deletedAt: null, id: { notIn: holeIds } },
        include: { coordinates: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 500,
      })
    : [];
  const points = [...selected, ...context].flatMap((h) => {
    const coordinate = h.coordinates.find((v) => v.id === h.officialCoordinateId);
    if (!coordinate) return [];
    const [x, y] = proj4(
      'EPSG:4326',
      `+proj=utm +zone=${first.zone} ${first.hemisphere === 'S' ? '+south' : ''} +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs`,
      [coordinate.longitude, coordinate.latitude],
    );
    return [{ code: h.code, x, y, selected: holeIds.includes(h.id) }];
  });
  if (
    view &&
    points.some(
      (p) =>
        p.selected &&
        (Math.abs(p.x - view.centerX) > view.spanM / 2 ||
          Math.abs(p.y - view.centerY) > view.spanM / 2),
    )
  )
    throw new BadRequestException({
      code: 'MAP_EXCLUDES_BOREHOLE',
      message: 'Map must include every selected borehole',
    });
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y));
  const actualView = view ?? {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    spanM: Math.max(maxX - minX, maxY - minY, 300) * 1.3,
  };
  return { zone: first.zone, hemisphere: first.hemisphere, points, view: actualView };
}
