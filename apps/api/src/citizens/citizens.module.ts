import { Module } from '@nestjs/common';
import { CitizensController } from './citizens.controller';
import { CitizensService } from './citizens.service';
import { DigitalIdNumberService } from './digital-id-number.service';

@Module({
  controllers: [CitizensController],
  providers: [CitizensService, DigitalIdNumberService],
  exports: [CitizensService, DigitalIdNumberService],
})
export class CitizensModule {}
