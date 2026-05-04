import { Module } from '@nestjs/common';
import { NfcController } from './nfc.controller';
import { NfcService } from './nfc.service';
import { NfcKeyStoreService } from './nfc-key-store.service';

@Module({
  controllers: [NfcController],
  providers: [NfcService, NfcKeyStoreService],
  exports: [NfcKeyStoreService],
})
export class NfcModule {}
