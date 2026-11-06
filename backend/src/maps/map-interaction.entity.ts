import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MapObjectEntity } from './map-object.entity';

export enum InteractionType {
  MEMO = 'memo',
  CHOICE = 'choice',
  IMAGE = 'image',
  BUTTON = 'button',
}

export interface ChoiceOption {
  label: string;
  resultText: string;
}

@Entity({ name: 'map_interaction' })
export class MapInteractionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  object_id!: string;

  @OneToOne(() => MapObjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'object_id' })
  object?: MapObjectEntity;

  @Column({
    type: 'enum',
    enum: InteractionType,
    enumName: 'map_interaction_type',
  })
  interaction_type!: InteractionType;

  @Column({ type: 'text', nullable: true })
  memo_text!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  choice_options!: ChoiceOption[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bg_image_url!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
