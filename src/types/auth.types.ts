export interface JwtPayload {
  sub: string;
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

export interface authCheckRes {
  status: 401 | 404 | 403 | 419 | 500 | 200;
  message: string;
}
