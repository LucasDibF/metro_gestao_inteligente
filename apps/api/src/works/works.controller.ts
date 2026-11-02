import { workStatuses } from './work-status';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { parseWork } from './work-input';
import { WorksService } from './works.service';

@Controller('obras')
export class WorksController {
  constructor(@Inject(WorksService) private readonly works: WorksService) {}
  @Get()
  list(
    @Req() request: AuthRequest,
    @Query('page') page?: string,
    @Query('q') query?: string,
    @Query('status') status?: string,
  ) {
    if (
      (page !== undefined &&
        (typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || Number(page) > 100000)) ||
      (query !== undefined && (typeof query !== 'string' || query.length > 100))
    )
      throw new BadRequestException('Invalid search or page');
    if (status !== undefined && !(workStatuses as readonly string[]).includes(status))
      throw new BadRequestException('Invalid work status');
    return this.works.list(request.identity, Number(page ?? 1), query?.trim() ?? '', status);
  }
  @Get(':id')
  get(@Req() request: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.works.get(request.identity, id);
  }
  @Post()
  @Roles('ENGINEER', 'COMMERCIAL')
  create(@Req() request: AuthRequest, @Body() body: unknown) {
    return this.works.create(request.identity, parseWork(body));
  }
  @Put(':id')
  @Roles('ENGINEER', 'COMMERCIAL')
  update(
    @Req() request: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseWork(body, true);
    return this.works.update(request.identity, id, { ...input, version: input.version! });
  }
}
