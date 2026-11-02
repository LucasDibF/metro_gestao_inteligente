import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/roles.guard';
import { AuthRequest } from '../auth/auth.guard';
import { hierarchyPage } from '../works/hierarchy-input';
import { WorkspaceService } from './workspace.service';
@Controller('workspace')
export class WorkspaceController {
  constructor(@Inject(WorkspaceService) private readonly service: WorkspaceService) {}
  @Get('resumo') summary(@Req() r: AuthRequest) {
    return this.service.summary(r.identity);
  }
  @Get('relatorios') @Roles('ENGINEER', 'COMMERCIAL', 'ADMIN', 'VIEWER') reports(
    @Req() r: AuthRequest,
    @Query('page') page?: string,
    @Query('q') q?: string,
    @Query('state') state?: string,
  ) {
    if (
      (q !== undefined && (typeof q !== 'string' || q.length > 100)) ||
      (state !== undefined && typeof state !== 'string')
    )
      throw new BadRequestException('Invalid filters');
    return this.service.reports(r.identity, hierarchyPage(page), q?.trim() ?? '', state ?? '');
  }
  @Get('atividades') activity(@Req() r: AuthRequest) {
    return this.service.activity(r.identity);
  }
  @Post('atividades/lidas') read(@Req() r: AuthRequest, @Body() body: unknown) {
    return this.service.read(r.identity, body);
  }
}
