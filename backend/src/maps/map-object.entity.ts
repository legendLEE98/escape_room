import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MapRoomEntity } from './map-room.entity';

export enum ColliderShape {
  BOX = 'box',
  CYLINDER = 'cylinder',
}

@Entity({ name: 'map_object' })
export class MapObjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  room_id!: string;

  @ManyToOne(() => MapRoomEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room?: MapRoomEntity;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  // null = empty object (no geometry, e.g. a folder/pivot or a spawn marker).
  @Column({ type: 'varchar', length: 255, nullable: true })
  glb_url!: string | null;

  @Column({ type: 'jsonb', default: () => "'[0, 0, 0]'" })
  position!: number[];

  @Column({ type: 'jsonb', default: () => "'[0, 0, 0]'" })
  rotation!: number[];

  @Column({ type: 'jsonb', default: () => "'[1, 1, 1]'" })
  scale!: number[];

  @Column({ type: 'boolean', default: true })
  cast_shadow!: boolean;

  @Column({ type: 'boolean', default: true })
  receive_shadow!: boolean;

  @Column({ type: 'boolean', default: true })
  blocks_movement!: boolean;

  @Column({
    type: 'enum',
    enum: ColliderShape,
    enumName: 'map_object_collider_shape',
    default: ColliderShape.BOX,
  })
  collider_shape!: ColliderShape;

  @Column({ type: 'boolean', default: false })
  use_gravity!: boolean;

  @Column({ type: 'boolean', default: false })
  is_spawn_point!: boolean;

  @Column({ type: 'boolean', default: true })
  visible!: boolean;

  @Column({ type: 'uuid', nullable: true })
  parent_object_id!: string | null;

  @ManyToOne(() => MapObjectEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parent_object_id' })
  parent?: MapObjectEntity | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
