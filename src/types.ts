export type OutputFormat = "table" | "json" | "yaml";

export interface GlobalOptions {
  apiUrl?: string;
  profile?: string;
  org?: string;
  json?: boolean;
  output?: OutputFormat;
  yes?: boolean;
  wait?: boolean;
  timeout?: string;
  verbose?: boolean;
  debugHttp?: boolean;
}

export interface StoredProfile {
  name: string;
  apiUrl: string;
  orgId?: string;
  auth?: OAuthProfileAuth | ApiKeyProfileAuth;
}

export interface OAuthProfileAuth {
  type: "oauth";
  clientId: string;
  tokenEndpoint: string;
  scope?: string;
  resource?: string;
  expiresAt?: string;
}

export interface ApiKeyProfileAuth {
  type: "api_key";
  clientId?: string;
}

export interface ConfigFile {
  currentProfile?: string;
  profiles: Record<string, StoredProfile>;
}

export interface CliConfigResponse {
  apiUrl: string;
  authIssuer: string;
  clientId: string;
  deviceAuthorizationEndpoint: string;
  tokenEndpoint: string;
  resource: string;
  scopes: string[];
  supportedAuthModes: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  rawBody?: string | URLSearchParams | Uint8Array | Buffer;
  expectText?: boolean;
  noAuth?: boolean;
}
