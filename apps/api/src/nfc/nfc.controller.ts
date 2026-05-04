import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NfcService } from './nfc.service';
import { EncodeCardDto } from './dto/encode-card.dto';
import { VerifySunDto, VerifySunResult } from './dto/verify-sun.dto';
import { DigitalIdAuthGuard } from '../auth/guards/digital-id-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OfficerOnly } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SijilliRequestUser } from '../auth/types';
import { Audit, AuditInterceptor } from '../audit/audit.interceptor';

@ApiTags('nfc')
@Controller('nfc')
export class NfcController {
  constructor(private readonly nfc: NfcService) {}

  // Officer-authenticated callback that the issuer station fires after
  // it successfully writes the keys + URL to a freshly-printed chip.
  @Post('encode')
  @ApiBearerAuth()
  @UseGuards(DigitalIdAuthGuard, RolesGuard)
  @OfficerOnly('id_issuer', 'super_admin')
  @UseInterceptors(AuditInterceptor)
  @Audit({ action: 'update', entity: 'digital_id_cards', entityIdFrom: 'card.id' })
  @ApiOperation({ summary: 'Confirm a card has been encoded; binds nfc_uid' })
  encode(@Body() dto: EncodeCardDto, @CurrentUser() actor: SijilliRequestUser) {
    return this.nfc.recordEncoded(dto, actor);
  }

  // Public — anyone holding a chip can verify it. Rate limiting is
  // applied at the gateway (nginx / Supabase Edge) per CLAUDE.md security
  // checklist.
  @Post('verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify a SUN tap (public, no auth)' })
  verify(@Body() dto: VerifySunDto): Promise<VerifySunResult> {
    return this.nfc.verifyTap(dto);
  }
}
