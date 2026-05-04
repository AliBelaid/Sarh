import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { ReviewService } from './review.service';
import { DeedGeneratorService } from './deed-generator.service';
import { DeedSignerService } from './deed-signer.service';

@Module({
  controllers: [WorkflowController],
  providers: [ReviewService, DeedGeneratorService, DeedSignerService],
  exports: [ReviewService],
})
export class WorkflowModule {}
