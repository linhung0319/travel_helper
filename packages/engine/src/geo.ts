// 地理工具（T6）共用 web/src/lib/geo/ 的同一份程式，不另寫一份。
// 只引用不碰瀏覽器、Node API 的三個檔案（route.ts 用到 fetch 的型別，engine 的 lib 沒有）。
// TODO（T11 merge 後）：把 web/src/lib/geo/ 搬進 packages/engine，web 和 scripts 改從 engine import。

export { haversineMeters, isLonLat } from '../../../web/src/lib/geo/distance.ts';
export { estimateWalk, minutesForMeters, DEFAULT_WALK } from '../../../web/src/lib/geo/walk.ts';
export type { WalkOptions } from '../../../web/src/lib/geo/walk.ts';
export { nearestStations } from '../../../web/src/lib/geo/nearest.ts';
