import {
  Game,
  Player,
  PlayerID,
  PlayerType,
  Structures,
  UnitType,
} from "../core/game/Game";
import { TileRef } from "../core/game/GameMap";

export interface CliVisibilityAdapter {
  isPlayerKnown(game: Game, observer: Player, target: Player): boolean;
  isTileVisible(game: Game, observer: Player, tile: TileRef): boolean;
}

export interface CliObservation {
  schema: "grabby.observation.v1";
  tick: number;
  gameID?: string;
  observer: {
    id: PlayerID;
    name: string;
    alive: boolean;
    spawned: boolean;
    matter: string;
    cognition: number;
    systems: number;
  };
  map: {
    width: number;
    height: number;
    systems: number;
  };
  knownPlayers: Array<{
    id: PlayerID;
    name: string;
    type: PlayerType;
    alive: boolean;
    systems: number;
    relation: "self" | "ally" | "known";
  }>;
  visibleStructures: Array<{
    id: number;
    owner: PlayerID;
    type: UnitType;
    tile: TileRef;
    level: number;
    underConstruction: boolean;
  }>;
  visibleUnits: Array<{
    id: number;
    owner: PlayerID;
    type: UnitType;
    tile: TileRef;
    troops: number;
  }>;
  hiddenPlayerCount: number;
}

export class ConservativeCliVisibilityAdapter implements CliVisibilityAdapter {
  isPlayerKnown(_game: Game, observer: Player, target: Player): boolean {
    if (observer.id() === target.id()) return true;
    if (observer.hasContactWith(target)) return true;
    if (observer.isAlliedWith(target) || observer.isOnSameTeam(target))
      return true;
    if (observer.sharesBorderWith(target) || target.sharesBorderWith(observer))
      return true;
    if (observer.outgoingAttacks().some((a) => a.target().id() === target.id()))
      return true;
    if (
      observer.incomingAttacks().some((a) => a.attacker().id() === target.id())
    )
      return true;
    return false;
  }

  isTileVisible(game: Game, observer: Player, tile: TileRef): boolean {
    if (!game.hasOwner(tile)) return false;
    const owner = game.owner(tile);
    return owner.isPlayer() && this.isPlayerKnown(game, observer, owner);
  }
}

export function createCliObservation(params: {
  game: Game;
  observerPlayerID: PlayerID;
  gameID?: string;
  visibility?: CliVisibilityAdapter;
}): CliObservation {
  const { game, observerPlayerID, gameID } = params;
  const visibility =
    params.visibility ?? new ConservativeCliVisibilityAdapter();
  const observer = game.player(observerPlayerID);
  const players = game.players();
  const knownPlayers = players.filter((player) =>
    visibility.isPlayerKnown(game, observer, player),
  );
  const knownPlayerIDs = new Set(knownPlayers.map((player) => player.id()));
  const hiddenPlayerCount = players.length - knownPlayers.length;

  return {
    schema: "grabby.observation.v1",
    tick: game.ticks(),
    gameID,
    observer: {
      id: observer.id(),
      name: observer.displayName(),
      alive: observer.isAlive(),
      spawned: observer.hasSpawned(),
      matter: observer.gold().toString(),
      cognition: observer.troops(),
      systems: observer.numTilesOwned(),
    },
    map: {
      width: game.width(),
      height: game.height(),
      systems: game.numLandTiles(),
    },
    knownPlayers: knownPlayers.map((player) => ({
      id: player.id(),
      name: player.displayName(),
      type: player.type(),
      alive: player.isAlive(),
      systems: player.numTilesOwned(),
      relation:
        player.id() === observer.id()
          ? "self"
          : observer.isAlliedWith(player) || observer.isOnSameTeam(player)
            ? "ally"
            : "known",
    })),
    visibleStructures: game
      .units(...Structures.types)
      .filter((unit) => knownPlayerIDs.has(unit.owner().id()))
      .map((unit) => ({
        id: unit.id(),
        owner: unit.owner().id(),
        type: unit.type(),
        tile: unit.tile(),
        level: unit.level(),
        underConstruction: unit.isUnderConstruction(),
      })),
    visibleUnits: game
      .units()
      .filter((unit) => !Structures.has(unit.type()))
      .filter((unit) => knownPlayerIDs.has(unit.owner().id()))
      .filter((unit) => visibility.isTileVisible(game, observer, unit.tile()))
      .map((unit) => ({
        id: unit.id(),
        owner: unit.owner().id(),
        type: unit.type(),
        tile: unit.tile(),
        troops: unit.troops(),
      })),
    hiddenPlayerCount,
  };
}
