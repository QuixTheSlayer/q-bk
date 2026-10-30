import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createFakeUserRepository } from './testing/fake-user.repository.js';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'test-secret' }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        UsersService,
        { provide: getRepositoryToken(User), useValue: createFakeUserRepository() },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback?: unknown) => fallback },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('registers a user via the controller', async () => {
    const result = await controller.register({
      email: 'controller@example.com',
      password: 'password123',
    });

    expect(result.user.email).toBe('controller@example.com');
  });

  it('exposes the current user via me()', () => {
    const user = { id: '1', email: 'controller@example.com' };

    expect(controller.me(user)).toBe(user);
  });
});
