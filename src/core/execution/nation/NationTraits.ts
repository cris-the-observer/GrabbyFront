import { PseudoRandom } from "../../PseudoRandom";
import { GameID } from "../../Schemas";
import { simpleHash } from "../../Util";
import { PlayerID } from "../../game/Game";

export enum NationTrait {
  Expansionist = "expansionist",
  Defensive = "defensive",
  WeaponHeavy = "weapon-heavy",
  TradeOriented = "trade-oriented",
  AllianceProne = "alliance-prone",
}

export interface NationTraits {
  primary: NationTrait;
  attackMultiplier: number;
  reserveMultiplier: number;
  expandMultiplier: number;
  allianceRequestChanceMultiplier: number;
}

export function createNationTraits(
  gameID: GameID,
  nationID: PlayerID,
): NationTraits {
  const random = new PseudoRandom(simpleHash(gameID) + simpleHash(nationID));
  const traits = Object.values(NationTrait);
  const primary = traits[random.nextInt(0, traits.length)];

  switch (primary) {
    case NationTrait.Expansionist:
      return {
        primary,
        attackMultiplier: 0.94,
        reserveMultiplier: 0.9,
        expandMultiplier: 1.25,
        allianceRequestChanceMultiplier: 1,
      };
    case NationTrait.Defensive:
      return {
        primary,
        attackMultiplier: 1.08,
        reserveMultiplier: 1.2,
        expandMultiplier: 0.9,
        allianceRequestChanceMultiplier: 0.9,
      };
    case NationTrait.WeaponHeavy:
      return {
        primary,
        attackMultiplier: 0.9,
        reserveMultiplier: 1.05,
        expandMultiplier: 0.85,
        allianceRequestChanceMultiplier: 0.85,
      };
    case NationTrait.TradeOriented:
      return {
        primary,
        attackMultiplier: 1.04,
        reserveMultiplier: 1,
        expandMultiplier: 0.95,
        allianceRequestChanceMultiplier: 1.1,
      };
    case NationTrait.AllianceProne:
      return {
        primary,
        attackMultiplier: 1,
        reserveMultiplier: 0.95,
        expandMultiplier: 1,
        allianceRequestChanceMultiplier: 1.5,
      };
  }
}
