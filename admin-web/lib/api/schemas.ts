import { z } from 'zod';

/**
 * Zod is the PRIMARY validation guard (plan §10.6 — auth DTOs have no server-side
 * class-validator). The server `message[]` is only a form-level fallback. Mirror
 * the backend's real rules: email format + password ≥ 8.
 */
const email = z.string().min(1, 'auth.errors.emailRequired').email('auth.errors.emailInvalid');
const password = z.string().min(8, 'auth.errors.passwordMin');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'auth.errors.passwordRequired'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: password,
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'auth.errors.passwordsMismatch',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
    password,
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'auth.errors.passwordsMismatch',
    path: ['confirmPassword'],
  });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

// ── Org / people ──────────────────────────────────────────────────────────────
export const roleSchema = z.enum(['admin', 'operator', 'viewer']);

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email().or(z.literal('')).optional(),
  country: z.string().min(1).max(100),
  timezone: z.string().min(1).max(100),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

export const inviteUserSchema = z.object({
  email,
  role: roleSchema.default('viewer'),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z.object({
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ── Profile ─────────────────────────────────────────────────────────────────
export const profileSchema = z
  .object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    currentPassword: z.string().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const changing = Boolean(v.newPassword && v.newPassword.length > 0);
    if (!changing) return;
    if ((v.newPassword ?? '').length < 8) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth.errors.passwordMin', path: ['newPassword'] });
    }
    if (!v.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'auth.errors.currentPasswordRequired',
        path: ['currentPassword'],
      });
    }
    if (v.newPassword !== v.confirmPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'auth.errors.passwordsMismatch', path: ['confirmPassword'] });
    }
  });
export type ProfileInput = z.infer<typeof profileSchema>;

// ── Devices (Month 8) ─────────────────────────────────────────────────────────
export const deviceTypeSchema = z.enum(['MET-LINK', 'NEP-LINK']);

export const createDeviceSchema = z.object({
  bleId: z.string().min(1, 'devices.errors.bleIdRequired').max(120),
  name: z.string().min(1, 'devices.errors.nameRequired').max(120),
  type: deviceTypeSchema,
  serialNo: z.string().max(120).optional(),
  firmwareVersion: z.string().max(60).optional(),
  customName: z.string().max(120).optional(),
});
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  customName: z.string().max(120).nullable().optional(),
  serialNo: z.string().max(120).nullable().optional(),
  firmwareVersion: z.string().max(60).nullable().optional(),
});
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

export const firmwareTargetSchema = z.object({
  deviceType: deviceTypeSchema,
  version: z.string().min(1, 'devices.errors.versionRequired').max(60),
});
export type FirmwareTargetInput = z.infer<typeof firmwareTargetSchema>;

/**
 * Device settings — client Zod is the SOLE guard: the backend `UpdateDeviceSettingsDto`
 * has ZERO server-side validation (§10.6), yet these writes reach the live field device.
 * Every field is optional (PATCH is partial) but strictly typed/bounded when present.
 */
const sensorPrefSchema = z.object({
  NMEA: z.string(),
  Type: z.string(),
  Unit: z.string(),
  Desc: z.string(),
  EnShow: z.number().int().min(0).max(1).optional(),
  EnLog: z.number().int().min(0).max(1).optional(),
});

export const deviceSettingsSchema = z.object({
  qqEnabled: z.boolean().optional(),
  qqGpsHeight: z.boolean().optional(),
  qfeHeightM: z.number().min(-500).max(10000).optional(),
  qnhHeightM: z.number().min(-500).max(10000).optional(),
  dewPointEnabled: z.boolean().optional(),
  windRoseUnit: z.string().max(20).optional(),
  windRosePeriod: z.string().max(20).optional(),
  windRoseOrient: z.enum(['true', 'relative']).optional(),
  graphicalType: z.string().max(20).optional(),
  graphItem: z.number().int().min(0).max(50).optional(),
  colorScheme: z.number().int().min(0).max(10).optional(),
  pageLayout: z.number().int().min(0).max(10).optional(),
  unitWindSpeed: z.string().max(10).optional(),
  unitPressure: z.string().max(10).optional(),
  unitTemperature: z.string().max(10).optional(),
  unitAltitude: z.string().max(10).optional(),
  sensorShowPrefs: z.array(sensorPrefSchema).nullable().optional(),
  sensorLogPrefs: z.array(sensorPrefSchema).nullable().optional(),
});
export type DeviceSettingsInput = z.infer<typeof deviceSettingsSchema>;

// ── Sessions (Month 10) ───────────────────────────────────────────────────────
// The session PATCH only mutates the comment from the admin panel; the server DTO
// carries no validation for it (§10.6), so the client bounds the length.
export const sessionCommentSchema = z.object({
  comment: z.string().max(2000, 'Comment is too long (max 2000 characters)'),
});
export type SessionCommentInput = z.infer<typeof sessionCommentSchema>;

// ── Alert rules (Month 11) ────────────────────────────────────────────────────
// Client Zod is the PRIMARY guard (§10.6): the CreateAlertRuleDto leaves `sensor`
// a free string and puts NO @Min on threshold/cooldown. Crucially, we restrict
// `sensor` to the keys the backend alert-evaluator can actually resolve (MET_/
// NEP_SENSOR_MAP in alert-rules/evaluate.ts) — a rule on any other key would be
// accepted by the API but could never fire, silently.
export const MET_ALERT_SENSORS = ['wind_speed', 'wind_dir', 'temperature', 'humidity', 'pressure', 'dew_point'] as const;
export const NEP_ALERT_SENSORS = ['turbidity', 'temperature'] as const;

const alertConditionSchema = z.enum(['gt', 'lt', 'gte', 'lte']);
const alertAppTypeSchema = z.enum(['MET', 'NEP']);
/** A 24-hex Mongo ObjectId (deviceId / notifyUserIds — the DTO's only real check). */
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');

export const alertRuleSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(120),
    deviceId: objectId.describe('Select a device'),
    appType: alertAppTypeSchema,
    sensor: z.string().min(1, 'Select a sensor'),
    condition: alertConditionSchema,
    threshold: z
      .number({ invalid_type_error: 'Threshold must be a number' })
      .finite('Threshold must be a number'),
    unit: z.string().min(1, 'Unit is required').max(20),
    cooldownMinutes: z
      .number({ invalid_type_error: 'Cooldown must be a number' })
      .int()
      .min(0, 'Cooldown cannot be negative')
      .max(10080, 'Cooldown is too large')
      .default(60),
    notifyUserIds: z.array(objectId).default([]),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const allowed: readonly string[] = v.appType === 'MET' ? MET_ALERT_SENSORS : NEP_ALERT_SENSORS;
    if (!allowed.includes(v.sensor)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Not a valid ${v.appType} sensor`, path: ['sensor'] });
    }
  });
export type AlertRuleInput = z.infer<typeof alertRuleSchema>;

export const updateAlertRuleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sensor: z.string().min(1).optional(),
  condition: alertConditionSchema.optional(),
  threshold: z.number().finite().optional(),
  unit: z.string().min(1).max(20).optional(),
  cooldownMinutes: z.number().int().min(0).max(10080).optional(),
  notifyUserIds: z.array(objectId).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAlertRuleInput = z.infer<typeof updateAlertRuleSchema>;

// ── Share links (Month 11) ────────────────────────────────────────────────────
// The share DTO DOES validate resourceType/expiresAt server-side; client mirrors it.
export const createShareSchema = z.object({
  resourceType: z.enum(['nepSession', 'metRecord']),
  resourceId: z.string().min(1),
  /** ISO date; omitted → backend defaults to +30 days. */
  expiresAt: z.string().datetime().optional(),
});
export type CreateShareInput = z.infer<typeof createShareSchema>;
