import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RateLimiterService } from './rate-limiter.service';
import { IdentityGuard, UserAuthGuard } from './auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.register({ secret: process.env.JWT_SECRET }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, RateLimiterService, UserAuthGuard, IdentityGuard],
  exports: [AuthService, UserAuthGuard, IdentityGuard, RateLimiterService],
})
export class AuthModule {}
