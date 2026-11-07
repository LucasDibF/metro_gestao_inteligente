import { Body, Controller, Get, Header, Inject, Put, Req } from '@nestjs/common';
import { AuthRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.guard';
import type { ProfessionalProfileRows } from './professional-profile';
import { ProfessionalProfileService } from './professional-profile.service';

/** Only an engineer (main or additional role) keeps a profile, and only their own. */
@Controller('perfil-profissional')
@Roles('ENGINEER')
export class ProfessionalProfileController {
  constructor(
    @Inject(ProfessionalProfileService) private readonly service: ProfessionalProfileService,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  read(@Req() r: AuthRequest): Promise<ProfessionalProfileRows> {
    return this.service.read(r.identity);
  }
  @Put()
  @Header('Cache-Control', 'private, no-store')
  save(@Req() r: AuthRequest, @Body() body: unknown): Promise<ProfessionalProfileRows> {
    return this.service.save(r.identity, body);
  }
}
