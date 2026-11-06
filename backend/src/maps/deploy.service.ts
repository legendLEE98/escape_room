import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomInt } from 'node:crypto';
import { DataSource } from 'typeorm';
import { MapsService } from './maps.service';
import { MapInfoEntity } from './map-info.entity';
import { MapReleaseEntity } from './map-release.entity';
import { UserSavedMapEntity } from './user-saved-map.entity';
import type { MapLayoutDto } from './dto/map-layout.dto';

// No 0/O/1/I — codes get read aloud and typed by hand.
export const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 8;
const CODE_RETRIES = 8;

@Injectable()
export class DeployService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly maps: MapsService,
  ) {}

  // Snapshots the *saved* working copy as the next version and shares it by
  // code. The caller (editor UI) is responsible for saving first.
  async deploy(mapId: string, ownerId: string) {
    await this.maps.getMapInfo(mapId, ownerId); // 404s if missing or not owned
    const layout = await this.maps.loadLayout(mapId, ownerId);
    this.assertPlayable(layout);

    return this.dataSource.transaction(async (manager) => {
      // Serializes concurrent deploys of the same map so versions stay gapless.
      const map = await manager.findOneOrFail(MapInfoEntity, {
        where: { id: mapId, owner_id: ownerId },
        lock: { mode: 'pessimistic_write' },
      });

      const version = map.release_version + 1;
      await manager.save(
        manager.create(MapReleaseEntity, {
          map_id: map.id,
          version,
          title: map.title,
          difficulty: map.difficulty,
          min_user: map.min_user,
          max_user: map.max_user,
          map_desc: map.map_desc,
          layout,
        }),
      );

      const shareCode = map.share_code ?? (await this.mintShareCode(manager));
      await manager.update(MapInfoEntity, map.id, {
        deploy: true,
        share_code: shareCode,
        release_version: version,
      });

      // The author can play their own map right away.
      await manager.upsert(
        UserSavedMapEntity,
        { user_id: ownerId, map_id: map.id, last_played_at: new Date() },
        ['user_id', 'map_id'],
      );

      return { shareCode, version };
    });
  }

  // The code and old releases are kept, so deploying again restores the link.
  async undeploy(mapId: string, ownerId: string) {
    await this.maps.getMapInfo(mapId, ownerId); // 404s if missing or not owned
    await this.dataSource.manager.update(MapInfoEntity, mapId, { deploy: false });
  }

  private assertPlayable(layout: MapLayoutDto) {
    const startRoom = layout.rooms.find((room) => room.isStartRoom);
    if (!startRoom) {
      throw new BadRequestException('시작 방이 없어 배포할 수 없습니다. 방을 하나 이상 만들어 주세요.');
    }
    if (!startRoom.objects.some((object) => object.isSpawnPoint)) {
      throw new BadRequestException(
        `시작 방 "${startRoom.roomName}"에 스폰 위치가 없습니다. 스폰 위치를 추가한 뒤 배포해 주세요.`,
      );
    }
    // Without an exit nobody could ever clear the map.
    if (!layout.rooms.some((room) => (room.exitEdges ?? []).length > 0)) {
      throw new BadRequestException(
        '탈출구가 없어 배포할 수 없습니다. 오브젝트 탭의 "탈출구 추가"로 클리어할 문을 하나 이상 만들어 주세요.',
      );
    }
  }

  private async mintShareCode(manager: DataSource['manager']) {
    for (let attempt = 0; attempt < CODE_RETRIES; attempt += 1) {
      let code = '';
      for (let i = 0; i < SHARE_CODE_LENGTH; i += 1) {
        code += SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)];
      }
      const taken = await manager.exists(MapInfoEntity, { where: { share_code: code } });
      if (!taken) return code;
    }
    throw new ConflictException('공유 코드를 만들지 못했습니다. 다시 시도해 주세요.');
  }
}
