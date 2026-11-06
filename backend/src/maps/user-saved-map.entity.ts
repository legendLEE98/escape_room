import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'user_saved_maps' })
export class UserSavedMapEntity {
  @PrimaryColumn({ type: 'uuid' })
  user_id!: string;

  @PrimaryColumn({ type: 'uuid' })
  map_id!: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  last_played_at!: Date;
}
