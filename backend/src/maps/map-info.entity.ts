import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'map_info' })
export class MapInfoEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  owner_id!: string;

  @Column({ type: 'varchar', length: 100 })
  title!: string;

  @Column({ type: 'varchar', length: 50, default: 'DEFAULT' })
  filter!: string;

  @Column({ type: 'smallint', default: 1 })
  difficulty!: number;

  @Column({ type: 'text', nullable: true })
  map_desc!: string | null;

  @Column({ type: 'smallint', default: 1 })
  min_user!: number;

  @Column({ type: 'smallint', default: 4 })
  max_user!: number;

  @Column({ type: 'boolean', default: false })
  deploy!: boolean;

  @Column({ type: 'varchar', length: 8, nullable: true, unique: true })
  share_code!: string | null;

  @Column({ type: 'integer', default: 0 })
  release_version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
