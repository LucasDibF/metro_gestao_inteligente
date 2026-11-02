import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import { object } from '../auth/auth-input';
import { hierarchyPage } from './hierarchy-input';
import { TrashKind, TrashService } from './trash.service';
function kind(value: string): TrashKind {
  if (!['obras', 'pastas', 'furos'].includes(value)) throw new BadRequestException('Invalid kind');
  return value as TrashKind;
}
function version(body: unknown) {
  const input = object(body);
  if (
    Object.keys(input).some((key) => key !== 'version') ||
    !Number.isSafeInteger(input.version) ||
    Number(input.version) < 1
  )
    throw new BadRequestException('Expected version required');
  return Number(input.version);
}
@Controller()
@Roles('ADMIN')
export class TrashController {
  constructor(@Inject(TrashService) private readonly trash: TrashService) {}
  @Get('lixeira')
  list(@Req() req: AuthRequest, @Query('tipo') type = 'obras', @Query('page') page?: string) {
    return this.trash.list(req.identity, kind(type), hierarchyPage(page));
  }
  @Post('lixeira/:kind/:id/restaurar')
  @HttpCode(200)
  restore(
    @Req() req: AuthRequest,
    @Param('kind') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.trash.change(req.identity, kind(type), id, version(body), true);
  }
  @Delete('obras/:id')
  removeWork(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.trash.change(req.identity, 'obras', id, version(body), false);
  }
  @Delete('obras/:workId/pastas/:id')
  removeFolder(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.trash.change(req.identity, 'pastas', id, version(body), false, workId);
  }
  @Delete('obras/:workId/furos/:id')
  removeHole(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.trash.change(req.identity, 'furos', id, version(body), false, workId);
  }
}
