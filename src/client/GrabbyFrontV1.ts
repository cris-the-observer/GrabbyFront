import { GameMapType, UnitType } from "../core/game/Game";

export const BRAND_NAME = "Grabby Front";
export const DEFAULT_V1_TOTAL_CIVILIZATIONS = 12;
export const DEFAULT_V1_HUMANS = 1;
export const DEFAULT_V1_BOTS = 0;
export const DEFAULT_V1_NATIONS =
  DEFAULT_V1_TOTAL_CIVILIZATIONS - DEFAULT_V1_HUMANS;
export const DEFAULT_V1_DISABLED_UNITS: UnitType[] = [UnitType.Warship];
export const V1_PUBLIC_LOBBIES_ENABLED = false;
export const V1_ONLINE_PRODUCT_ENABLED = false;
export const V1_ADS_ENABLED = false;

export const GRABBY_RESOURCE_DISPLAY_NAMES = {
  gold: "Matter",
  troops: "Cognition",
  population: "Cognition",
} as const;

export const GRABBY_UNIT_DISPLAY_NAMES: Partial<Record<UnitType, string>> = {
  [UnitType.City]: "O'Neill Swarm",
  [UnitType.DefensePost]: "Kinetic Defense Lattice",
  [UnitType.Port]: "Relativistic Mass-Driver",
  [UnitType.Factory]: "Beam-Rider Corridor Foundry",
  [UnitType.SAMLauncher]: "Laser Broom",
  [UnitType.MissileSilo]: "RKV Assembly",
  [UnitType.AtomBomb]: "Relativistic Kill Vehicle",
  [UnitType.HydrogenBomb]: "Penrose GRB Cannon",
  [UnitType.MIRV]: "von Neumann Swarm",
};

type GameMapRegistry = typeof GameMapType & Partial<Record<"Universe", string>>;

function universeMapFrom(
  maps: GameMapRegistry = GameMapType,
): GameMapType | undefined {
  const universe = maps.Universe;
  return typeof universe === "string" ? (universe as GameMapType) : undefined;
}

export function getDefaultV1Map(
  maps: GameMapRegistry = GameMapType,
): GameMapType {
  return universeMapFrom(maps) ?? GameMapType.World;
}

export function getV1VisibleMaps(
  _selectedMap: GameMapType = getDefaultV1Map(),
  maps: GameMapRegistry = GameMapType,
): GameMapType[] {
  return [getDefaultV1Map(maps)];
}

export function getDefaultV1NationCount(
  humanCount = DEFAULT_V1_HUMANS,
): number {
  return Math.max(0, DEFAULT_V1_TOTAL_CIVILIZATIONS - humanCount);
}

export function getGrabbyUnitDisplayName(unitType: UnitType): string {
  return GRABBY_UNIT_DISPLAY_NAMES[unitType] ?? unitType;
}
