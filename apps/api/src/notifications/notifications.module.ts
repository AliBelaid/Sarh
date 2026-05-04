import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SmsGatewayService } from './sms-gateway.service';

@Global()
@Module({
  providers: [NotificationsService, SmsGatewayService],
  exports: [NotificationsService, SmsGatewayService],
})
export class NotificationsModule {}
