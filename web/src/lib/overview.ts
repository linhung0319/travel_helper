// 探索的概覽卡（T63，interaction-design §27）：選了子地區時卡片換成那個子地區的簡介、二月注意、代表點。純邏輯，ExploreHome 讀。
// 區域一律從 areas.json 來，不寫死區域 ID。

import { displayName } from '../data/normalize.ts';
import type { Area } from '../data/types.ts';

export interface OverviewContent {
  /** 選著的子地區；null＝全區 */
  regionId: string | null;
  /** 「志摩」或「賢島」：代表點的小標題、「看賢島 ›」用 */
  label: string;
  summary: string | null;
  /** 二月注意（只放一則） */
  feb: string | null;
  /** 代表點的 ID（areas.json 的 highlights） */
  highlights: string[];
}

/** 子地區一行的第一顆：「志摩全區」 */
export const allRegionsLabel = (area: Area) => `${displayName(area.name, area.id)}全區`;

/** 區名旁邊的小字：日文名；和中文一樣時寫假名，都沒有就不寫 */
export function areaSubName(area: Area): string | null {
  const { ja, zh, kana } = area.name as { ja?: string; zh?: string; kana?: string };
  if (ja && ja !== zh) return ja;
  return kana ?? null;
}

/** 概覽卡的內容：regionId 是那張卡選的子地區（找不到就當全區） */
export function overviewContent(area: Area, regionId: string | null): OverviewContent {
  const region = regionId ? area.regions?.find((r) => r.id === regionId) : undefined;
  if (region) {
    return {
      regionId: region.id,
      label: displayName(region.name, region.id),
      summary: region.intro?.summary || null,
      feb: region.intro?.febNote || null,
      highlights: region.intro?.highlights ?? [],
    };
  }
  return {
    regionId: null,
    label: displayName(area.name, area.id),
    summary: area.intro?.summary || null,
    feb: area.intro?.february?.[0]?.text || null,
    highlights: area.intro?.highlights ?? [],
  };
}
