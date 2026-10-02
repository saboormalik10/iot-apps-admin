/**
 * The swap point.
 *
 * Every screen imports its data from here and nowhere else. Today this file
 * re-exports the in-browser mock; in the real build each function becomes an HTTP
 * call and `lib/mock/` is deleted whole. Nothing above this line changes.
 *
 * An eslint rule stops `features/` and `components/` importing `lib/mock/*`
 * directly, so the boundary cannot quietly rot.
 */
export {
  listStations,
  getStation,
  stationCount,
  getPumpStation,
  setPumpMode,
  commandPump,
  listEvents,
  getEvent,
  cameraEvents,
  acknowledgeEvent,
  acknowledgeAll,
  unacknowledgedCount,
  activeAlertCount,
  leadAlert,
  listRules,
  listRuleVersions,
  currentRuleVersion,
  restoreRuleVersion,
  setRuleEnabled,
  saveRule,
  createRule,
  listRoles,
  createRole,
  listUsers,
  createUser,
  updateUser,
  removeUser,
  setUserStatus,
  DEMO_USER,
  listHealth,
  runHistoryQuery,
  listAudit,
  buildSeries,
  statusFor,
  stationStatusFrom,
  PARAMETER_LABELS,
  PARAMETER_UNITS,
} from '@/lib/mock/api';

/** The operational charts' data — derived from the same curves as everything else. */
export {
  getVigilance,
  rainfallByHour,
  corridorExceedance,
  windRose,
  ROSE_BANDS,
  getDelivery,
  deliveryStats,
  listAnnotations,
  addAnnotation,
  availabilityBudgets,
  calibrationSchedule,
  qualityFlags,
  pumpHistory,
  pumpProtection,
  powerTrails,
  maintenanceWindows,
  telemetryFor,
  staffGaugeChecks,
  getMaintenance,
  maintenanceNow,
  setMaintenance,
  pipelineStats,
  simulateRule,
  loggerStrips,
  workOrders,
  chargeController,
  listInstruments,
  instrumentsNow,
  addInstrument,
  updateInstrument,
  INSTRUMENT_CATALOG,
} from '@/lib/mock/insights';
export type { PipelineStats } from '@/lib/mock/insights';
export { compass } from '@/lib/mock/api';

/** Change notification. In the real build this is the realtime channel. */
export { subscribeToData, getRevision } from '@/lib/mock/store';

/** Prototype-only time controls (the demo dock). Not part of the product API. */
export { storyPoints, demoJumpTo, demoSetSpeed, demoPause, demoReset, demoState } from '@/lib/mock/demo';
