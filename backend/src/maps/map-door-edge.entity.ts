import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { MapDoorEntity } from './map-door.entity';
import { MapRoomEntity } from './map-room.entity';

export enum DoorSide {
  N = 'N',
  S = 'S',
  W = 'W',
  E = 'E',
}

// The room-side half of a door: which wall cell/side it opens on, and which
// room it leads to. Exactly two rows per map_door (one per side). Lock state
// is NOT here — see map-door.entity.ts.
@Entity({ name: 'map_door_edge' })
@Unique(['door_id', 'room_id'])
export class MapDoorEdgeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  door_id!: string;

  @ManyToOne(() => MapDoorEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'door_id' })
  door?: MapDoorEntity;

  @Column({ type: 'uuid' })
  room_id!: string;

  @ManyToOne(() => MapRoomEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room?: MapRoomEntity;

  @Column({ type: 'smallint' })
  x!: number;

  @Column({ type: 'smallint' })
  z!: number;

  @Column({ type: 'enum', enum: DoorSide, enumName: 'map_door_edge_side' })
  side!: DoorSide;

  @Column({ type: 'uuid' })
  connected_room_id!: string;

  @ManyToOne(() => MapRoomEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connected_room_id' })
  connected_room?: MapRoomEntity;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
