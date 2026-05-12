import { setSecret, upsertProfile, deleteProfile, getProfile, getSecret } from "./config.js";
import { McpstackClient } from "./client.js";
import { printInfo, printSuccess, printWarning } from "./output.js";
import { z } from "zod";
import type {
  CliConfigResponse,
  DeviceAuthorizationResponse,
  GlobalOptions,
  TokenResponse,
} from "./types.js";

const cliConfigSchema = z.object({
  apiUrl: z.string().url(),
  authIssuer: z.string().url(),
  clientId: z.string().min(1),
  deviceAuthorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  resource: z.string().min(1),
  scopes: z.array(z.string().min(1)),
  supportedAuthModes: z.array(z.string()).default([]),
});

const deviceAuthorizationSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  verification_uri_complete: z.string().url().optional(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
});

export async function login(options: GlobalOptions & { profileName?: string }): Promise<void> {
  const client = await McpstackClient.create(options);
  const config = cliConfigSchema.parse(
    await client.request<CliConfigResponse>("/api/v1/cli/config", { noAuth: true }),
  );
  const scope = config.scopes.join(" ");

  const device = await startDeviceAuthorization(config, scope);
  const verificationUrl = device.verification_uri_complete ?? device.verification_uri;
  printInfo("Open this URL to sign in:");
  console.log(verificationUrl);
  console.log("");
  console.log(`Device code: ${device.user_code}`);

  const token = await pollDeviceToken(config, device, scope);
  const profileName = options.profileName ?? options.profile ?? process.env.MCPSTACK_PROFILE ?? "default";
  const expiresAt = new Date(Date.now() + (token.expires_in ?? 600) * 1000).toISOString();

  await upsertProfile({
    name: profileName,
    apiUrl: config.apiUrl,
    auth: {
      type: "oauth",
      clientId: config.clientId,
      tokenEndpoint: config.tokenEndpoint,
      scope,
      resource: config.resource,
      expiresAt,
    },
  });
  await setSecret(profileName, "accessToken", token.access_token);
  if (token.refresh_token) {
    await setSecret(profileName, "refreshToken", token.refresh_token);
  }

  printSuccess(`Signed in and saved profile '${profileName}'.`);
}

export async function logout(options: GlobalOptions): Promise<void> {
  const profile = await getProfile(options.profile);
  if (!profile) {
    printWarning("No active profile found.");
    return;
  }

  await deleteProfile(profile.name);
  printSuccess(`Deleted profile '${profile.name}'.`);
}

export async function status(options: GlobalOptions): Promise<void> {
  const profile = await getProfile(options.profile);
  if (!profile) {
    printWarning("No active profile. Run `mcpstack auth login`.");
    return;
  }

  console.log(`Profile: ${profile.name}`);
  console.log(`API URL: ${profile.apiUrl}`);
  console.log(`Organization: ${profile.orgId ?? "(not selected)"}`);
  console.log(`Auth: ${profile.auth?.type ?? "(none)"}`);
  if (profile.auth?.type === "oauth") {
    console.log(`Expires: ${profile.auth.expiresAt ?? "(unknown)"}`);
  }
}

export async function serviceAccountLogin(options: GlobalOptions & { key?: string; profileName?: string }): Promise<void> {
  const apiKey = options.key ?? process.env.MCPSTACK_API_KEY;
  if (!apiKey) {
    throw new Error("Provide --key <api-key> or set MCPSTACK_API_KEY.");
  }

  const apiUrl = options.apiUrl ?? process.env.MCPSTACK_API_URL ?? "http://localhost:5150";
  const profileName = options.profileName ?? options.profile ?? process.env.MCPSTACK_PROFILE ?? "service-account";
  const clientId = apiKey.slice(0, apiKey.lastIndexOf("_"));

  await upsertProfile({
    name: profileName,
    apiUrl,
    auth: {
      type: "api_key",
      clientId: clientId || undefined,
    },
  });
  await setSecret(profileName, "apiKey", apiKey);

  printSuccess(`Stored service-account profile '${profileName}'.`);
}

export async function serviceAccountLogout(options: GlobalOptions): Promise<void> {
  await logout(options);
}

export async function whoami(options: GlobalOptions): Promise<unknown> {
  const client = await McpstackClient.create(options);
  return client.request("/api/v1/cli/whoami");
}

async function startDeviceAuthorization(
  config: CliConfigResponse,
  scope: string,
): Promise<DeviceAuthorizationResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    scope,
    resource: config.resource,
  });

  const response = await fetch(config.deviceAuthorizationEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      response.status === 404
        ? "The server does not expose SqlOS device authorization yet. Update SqlOS/Emcy.Api, then retry."
        : `Device authorization failed: ${text || response.statusText}`,
    );
  }

  return deviceAuthorizationSchema.parse(await response.json()) as DeviceAuthorizationResponse;
}

async function pollDeviceToken(
  config: CliConfigResponse,
  device: DeviceAuthorizationResponse,
  scope: string,
): Promise<TokenResponse> {
  const startedAt = Date.now();
  let intervalMs = Math.max(device.interval ?? 5, 1) * 1000;

  while (Date.now() - startedAt < device.expires_in * 1000) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: device.device_code,
      client_id: config.clientId,
      scope,
      resource: config.resource,
    });

    const response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (response.ok) {
      return tokenResponseSchema.parse(payload) as TokenResponse;
    }

    const error = String(payload.error ?? "");
    if (error === "authorization_pending") {
      continue;
    }

    if (error === "slow_down") {
      intervalMs += 5_000;
      continue;
    }

    if (error === "access_denied") {
      throw new Error("Device login was denied.");
    }

    if (error === "expired_token") {
      throw new Error("Device login expired. Run `mcpstack auth login` again.");
    }

    throw new Error(`Device token polling failed: ${payload.error_description ?? error ?? response.statusText}`);
  }

  throw new Error("Device login expired. Run `mcpstack auth login` again.");
}
