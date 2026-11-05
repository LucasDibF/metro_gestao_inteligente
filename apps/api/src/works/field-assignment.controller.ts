import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put, Req } from '@nestjs/common';
import { type AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { FieldAssignmentService } from './field-assignment.service';
@Roles('ADMIN', 'COMMERCIAL')
@Controller('obras/:workId/equipe-campo')
export class FieldAssignmentController {
  constructor(@Inject(FieldAssignmentService) private readonly service: FieldAssignmentService) {}
  @Get() get(@Req() req: AuthRequest, @Param('workId', ParseUUIDPipe) workId: string) {
    return this.service.get(req.identity, workId);
  }
  @Put() save(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Body() body: unknown,
  ) {
    return this.service.save(req.identity, workId, body);
  }
}
