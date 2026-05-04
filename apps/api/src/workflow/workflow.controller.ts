import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ReviewService } from './review.service';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { DigitalIdAuthGuard } from '../auth/guards/digital-id-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SijilliRequestUser } from '../auth/types';

// Audit is written from the service so the action ('approve' / 'reject' /
// 'update' for needs_clarification) reflects the actual decision rather
// than a static decorator value.
@ApiTags('workflow')
@ApiBearerAuth()
@Controller('properties')
@UseGuards(DigitalIdAuthGuard)
export class WorkflowController {
  constructor(private readonly reviews: ReviewService) {}

  @Post(':id/review')
  @ApiOperation({
    summary:
      'Officer review on a property — approve / reject / needs_clarification (region-scoped)',
  })
  review(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewDecisionDto,
    @CurrentUser() actor: SijilliRequestUser,
    @Req() req: Request,
  ) {
    return this.reviews.review(id, dto, actor, {
      ip: ipFromRequest(req),
      user_agent: req.headers['user-agent'] ?? null,
    });
  }
}

function ipFromRequest(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip ?? null;
}
