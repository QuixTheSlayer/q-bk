# q-bk

A NestJS API with a JWT-based authentication module (register, login, token refresh,
logout) and interactive Swagger API docs.

## Requirements

- Node.js
- npm

## Setup

```bash
npm install
```

Create a `.env` file in the project root (values below are safe local defaults — set
real secrets before deploying anywhere else):

```
OBSERVE_APP_KEY=0
OBSERVE_APP_SECRET=0

JWT_ACCESS_SECRET=dev-access-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=dev-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d
```

## Running the app

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
```

The API listens on `http://localhost:3000` by default (override with `PORT`).

## API docs

Once the app is running, interactive Swagger UI is available at:

```
http://localhost:3000/api/docs
```

Raw OpenAPI JSON: `http://localhost:3000/api/docs-json`.

## Auth module

The app ships with a full JWT auth flow under `/auth`:

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Create an account, returns a token pair |
| POST | `/auth/login` | No | Log in with email/password, returns a token pair |
| POST | `/auth/refresh` | No | Exchange a refresh token for a new token pair |
| POST | `/auth/logout` | Bearer | Revoke the current refresh token |
| GET | `/auth/me` | Bearer | Get the current authenticated user |

See:

- [`docs/auth.md`](docs/auth.md) — architecture, token flow, config, and how to extend
  this module (e.g. swap the in-memory user store for a real database).
- [`docs/nestjs-auth-tutorial.md`](docs/nestjs-auth-tutorial.md) — a from-scratch,
  beginner-friendly tutorial for building this kind of auth module in NestJS.

## Testing

```bash
# unit tests
npm run test

# unit tests, watch mode
npm run test:watch

# end-to-end tests
npm run test:e2e

# coverage
npm run test:cov
```

## Linting & formatting

```bash
npm run lint
npm run format
```

## Project structure

```
src/
  auth/            # JWT auth module (service, controller, guards, strategies, DTOs)
  types/           # Shared TypeScript types
  app.module.ts    # Root module
  main.ts          # Bootstrap, Swagger setup, global validation
docs/
  auth.md                    # Auth module developer docs
  nestjs-auth-tutorial.md    # Beginner tutorial for building JWT auth in NestJS
```

## Observability

This app is instrumented with [NestJS Observe](https://observe.nestjs.com) for
distributed tracing, metrics, and logging. Configure it via the `OBSERVE_APP_KEY` and
`OBSERVE_APP_SECRET` environment variables.

## Built with

[NestJS](https://nestjs.com) — a progressive Node.js framework for building efficient,
scalable server-side applications.
