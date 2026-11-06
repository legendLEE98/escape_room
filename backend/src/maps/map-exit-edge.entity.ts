import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MapDoorEntity } from './map-door.entity';
import { MapRoomEntity } from './map-room.entity';
import { DoorSide } from './map-door-edge.entity';

// An exit: a door on one wall that leads out of the map instead of into
// another room. Reaching it clears the game. Its lock lives in map_door (same
// as any door); this row is only where it sits.
@Entity({ name: 'map_exit_edge' })
export class MapExitEdgeEntity {
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

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
