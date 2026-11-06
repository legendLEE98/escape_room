import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MapInfoEntity } from './map-info.entity';
import { MapObjectEntity } from './map-object.entity';

export enum DoorLockType {
  NONE = 'none',
  BUTTON = 'button',
  PASSWORD = 'password',
  KEY = 'key',
}

// One row per door (== doorId in the frontend JSON). Lock state lives here
// exactly once — never duplicated per side — so the "locked on one side,
// open on the other" contradiction the editor's canonical-edge logic guards
// against can't happen at the schema level at all. See db/schema.sql.
@Entity({ name: 'map_door' })
export class MapDoorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Denormalized (derivable via either map_door_edge -> map_room -> map_id)
  // so deleting a map cascades all the way down to its doors — otherwise
  // nothing points back at map_door and it leaks as an orphan row.
  @Column({ type: 'uuid' })
  map_id!: string;

  @ManyToOne(() => MapInfoEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'map_id' })
  map_info?: MapInfoEntity;

  @Column({
    type: 'enum',
    enum: DoorLockType,
    enumName: 'map_door_lock_type',
    default: DoorLockType.NONE,
  })
  lock_type!: DoorLockType;

  @Column({ type: 'varchar', length: 100, default: '' })
  password!: string;

  @Column({ type: 'uuid', nullable: true })
  required_button_object_id!: string | null;

  @ManyToOne(() => MapObjectEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'required_button_object_id' })
  required_button_object?: MapObjectEntity | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
