import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service.js';
import { createFakeUserRepository } from './testing/fake-user.repository.js';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        AuthService,
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: createFakeUserRepository(),
        },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback?: unknown) => fallback },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('registers a new user and returns tokens', async () => {
    const result = await service.register('user@example.com', 'password123');

    expect(result.user).toEqual({ id: '1', email: 'user@example.com' });
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('rejects duplicate registrations', async () => {
    await service.register('dup@example.com', 'password123');

    await expect(
      service.register('dup@example.com', 'password123'),
    ).rejects.toThrow(ConflictException);
  });

  it('logs in with correct credentials', async () => {
    await service.register('login@example.com', 'password123');

    const result = await service.login('login@example.com', 'password123');

    expect(result.user.email).toBe('login@example.com');
  });

  it('rejects login with wrong password', async () => {
    await service.register('wrong@example.com', 'password123');

    await expect(
      service.login('wrong@example.com', 'nope'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects login for unknown email', async () => {
    await expect(
      service.login('missing@example.com', 'password123'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('refreshes tokens with a valid refresh token', async () => {
    const { refreshToken } = await service.register(
      'refresh@example.com',
      'password123',
    );

    const result = await service.refresh(refreshToken);

    expect(result.user.email).toBe('refresh@example.com');
  });

  it('rejects refresh after logout', async () => {
    const { refreshToken, user } = await service.register(
      'logout@example.com',
      'password123',
    );

    await service.logout(user.id);

    await expect(service.refresh(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
