import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ConfigFile, StoredProfile } from "./types.js";

const configPath = join(homedir(), ".config", "mcpstack", "config.json");
const fallbackSecretPath = join(homedir(), ".config", "mcpstack", "secrets.json");
const secretService = "mcpstack";

type SecretMap = Record<string, string>;
type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

let keytarPromise: Promise<KeytarModule | null> | undefined;

export async function loadConfig(): Promise<ConfigFile> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as ConfigFile;
    return { ...parsed, profiles: parsed.profiles ?? {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { profiles: {} };
    }
    throw error;
  }
}

export async function saveConfig(config: ConfigFile): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export async function getProfile(name?: string): Promise<StoredProfile | undefined> {
  const config = await loadConfig();
  const profileName = name ?? process.env.MCPSTACK_PROFILE ?? config.currentProfile;
  return profileName ? config.profiles[profileName] : undefined;
}

export async function upsertProfile(profile: StoredProfile, setCurrent = true): Promise<void> {
  const config = await loadConfig();
  config.profiles[profile.name] = profile;
  if (setCurrent) {
    config.currentProfile = profile.name;
  }
  await saveConfig(config);
}

export async function deleteProfile(name: string): Promise<void> {
  const config = await loadConfig();
  delete config.profiles[name];
  if (config.currentProfile === name) {
    config.currentProfile = Object.keys(config.profiles)[0];
  }
  await deleteSecret(name, "accessToken");
  await deleteSecret(name, "refreshToken");
  await deleteSecret(name, "apiKey");
  await saveConfig(config);
}

export async function setCurrentProfile(name: string): Promise<void> {
  const config = await loadConfig();
  if (!config.profiles[name]) {
    throw new Error(`Profile '${name}' does not exist.`);
  }
  config.currentProfile = name;
  await saveConfig(config);
}

export async function getSecret(profile: string, key: string): Promise<string | undefined> {
  const account = `${profile}:${key}`;
  const keytar = await loadKeytar();
  if (keytar) {
    const value = await keytar.getPassword(secretService, account);
    if (value) {
      return value;
    }
  }

  const secrets = await loadFallbackSecrets();
  return secrets[account];
}

export async function setSecret(profile: string, key: string, value: string): Promise<void> {
  const account = `${profile}:${key}`;
  const keytar = await loadKeytar();
  if (keytar) {
    await keytar.setPassword(secretService, account, value);
    return;
  }

  const secrets = await loadFallbackSecrets();
  secrets[account] = value;
  await saveFallbackSecrets(secrets);
}

export async function deleteSecret(profile: string, key: string): Promise<void> {
  const account = `${profile}:${key}`;
  const keytar = await loadKeytar();
  if (keytar) {
    await keytar.deletePassword(secretService, account);
  }

  const secrets = await loadFallbackSecrets();
  delete secrets[account];
  await saveFallbackSecrets(secrets);
}

async function loadKeytar(): Promise<KeytarModule | null> {
  keytarPromise ??= import("keytar")
    .then((module) => module.default as KeytarModule)
    .catch(() => null);
  return keytarPromise;
}

async function loadFallbackSecrets(): Promise<SecretMap> {
  try {
    const raw = await readFile(fallbackSecretPath, "utf8");
    return JSON.parse(raw) as SecretMap;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveFallbackSecrets(secrets: SecretMap): Promise<void> {
  await mkdir(dirname(fallbackSecretPath), { recursive: true, mode: 0o700 });
  await writeFile(fallbackSecretPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
}

export async function removeAllLocalState(): Promise<void> {
  await rm(configPath, { force: true });
  await rm(fallbackSecretPath, { force: true });
}

export async function getConfigPath(): Promise<string> {
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  try {
    await stat(configPath);
  } catch {
    await saveConfig({ profiles: {} });
  }
  return configPath;
}
