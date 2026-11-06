import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MapInfoEntity } from './map-info.entity';

@Entity({ name: 'map_room' })
export class MapRoomEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  map_id!: string;

  @ManyToOne(() => MapInfoEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'map_id' })
  map_info?: MapInfoEntity;

  @Column({ type: 'varchar', length: 100 })
  room_name!: string;

  @Column({ type: 'boolean', default: false })
  is_start_room!: boolean;

  // [x, y, z] — matches Vector3.toArray() on the frontend directly.
  @Column({ type: 'jsonb', default: () => "'[0, 0, 0]'" })
  initial_spawn_pos!: number[];

  // [{ x, z }, ...] — walls/doors are generated client-side from this, never stored separately.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  floor_cells!: Array<{ x: number; z: number }>;

  // { x, z } — editor-only layout offset for the room-link panel, unused by actual gameplay.
  @Column({ type: 'jsonb', default: () => '\'{"x": 0, "z": 0}\'' })
  world_offset!: { x: number; z: number };

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
