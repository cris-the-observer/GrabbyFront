import fs from "fs";
import path from "path";
import { vi } from "vitest";
import { FetchGameMapLoader } from "../src/core/game/FetchGameMapLoader";
import {
  DefaultGameMap,
  GameMapType,
  normalGameplayMaps,
  visibleMapCategories,
} from "../src/core/game/Game";

const ROOT = path.resolve(__dirname, "..");

describe("Universe map registry", () => {
  test("Universe is the distinct visible/default V1 map", async () => {
    expect(GameMapType.Universe).toBe("Universe");
    expect(GameMapType.Universe).not.toBe(GameMapType.MilkyWay);
    expect(DefaultGameMap).toBe(GameMapType.Universe);
    expect(normalGameplayMaps).toEqual([GameMapType.Universe]);
    expect(visibleMapCategories).toEqual({
      universe: [GameMapType.Universe],
    });

    vi.doMock("../src/server/Logger", () => ({
      logger: {
        child: () => ({
          error: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
        }),
      },
    }));
    const { MapPlaylist } = await import("../src/server/MapPlaylist");
    const playlist = new MapPlaylist();
    await expect(playlist.gameConfig("ffa")).resolves.toMatchObject({
      gameMap: GameMapType.Universe,
    });
    await expect(playlist.gameConfig("team")).resolves.toMatchObject({
      gameMap: GameMapType.Universe,
    });
  });

  test("Universe has public runtime map assets and translation", () => {
    const resourceDir = path.join(ROOT, "resources", "maps", "universe");
    for (const file of [
      "manifest.json",
      "map.bin",
      "map4x.bin",
      "map16x.bin",
      "thumbnail.webp",
      "review.json",
    ]) {
      expect(fs.existsSync(path.join(resourceDir, file))).toBe(true);
    }

    const manifest = JSON.parse(
      fs.readFileSync(path.join(resourceDir, "manifest.json"), "utf8"),
    ) as { name: string; nations: unknown[] };
    expect(manifest.name).toBe("universe");
    expect(manifest.nations).toHaveLength(12);

    const en = JSON.parse(
      fs.readFileSync(path.join(ROOT, "resources", "lang", "en.json"), "utf8"),
    ) as {
      map: Record<string, string>;
      map_categories: Record<string, string>;
    };
    expect(en.map.universe).toBe("Universe");
    expect(en.map_categories.universe).toBe("Universe");
  });

  test("Universe resolves through default fetch loader paths", () => {
    const mapData = new FetchGameMapLoader("/assets/maps").getMapData(
      GameMapType.Universe,
    );

    expect(mapData.webpPath).toBe("/assets/maps/universe/thumbnail.webp");
  });
});
