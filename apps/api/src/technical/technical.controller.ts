import { InteractiveSheetService } from './interactive-sheet.service';
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { TechnicalService } from './technical.service';
@Controller('obras/:workId/furos/:boreholeId/tecnico')
export class TechnicalController {
  constructor(
    @Inject(TechnicalService) private readonly service: TechnicalService,
    @Inject(InteractiveSheetService) private readonly sheet: InteractiveSheetService,
  ) {}
  @Get('analise')
  @Roles('ENGINEER', 'VIEWER')
  @Header('Cache-Control', 'private, no-store')
  analysis(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
  ) {
    return this.sheet.get(r.identity, w, b, false);
  }
  @Get('folha')
  @Roles('ENGINEER', 'VIEWER')
  @Header('Cache-Control', 'private, no-store')
  preview(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
  ) {
    return this.sheet.get(r.identity, w, b);
  }
  @Get() async get(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
  ) {
    const data = await this.service.get(r.identity, w, b);
    const engineering = [r.identity.role, ...r.identity.additionalRoles].some(
      (role) => role === 'ENGINEER' || role === 'VIEWER',
    );
    return engineering
      ? data
      : {
          ...data,
          events: [],
          hole: {
            ...data.hole,
            reviewerName: null,
            reviewerRegistration: null,
            reviewerTitle: null,
          },
        };
  }
  @Put() @Roles('ENGINEER', 'OPERATOR') fields(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Body() v: unknown,
  ) {
    return this.service.fields(r.identity, w, b, v);
  }
  @Post('camadas') @Roles('ENGINEER') layer(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Body() v: unknown,
  ) {
    return this.service.layer(r.identity, w, b, v);
  }
  @Put('camadas/:id') @Roles('ENGINEER') editLayer(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() v: unknown,
  ) {
    return this.service.layer(r.identity, w, b, v, id);
  }
  @Post('enviar-revisao') @Roles('ENGINEER', 'OPERATOR') submit(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Body() v: unknown,
  ) {
    return this.service.review(r.identity, w, b, v, 'submit');
  }
  @Post('aprovar') @Roles('ENGINEER') approve(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Body() v: unknown,
  ) {
    return this.service.review(r.identity, w, b, v, 'approve');
  }
  @Post('devolver') @Roles('ENGINEER') reject(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Body() v: unknown,
  ) {
    return this.service.review(r.identity, w, b, v, 'reject');
  }
}
