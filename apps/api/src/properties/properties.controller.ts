import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { ListPropertiesQuery } from './dto/list-properties.dto';
import { OverlapCheckDto } from './dto/overlap-check.dto';
import { NearbyQuery } from './dto/nearby.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DigitalIdAuthGuard } from '../auth/guards/digital-id-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SijilliRequestUser } from '../auth/types';
import { Audit, AuditInterceptor } from '../audit/audit.interceptor';
import { UploadFile } from '../storage/storage.service';

@ApiTags('properties')
@ApiBearerAuth()
@Controller('properties')
@UseGuards(DigitalIdAuthGuard)
@UseInterceptors(AuditInterceptor)
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a property registration request (citizen-only)' })
  @Audit({ action: 'create', entity: 'properties', entityIdFrom: 'property.id' })
  submit(@Body() dto: CreatePropertyDto, @CurrentUser() actor: SijilliRequestUser) {
    return this.properties.submit(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'List properties (citizen → own; officer → region)' })
  list(@Query() q: ListPropertiesQuery, @CurrentUser() actor: SijilliRequestUser) {
    return this.properties.list(q, actor);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Find properties within a radius of a point' })
  nearby(@Query() q: NearbyQuery) {
    return this.properties.nearby(q);
  }

  @Post('overlap-check')
  @ApiOperation({
    summary: 'Find approved properties that intersect a candidate polygon (soft warning)',
  })
  overlapCheck(@Body() dto: OverlapCheckDto) {
    return this.properties.overlapCheck(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a property by id' })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: SijilliRequestUser,
  ) {
    return this.properties.getById(id, actor);
  }

  @Post(':id/documents')
  @ApiOperation({ summary: 'Upload a supporting document (multipart/form-data)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        document_type: {
          type: 'string',
          enum: [
            'koreky_certificate',
            'survey_certificate',
            'sale_contract',
            'inheritance_deed',
            'court_order',
            'site_photo',
            'boundary_map',
            'other',
          ],
        },
        title_ar: { type: 'string' },
      },
      required: ['file', 'document_type'],
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @Audit({ action: 'create', entity: 'property_documents' })
  uploadDocument(
    @Param('id', new ParseUUIDPipe()) propertyId: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: UploadFile,
    @CurrentUser() actor: SijilliRequestUser,
  ) {
    return this.properties.uploadDocument(propertyId, dto, file, actor);
  }
}
