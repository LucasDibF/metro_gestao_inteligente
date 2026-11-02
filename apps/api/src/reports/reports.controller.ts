import { hierarchyPage } from '../works/hierarchy-input';
import {
  ForbiddenException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { ReportsService } from './reports.service';
@Controller('obras/:workId/relatorios')
@Roles('ENGINEER', 'COMMERCIAL', 'ADMIN', 'VIEWER')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Get('opcoes') options(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Query('page') page?: string,
  ) {
    return this.reports.options(r.identity, w, hierarchyPage(page));
  }
  @Get() list(@Req() r: AuthRequest, @Param('workId', ParseUUIDPipe) w: string) {
    return this.reports.list(r.identity, w);
  }
  @Post() @Roles('ENGINEER') create(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Body() v: unknown,
  ) {
    return this.reports.save(r.identity, w, v);
  }
  @Put(':id') @Roles('ENGINEER') edit(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() v: unknown,
  ) {
    return this.reports.save(r.identity, w, v, id);
  }
  @Get(':id/croqui') map(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reports.map(r.identity, w, id);
  }
  @Put(':id/croqui') @Roles('ENGINEER') saveMap(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() v: unknown,
  ) {
    return this.reports.saveMap(r.identity, w, id, v);
  }
  @Get(':id/emissoes') history(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reports.history(r.identity, w, id);
  }
  @Post(':id/emissoes') @Roles('ENGINEER') issue(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() v: unknown,
  ) {
    return this.reports.issue(r.identity, w, id, v);
  }
  @Get(':id/emissoes/:issueId/pdf') async pdf(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Res() res: Response,
  ) {
    if (!r.identity.canDownloadReports) throw new ForbiddenException('Report download disabled');
    const pdf = await this.reports.download(r.identity, w, id, issueId);
    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sondagem-emissao-${pdf.issueNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Content-SHA256': pdf.sha256,
      })
      .send(pdf.body);
  }
}
