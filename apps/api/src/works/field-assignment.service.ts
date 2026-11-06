import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService, type TenantContext } from '../database/tenant-database.service';
import { isUuid } from '../common/uuid';
import { technicalInput } from '../technical/technical-input';
import { lockWork, readWork } from './work-lock';
@Injectable()
export class FieldAssignmentService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  get(c: TenantContext, workId: string) {
    return this.db.run(c, async (tx) => {
      await readWork(tx, c, workId);
      const [row] = await tx.$queryRaw<
        Array<{ items: Array<{ userId: string; email: string }> }>
      >`SELECT field_operators() AS items`;
      return {
        assignment: await tx.workAssignment.findUnique({ where: { workId } }),
        operators: row.items,
      };
    });
  }
  save(c: TenantContext, workId: string, body: unknown) {
    const input = technicalInput(body, ['operatorId', 'version']);
    if (
      (input.operatorId !== null && !isUuid(input.operatorId)) ||
      !Number.isSafeInteger(input.version) ||
      Number(input.version) < 0
    )
      throw new BadRequestException('Invalid assignment');
    const operatorId = input.operatorId as string | null;
    return this.db.run(c, async (tx) => {
      await lockWork(tx, c, workId);
      const existing = await tx.workAssignment.findUnique({ where: { workId } });
      if ((existing?.version ?? 0) !== input.version)
        throw new ConflictException({
          code: 'RECORD_VERSION_CONFLICT',
          message: 'Assignment changed; reload',
        });
      if (operatorId) {
        const [row] = await tx.$queryRaw<
          Array<{ items: Array<{ userId: string }> }>
        >`SELECT field_operators() AS items`;
        if (!row.items.some((item) => item.userId === operatorId))
          throw new BadRequestException('Active operator required');
      }
      if (!existing && !operatorId) return null;
      return existing
        ? tx.workAssignment.update({
            where: { workId },
            data: {
              operatorId: operatorId ?? existing.operatorId,
              active: operatorId !== null,
              assignedBy: c.userId,
              version: { increment: 1 },
              updatedAt: new Date(),
            },
          })
        : tx.workAssignment.create({
            data: { workId, tenantId: c.tenantId, operatorId: operatorId!, assignedBy: c.userId },
          });
    });
  }
}
