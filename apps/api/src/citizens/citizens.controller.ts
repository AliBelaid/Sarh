import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CitizensService } from './citizens.service';
import { CreateCitizenDto } from './dto/create-citizen.dto';
import { UpdateCitizenDto } from './dto/update-citizen.dto';
import { ListCitizensQuery } from './dto/list-citizens.dto';
import { DigitalIdAuthGuard } from '../auth/guards/digital-id-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OfficerOnly } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SijilliRequestUser } from '../auth/types';
import { Audit, AuditInterceptor } from '../audit/audit.interceptor';

@ApiTags('citizens')
@ApiBearerAuth()
@Controller('citizens')
@UseGuards(DigitalIdAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
export class CitizensController {
  constructor(private readonly citizens: CitizensService) {}

  @Post()
  @OfficerOnly('id_issuer', 'registry_officer', 'super_admin')
  @ApiOperation({ summary: 'Create a citizen record (officer-only)' })
  @Audit({ action: 'create', entity: 'citizens' })
  create(@Body() dto: CreateCitizenDto, @CurrentUser() actor: SijilliRequestUser) {
    return this.citizens.create(dto, actor);
  }

  @Get()
  @OfficerOnly('id_issuer', 'registry_officer', 'super_admin', 'auditor', 'reviewer')
  @ApiOperation({ summary: 'List citizens (region-scoped + cursor pagination)' })
  list(@Query() q: ListCitizensQuery, @CurrentUser() actor: SijilliRequestUser) {
    return this.citizens.list(q, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a citizen by id (self or officer)' })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: SijilliRequestUser,
  ) {
    return this.citizens.getById(id, actor);
  }

  @Patch(':id')
  @OfficerOnly('id_issuer', 'registry_officer', 'super_admin')
  @ApiOperation({ summary: 'Update a citizen (officer-only)' })
  @Audit({ action: 'update', entity: 'citizens' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCitizenDto,
    @CurrentUser() actor: SijilliRequestUser,
  ) {
    return this.citizens.update(id, dto, actor);
  }
}
