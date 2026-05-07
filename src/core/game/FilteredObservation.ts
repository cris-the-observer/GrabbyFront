import { Game, Player } from "./Game";
import {
  GameUpdateType,
  GameUpdateViewData,
  PlayerUpdate,
} from "./GameUpdates";

const PLAYER_ID_MASK = 0xfff;

export const UNKNOWN_CIVILIZATION_NAME = "Unknown Civilization";

export interface FilteredObservationOptions {
  observerSmallID: number;
  contactedSmallIDs: ReadonlySet<number>;
}

export function filterGameUpdateForObserver(
  update: GameUpdateViewData,
  options: FilteredObservationOptions,
): GameUpdateViewData {
  const canSeeSmallID = (smallID: number): boolean =>
    smallID === 0 ||
    smallID === options.observerSmallID ||
    options.contactedSmallIDs.has(smallID);

  const filteredUpdates = {
    ...update.updates,
    [GameUpdateType.Player]: update.updates[GameUpdateType.Player].map(
      (playerUpdate) =>
        canSeeSmallID(playerUpdate.smallID)
          ? clonePlayerUpdate(playerUpdate)
          : hidePlayerUpdate(playerUpdate),
    ),
    [GameUpdateType.Unit]: update.updates[GameUpdateType.Unit].filter((unit) =>
      canSeeSmallID(unit.ownerID),
    ),
    [GameUpdateType.AllianceRequest]: update.updates[
      GameUpdateType.AllianceRequest
    ].filter(
      (request) =>
        canSeeSmallID(request.requestorID) &&
        canSeeSmallID(request.recipientID),
    ),
    [GameUpdateType.AllianceRequestReply]: update.updates[
      GameUpdateType.AllianceRequestReply
    ].filter(
      (reply) =>
        canSeeSmallID(reply.request.requestorID) &&
        canSeeSmallID(reply.request.recipientID),
    ),
    [GameUpdateType.BrokeAlliance]: update.updates[
      GameUpdateType.BrokeAlliance
    ].filter(
      (event) =>
        canSeeSmallID(event.traitorID) && canSeeSmallID(event.betrayedID),
    ),
    [GameUpdateType.AllianceExpired]: update.updates[
      GameUpdateType.AllianceExpired
    ].filter(
      (event) =>
        canSeeSmallID(event.player1ID) && canSeeSmallID(event.player2ID),
    ),
    [GameUpdateType.AllianceExtension]: update.updates[
      GameUpdateType.AllianceExtension
    ].filter((event) => canSeeSmallID(event.playerID)),
    [GameUpdateType.TargetPlayer]: update.updates[
      GameUpdateType.TargetPlayer
    ].filter(
      (event) => canSeeSmallID(event.playerID) && canSeeSmallID(event.targetID),
    ),
    [GameUpdateType.Emoji]: update.updates[GameUpdateType.Emoji].filter(
      (event) =>
        event.emoji.recipientID === "AllPlayers" ||
        (canSeeSmallID(event.emoji.senderID) &&
          canSeeSmallID(event.emoji.recipientID)),
    ),
    [GameUpdateType.UnitIncoming]: update.updates[
      GameUpdateType.UnitIncoming
    ].filter((event) => canSeeSmallID(event.playerID)),
    [GameUpdateType.ConquestEvent]: update.updates[
      GameUpdateType.ConquestEvent
    ].filter(() => false),
    [GameUpdateType.EmbargoEvent]: update.updates[
      GameUpdateType.EmbargoEvent
    ].filter(
      (event) =>
        canSeeSmallID(event.playerID) && canSeeSmallID(event.embargoedID),
    ),
  };

  return {
    ...update,
    packedTileUpdates: filterPackedTileUpdates(
      update.packedTileUpdates,
      canSeeSmallID,
    ),
    packedMotionPlans: update.packedMotionPlans
      ? new Uint32Array(update.packedMotionPlans)
      : undefined,
    updates: filteredUpdates,
    playerNameViewData: Object.fromEntries(
      Object.entries(update.playerNameViewData).filter(([playerID]) => {
        const player = update.updates[GameUpdateType.Player].find(
          (p) => p.id === playerID,
        );
        return player !== undefined && canSeeSmallID(player.smallID);
      }),
    ),
  };
}

export function filterGameUpdateForPlayer(
  _game: Game,
  update: GameUpdateViewData,
  observer: Player,
): GameUpdateViewData {
  return filterGameUpdateForObserver(update, {
    observerSmallID: observer.smallID(),
    contactedSmallIDs: observer.contactSmallIDs(),
  });
}

function filterPackedTileUpdates(
  packedTileUpdates: Uint32Array,
  canSeeSmallID: (smallID: number) => boolean,
): Uint32Array {
  const filtered = new Uint32Array(packedTileUpdates.length);
  for (let i = 0; i + 1 < packedTileUpdates.length; i += 2) {
    const tile = packedTileUpdates[i];
    const packed = packedTileUpdates[i + 1];
    const ownerID = packed & PLAYER_ID_MASK;
    filtered[i] = tile;
    filtered[i + 1] = canSeeSmallID(ownerID)
      ? packed
      : packed & ~PLAYER_ID_MASK;
  }
  return filtered;
}

function clonePlayerUpdate(update: PlayerUpdate): PlayerUpdate {
  return {
    ...update,
    embargoes: new Set(update.embargoes),
    outgoingAttacks: [...update.outgoingAttacks],
    incomingAttacks: [...update.incomingAttacks],
    outgoingAllianceRequests: [...update.outgoingAllianceRequests],
    alliances: [...update.alliances],
    targets: [...update.targets],
    outgoingEmojis: [...update.outgoingEmojis],
  };
}

function hidePlayerUpdate(update: PlayerUpdate): PlayerUpdate {
  return {
    ...clonePlayerUpdate(update),
    name: UNKNOWN_CIVILIZATION_NAME,
    displayName: UNKNOWN_CIVILIZATION_NAME,
    gold: 0n,
    troops: 0,
    allies: [],
    embargoes: new Set(),
    targets: [],
    outgoingEmojis: [],
    outgoingAttacks: [],
    incomingAttacks: [],
    outgoingAllianceRequests: [],
    alliances: [],
    isTraitor: false,
    traitorRemainingTicks: 0,
    betrayals: 0,
    lastDeleteUnitTick: -1,
  };
}
