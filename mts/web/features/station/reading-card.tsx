/**
 * Which tunnel monitoring point a sensor belongs to, from its ID: Lady Game Drive
 * has an up-tunnel and a down-tunnel point. (The per-reading cards this file used
 * to hold were replaced by the station page's panels: station-panels.tsx.)
 */
export function pointLabel(sensorId: string): string | null {
  if (sensorId.includes('-UP-')) return 'Up tunnel';
  if (sensorId.includes('-DN-')) return 'Down tunnel';
  return null;
}
