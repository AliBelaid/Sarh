import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { DbModule } from '../db/db.module';

@Global()
@Module({
  imports: [DbModule],
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
