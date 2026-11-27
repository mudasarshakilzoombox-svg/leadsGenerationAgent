import { hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';
import { ARGON2_PARAMS, needsRehash, normalizePassword } from '../domain/identity.js';

/** argon2id hashing (08-authentication.md §3). Passwords are NFKC-normalized first. */
@Injectable()
export class PasswordHasher {
  /** Verified against for unknown accounts so both paths cost the same (no timing oracle). */
  private readonly dummyHash: Promise<string> = this.hash('dummy password for timing equalization');

  hash(password: string): Promise<string> {
    return hash(normalizePassword(password), ARGON2_PARAMS);
  }

  async verify(storedHash: string | null | undefined, password: string): Promise<boolean> {
    const target = storedHash ?? (await this.dummyHash);
    try {
      const ok = await verify(target, normalizePassword(password));
      return ok && Boolean(storedHash);
    } catch {
      return false;
    }
  }

  needsRehash(storedHash: string): boolean {
    return needsRehash(storedHash);
  }
}
