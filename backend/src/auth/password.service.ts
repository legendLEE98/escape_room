import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  // Verified against when the email doesn't exist, so a missing account and a
  // wrong password cost the same time and can't be told apart by latency.
  private dummyHash: Promise<string> | null = null;

  hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string) {
    return argon2.verify(hash, password).catch(() => false);
  }

  async verifyAgainstDummy(password: string) {
    this.dummyHash ??= this.hash('dummy-password-for-timing');
    await this.verify(await this.dummyHash, password);
  }
}
