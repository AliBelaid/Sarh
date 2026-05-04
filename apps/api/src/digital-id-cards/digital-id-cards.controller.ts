import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DigitalIdCardsService } from './digital-id-cards.service';
import { IssueCardDto } from './dto/issue-card.dto';
import { FreezeCardDto, ReissueCardDto, RevokeCardDto } from './dto/card-action.dto';
import { ListDigitalIdsQuery } from './dto/list-cards.dto';
import { DigitalIdAuthGuard } from '../auth/guards/digital-id-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OfficerOnly } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SijilliRequestUser } from '../auth/types';
import { Audit, AuditInterceptor } from '../audit/audit.interceptor';

@ApiTags('digital-id-cards')
@ApiBearerAuth()
@Controller('digital-id-cards')
@UseGuards(DigitalIdAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
export class DigitalIdCardsController {
  constructor(private readonly cards: DigitalIdCardsService) {}

  @Get()
  @OfficerOnly('id_issuer', 'super_admin', 'auditor', 'registry_officer')
  @ApiOperation({ summary: 'List digital ID cards (cursor-paginated)' })
  list(@Query() q: ListDigitalIdsQuery, @CurrentUser() actor: SijilliRequestUser) {
    return this.cards.list(q, actor);
  }

  @Post('issue')
  @OfficerOnly('id_issuer', 'super_admin')
  @ApiOperation({ summary: 'Issue a new digital ID card (id_issuer only)' })
  @Audit({ action: 'issue_id', entity: 'digital_id_cards', entityIdFrom: 'card.id' })
  issue(@Body() dto: IssueCardDto, @CurrentUser() actor: SijilliRequestUser) {
    return this.cards.issue(dto, actor);
  }

  @Post(':id/freeze')
  @OfficerOnly('id_issuer', 'super_admin', 'registry_officer')
  @ApiOperation({ summary: 'Freeze a card (reversible)' })
  @Audit({ action: 'update', entity: 'digital_id_cards' })
  freeze(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FreezeCardDto,
    @CurrentUser() actor: SijilliRequestUser,
  ) {
    return this.cards.freeze(id, dto, actor);
  }

  @Post(':id/revoke')
  @OfficerOnly('id_issuer', 'super_admin')
  @ApiOperation({ summary: 'Permanently revoke a card' })
  @Audit({ action: 'revoke_id', entity: 'digital_id_cards' })
  revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RevokeCardDto,
    @CurrentUser() actor: SijilliRequestUser,
  ) {
    return this.cards.revoke(id, dto, actor);
  }

  @Post(':id/reissue')
  @OfficerOnly('id_issuer', 'super_admin')
  @ApiOperation({ summary: 'Reissue a card (revokes old, mints fresh NFC keys)' })
  @Audit({ action: 'issue_id', entity: 'digital_id_cards', entityIdFrom: 'card.id' })
  reissue(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReissueCardDto,
    @CurrentUser() actor: SijilliRequestUser,
  ) {
    return this.cards.reissue(id, dto, actor);
  }
}
