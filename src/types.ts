export type OutputFormat = "table" | "json" | "yaml";

export interface GlobalOptions {
  apiUrl?: string;
  org?: string;
  json?: boolean;
  output?: OutputFormat;
  yes?: boolean;
  wait?: boolean;
  timeout?: string;
  verbose?: boolean;
  debugHttp?: boolean;
  noBrowser?: boolean;
}

export interface ConfigFile {
  apiUrl: string;
  orgId?: string;
  auth?: OAuthAuth | ApiKeyAuth;
}

export interface OAuthAuth {
  type: "oauth";
  clientId: string;
  tokenEndpoint: string;
  scope?: string;
  resource?: string;
  expiresAt?: string;
}

export interface ApiKeyAuth {
  type: "api_key";
  clientId?: string;
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
