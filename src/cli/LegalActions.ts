import { Config } from "../core/configuration/Config";
import {
  Game,
  Player,
  PlayerID,
  TerraNullius,
  UnitType,
} from "../core/game/Game";
import { TileRef } from "../core/game/GameMap";
import {
  CliVisibilityAdapter,
  ConservativeCliVisibilityAdapter,
} from "./ObservationAdapter";

export interface CliLegalActions {
  schema: "grabby.legal_actions.v1";
  tile?: TileRef;
  build: Array<{
    unit: UnitType;
    tile: TileRef | false;
    upgradeUnitId: number | false;
    cost: string;
  }>;
  attacks: Array<{ type: "attack"; targetID: PlayerID | null }>;
  diplomacy: Array<
    | { type: "allianceRequest"; recipient: PlayerID }
    | { type: "breakAlliance"; recipient: PlayerID }
    | { type: "embargo"; targetID: PlayerID; action: "start" | "stop" }
  >;
  transfers: Array<
    | { type: "donate_gold"; recipient: PlayerID }
    | { type: "donate_troops"; recipient: PlayerID }
  >;
}

export function listLegalActions(params: {
  game: CliLegalActionGame;
  observerPlayerID: PlayerID;
  tile?: TileRef;
  visibility?: Pick<CliVisibilityAdapter, "isPlayerKnown" | "isTileVisible">;
}): CliLegalActions {
  const { game, observerPlayerID, tile } = params;
  const visibility =
    params.visibility ?? new ConservativeCliVisibilityAdapter();
  const player = game.player(observerPlayerID);
  const buildables = player
    .buildableUnits(tile ?? null)
    .filter((buildable) => !game.config().isUnitDisabled(buildable.type));

  const result: CliLegalActions = {
    schema: "grabby.legal_actions.v1",
    ...(tile === undefined ? {} : { tile }),
    build: buildables.map((buildable) => ({
      unit: buildable.type,
      tile: buildable.canBuild,
      upgradeUnitId: buildable.canUpgrade,
      cost: buildable.cost.toString(),
    })),
    attacks: [],
    diplomacy: [],
    transfers: [],
  };

  if (tile === undefined) return result;
  if (player.canAttack(tile)) {
    const target = game.hasOwner(tile) ? game.owner(tile) : null;
    result.attacks.push({
      type: "attack",
      targetID:
        target !== null && isCliLegalActionPlayer(target) ? target.id() : null,
    });
  }

  if (!game.hasOwner(tile)) return result;
  const target = game.owner(tile);
  if (!isCliLegalActionPlayer(target) || target.id() === player.id())
    return result;
  if (
    !visibility.isPlayerKnown(
      game as Game,
      player as unknown as Player,
      target as unknown as Player,
    )
  ) {
    return result;
  }

  if (player.canSendAllianceRequest(target)) {
    result.diplomacy.push({ type: "allianceRequest", recipient: target.id() });
  }
  if (player.isAlliedWith(target)) {
    result.diplomacy.push({ type: "breakAlliance", recipient: target.id() });
  }
  if (player.canDonateGold(target)) {
    result.transfers.push({ type: "donate_gold", recipient: target.id() });
  }
  if (player.canDonateTroops(target)) {
    result.transfers.push({ type: "donate_troops", recipient: target.id() });
  }
  if (!player.hasEmbargoAgainst(target)) {
    result.diplomacy.push({
      type: "embargo",
      targetID: target.id(),
      action: "start",
    });
  }
  return result;
}

interface CliLegalActionGame {
  config(): Pick<Config, "isUnitDisabled">;
  player(id: PlayerID): CliLegalActionPlayer;
  hasOwner(tile: TileRef): boolean;
  owner(tile: TileRef): CliLegalActionPlayer | TerraNullius;
}

interface CliLegalActionPlayer {
  id(): PlayerID;
  isPlayer(): boolean;
  buildableUnits(tile: TileRef | null): CliBuildableUnit[];
  canAttack(tile: TileRef): boolean;
  canSendAllianceRequest(target: CliLegalActionPlayer): boolean;
  isAlliedWith(target: CliLegalActionPlayer): boolean;
  canDonateGold(target: CliLegalActionPlayer): boolean;
  canDonateTroops(target: CliLegalActionPlayer): boolean;
  hasEmbargoAgainst(target: CliLegalActionPlayer): boolean;
}

interface CliBuildableUnit {
  type: UnitType;
  canBuild: TileRef | false;
  canUpgrade: number | false;
  cost: bigint;
}

function isCliLegalActionPlayer(
  value: CliLegalActionPlayer | TerraNullius | null,
): value is CliLegalActionPlayer {
  return value !== null && value.isPlayer();
}
