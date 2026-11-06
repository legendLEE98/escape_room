import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { MapInfoEntity } from './map-info.entity';
import type { MapLayoutDto } from './dto/map-layout.dto';

// Immutable snapshot taken on each deploy. See db/schema.sql.
@Entity({ name: 'map_release' })
@Unique(['map_id', 'version'])
export class MapReleaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  map_id!: string;

  @ManyToOne(() => MapInfoEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'map_id' })
  map_info?: MapInfoEntity;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'varchar', length: 100 })
  title!: string;

  @Column({ type: 'smallint' })
  difficulty!: number;

  @Column({ type: 'smallint' })
  min_user!: number;

  @Column({ type: 'smallint' })
  max_user!: number;

  @Column({ type: 'text', nullable: true })
  map_desc!: string | null;

  @Column({ type: 'jsonb' })
  layout!: MapLayoutDto;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  published_at!: Date;
}
