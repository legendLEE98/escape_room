import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MapsController } from './maps.controller';
import {
  SharedMapsController,
  SavedMapsController,
} from './shared-maps.controller';
import { SharedMapsService } from './shared-maps.service';
import { DeployService } from './deploy.service';
import { MapReleaseEntity } from './map-release.entity';
import { UserSavedMapEntity } from './user-saved-map.entity';
import { UserEntity } from '../users/user.entity';
import { MapsService } from './maps.service';
import { MapInfoEntity } from './map-info.entity';
import { MapRoomEntity } from './map-room.entity';
import { MapObjectEntity } from './map-object.entity';
import { MapDoorEntity } from './map-door.entity';
import { MapDoorEdgeEntity } from './map-door-edge.entity';
import { MapExitEdgeEntity } from './map-exit-edge.entity';
import { MapInteractionEntity } from './map-interaction.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      MapInfoEntity,
      MapRoomEntity,
      MapObjectEntity,
      MapDoorEntity,
      MapDoorEdgeEntity,
      MapExitEdgeEntity,
      MapInteractionEntity,
      MapReleaseEntity,
      UserSavedMapEntity,
      UserEntity,
    ]),
  ],
  controllers: [MapsController, SharedMapsController, SavedMapsController],
  providers: [MapsService, DeployService, SharedMapsService],
  exports: [SharedMapsService],
})
export class MapsModule {}
