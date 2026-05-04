import { Module } from '@nestjs/common';
import { DigitalIdCardsController } from './digital-id-cards.controller';
import { DigitalIdCardsService } from './digital-id-cards.service';
import { CitizensModule } from '../citizens/citizens.module';
import { NfcModule } from '../nfc/nfc.module';

@Module({
  imports: [CitizensModule, NfcModule],
  controllers: [DigitalIdCardsController],
  providers: [DigitalIdCardsService],
  exports: [DigitalIdCardsService],
})
export class DigitalIdCardsModule {}
