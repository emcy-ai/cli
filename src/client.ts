import { fetch } from "undici";
import { getProfile, getSecret, setSecret, upsertProfile } from "./config.js";
import type { GlobalOptions, RequestOptions, StoredProfile, TokenResponse } from "./types.js";

export class McpstackHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

export class McpstackClient {
  readonly apiUrl: string;
  readonly profile?: StoredProfile;

  private constructor(
    private readonly options: GlobalOptions,
    apiUrl: string,
    profile?: StoredProfile,
  ) {
    this.apiUrl = apiUrl.replace(/\/+$/, "");
    this.profile = profile;
  }

  static async create(options: GlobalOptions): Promise<McpstackClient> {
    const profile = await getProfile(options.profile);
    const apiUrl = options.apiUrl
      ?? process.env.MCPSTACK_API_URL
      ?? profile?.apiUrl
      ?? "http://localhost:5150";
    return new McpstackClient(options, apiUrl, profile);
  }

  async request<T = unknown>(path: string, requestOptions: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, requestOptions.query);
    const headers: Record<string, string> = {
      Accept: requestOptions.expectText ? "text/plain" : "application/json",
      ...requestOptions.headers,
    };

    let body: string | URLSearchParams | Uint8Array | Buffer | undefined;
    if (requestOptions.rawBody) {
      body = requestOptions.rawBody;
    } else if (requestOptions.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(requestOptions.body);
    }

    if (!requestOptions.noAuth) {
      const authHeader = await this.resolveAuthHeader();
      if (authHeader) {
        headers.Authorization = authHeader;
      }
    }

    if (this.options.debugHttp) {
      console.error(`${requestOptions.method ?? "GET"} ${url}`);
    }

    const response = await fetch(url, {
      method: requestOptions.method ?? "GET",
      headers,
      body,
    });

    const responseBody = requestOptions.expectText
      ? await response.text()
      : await readJsonOrText(response);

    if (!response.ok) {
      throw new McpstackHttpError(
        formatHttpError(response.status, responseBody),
        response.status,
        responseBody,
      );
    }

    return responseBody as T;
  }

  async stream(path: string, onChunk: (text: string) => void, requestOptions: RequestOptions = {}): Promise<void> {
    const url = this.buildUrl(path, requestOptions.query);
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      ...requestOptions.headers,
    };

    if (!requestOptions.noAuth) {
      const authHeader = await this.resolveAuthHeader();
      if (authHeader) {
        headers.Authorization = authHeader;
      }
    }

    const response = await fetch(url, { method: requestOptions.method ?? "GET", headers });
    if (!response.ok) {
      throw new McpstackHttpError(
        formatHttpError(response.status, await readJsonOrText(response)),
        response.status,
        undefined,
      );
    }

    if (!response.body) {
      return;
    }

    for await (const chunk of response.body) {
      onChunk(Buffer.from(chunk).toString("utf8"));
    }
  }

  async resolveOrgId(explicitOrg?: string): Promise<string> {
    const orgId = explicitOrg
      ?? this.options.org
      ?? process.env.MCPSTACK_ORG_ID
      ?? this.profile?.orgId;
    if (orgId) {
      return orgId;
    }

    const orgs = await this.request<any[]>("/api/v1/organizations");
    if (orgs.length === 1) {
      return orgs[0].id ?? orgs[0].organizationId;
    }

    if (orgs.length === 0) {
      throw new Error("No organizations found for the current account.");
    }

    throw new Error("Multiple organizations found. Pass --org <organization-id> or run `mcpstack org use <organization-id>`.");
  }

  async setProfileOrg(orgId: string): Promise<void> {
    if (!this.profile) {
      throw new Error("No stored profile is active. Run `mcpstack auth login` first.");
    }

    await upsertProfile({ ...this.profile, orgId });
  }

  buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.apiUrl}${normalizedPath}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async resolveAuthHeader(): Promise<string | undefined> {
    const accessToken = process.env.MCPSTACK_ACCESS_TOKEN;
    if (accessToken) {
      return `Bearer ${accessToken}`;
    }

    const apiKey = process.env.MCPSTACK_API_KEY;
    if (apiKey) {
      return `Bearer ${apiKey}`;
    }

    if (!this.profile?.auth) {
      return undefined;
    }

    if (this.profile.auth.type === "api_key") {
      const storedApiKey = await getSecret(this.profile.name, "apiKey");
      return storedApiKey ? `Bearer ${storedApiKey}` : undefined;
    }

    const refreshed = await this.refreshAccessTokenIfNeeded();
    const token = refreshed ?? await getSecret(this.profile.name, "accessToken");
    return token ? `Bearer ${token}` : undefined;
  }

  private async refreshAccessTokenIfNeeded(): Promise<string | undefined> {
    if (!this.profile?.auth || this.profile.auth.type !== "oauth") {
      return undefined;
    }

    const expiresAt = this.profile.auth.expiresAt ? Date.parse(this.profile.auth.expiresAt) : 0;
    if (expiresAt > Date.now() + 60_000) {
      return undefined;
    }

    const refreshToken = await getSecret(this.profile.name, "refreshToken");
    if (!refreshToken) {
      return undefined;
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.profile.auth.clientId,
    });

    const response = await fetch(this.profile.auth.tokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      return undefined;
    }

    const token = await response.json() as TokenResponse;
    await setSecret(this.profile.name, "accessToken", token.access_token);
    if (token.refresh_token) {
      await setSecret(this.profile.name, "refreshToken", token.refresh_token);
    }

    const expiresAtIso = new Date(Date.now() + (token.expires_in ?? 600) * 1000).toISOString();
    await upsertProfile({
      ...this.profile,
      auth: {
        ...this.profile.auth,
        expiresAt: expiresAtIso,
      },
    }, false);

    return token.access_token;
  }
}

async function readJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatHttpError(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.error_description ?? record.error ?? record.message;
    if (message) {
      return `HTTP ${status}: ${String(message)}`;
    }
  }

  return typeof body === "string" && body
    ? `HTTP ${status}: ${body}`
    : `HTTP ${status}`;
}
