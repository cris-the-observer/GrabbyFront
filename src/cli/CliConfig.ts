import { randomUUID } from "crypto";
import fs from "fs";
import { simpleHash } from "../core/Util";

export interface CliIdentityConfig {
  name: string;
  clanTag: string | null;
  token: string;
}

export interface CliStartupConfig {
  serverUrl: string;
  gameID: string;
  joinToken?: string;
  identity: CliIdentityConfig;
  workerCount: number;
  workerPath?: string;
  turnstileToken: string | null;
  autoJoin: boolean;
  observeOnTick: boolean;
  mapAssetRoot?: string;
}

type Env = Record<string, string | undefined>;

const DEFAULT_WORKER_COUNT = 2;

export function resolveWorkerPath(
  gameID: string,
  workerCount = DEFAULT_WORKER_COUNT,
): string {
  return `w${simpleHash(gameID) % workerCount}`;
}

export function resolveGameWebSocketUrl(config: CliStartupConfig): string {
  const base = new URL(config.serverUrl);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  const workerPath =
    config.workerPath ?? resolveWorkerPath(config.gameID, config.workerCount);
  const basePath = base.pathname.replace(/\/+$/, "");
  base.pathname = `${basePath}/${workerPath}`.replace(/\/{2,}/g, "/");
  base.search = "";
  base.hash = "";
  return base.toString();
}

export function parseCliStartupConfig(
  argv = process.argv.slice(2),
  env: Env = process.env,
): CliStartupConfig {
  const flags = parseFlags(argv);
  const startupJson = readStartupJson(
    flags["startup-json"] ?? env.GRABBY_STARTUP_JSON,
  );
  const merged = {
    ...envConfig(env),
    ...startupJson,
    ...flagsConfig(flags),
  };

  const serverUrl = stringValue(merged.serverUrl, "server URL");
  const gameID = stringValue(merged.gameID, "game ID");
  const identityObj = isRecord(merged.identity) ? merged.identity : {};
  const identityToken =
    stringMaybe(merged.identityToken) ??
    stringMaybe(identityObj.token) ??
    randomUUID();

  return {
    serverUrl,
    gameID,
    joinToken: stringMaybe(merged.joinToken),
    identity: {
      name:
        stringMaybe(merged.name) ??
        stringMaybe(identityObj.name) ??
        "Grabby CLI",
      clanTag:
        stringMaybe(merged.clanTag) ?? stringMaybe(identityObj.clanTag) ?? null,
      token: identityToken,
    },
    workerCount: numberValue(merged.workerCount, DEFAULT_WORKER_COUNT),
    workerPath: stringMaybe(merged.workerPath),
    turnstileToken: stringMaybe(merged.turnstileToken) ?? null,
    autoJoin: booleanValue(merged.autoJoin, true),
    observeOnTick: booleanValue(merged.observeOnTick, true),
    mapAssetRoot: stringMaybe(merged.mapAssetRoot),
  };
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim();
    if (rawValue !== undefined) {
      result[key] = rawValue;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      result[key] = next;
      i++;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function flagsConfig(
  flags: Record<string, string | boolean>,
): Record<string, unknown> {
  return omitUndefined({
    serverUrl: flags["server-url"],
    gameID: flags["game-id"],
    joinToken: flags["join-token"],
    name: flags.name,
    clanTag: flags["clan-tag"],
    identityToken: flags.identity,
    workerCount: flags["worker-count"],
    workerPath: flags["worker-path"],
    turnstileToken: flags["turnstile-token"],
    autoJoin: flags["auto-join"],
    observeOnTick: flags["observe-on-tick"],
    mapAssetRoot: flags["map-assets"],
  });
}

function envConfig(env: Env): Record<string, unknown> {
  return omitUndefined({
    serverUrl: env.GRABBY_SERVER_URL,
    gameID: env.GRABBY_GAME_ID,
    joinToken: env.GRABBY_JOIN_TOKEN,
    name: env.GRABBY_PLAYER_NAME,
    clanTag: env.GRABBY_CLAN_TAG,
    identityToken: env.GRABBY_PLAYER_IDENTITY,
    workerCount: env.GRABBY_WORKER_COUNT,
    workerPath: env.GRABBY_WORKER_PATH,
    turnstileToken: env.GRABBY_TURNSTILE_TOKEN,
    autoJoin: env.GRABBY_AUTO_JOIN,
    observeOnTick: env.GRABBY_OBSERVE_ON_TICK,
    mapAssetRoot: env.GRABBY_MAP_ASSETS,
  });
}

function readStartupJson(input: unknown): Record<string, unknown> {
  const source = stringMaybe(input);
  if (!source) return {};
  const raw = source.trim().startsWith("{")
    ? source
    : fs.readFileSync(source, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Startup JSON must be an object");
  }
  return parsed;
}

function stringValue(value: unknown, label: string): string {
  const result = stringMaybe(value);
  if (!result) throw new Error(`Missing ${label}`);
  return result;
}

function stringMaybe(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function numberValue(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function omitUndefined(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
