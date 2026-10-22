import type { PlaceType } from '../data/types.ts';

export const TYPE_COLORS: Record<PlaceType, string> = {
  station: '#1f6feb',
  spot: '#1a7f37',
  lodging: '#8250df',
  restaurant: '#d1501a',
};

export const TYPE_ICONS: Record<PlaceType, string> = {
  station: '🚉',
  spot: '📍',
  lodging: '🏨',
  restaurant: '🍴',
};
