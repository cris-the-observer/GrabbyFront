import { listLegalActions } from "../../src/cli/LegalActions";
import { UnitType } from "../../src/core/game/Game";

function player(overrides: Record<string, unknown> = {}) {
  return {
    id: () => "PLAYER01",
    isPlayer: () => true,
    buildableUnits: () => [
      {
        type: UnitType.City,
        canBuild: 1,
        canUpgrade: false as false,
        cost: 10n,
      },
      {
        type: UnitType.Warship,
        canBuild: 2,
        canUpgrade: false as false,
        cost: 20n,
      },
    ],
    canAttack: () => false,
    canSendEmoji: () => true,
    canEmbargoAll: () => true,
    canSendAllianceRequest: () => true,
    isAlliedWith: () => false,
    canDonateGold: () => true,
    canDonateTroops: () => true,
    hasEmbargoAgainst: () => false,
    ...overrides,
  };
}

function game(
  myPlayer: ReturnType<typeof player>,
  target: ReturnType<typeof player>,
) {
  return {
    config: () => ({
      isUnitDisabled: (unit: UnitType) => unit === UnitType.Warship,
    }),
    player: () => myPlayer,
    hasOwner: () => true,
    owner: () => target,
  };
}

describe("CLI legal action helpers", () => {
  it("omits disabled warships from build helpers", () => {
    const actions = listLegalActions({
      game: game(player(), player({ id: () => "TARGET01" })),
      observerPlayerID: "PLAYER01",
      tile: 42,
      visibility: {
        isPlayerKnown: () => true,
        isTileVisible: () => true,
      },
    });

    expect(actions.build.map((a) => a.unit)).toEqual([UnitType.City]);
  });

  it("omits diplomacy and transfer helpers for uncontacted targets", () => {
    const actions = listLegalActions({
      game: game(player(), player({ id: () => "TARGET01" })),
      observerPlayerID: "PLAYER01",
      tile: 42,
      visibility: {
        isPlayerKnown: () => false,
        isTileVisible: () => true,
      },
    });

    expect(actions.diplomacy).toEqual([]);
    expect(actions.transfers).toEqual([]);
  });
});
