import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../users/user.entity';
import { MapInfoEntity } from '../maps/map-info.entity';
import { MapRoomEntity } from '../maps/map-room.entity';
import { MapObjectEntity } from '../maps/map-object.entity';
import { MapDoorEntity } from '../maps/map-door.entity';
import { MapDoorEdgeEntity } from '../maps/map-door-edge.entity';
import { MapExitEdgeEntity } from '../maps/map-exit-edge.entity';
import { MapInteractionEntity } from '../maps/map-interaction.entity';
import { MapReleaseEntity } from '../maps/map-release.entity';
import { UserSavedMapEntity } from '../maps/user-saved-map.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      entities: [
        UserEntity,
        MapInfoEntity,
        MapRoomEntity,
        MapObjectEntity,
        MapDoorEntity,
        MapDoorEdgeEntity,
        MapExitEdgeEntity,
        MapInteractionEntity,
        MapReleaseEntity,
        UserSavedMapEntity,
      ],
      // db/schema.sql is the source of truth for the schema (applied by hand
      // via docker exec, see that file's header) — never auto-sync here.
      synchronize: false,
    }),
  ],
})
export class DatabaseModule {}
