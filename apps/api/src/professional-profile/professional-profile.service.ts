import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantDatabaseService } from '../database/tenant-database.service';
import { professionalProfileInput } from './professional-profile-input';
import {
  professionalProfileView,
  readOwnProfile,
  type ProfessionalProfileRows,
} from './professional-profile';

function versionConflict(): never {
  throw new ConflictException({
    code: 'RECORD_VERSION_CONFLICT',
    message: 'Professional profile changed; reload',
  });
}
/** The signed-in user's own profile in the session company; RLS enforces the same owner. */
@Injectable()
export class ProfessionalProfileService {
  constructor(@Inject(TenantDatabaseService) private readonly db: TenantDatabaseService) {}
  read(c: TenantContext): Promise<ProfessionalProfileRows> {
    return this.db.run(c, async (tx) => professionalProfileView(await readOwnProfile(tx, c)));
  }
  async save(c: TenantContext, body: unknown): Promise<ProfessionalProfileRows> {
    const { fields, version } = professionalProfileInput(body);
    try {
      return await this.db.run(c, async (tx) => {
        const owner = { tenantId: c.tenantId, userId: c.userId };
        if (version === 0) await tx.professionalProfile.create({ data: { ...owner, ...fields } });
        else {
          const updated = await tx.professionalProfile.updateMany({
            where: { ...owner, version },
            data: { ...fields, version: { increment: 1 } },
          });
          if (!updated.count) versionConflict();
        }
        return professionalProfileView(await readOwnProfile(tx, c));
      });
    } catch (error) {
      // A second create for the same login: someone saved it meanwhile.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        versionConflict();
      throw error;
    }
  }
}
