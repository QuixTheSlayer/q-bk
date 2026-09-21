# Building a JWT Auth Service in NestJS — A Beginner's Tutorial

This tutorial walks you through building a complete login/register system with JWT
tokens in a NestJS app, from an empty project to a working, testable auth module.
No prior auth experience assumed — just basic TypeScript and a little NestJS
(controllers, providers, modules).

By the end you'll have:

- `POST /auth/register` and `POST /auth/login`
- `POST /auth/refresh` to get new tokens without logging in again
- `POST /auth/logout`
- A `GET /auth/me` route protected by a login check
- Passwords stored safely (never in plain text)

---

## 1. The concepts, in plain language

Before writing code, three ideas you need in your head:

**Hashing passwords.** You never store a user's actual password. Instead you run it
through a one-way function (bcrypt) that turns `"password123"` into gibberish like
`$2a$10$N9qo8u...`. When the user logs in again, you hash what they typed and compare
the gibberish — you never "unhash" anything.

**JWT (JSON Web Token).** A JWT is a signed string that proves "this user logged in
successfully." It contains a payload (e.g. `{ userId: "1", email: "a@b.com" }`), and it's
signed with a secret key known only to your server. Anyone can *read* a JWT's payload
(it's just base64), but nobody can *forge* one without your secret. Your server checks
the signature on every request instead of looking the user up in a session store.

**Access token vs. refresh token.** One token isn't enough on its own:

- The **access token** is short-lived (minutes). It's sent with every request as proof
  of login. If it leaks, the damage window is small because it expires fast.
- The **refresh token** is long-lived (days/weeks). It's only used to request a new
  access token when the old one expires, so the user doesn't have to log in constantly.

Two tokens = short-lived convenience + long-lived safety net.

---

## 2. Prerequisites

- Node.js installed
- A NestJS project. If you don't have one:

```bash
npm i -g @nestjs/cli
nest new my-app
cd my-app
```

Install the packages this tutorial uses:

```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs @nestjs/config class-validator class-transformer
npm install -D @types/passport-jwt @types/bcryptjs
```

What each one does:

| Package | Role |
|---|---|
| `@nestjs/jwt` | Sign and verify JWTs. |
| `@nestjs/passport` + `passport` + `passport-jwt` | Plug JWT verification into NestJS's guard system. |
| `bcryptjs` | Hash passwords and refresh tokens. |
| `@nestjs/config` | Read secrets from a `.env` file. |
| `class-validator` + `class-transformer` | Validate request bodies (e.g. reject a bad email). |

---

## 3. Project layout

Everything auth-related lives in one folder:

```
src/
  auth/
    dto/
      register.dto.ts
      login.dto.ts
      refresh-token.dto.ts
    strategies/
      jwt.strategy.ts
    guards/
      jwt-auth.guard.ts
    decorators/
      current-user.decorator.ts
    users.service.ts
    auth.service.ts
    auth.controller.ts
    auth.module.ts
  types/
    auth.types.ts
```

---

## 4. Define shared types

These are the shapes we'll pass around: what goes *into* a token, and what comes
*out* of a successful login.

```ts
// src/types/auth.types.ts
export interface JwtPayload {
  sub: string;   // "subject" — the user's id. This is a JWT convention, not a NestJS one.
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthResponse extends AuthTokens {
  user: AuthenticatedUser;
}
```

---

## 5. Validate incoming requests with DTOs

A DTO (Data Transfer Object) describes what a request body should look like.
`class-validator` decorators reject bad input automatically once we wire up a
`ValidationPipe` in step 11.

```ts
// src/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

```ts
// src/auth/dto/login.dto.ts
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
```

```ts
// src/auth/dto/refresh-token.dto.ts
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
```

---

## 6. Store users somewhere

A real app would use a database. To keep this tutorial focused on *auth*, we'll use a
simple in-memory store — a `Map`. It's a real, working `@Injectable()` service; the only
thing to swap out later is what's inside it.

```ts
// src/auth/users.service.ts
import { Injectable } from '@nestjs/common';

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  refreshTokenHash: string | null;
}

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
    if (user) user.refreshTokenHash = refreshTokenHash;
  }
}
```

Why store a hash of the refresh token too? So that logging out can actually invalidate
it (explained in step 8).

---

## 7. Configure secrets

Create a `.env` file in your project root:

```
JWT_ACCESS_SECRET=change-me-access
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=change-me-refresh
JWT_REFRESH_EXPIRES_IN=7d
```

Make sure `.env` is in `.gitignore` — secrets never get committed. Use two *different*
secrets for access vs. refresh tokens, so a leaked access-token secret can't be used to
forge refresh tokens.

---

## 8. Write the AuthService — the core logic

This is where registration, login, refreshing, and logout actually happen.

```ts
// src/auth/auth.service.ts
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { AuthResponse, AuthTokens, JwtPayload } from '../types/auth.types.js';
import { UsersService, type StoredUser } from './users.service.js';

const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(email: string, password: string): Promise<AuthResponse> {
    if (this.usersService.findByEmail(email)) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const user = this.usersService.create(email, passwordHash);
    return this.issueTokens(user);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = this.usersService.findById(payload.sub);
    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const tokenMatches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!tokenMatches) throw new UnauthorizedException('Refresh token has been revoked');

    return this.issueTokens(user); // rotate: old refresh token stops working
  }

  async logout(userId: string): Promise<void> {
    this.usersService.setRefreshTokenHash(userId, null);
  }

  private async issueTokens(user: StoredUser): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as JwtSignOptions['expiresIn'],
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as JwtSignOptions['expiresIn'],
      }),
    ]);

    // Store a hash of the refresh token, not the token itself — same idea as passwords.
    const refreshTokenHash = await bcrypt.hash(refreshToken, PASSWORD_SALT_ROUNDS);
    this.usersService.setRefreshTokenHash(user.id, refreshTokenHash);

    return this.buildResponse(user, { accessToken, refreshToken });
  }

  private buildResponse(user: StoredUser, tokens: AuthTokens): AuthResponse {
    return { ...tokens, user: { id: user.id, email: user.email } };
  }
}
```

**Why `logout` works:** the refresh endpoint checks the *stored* hash before issuing new
tokens. Clearing that hash on logout means the next refresh attempt fails, even though
the JWT itself would still technically verify (it hasn't expired). This is the trick to
"revoking" a token that's otherwise just a signed string nobody can invalidate directly.

**Why refresh "rotates" the token:** every successful refresh generates a brand-new
refresh token and overwrites the stored hash. So each refresh token is single-use — if
someone steals an old one and the real user has already refreshed, the stolen one no
longer matches.

---

## 9. Protect routes with a Passport JWT strategy

A "strategy" tells Passport *how* to check a token. We tell it: pull the token from the
`Authorization: Bearer <token>` header, verify it against our secret, then look up the
user it belongs to.

```ts
// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser, JwtPayload } from '../../types/auth.types.js';
import { UsersService } from '../users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService, private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    const user = this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User no longer exists');
    return { id: user.id, email: user.email };
  }
}
```

Whatever `validate()` returns gets attached to `request.user` automatically — that's a
Passport convention.

Turn the strategy into a reusable guard:

```ts
// src/auth/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

And a small decorator so controllers can grab the logged-in user without touching
`request` directly:

```ts
// src/auth/decorators/current-user.decorator.ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../types/auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
```

---

## 10. The controller — wiring HTTP to the service

```ts
// src/auth/auth.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser, AuthResponse } from '../types/auth.types.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto.email, dto.password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.authService.logout(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
```

`@UseGuards(JwtAuthGuard)` is the whole trick to "protecting" a route — without it,
anyone can call the endpoint; with it, only requests with a valid access token get
through.

---

## 11. Tie it together in a module

```ts
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UsersService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

Then register it in your root module, and turn on `.env` support + request validation:

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
  ],
})
export class AppModule {}
```

```ts
// src/main.ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

`ValidationPipe` is what actually enforces the `@IsEmail()`/`@MinLength()` decorators on
your DTOs — without it they're just annotations that do nothing.

---

## 12. Try it out

Start the app:

```bash
npm run start:dev
```

Register a user:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"password123"}'
```

You'll get back something like:

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "user": { "id": "1", "email": "a@b.com" }
}
```

Call the protected route using the access token:

```bash
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer <paste accessToken here>"
```

Refresh once the access token is close to expiring:

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<paste refreshToken here>"}'
```

Log out (revokes the refresh token, requires a valid access token):

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <paste accessToken here>"
```

---

## 13. Common beginner mistakes to avoid

- **Using one secret for both access and refresh tokens.** If it leaks, both token types
  are compromised at once.
- **Storing the raw refresh token instead of a hash.** If your data store leaks, every
  refresh token leaks in plaintext, usable immediately.
- **Making access tokens long-lived "for convenience."** Then a stolen access token stays
  valid for a long time with no way to revoke it early (unless you build a blocklist).
- **Forgetting `ValidationPipe`.** Your `class-validator` decorators are silently ignored
  without it — bad input reaches your service unfiltered.
- **Comparing passwords with `===`.** Always use `bcrypt.compare()`; hashes of the same
  password differ each time due to the salt, so string equality never works.

---

## 14. Where to go from here

- Swap the in-memory `UsersService` for a real database (Prisma, TypeORM, etc.) — keep
  the same method names and nothing else needs to change.
- Add roles (`admin`, `user`) to the JWT payload and write a `RolesGuard`.
- Add Swagger (`@nestjs/swagger`) to get interactive API docs and a "try it out" UI for
  these endpoints.
- Add rate limiting on `/auth/login` to slow down brute-force attempts.

---

*Tip: to turn this file into a PDF, upload it to [claude.ai](https://claude.ai) and ask
Claude to convert it, or open it in any Markdown editor (e.g. VS Code with a
"Markdown PDF" extension) and export to PDF.*
