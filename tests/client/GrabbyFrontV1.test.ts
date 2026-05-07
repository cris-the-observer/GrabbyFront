import { describe, expect, it } from "vitest";
import en from "../../resources/lang/en.json";
import {
  BRAND_NAME,
  DEFAULT_V1_BOTS,
  DEFAULT_V1_DISABLED_UNITS,
  DEFAULT_V1_NATIONS,
  DEFAULT_V1_TOTAL_CIVILIZATIONS,
  GRABBY_RESOURCE_DISPLAY_NAMES,
  V1_ADS_ENABLED,
  V1_ONLINE_PRODUCT_ENABLED,
  V1_PUBLIC_LOBBIES_ENABLED,
  getDefaultV1Map,
  getGrabbyUnitDisplayName,
  getV1VisibleMaps,
} from "../../src/client/GrabbyFrontV1";
import { HostLobbyModal } from "../../src/client/HostLobbyModal";
import { SinglePlayerModal } from "../../src/client/SinglePlayerModal";
import { GameMapType, UnitType } from "../../src/core/game/Game";

describe("Grabby Front V1 shell defaults and vocabulary", () => {
  it("uses Grabby Front as the user-facing brand", () => {
    expect(BRAND_NAME).toBe("Grabby Front");
    expect(en.main.title).toBe("Grabby Front");
  });

  it("keeps the default match shape at one human plus eleven Nations", () => {
    expect(DEFAULT_V1_TOTAL_CIVILIZATIONS).toBe(12);
    expect(DEFAULT_V1_BOTS).toBe(0);
    expect(DEFAULT_V1_NATIONS).toBe(11);
    expect(DEFAULT_V1_DISABLED_UNITS).toEqual([UnitType.Warship]);
  });

  it("disables public online product surfaces for V1 local/private play", () => {
    expect(V1_PUBLIC_LOBBIES_ENABLED).toBe(false);
    expect(V1_ONLINE_PRODUCT_ENABLED).toBe(false);
    expect(V1_ADS_ENABLED).toBe(false);
  });

  it("applies the V1 defaults to single-player and private lobby forms", () => {
    const singlePlayerModal = new SinglePlayerModal();
    const hostLobbyModal = new HostLobbyModal();

    for (const modal of [singlePlayerModal, hostLobbyModal]) {
      expect((modal as any).selectedMap).toBe(getDefaultV1Map());
      expect((modal as any).bots).toBe(DEFAULT_V1_BOTS);
      expect((modal as any).nations).toBe(DEFAULT_V1_NATIONS);
      expect((modal as any).defaultNationCount).toBe(DEFAULT_V1_NATIONS);
      expect((modal as any).disabledUnits).toEqual(DEFAULT_V1_DISABLED_UNITS);
    }
  });

  it("defaults to Universe when present and filters normal map choices to the V1 map", () => {
    const maps = {
      ...GameMapType,
      Universe: "Universe",
    } as typeof GameMapType & { Universe: GameMapType };

    expect(getDefaultV1Map(maps)).toBe("Universe");
    expect(getV1VisibleMaps("World" as GameMapType, maps)).toEqual([
      "Universe",
    ]);
  });

  it("falls back without breaking local play before the Universe asset exists", () => {
    const maps = {
      World: "World",
    } as typeof GameMapType;

    expect(getDefaultV1Map(maps)).toBe(GameMapType.World);
    expect(getV1VisibleMaps(GameMapType.World, maps)).toEqual([
      GameMapType.World,
    ]);
  });

  it("renames core resources without changing internal schema names", () => {
    expect(GRABBY_RESOURCE_DISPLAY_NAMES.gold).toBe("Matter");
    expect(GRABBY_RESOURCE_DISPLAY_NAMES.troops).toBe("Cognition");
    expect(GRABBY_RESOURCE_DISPLAY_NAMES.population).toBe("Cognition");
  });

  it("maps OpenFront unit enums to Grabby Front megastructure display names", () => {
    expect(getGrabbyUnitDisplayName(UnitType.City)).toBe("O'Neill Swarm");
    expect(getGrabbyUnitDisplayName(UnitType.DefensePost)).toBe(
      "Kinetic Defense Lattice",
    );
    expect(getGrabbyUnitDisplayName(UnitType.Port)).toBe(
      "Relativistic Mass-Driver",
    );
    expect(getGrabbyUnitDisplayName(UnitType.Factory)).toBe(
      "Beam-Rider Corridor Foundry",
    );
    expect(getGrabbyUnitDisplayName(UnitType.SAMLauncher)).toBe("Laser Broom");
    expect(getGrabbyUnitDisplayName(UnitType.MissileSilo)).toBe("RKV Assembly");
    expect(getGrabbyUnitDisplayName(UnitType.AtomBomb)).toBe(
      "Relativistic Kill Vehicle",
    );
    expect(getGrabbyUnitDisplayName(UnitType.HydrogenBomb)).toBe(
      "Penrose GRB Cannon",
    );
    expect(getGrabbyUnitDisplayName(UnitType.MIRV)).toBe("von Neumann Swarm");
  });
});
