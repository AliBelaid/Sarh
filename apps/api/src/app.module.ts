import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { DbModule } from './db/db.module';
import { SupabaseModule } from './supabase/supabase.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { CitizensModule } from './citizens/citizens.module';
import { NfcModule } from './nfc/nfc.module';
import { DigitalIdCardsModule } from './digital-id-cards/digital-id-cards.module';
import { PropertiesModule } from './properties/properties.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SsiModule } from './ssi/ssi.module';
import { WorkflowModule } from './workflow/workflow.module';
import { VerifyModule } from './verify/verify.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DbModule,
    SupabaseModule,
    AuditModule,
    StorageModule,
    NotificationsModule,
    AuthModule,
    CitizensModule,
    NfcModule,
    DigitalIdCardsModule,
    PropertiesModule,
    SsiModule,
    WorkflowModule,
    VerifyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
