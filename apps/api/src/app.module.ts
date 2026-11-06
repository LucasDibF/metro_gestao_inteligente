import { ProfessionalProfileController } from './professional-profile/professional-profile.controller';
import { ProfessionalProfileService } from './professional-profile/professional-profile.service';
import { MobileSyncController } from './mobile/mobile-sync.controller';
import { MobileController } from './mobile/mobile.controller';
import { FieldAssignmentController } from './works/field-assignment.controller';
import { FieldAssignmentService } from './works/field-assignment.service';
import { AccessController } from './management/access.controller';
import { ClientsController } from './management/clients.controller';
import { InteractiveSheetService } from './technical/interactive-sheet.service';
import { WorkspaceController } from './workspace/workspace.controller';
import { WorkspaceService } from './workspace/workspace.service';
import { OperationsController } from './operations/operations.controller';
import { ReportsService } from './reports/reports.service';
import { ReportsController } from './reports/reports.controller';
import { FilesService } from './files/files.service';
import { PhotoStagingService } from './files/photo-staging.service';
import { FilesController } from './files/files.controller';
import { TechnicalService } from './technical/technical.service';
import { TechnicalController } from './technical/technical.controller';
import { SptService } from './spt/spt.service';
import { SptController } from './spt/spt.controller';
import { DevelopmentController } from './auth/development.controller';
import { TrashService } from './works/trash.service';
import { TrashController } from './works/trash.controller';
import { HierarchyService } from './works/hierarchy.service';
import { HierarchyController } from './works/hierarchy.controller';
import { WorksController } from './works/works.controller';
import { WorksService } from './works/works.service';
import { MfaService } from './auth/mfa.service';
import { MfaController } from './auth/mfa.controller';
import { SessionAdminController } from './auth/session-admin.controller';
import { RolesGuard } from './auth/roles.guard';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './database/database.service';
import { TenantDatabaseService } from './database/tenant-database.service';
import { HealthController } from './health.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { TokenService } from './auth/token.service';
import { AuthGuard } from './auth/auth.guard';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [
    MobileController,
    MobileSyncController,
    FieldAssignmentController,
    AccessController,
    ClientsController,
    WorkspaceController,
    OperationsController,
    ReportsController,
    FilesController,
    TechnicalController,
    DevelopmentController,
    SptController,
    HealthController,
    AuthController,
    MfaController,
    SessionAdminController,
    WorksController,
    HierarchyController,
    TrashController,
    ProfessionalProfileController,
  ],
  providers: [
    FieldAssignmentService,
    WorkspaceService,
    { provide: PrismaClient, useClass: DatabaseService },
    ReportsService,
    FilesService,
    PhotoStagingService,
    TechnicalService,
    ProfessionalProfileService,
    InteractiveSheetService,
    SptService,
    TenantDatabaseService,
    TokenService,
    AuthService,
    MfaService,
    WorksService,
    HierarchyService,
    TrashService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
