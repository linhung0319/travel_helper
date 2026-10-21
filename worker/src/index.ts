// Cloudflare Worker（T24、T25、T16）。T22 先放空殼：所有請求都回 501。
import type { PlaceBase } from '@travel-helper/engine';

export type PlacesResponse = PlaceBase[];

export default {
  async fetch(): Promise<Response> {
    return new Response('not implemented', { status: 501 });
  },
};
