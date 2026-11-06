import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { MapInfoEntity } from './map-info.entity';
import { MapRoomEntity } from './map-room.entity';
import { MapObjectEntity } from './map-object.entity';
import { MapDoorEntity } from './map-door.entity';
import { MapDoorEdgeEntity } from './map-door-edge.entity';
import { MapExitEdgeEntity } from './map-exit-edge.entity';
import { MapInteractionEntity } from './map-interaction.entity';
import type { LayoutRoomDto, MapLayoutDto } from './dto/map-layout.dto';
import { DoorLockType } from './map-door.entity';

@Injectable()
export class MapsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MapInfoEntity)
    private readonly mapInfoRepo: Repository<MapInfoEntity>,
    @InjectRepository(MapRoomEntity)
    private readonly roomRepo: Repository<MapRoomEntity>,
    @InjectRepository(MapObjectEntity)
    private readonly objectRepo: Repository<MapObjectEntity>,
    @InjectRepository(MapDoorEntity)
    private readonly doorRepo: Repository<MapDoorEntity>,
    @InjectRepository(MapDoorEdgeEntity)
    private readonly doorEdgeRepo: Repository<MapDoorEdgeEntity>,
    @InjectRepository(MapExitEdgeEntity)
    private readonly exitEdgeRepo: Repository<MapExitEdgeEntity>,
    @InjectRepository(MapInteractionEntity)
    private readonly interactionRepo: Repository<MapInteractionEntity>,
  ) {}

  // --- map_info (metadata) -------------------------------------------------
  // Separate from layout save/load, and separate from "deploy" (map_info.deploy
  // just gets flipped by a future publish action — not touched here).

  // Every authoring method is scoped to the owner. A map that exists but
  // belongs to someone else is reported as 404, not 403, so ids can't be
  // probed for existence.
  listMaps(ownerId: string) {
    return this.mapInfoRepo.find({
      where: { owner_id: ownerId },
      order: { created_at: 'DESC' },
    });
  }

  async getMapInfo(mapId: string, ownerId: string) {
    const map = await this.mapInfoRepo.findOne({
      where: { id: mapId, owner_id: ownerId },
    });
    if (!map) throw new NotFoundException(`Map ${mapId} not found`);
    return map;
  }

  createMap(
    ownerId: string,
    input: {
      title: string;
      difficulty?: number;
      minUser?: number;
      maxUser?: number;
    },
  ) {
    const map = this.mapInfoRepo.create({
      owner_id: ownerId,
      title: input.title,
      difficulty: input.difficulty ?? 1,
      min_user: input.minUser ?? 1,
      max_user: input.maxUser ?? 4,
    });
    return this.mapInfoRepo.save(map);
  }

  async updateMapInfo(
    mapId: string,
    ownerId: string,
    patch: Partial<{
      title: string;
      difficulty: number;
      min_user: number;
      max_user: number;
      map_desc: string;
    }>,
  ) {
    await this.getMapInfo(mapId, ownerId); // 404s if missing or not owned
    await this.mapInfoRepo.update(mapId, patch);
    return this.getMapInfo(mapId, ownerId);
  }

  async deleteMap(mapId: string, ownerId: string) {
    await this.getMapInfo(mapId, ownerId); // 404s if missing or not owned
    await this.mapInfoRepo.delete(mapId);
  }

  // --- layout (rooms/objects/doors) ---------------------------------------
  // This is the "저장/불러오기" the editor's Ctrl+S-equivalent drives — always
  // writes/reads the map's current (non-archived) working state. Every save
  // replaces the map's entire room/object/door graph in one transaction
  // rather than diffing — simplest correct approach given the editor always
  // sends the full current layout anyway (see persistence.js's
  // ctx.serializeLayout()).

  async loadLayout(mapId: string, ownerId: string): Promise<MapLayoutDto> {
    await this.getMapInfo(mapId, ownerId); // 404s if missing or not owned

    const rooms = await this.roomRepo.find({
      where: { map_id: mapId },
      order: { created_at: 'ASC' },
    });
    const roomIds = rooms.map((room) => room.id);

    const [objects, edges, exits] = await Promise.all([
      roomIds.length
        ? this.objectRepo.find({ where: { room_id: In(roomIds) } })
        : Promise.resolve([]),
      roomIds.length
        ? this.doorEdgeRepo.find({ where: { room_id: In(roomIds) } })
        : Promise.resolve([]),
      roomIds.length
        ? this.exitEdgeRepo.find({ where: { room_id: In(roomIds) } })
        : Promise.resolve([]),
    ]);

    const objectIds = objects.map((object) => object.id);
    const interactions = objectIds.length
      ? await this.interactionRepo.find({ where: { object_id: In(objectIds) } })
      : [];
    const interactionByObjectId = new Map(
      interactions.map((interaction) => [interaction.object_id, interaction]),
    );

    const doorIds = [
      ...new Set([...edges, ...exits].map((edge) => edge.door_id)),
    ];
    const doors = doorIds.length
      ? await this.doorRepo.find({ where: { id: In(doorIds) } })
      : [];
    const doorById = new Map(doors.map((door) => [door.id, door]));

    return {
      rooms: rooms.map((room) => ({
        id: room.id,
        roomName: room.room_name,
        isStartRoom: room.is_start_room,
        initialSpawnPos: room.initial_spawn_pos,
        floorCells: room.floor_cells,
        worldOffset: room.world_offset,
        doorEdges: edges
          .filter((edge) => edge.room_id === room.id)
          .map((edge) => {
            const door = doorById.get(edge.door_id);
            return {
              x: edge.x,
              z: edge.z,
              side: edge.side,
              connectedRoomId: edge.connected_room_id,
              doorId: edge.door_id,
              lockType: door?.lock_type ?? DoorLockType.NONE,
              password: door?.password ?? '',
              requiredButtonId: door?.required_button_object_id ?? null,
            };
          }),
        exitEdges: exits
          .filter((exit) => exit.room_id === room.id)
          .map((exit) => {
            const door = doorById.get(exit.door_id);
            return {
              x: exit.x,
              z: exit.z,
              side: exit.side,
              exitId: exit.door_id,
              lockType: door?.lock_type ?? DoorLockType.NONE,
              password: door?.password ?? '',
              requiredButtonId: door?.required_button_object_id ?? null,
            };
          }),
        objects: objects
          .filter((object) => object.room_id === room.id)
          .map((object) => {
            const interaction = interactionByObjectId.get(object.id);
            return {
              id: object.id,
              name: object.name,
              glbUrl: object.glb_url,
              transform: {
                position: object.position,
                rotation: object.rotation,
                scale: object.scale,
              },
              castShadow: object.cast_shadow,
              receiveShadow: object.receive_shadow,
              blocksMovement: object.blocks_movement,
              colliderShape: object.collider_shape,
              useGravity: object.use_gravity,
              isSpawnPoint: object.is_spawn_point,
              visible: object.visible,
              parentObjectId: object.parent_object_id,
              interaction: interaction
                ? {
                    interactionType: interaction.interaction_type,
                    bgImageUrl: interaction.bg_image_url,
                    memoText: interaction.memo_text,
                    choiceOptions: interaction.choice_options,
                  }
                : null,
            };
          }),
      })),
    };
  }

  async saveLayout(
    mapId: string,
    ownerId: string,
    layout: MapLayoutDto,
  ): Promise<MapLayoutDto> {
    await this.getMapInfo(mapId, ownerId); // 404s if missing or not owned

    await this.dataSource.transaction(async (manager) => {
      await this.clearExistingLayout(manager, mapId);
      await this.insertLayout(manager, mapId, layout);
    });

    return this.loadLayout(mapId, ownerId);
  }

  private async clearExistingLayout(manager: EntityManager, mapId: string) {
    const existingRooms = await manager.find(MapRoomEntity, {
      where: { map_id: mapId },
      select: ['id'],
    });
    const roomIds = existingRooms.map((room) => room.id);
    if (!roomIds.length) return;

    // map_door isn't reachable from map_room by a direct FK (it's keyed by
    // doorId, shared across the two rooms a door connects), so its rows would
    // be orphaned by a plain cascade delete — capture which ones to remove
    // before the cascade fires.
    const edges = await manager.find(MapDoorEdgeEntity, {
      where: { room_id: In(roomIds) },
      select: ['door_id'],
    });
    const exits = await manager.find(MapExitEdgeEntity, {
      where: { room_id: In(roomIds) },
      select: ['door_id'],
    });
    const doorIds = [
      ...new Set([...edges, ...exits].map((edge) => edge.door_id)),
    ];

    await manager.delete(MapRoomEntity, roomIds); // cascades map_object, map_door_edge, map_interaction
    if (doorIds.length) await manager.delete(MapDoorEntity, doorIds);
  }

  private async insertLayout(
    manager: EntityManager,
    mapId: string,
    layout: MapLayoutDto,
  ) {
    const roomIdMap = new Map<string, string>(); // payload room id -> db uuid
    const objectIdMap = new Map<string, string>(); // payload object id -> db uuid

    for (const room of layout.rooms) {
      const saved = await manager.save(
        manager.create(MapRoomEntity, {
          map_id: mapId,
          room_name: room.roomName,
          is_start_room: room.isStartRoom,
          initial_spawn_pos: room.initialSpawnPos,
          floor_cells: room.floorCells ?? [],
          world_offset: room.worldOffset ?? { x: 0, z: 0 },
        }),
      );
      roomIdMap.set(room.id, saved.id);
    }

    // Objects first without parent_object_id — a child can reference a
    // parent object anywhere in the payload, including one not yet inserted.
    for (const room of layout.rooms) {
      const dbRoomId = roomIdMap.get(room.id)!;
      for (const object of room.objects) {
        const saved = await manager.save(
          manager.create(MapObjectEntity, {
            room_id: dbRoomId,
            name: object.name,
            glb_url: object.glbUrl,
            position: object.transform.position,
            rotation: object.transform.rotation,
            scale: object.transform.scale,
            cast_shadow: object.castShadow,
            receive_shadow: object.receiveShadow,
            blocks_movement: object.blocksMovement,
            collider_shape: object.colliderShape,
            use_gravity: object.useGravity,
            is_spawn_point: object.isSpawnPoint,
            visible: object.visible,
            parent_object_id: null,
          }),
        );
        objectIdMap.set(object.id, saved.id);
      }
    }

    for (const room of layout.rooms) {
      for (const object of room.objects) {
        if (!object.parentObjectId) continue;
        const dbId = objectIdMap.get(object.id);
        const parentDbId = objectIdMap.get(object.parentObjectId);
        if (dbId && parentDbId)
          await manager.update(MapObjectEntity, dbId, {
            parent_object_id: parentDbId,
          });
      }
    }

    for (const room of layout.rooms) {
      for (const object of room.objects) {
        if (!object.interaction) continue;
        const dbId = objectIdMap.get(object.id);
        if (!dbId) continue;
        await manager.save(
          manager.create(MapInteractionEntity, {
            object_id: dbId,
            interaction_type: object.interaction.interactionType,
            memo_text: object.interaction.memoText,
            choice_options: object.interaction.choiceOptions,
            bg_image_url: object.interaction.bgImageUrl,
          }),
        );
      }
    }

    await this.insertDoors(
      manager,
      mapId,
      roomIdMap,
      objectIdMap,
      layout.rooms,
    );
  }

  private async insertDoors(
    manager: EntityManager,
    mapId: string,
    roomIdMap: Map<string, string>,
    objectIdMap: Map<string, string>,
    rooms: LayoutRoomDto[],
  ) {
    // A door is one row shared by both rooms it connects (keyed by doorId),
    // but each room's doorEdges array carries its own independent copy —
    // group back into one entry per doorId before writing map_door once.
    const edgesByDoorId = new Map<
      string,
      { room: LayoutRoomDto; edge: LayoutRoomDto['doorEdges'][number] }[]
    >();
    for (const room of rooms) {
      for (const edge of room.doorEdges) {
        // Edges without a doorId are pre-doorId legacy data (see
        // persistence.js) and can't be matched to their other side reliably
        // — dropped rather than guessed at.
        if (!edge.doorId) continue;
        if (!edgesByDoorId.has(edge.doorId)) edgesByDoorId.set(edge.doorId, []);
        edgesByDoorId.get(edge.doorId)!.push({ room, edge });
      }
    }

    for (const [doorId, entries] of edgesByDoorId) {
      // Only one side ever carries real lock values (ctx.resolveCanonicalDoorEdge
      // on the frontend) — take whichever side actually has one, or either if
      // both are 'none'.
      const canonical =
        entries.find(({ edge }) => edge.lockType !== 'none') ?? entries[0];
      const requiredButtonDbId = canonical.edge.requiredButtonId
        ? (objectIdMap.get(canonical.edge.requiredButtonId) ?? null)
        : null;

      await manager.save(
        manager.create(MapDoorEntity, {
          id: doorId,
          map_id: mapId,
          lock_type: canonical.edge.lockType,
          password: canonical.edge.password ?? '',
          required_button_object_id: requiredButtonDbId,
        }),
      );

      for (const { room, edge } of entries) {
        const connectedRoomDbId = edge.connectedRoomId
          ? roomIdMap.get(edge.connectedRoomId)
          : undefined;
        if (!connectedRoomDbId) continue; // connected room missing from this save — skip a dangling edge
        await manager.save(
          manager.create(MapDoorEdgeEntity, {
            door_id: doorId,
            room_id: roomIdMap.get(room.id)!,
            x: edge.x,
            z: edge.z,
            side: edge.side,
            connected_room_id: connectedRoomDbId,
          }),
        );
      }
    }

    // Exits: same lock row in map_door (keyed by exitId), plus where it sits.
    for (const room of rooms) {
      for (const exit of room.exitEdges ?? []) {
        if (!exit.exitId) continue;
        const requiredButtonDbId = exit.requiredButtonId
          ? (objectIdMap.get(exit.requiredButtonId) ?? null)
          : null;
        await manager.save(
          manager.create(MapDoorEntity, {
            id: exit.exitId,
            map_id: mapId,
            lock_type: exit.lockType,
            password: exit.password ?? '',
            required_button_object_id: requiredButtonDbId,
          }),
        );
        await manager.save(
          manager.create(MapExitEdgeEntity, {
            door_id: exit.exitId,
            room_id: roomIdMap.get(room.id)!,
            x: exit.x,
            z: exit.z,
            side: exit.side,
          }),
        );
      }
    }
  }
}
