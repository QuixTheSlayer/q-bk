import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';
export const BEARER_AUTH_NAME = 'access-token';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Q Backend API')
    .setDescription(
      [
        'REST API for the Q backend.',
        '',
        '## Authentication',
        '1. `POST /auth/register` or `POST /auth/login` to obtain an `accessToken` and `refreshToken`.',
        '2. Click **Authorize** and paste the `accessToken` (no `Bearer ` prefix).',
        '3. When the access token expires, call `POST /auth/refresh` with the `refreshToken`.',
        '',
        '## Errors',
        'All errors share the `ErrorResponseDto` shape. Validation failures return `400` with a list of messages.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .setContact('Q Team', '', 'dev3@judgify.me')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer(`http://localhost:${process.env.PORT ?? 3000}`, 'Local')
    .addTag('app', 'Service health and basics')
    .addTag('auth', 'Registration, login, token refresh and session management')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token returned by login/register/refresh',
      },
      BEARER_AUTH_NAME,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    customSiteTitle: 'Q Backend API Docs',
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
    yamlDocumentUrl: `${SWAGGER_PATH}/yaml`,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'list',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      tryItOutEnabled: true,
    },
  });
}
