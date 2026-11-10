import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MapInfoEntity } from './map-info.entity';
import { MapReleaseEntity } from './map-release.entity';
import { UserSavedMapEntity } from './user-saved-map.entity';
import { UserEntity } from '../users/user.entity';
import { SHARE_CODE_ALPHABET, SHARE_CODE_LENGTH } from './deploy.service';

const CODE_PATTERN = new RegExp(`^[${SHARE_CODE_ALPHABET}]{${SHARE_CODE_LENGTH}}$`);

export interface SharedMapSummary {
  code: string;
  releaseId: string;
  version: number;
  title: string;
  difficulty: number;
  minUser: number;
  maxUser: number;
  mapDesc: string | null;
  ownerNickname: string;
  publishedAt: Date;
}

// Everything a player (including guests) can do with a map they only know by
// its code. Content always comes from the latest release, never the author's
// working copy.
@Injectable()
export class SharedMapsService {
  constructor(
    @InjectRepository(MapInfoEntity) private readonly maps: Repository<MapInfoEntity>,
    @InjectRepository(MapReleaseEntity) private readonly releases: Repository<MapReleaseEntity>,
    @InjectRepository(UserSavedMapEntity) private readonly saved: Repository<UserSavedMapEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {}

  async getSummary(rawCode: string): Promise<SharedMapSummary> {
    const { map, release } = await this.findShared(rawCode);
    return this.toSummary(map, release);
  }

  // Official maps for everyone's "create room" list. Newest first.
  async listFeatured() {
    const maps = await this.maps.find({
      where: { featured: true, deploy: true },
      order: { created_at: 'ASC' },
    });
    if (!maps.length) return [];
    const latest = await this.latestReleases(maps.map((map) => map.id));
    const entries: Array<SharedMapSummary & { available: boolean }> = [];
    for (const map of maps) {
      const release = latest.get(map.id);
      if (!map.share_code || !release) continue;
      entries.push({ ...(await this.toSummary(map, release)), available: true });
    }
    return entries;
  }

  async getLayout(rawCode: string) {
    const { release } = await this.findShared(rawCode);
    return { version: release.version, releaseId: release.id, layout: release.layout };
  }

  async getLayoutByRelease(releaseId: string) {
    const release = await this.releases.findOne({ where: { id: releaseId } });
    if (!release) throw new NotFoundException('맵 데이터를 찾을 수 없습니다.');
    return { version: release.version, releaseId: release.id, layout: release.layout };
  }

  // --- a logged-in user's saved list ---------------------------------------

  async listSaved(userId: string) {
    const rows = await this.saved.find({ where: { user_id: userId }, order: { last_played_at: 'DESC' } });
    if (!rows.length) return [];

    const maps = await this.maps.find({ where: { id: In(rows.map((row) => row.map_id)) } });
    const mapById = new Map(maps.map((map) => [map.id, map]));
    const latest = await this.latestReleases(maps.map((map) => map.id));

    const entries: Array<SharedMapSummary & { available: boolean }> = [];
    for (const row of rows) {
      const map = mapById.get(row.map_id);
      const release = map && latest.get(map.id);
      if (!map?.share_code || !release) continue;
      const summary = await this.toSummary(map, release);
      // Unshared maps stay in the list (greyed out) so a redeploy brings them back.
      entries.push({ ...summary, available: map.deploy });
    }
    return entries;
  }

  async addSaved(userId: string, rawCode: string) {
    const { map, release } = await this.findShared(rawCode);
    await this.saved.upsert(
      { user_id: userId, map_id: map.id, last_played_at: new Date() },
      ['user_id', 'map_id'],
    );
    return { ...(await this.toSummary(map, release)), available: true };
  }

  async removeSaved(userId: string, rawCode: string) {
    const code = this.normalizeCode(rawCode);
    const map = code && (await this.maps.findOne({ where: { share_code: code } }));
    if (map) await this.saved.delete({ user_id: userId, map_id: map.id });
  }

  // --- helpers ---------------------------------------------------------------

  private normalizeCode(rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    return CODE_PATTERN.test(code) ? code : null;
  }

  // 404 for malformed, unknown, and unshared codes alike — nothing tells them apart.
  private async findShared(rawCode: string) {
    const code = this.normalizeCode(rawCode);
    const map = code && (await this.maps.findOne({ where: { share_code: code, deploy: true } }));
    const release =
      map && (await this.releases.findOne({ where: { map_id: map.id }, order: { version: 'DESC' } }));
    if (!map || !release) throw new NotFoundException('존재하지 않거나 공개되지 않은 맵 코드입니다.');
    return { map, release };
  }

  private async latestReleases(mapIds: string[]) {
    const rows: MapReleaseEntity[] = await this.releases
      .createQueryBuilder('r')
      .distinctOn(['r.map_id'])
      .where('r.map_id IN (:...mapIds)', { mapIds })
      .orderBy('r.map_id')
      .addOrderBy('r.version', 'DESC')
      .getMany();
    return new Map(rows.map((row) => [row.map_id, row]));
  }

  private async toSummary(map: MapInfoEntity, release: MapReleaseEntity): Promise<SharedMapSummary> {
    const owner = await this.users.findOne({ where: { id: map.owner_id }, select: ['nickname'] });
    return {
      code: map.share_code!,
      releaseId: release.id,
      version: release.version,
      title: release.title,
      difficulty: release.difficulty,
      minUser: release.min_user,
      maxUser: release.max_user,
      mapDesc: release.map_desc,
      ownerNickname: owner?.nickname ?? '알 수 없음',
      publishedAt: release.published_at,
    };
  }
}
