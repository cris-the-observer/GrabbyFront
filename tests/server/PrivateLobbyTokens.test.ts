import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/configuration/ConfigLoader", () => ({
  getServerConfigFromServer: () => ({
    otelEnabled: () => false,
    otelAuthHeader: () => "",
    otelEndpoint: () => "",
    env: () => 0,
  }),
  getServerConfig: () => ({
    otelEnabled: () => false,
  }),
}));

vi.mock("../../src/core/Schemas", async () => {
  const actual = (await vi.importActual("../../src/core/Schemas")) as any;
  return {
    ...actual,
    GameStartInfoSchema: {
      safeParse: (data: any) => ({ success: true, data }),
    },
    ServerPrestartMessageSchema: {
      safeParse: (data: any) => ({ success: true, data }),
    },
    ClientMessageSchema: {
      safeParse: (data: any) => ({ success: true, data }),
    },
  };
});

import { GameEnv } from "../../src/core/configuration/Config";
import { GameType } from "../../src/core/game/Game";
import { Client } from "../../src/server/Client";
import { GameServer } from "../../src/server/GameServer";

function makeMockWs() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  return {
    on: (event: string, handler: (...args: any[]) => any) => {
      handlers[event] = handler;
    },
    removeAllListeners: (_event: string) => {},
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    trigger: (event: string, ...args: any[]) => handlers[event]?.(...args),
  };
}

function makeClient(clientID: string, persistentID: string) {
  const ws = makeMockWs();
  const client = new Client(
    clientID,
    persistentID,
    null,
    null,
    undefined,
    "127.0.0.1",
    "TestUser",
    null,
    ws as any,
    undefined,
  );
  return { client, ws };
}

describe("private lobby anonymous tokens", () => {
  let mockLogger: any;
  let mockConfig: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = {
      child: vi.fn().mockReturnThis(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    mockConfig = {
      turnIntervalMs: () => 100,
      gameCreationRate: () => 1000,
      env: () => GameEnv.Dev,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  function makeGame() {
    return new GameServer(
      "PRIV1234",
      mockLogger,
      Date.now(),
      mockConfig,
      { gameType: GameType.Private } as any,
    );
  }

  it("returns host and join tokens only in the creator response", () => {
    const game = makeGame();

    const creatorResponse = game.privateLobbyCreateResponse();

    expect(creatorResponse.gameInfo.gameID).toBe("PRIV1234");
    expect(creatorResponse.hostToken).toEqual(expect.any(String));
    expect(creatorResponse.joinToken).toEqual(expect.any(String));
    expect(creatorResponse.hostToken).not.toBe(creatorResponse.joinToken);

    expect(game.gameInfo()).not.toHaveProperty("hostToken");
    expect(game.gameInfo()).not.toHaveProperty("joinToken");
    expect(creatorResponse.gameInfo).not.toHaveProperty("hostToken");
    expect(creatorResponse.gameInfo).not.toHaveProperty("joinToken");
  });

  it("requires the host token for WebSocket host actions", async () => {
    const game = makeGame();
    const { hostToken, joinToken } = game.privateLobbyCreateResponse();
    const { client: host, ws: hostWs } = makeClient("HOST0001", "host-pid");
    const { client: guest, ws: guestWs } = makeClient("GUEST001", "guest-pid");

    game.joinClient(host);
    game.joinClient(guest);

    await guestWs.trigger(
      "message",
      JSON.stringify({
        type: "intent",
        hostToken: joinToken,
        intent: { type: "start_game" },
      }),
    );
    expect(game.hasStarted()).toBe(false);

    await hostWs.trigger(
      "message",
      JSON.stringify({
        type: "intent",
        intent: { type: "start_game" },
      }),
    );
    expect(game.hasStarted()).toBe(false);

    await hostWs.trigger(
      "message",
      JSON.stringify({
        type: "intent",
        hostToken,
        intent: { type: "start_game" },
      }),
    );
    expect(game.hasStarted()).toBe(true);
  });
});
