import type { LocationId } from '@/lib/api/types';

/**
 * DEMO coordinates for the Map and Satellite backgrounds (client, 9 Nov 2026: "we
 * will use demo coordinates for now"). Each sits at the approximate place on the
 * M1 line its name refers to — close enough to read the corridor on a real map,
 * not a survey. MTS supplies the surveyed positions (§15); they replace these.
 */
export const DEMO_COORDINATES: Record<LocationId, { lng: number; lat: number }> = {
  marrickville: { lng: 151.1546, lat: -33.9136 },
  'marrickville-dulwich-hill': { lng: 151.146, lat: -33.9105 },
  canterbury: { lng: 151.1185, lat: -33.9118 },
  campsie: { lng: 151.1035, lat: -33.9098 },
  belmore: { lng: 151.089, lat: -33.918 },
  'lady-game-drive': { lng: 151.1435, lat: -33.7795 },
  'windsor-road': { lng: 150.923, lat: -33.693 },
};
