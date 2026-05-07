import {
  parseCliStartupConfig,
  resolveWorkerPath,
} from "../../src/cli/CliConfig";

describe("CLI startup config", () => {
  it("accepts flags, environment, and startup JSON with flag precedence", () => {
    const config = parseCliStartupConfig(
      [
        "--startup-json",
        JSON.stringify({
          serverUrl: "https://json.example",
          gameID: "ABCDEFGH",
          joinToken: "json-join-token",
          identity: { token: "00000000-0000-4000-8000-000000000001" },
        }),
        "--server-url",
        "https://flag.example",
        "--name",
        "Flag Pilot",
      ],
      {
        GRABBY_GAME_ID: "HGFEDCBA",
        GRABBY_PLAYER_NAME: "Env Pilot",
      },
    );

    expect(config.serverUrl).toBe("https://flag.example");
    expect(config.gameID).toBe("ABCDEFGH");
    expect(config.joinToken).toBe("json-join-token");
    expect(config.identity.name).toBe("Flag Pilot");
    expect(config.identity.token).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("computes the same worker path format as OpenFront server config", () => {
    expect(resolveWorkerPath("ABCDEFGH", 2)).toMatch(/^w[01]$/);
    expect(resolveWorkerPath("ABCDEFGH", 2)).toBe(
      resolveWorkerPath("ABCDEFGH", 2),
    );
  });
});
