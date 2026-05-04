import { Global, Module } from '@nestjs/common';
import { SsiService } from './ssi.service';
import { AcaPyClient } from './aca-py.client';

@Global()
@Module({
  providers: [SsiService, AcaPyClient],
  exports: [SsiService, AcaPyClient],
})
export class SsiModule {}
