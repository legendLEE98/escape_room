import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { MapsModule } from './maps/maps.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { GameRoomsModule } from './game-rooms/game-rooms.module';

@Module({
  imports: [DatabaseModule, RedisModule, AuthModule, MapsModule, GameRoomsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
