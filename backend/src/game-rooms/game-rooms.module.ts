import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MapsModule } from '../maps/maps.module';
import { GameRoomsController } from './game-rooms.controller';
import { GameRoomsGateway } from './game-rooms.gateway';
import { GameRoomsService } from './game-rooms.service';

@Module({
  imports: [AuthModule, MapsModule],
  controllers: [GameRoomsController],
  providers: [GameRoomsService, GameRoomsGateway],
})
export class GameRoomsModule {}
