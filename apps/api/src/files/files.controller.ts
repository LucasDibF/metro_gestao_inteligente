import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { FilesService } from './files.service';
@Controller('obras/:workId/furos/:boreholeId/arquivos')
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}
  @Get() list(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
  ) {
    return this.files.list(r.identity, w, b);
  }
  @Put('coordenadas/planejada') @Roles('ENGINEER') planned(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Body() v: unknown,
  ) {
    return this.files.coordinate(r.identity, w, b, 'PLANNED', v);
  }
  @Put('coordenadas/executada') @Roles('ENGINEER', 'OPERATOR') executed(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Body() v: unknown,
  ) {
    return this.files.coordinate(r.identity, w, b, 'EXECUTED', v);
  }
  @Put('coordenadas/oficial') @Roles('ENGINEER', 'OPERATOR') official(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Body() v: unknown,
  ) {
    return this.files.official(r.identity, w, b, v);
  }
  @Post('fotografias')
  @Roles('ENGINEER', 'OPERATOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 } }),
  )
  upload(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption: unknown,
    @Body('purpose') purpose: unknown,
  ) {
    return this.files.upload(r.identity, w, b, file, caption, purpose);
  }
  @Put('fotografias/:id') @Roles('ENGINEER', 'OPERATOR') update(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() v: unknown,
  ) {
    return this.files.updatePhoto(r.identity, w, b, id, v);
  }
  @Delete('fotografias/:id') @Roles('ENGINEER', 'OPERATOR') delete(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() v: unknown,
  ) {
    return this.files.updatePhoto(r.identity, w, b, id, v, true);
  }
  @Get('fotografias/:id/:variant') async download(
    @Req() r: AuthRequest,
    @Param('workId', ParseUUIDPipe) w: string,
    @Param('boreholeId', ParseUUIDPipe) b: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variant') variant: string,
    @Res() res: Response,
  ) {
    const result = await this.files.download(r.identity, w, b, id, variant !== 'original');
    res
      .set({
        'Content-Type': result.mime,
        'Content-Disposition': 'inline; filename="fotografia"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(result.body);
  }
}
