import { colord } from "colord";
import { PastelTheme } from "../src/core/configuration/PastelTheme";
import { GameMapType } from "../src/core/game/Game";
import { GameMapImpl } from "../src/core/game/GameMap";
import {
  cosmicTerrainColor,
  terrainColorForMap,
} from "../src/core/game/TerrainColors";

const LAND_BIT = 0b10000000;
const SHORELINE_BIT = 0b01000000;
const OCEAN_BIT = 0b00100000;

describe("Universe terrain colors", () => {
  test("Universe uses quiet cosmic colors based on terrain bytes", () => {
    const terrain = new Uint8Array([
      OCEAN_BIT | 20,
      OCEAN_BIT | SHORELINE_BIT,
      LAND_BIT | 8,
      LAND_BIT | 28,
    ]);
    const map = new GameMapImpl(4, 1, terrain, 2);
    const theme = new PastelTheme();

    expect(
      terrainColorForMap(GameMapType.Universe, theme, map, 0).toHex(),
    ).toBe("#080b1a");
    expect(
      terrainColorForMap(GameMapType.Universe, theme, map, 1).toHex(),
    ).toBe("#0a0e24");
    expect(
      terrainColorForMap(GameMapType.Universe, theme, map, 2).toHex(),
    ).toBe("#7c889e");
    expect(
      terrainColorForMap(GameMapType.Universe, theme, map, 3).toHex(),
    ).toBe("#f5ebac");
  });

  test("legacy maps keep theme terrain colors", () => {
    const terrain = new Uint8Array([OCEAN_BIT | 20]);
    const map = new GameMapImpl(1, 1, terrain, 0);
    const theme = new PastelTheme();

    expect(terrainColorForMap(GameMapType.World, theme, map, 0).toHex()).toBe(
      theme.terrainColor(map, 0).toHex(),
    );
    expect(cosmicTerrainColor(map, 0).toHex()).not.toBe(
      colord(theme.terrainColor(map, 0)).toHex(),
    );
  });
});
