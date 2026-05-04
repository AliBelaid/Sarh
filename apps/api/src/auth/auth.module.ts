import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DigitalIdAuthGuard } from './guards/digital-id-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtService } from './jwt.service';

// Global so DigitalIdAuthGuard's `JwtService` dependency resolves wherever
// the guard is used. Mirrors the original setup where SupabaseService was
// also global.
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, DigitalIdAuthGuard, RolesGuard, JwtService],
  exports: [AuthService, DigitalIdAuthGuard, RolesGuard, JwtService],
})
export class AuthModule {}
