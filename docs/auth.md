# Auth module

JWT-based authentication for the API, living under `src/auth/`.

## Overview

- Access tokens (short-lived) authenticate requests via `Authorization: Bearer <token>`.
- Refresh tokens (long-lived) are exchanged for a new token pair and are single-use: each
  refresh rotates the stored refresh token hash, and `logout` clears it, revoking future refreshes.
- Passwords and refresh tokens are hashed with `bcryptjs` — nothing sensitive is stored in plaintext.
- Users currently live in an in-memory store (`UsersService`). It's isolated behind a small
  interface (`findByEmail`, `findById`, `create`, `setRefreshTokenHash`) so it can be swapped for
  a real database repository without touching `AuthService`.

## Files

| File | Purpose |
|---|---|
| `auth.module.ts` | Wires `JwtModule`/`PassportModule` via `ConfigService`. |
| `auth.service.ts` | Core logic: register, login, refresh, logout, token issuing. |
| `auth.controller.ts` | HTTP routes, Swagger annotations. |
| `users.service.ts` | In-memory user store. |
| `strategies/jwt.strategy.ts` | Passport strategy that validates the access token and loads the user. |
| `guards/jwt-auth.guard.ts` | `AuthGuard('jwt')` — apply with `@UseGuards(JwtAuthGuard)`. |
| `decorators/current-user.decorator.ts` | `@CurrentUser()` param decorator, reads `request.user`. |
| `dto/*.ts` | Request/response DTOs with `class-validator` + `@ApiProperty` annotations. |
| `../types/auth.types.ts` | Shared types: `JwtPayload`, `AuthTokens`, `AuthenticatedUser`, `AuthResponse`. |

## Endpoints

All routes are under `/auth`. Full schemas are in Swagger UI at `/api/docs`.

| Method | Path | Auth required | Body | Description |
|---|---|---|---|---|
| POST | `/auth/register` | No | `{ email, password }` | Creates a user, returns a token pair. Fails with 409 if the email is taken. |
| POST | `/auth/login` | No | `{ email, password }` | Verifies credentials, returns a token pair. |
| POST | `/auth/refresh` | No | `{ refreshToken }` | Verifies + rotates the refresh token, returns a new token pair. |
| POST | `/auth/logout` | Yes (bearer) | — | Revokes the caller's stored refresh token. |
| GET | `/auth/me` | Yes (bearer) | — | Returns the authenticated user (`{ id, email }`). |

`register`/`login`/`refresh` all return an `AuthResponse`:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "1", "email": "user@example.com" }
}
```

## Token config

Read via `ConfigService` (backed by `@nestjs/config`, loaded from `.env`):

| Env var | Default | Purpose |
|---|---|---|
| `JWT_ACCESS_SECRET` | `dev-access-secret` | Signs/verifies access tokens. |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime. |
| `JWT_REFRESH_SECRET` | `dev-refresh-secret` | Signs/verifies refresh tokens. Must differ from the access secret. |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime. |

**Set real secrets in every non-local environment** — the defaults above are only meant for local
dev and are checked into `.env` (which is gitignored) as placeholders.

## Protecting a route

```ts
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../types/auth.types.js';

@UseGuards(JwtAuthGuard)
@Get('protected')
handler(@CurrentUser() user: AuthenticatedUser) {
  // user.id, user.email
}
```

In Swagger UI, click **Authorize** and paste an access token to call protected routes from the
docs page.

## Token flow

1. **Register/Login** — `AuthService` hashes/verifies the password with bcrypt, then calls
   `issueTokens`, which signs an access + refresh JWT (`{ sub: userId, email }`) and stores a
   bcrypt hash of the refresh token on the user record.
2. **Authenticated request** — `JwtAuthGuard` → `JwtStrategy.validate()` verifies the access
   token's signature/expiry, loads the user by `payload.sub`, and attaches
   `{ id, email }` to `request.user`.
3. **Refresh** — `AuthService.refresh()` verifies the refresh JWT against `JWT_REFRESH_SECRET`,
   compares it against the stored hash (rejecting if revoked/mismatched), then issues a brand new
   token pair — rotating the stored refresh hash.
4. **Logout** — clears the stored refresh token hash, so any refresh token issued before logout
   stops working. Access tokens already issued remain valid until they expire (there's no access
   token blocklist).

## Extending

- **Persisting users in a real database**: replace the `Map`-based storage in `UsersService` with
  a repository (TypeORM/Prisma/etc.), keeping the same public method signatures.
- **Roles/permissions**: add a `roles` field to the stored user and `JwtPayload`, then write a
  `RolesGuard` alongside `JwtAuthGuard`.
- **Access token revocation**: if you need immediate revocation (not just refresh-token
  revocation), swap short access-token expiry for a token blocklist/allowlist, or move to
  session-backed tokens.

## Testing

- `auth.service.spec.ts` covers register/login/refresh/logout, including duplicate-email and
  wrong-password rejections, and refresh failing after logout.
- `auth.controller.spec.ts` exercises the controller with an in-memory `AuthService`.
- Run with `npm test` (or `npx vitest run src/auth`).
