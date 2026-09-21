import { Injectable } from '@nestjs/common';

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  refreshTokenHash: string | null;
}

/**
 * In-memory user store. Swap for a real database repository without
 * changing AuthService's contract.
 */
@Injectable()
export class UsersService {
  private readonly usersById = new Map<string, StoredUser>();
  private readonly usersByEmail = new Map<string, string>();
  private nextId = 1;

  findByEmail(email: string): StoredUser | undefined {
    const id = this.usersByEmail.get(email.toLowerCase());
    return id ? this.usersById.get(id) : undefined;
  }

  findById(id: string): StoredUser | undefined {
    return this.usersById.get(id);
  }

  create(email: string, passwordHash: string): StoredUser {
    const id = String(this.nextId++);
    const user: StoredUser = {
      id,
      email: email.toLowerCase(),
      passwordHash,
      refreshTokenHash: null,
    };
    this.usersById.set(id, user);
    this.usersByEmail.set(user.email, id);
    return user;
  }

  setRefreshTokenHash(userId: string, refreshTokenHash: string | null): void {
    const user = this.usersById.get(userId);
    if (!user) {
      return;
    }
    user.refreshTokenHash = refreshTokenHash;
  }
}
