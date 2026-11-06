import type { UserRole } from '../users/user.entity';

export interface AuthPayload {
  sub: string;
  kind: 'user' | 'guest';
  nickname: string;
  role: UserRole | 'guest';
}
