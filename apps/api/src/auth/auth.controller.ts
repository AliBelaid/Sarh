import { Body, Controller, HttpCode, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { InviteOfficerDto } from './dto/invite-officer.dto';
import { DigitalIdAuthGuard } from './guards/digital-id-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OfficerOnly } from './decorators/roles.decorator';
import { Audit, AuditInterceptor } from '../audit/audit.interceptor';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sign-in')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in (officer or citizen) via Supabase Auth' })
  @UseInterceptors(AuditInterceptor)
  @Audit({ action: 'login', entity: 'auth.users', entityIdFrom: 'user.id', captureRequestBody: false })
  signIn(@Body() dto: SignInDto) {
    return this.auth.signIn(dto);
  }

  @Post('invite-officer')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a new officer (super_admin only)' })
  @UseGuards(DigitalIdAuthGuard, RolesGuard)
  @OfficerOnly('super_admin')
  @UseInterceptors(AuditInterceptor)
  @Audit({ action: 'create', entity: 'officers' })
  inviteOfficer(@Body() dto: InviteOfficerDto) {
    return this.auth.inviteOfficer(dto);
  }
}
