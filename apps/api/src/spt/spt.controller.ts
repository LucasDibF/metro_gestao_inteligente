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
import { hierarchyPage } from '../works/hierarchy-input';
import { parseSpt } from './spt-input';
import { SptService } from './spt.service';
@Controller('obras/:workId/furos/:boreholeId/ensaios')
export class SptController {
  constructor(@Inject(SptService) private readonly spt: SptService) {}
  @Get()
  list(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('boreholeId', ParseUUIDPipe) boreholeId: string,
    @Query('page') page?: string,
  ) {
    return this.spt.list(req.identity, workId, boreholeId, hierarchyPage(page));
  }
  @Get('metro')
  async metre(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('boreholeId', ParseUUIDPipe) boreholeId: string,
    @Query('depth') depth: string,
  ) {
    if (typeof depth !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(depth))
      throw new BadRequestException('Invalid depth');
    return { record: await this.spt.get(req.identity, workId, boreholeId, depth) };
  }
  @Post()
  @Roles('ENGINEER', 'OPERATOR')
  create(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('boreholeId', ParseUUIDPipe) boreholeId: string,
    @Body() body: unknown,
  ) {
    return this.spt.save(req.identity, workId, boreholeId, parseSpt(body, false));
  }
  @Put(':id')
  @Roles('ENGINEER', 'OPERATOR')
  update(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('boreholeId', ParseUUIDPipe) boreholeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.spt.save(req.identity, workId, boreholeId, parseSpt(body, true), id);
  }
}
