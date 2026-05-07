import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  Difficulty,
  GameMapType,
  mapCategories,
} from "../../../core/game/Game";
import { getDefaultV1Map, getV1VisibleMaps } from "../../GrabbyFrontV1";
import { translateText } from "../../Utils";
import "./MapDisplay";

@customElement("map-picker")
export class MapPicker extends LitElement {
  @property({ type: String }) selectedMap: GameMapType = getDefaultV1Map();
  @property({ type: Boolean }) useRandomMap = false;
  @property({ type: Boolean }) showMedals = false;
  @property({ type: Boolean }) randomMapDivider = false;
  @property({ attribute: false }) mapWins: Map<GameMapType, Set<Difficulty>> =
    new Map();
  @property({ attribute: false }) onSelectMap?: (map: GameMapType) => void;
  @property({ attribute: false }) onSelectRandom?: () => void;
  @state() private showAllMaps = false;

  createRenderRoot() {
    return this;
  }

  private handleMapSelection(mapValue: GameMapType) {
    this.onSelectMap?.(mapValue);
  }

  private getWins(mapValue: GameMapType): Set<Difficulty> {
    return this.mapWins?.get(mapValue) ?? new Set();
  }

  private renderMapCard(mapValue: GameMapType) {
    const mapKey = Object.entries(GameMapType).find(
      ([_, value]) => value === mapValue,
    )?.[0];
    return html`
      <div
        @click=${() => this.handleMapSelection(mapValue)}
        class="cursor-pointer"
      >
        <map-display
          .mapKey=${mapKey}
          .selected=${!this.useRandomMap && this.selectedMap === mapValue}
          .showMedals=${this.showMedals}
          .wins=${this.getWins(mapValue)}
          .translation=${translateText(`map.${mapKey?.toLowerCase()}`)}
        ></map-display>
      </div>
    `;
  }

  private renderAllMaps() {
    const visible = new Set(getV1VisibleMaps(this.selectedMap));
    const mapCategoryEntries = Object.entries(mapCategories)
      .map(
        ([categoryKey, maps]) =>
          [categoryKey, maps.filter((map) => visible.has(map))] as const,
      )
      .filter(([_, maps]) => maps.length > 0);
    return html`<div class="space-y-8">
      ${mapCategoryEntries.map(
        ([categoryKey, maps]) => html`
          <div class="w-full">
            <h4
              class="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 pl-2"
            >
              ${translateText(`map_categories.${categoryKey}`)}
            </h4>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              ${maps.map((mapValue) => this.renderMapCard(mapValue))}
            </div>
          </div>
        `,
      )}
    </div>`;
  }

  private renderFeaturedMaps() {
    const featuredMapList = getV1VisibleMaps(this.selectedMap);
    return html`<div class="w-full">
      <h4
        class="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 pl-2"
      >
        ${translateText("map_categories.featured")}
      </h4>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        ${featuredMapList.map((mapValue) => this.renderMapCard(mapValue))}
      </div>
    </div>`;
  }

  render() {
    return html`
      <div class="space-y-8">
        <div class="w-full">
          <div
            role="tablist"
            aria-label="${translateText("map.map")}"
            class="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected=${!this.showAllMaps}
              class="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${this
                .showAllMaps
                ? "text-white/60 hover:text-white"
                : "bg-malibu-blue/20 text-white shadow-[var(--shadow-malibu-blue-soft)]"}"
              @click=${() => (this.showAllMaps = false)}
            >
              ${translateText("map.featured")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected=${this.showAllMaps}
              class="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${this
                .showAllMaps
                ? "bg-malibu-blue/20 text-white shadow-[var(--shadow-malibu-blue-soft)]"
                : "text-white/60 hover:text-white"}"
              @click=${() => (this.showAllMaps = true)}
            >
              ${translateText("map.all")}
            </button>
          </div>
        </div>
        ${this.showAllMaps ? this.renderAllMaps() : this.renderFeaturedMaps()}
      </div>
    `;
  }
}
