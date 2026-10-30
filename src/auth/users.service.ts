import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

export type StoredUser = User;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<StoredUser | null> {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<StoredUser | null> {
    return this.users.findOne({ where: { id } });
  }

  create(email: string, passwordHash: string): Promise<StoredUser> {
    return this.users.save(
      this.users.create({
        email: email.toLowerCase(),
        passwordHash,
        refreshTokenHash: null,
      }),
    );
  }

  async setRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.users.update({ id: userId }, { refreshTokenHash });
  }
}
