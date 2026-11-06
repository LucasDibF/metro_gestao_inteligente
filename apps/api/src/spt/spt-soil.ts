import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenantContext } from '../database/tenant-database.service';

// Matches the metre intervals already used by the approved report.
export function metreInterval(depthM: string): { fromM: string; toM: string } {
  const depth = Number(depthM);
  return { fromM: String(Math.max(0, depth - 1)), toM: String(depth === 0 ? 1 : depth) };
}
export async function saveMetreSoil(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  workId: string,
  boreholeId: string,
  depthM: string,
  soil: {
    soilType: string;
    description: string;
    soilColor?: string | null;
    soilMoisture?: string | null;
  },
  executedDepthM: Prisma.Decimal | null,
): Promise<void> {
  const interval = metreInterval(depthM);
  if (executedDepthM !== null) {
    if (Number(interval.fromM) >= Number(executedDepthM))
      throw new BadRequestException('Soil interval exceeds executed depth');
    interval.toM = String(Math.min(Number(interval.toM), Number(executedDepthM)));
  }
  const scope = { tenantId: context.tenantId, workId, boreholeId };
  const overlapping = await tx.soilLayer.findMany({
    where: {
      ...scope,
      fromM: { lt: interval.toM },
      toM: { gt: interval.fromM },
    },
  });
  // Shrink existing intervals before creating their preserved neighbours.
  // Keep their identities and avoid requiring delete privileges.
  let cursor = Number(interval.fromM);
  for (const layer of overlapping.sort((a, b) => Number(a.fromM) - Number(b.fromM))) {
    const from = Math.max(Number(layer.fromM), Number(interval.fromM));
    const to = Math.min(Number(layer.toM), Number(interval.toM));
    if (cursor < from)
      await tx.soilLayer.create({
        data: {
          ...scope,
          fromM: String(cursor),
          toM: String(from),
          ...soil,
        },
      });
    await tx.soilLayer.update({
      where: { id: layer.id },
      data: {
        fromM: String(from),
        toM: String(to),
        ...soil,
        version: { increment: 1 },
      },
    });
    if (Number(layer.fromM) < from)
      await tx.soilLayer.create({
        data: {
          ...scope,
          fromM: layer.fromM,
          toM: String(from),
          soilType: layer.soilType,
          description: layer.description,
          soilColor: layer.soilColor,
          soilMoisture: layer.soilMoisture,
        },
      });
    if (Number(layer.toM) > to)
      await tx.soilLayer.create({
        data: {
          ...scope,
          fromM: String(to),
          toM: layer.toM,
          soilType: layer.soilType,
          description: layer.description,
          soilColor: layer.soilColor,
          soilMoisture: layer.soilMoisture,
        },
      });
    cursor = to;
  }
  if (cursor < Number(interval.toM))
    await tx.soilLayer.create({
      data: {
        ...scope,
        fromM: String(cursor),
        toM: interval.toM,
        ...soil,
      },
    });
  const hole = await tx.borehole.findUniqueOrThrow({ where: { id: boreholeId } });
  await tx.technicalEvent.create({
    data: {
      ...scope,
      actorId: context.userId,
      action: 'SPT_SOIL_SAVED',
      technicalVersion: hole.technicalVersion,
      details: {
        depthM,
        ...interval,
        replacedLayers: overlapping.map((l) => ({
          id: l.id,
          fromM: String(l.fromM),
          toM: String(l.toM),
          soilType: l.soilType,
          description: l.description,
        })),
      },
    },
  });
}
