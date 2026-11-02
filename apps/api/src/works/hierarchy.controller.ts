import {
  Body,
  BadRequestException,
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
import { hierarchyInput, hierarchyPage } from './hierarchy-input';
import { HierarchyService } from './hierarchy.service';

@Controller('obras/:workId')
export class HierarchyController {
  constructor(@Inject(HierarchyService) private readonly service: HierarchyService) {}
  @Get('pastas')
  folders(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Query('page') page?: string,
  ) {
    return this.service.list(req.identity, workId, false, hierarchyPage(page));
  }
  @Get('furos')
  boreholes(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Query('page') page?: string,
    @Query('folderId') folderId?: string,
  ) {
    if (
      folderId !== undefined &&
      (typeof folderId !== 'string' ||
        (folderId !== 'root' &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folderId)))
    )
      throw new BadRequestException('Invalid folder');
    return this.service.list(req.identity, workId, true, hierarchyPage(page), folderId);
  }
  @Post('pastas')
  @Roles('ENGINEER')
  createFolder(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Body() body: unknown,
  ) {
    return this.service.save(req.identity, workId, false, hierarchyInput(body, false, false));
  }
  @Post('furos')
  @Roles('ENGINEER')
  createBorehole(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Body() body: unknown,
  ) {
    return this.service.save(req.identity, workId, true, hierarchyInput(body, true, false));
  }
  @Put('pastas/:id')
  @Roles('ENGINEER')
  updateFolder(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.save(req.identity, workId, false, hierarchyInput(body, false, true), id);
  }
  @Put('furos/:id')
  @Roles('ENGINEER')
  updateBorehole(
    @Req() req: AuthRequest,
    @Param('workId', ParseUUIDPipe) workId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.save(req.identity, workId, true, hierarchyInput(body, true, true), id);
  }
}
