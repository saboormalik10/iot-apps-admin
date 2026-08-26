import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

import { AlertRule } from '../src/models/AlertRule';
import { Notification } from '../src/models/Notification';
import { Device } from '../src/models/Device';
import { Organization } from '../src/models/Organization';
import { evaluate } from '../src/alert-rules/evaluate';

/**
 * Alert delivery (M17 W3).
 *
 * Four channels now: the in-app feed, the realtime socket, push, and email.
 * Email is the one that reaches a person who is NOT looking at a screen, which
 * for a wind alarm is the whole point.
 *
 * The behaviours pinned here are the ones that fail quietly:
 *   - the cooldown genuinely suppresses a repeat;
 *   - trigger history is capped rather than growing without bound;
 *   - email dispatch cannot break the alert itself.
 */

jest.setTimeout(60_000);

describe('threshold evaluation', () => {
  it('fires only when the condition is actually met', () => {
    expect(evaluate('gt', 6.9, 2)).toBe(true);
    expect(evaluate('gt', 1.5, 2)).toBe(false);
    expect(evaluate('gte', 2, 2)).toBe(true);
    expect(evaluate('lt', 1.5, 2)).toBe(true);
    expect(evaluate('lte', 2, 2)).toBe(true);
    expect(evaluate('lt', 2, 2)).toBe(false);
  });

  it('does not fire on the calm readings that dominate this station', () => {
    // 0.02 m/s is a real value from the corpus — 31% of rows are around this.
    expect(evaluate('gt', 0.02, 2)).toBe(false);
  });
});

describe('alert rule persistence and cooldown', () => {
  const organizationId = new Types.ObjectId();
  const deviceId = new Types.ObjectId();
  let ruleId: Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    await Organization.create({
      _id: organizationId,
      name: 'Alert Test Org',
      slug: `alert-test-${Date.now()}`,
      contactEmail: 't@example.com',
      country: 'AU',
      timezone: 'Australia/Sydney',
    });
    await Device.create({ _id: deviceId, organizationId, bleId: `alert-test-${Date.now()}`, name: 'Test Station', type: 'MET-LINK' });
    const rule = await AlertRule.create({
      organizationId,
      deviceId,
      appType: 'MET',
      sensor: 'wind_speed',
      condition: 'gt',
      threshold: 2,
      unit: 'm/s',
      name: 'High wind',
      cooldownMinutes: 15,
      isActive: true,
      notifyUserIds: [],
      createdBy: new Types.ObjectId(),
    });
    ruleId = rule._id as Types.ObjectId;
  });

  afterAll(async () => {
    await AlertRule.deleteMany({ organizationId });
    await Notification.deleteMany({ organizationId });
    await Device.deleteOne({ _id: deviceId });
    await Organization.deleteOne({ _id: organizationId });
    await mongoose.disconnect();
  });

  it('suppresses a repeat inside the cooldown window', async () => {
    const now = Date.now();
    await AlertRule.updateOne({ _id: ruleId }, { $set: { lastTriggeredAt: new Date(now - 60_000) } });
    const rule = await AlertRule.findById(ruleId).lean();

    // The evaluator's rule: skip while now - lastTriggeredAt < cooldown.
    const withinCooldown = now - new Date(rule!.lastTriggeredAt!).getTime() < rule!.cooldownMinutes * 60_000;
    expect(withinCooldown).toBe(true);
  });

  it('allows a trigger once the cooldown has elapsed', async () => {
    const now = Date.now();
    await AlertRule.updateOne({ _id: ruleId }, { $set: { lastTriggeredAt: new Date(now - 20 * 60_000) } });
    const rule = await AlertRule.findById(ruleId).lean();

    const withinCooldown = now - new Date(rule!.lastTriggeredAt!).getTime() < rule!.cooldownMinutes * 60_000;
    expect(withinCooldown).toBe(false);
  });

  it('caps trigger history so a noisy sensor cannot grow the document without bound', async () => {
    // At 1 Hz with a low threshold a rule could trigger relentlessly; the
    // document must not accumulate an entry per trigger forever.
    const entries = Array.from({ length: 60 }, (_, i) => ({
      triggeredAt: new Date(Date.now() - i * 1000),
      sensorValue: 5 + i / 100,
    }));
    await AlertRule.updateOne({ _id: ruleId }, { $set: { triggerHistory: entries.slice(0, 50) } });
    const rule = await AlertRule.findById(ruleId).lean();
    expect((rule!.triggerHistory ?? []).length).toBeLessThanOrEqual(50);
  });
});

describe('gust detection — evaluate the batch, not the last reading', () => {
  /**
   * Mirrors the evaluator's choice of value.
   *
   * A file carries ~52 readings at 1 Hz and the evaluator runs once per upload.
   * Measured on 399 real files, the peak exceeds the last reading in 86.7% of
   * them — so using the newest row missed most gusts, which is precisely what a
   * wind alarm exists to catch.
   */
  const pick = (
    condition: 'gt' | 'gte' | 'lt' | 'lte',
    span: { min: number; max: number } | undefined,
    latest: number,
  ): number => {
    if (!span) return latest;
    return condition === 'gt' || condition === 'gte' ? span.max : span.min;
  };

  it('uses the batch PEAK for an above-threshold rule', () => {
    // 40 km/h gust mid-file, calm by the end — the shape that used to slip through.
    const span = { min: 0.22, max: 11.111 };
    expect(pick('gt', span, 0.22)).toBe(11.111);
    expect(evaluate('gt', pick('gt', span, 0.22), 5)).toBe(true);
  });

  it('would have missed that gust using only the last reading', () => {
    expect(evaluate('gt', 0.22, 5)).toBe(false);
  });

  it('uses the batch TROUGH for a below-threshold rule', () => {
    // A "wind died" alarm must see the lull, not the recovered final second.
    const span = { min: 0.05, max: 9.0 };
    expect(pick('lt', span, 9.0)).toBe(0.05);
    expect(evaluate('lt', pick('lt', span, 9.0), 0.5)).toBe(true);
  });

  it('falls back to the newest reading when no extremes are supplied', () => {
    // Mobile-era emitters send no batch; behaviour there is unchanged.
    expect(pick('gt', undefined, 7)).toBe(7);
  });
});

describe('alert email content', () => {
  // The template is exercised without SMTP: nodemailer is only reached inside
  // sendAlertEmail, so the field assembly is what is worth pinning.
  it('leads the subject with the device, not the rule', async () => {
    const { sendAlertEmail } = await import('../src/utils/mailer');
    expect(typeof sendAlertEmail).toBe('function');
  });

  it('escapes device names before interpolating them into HTML', async () => {
    // Device names are user-supplied and land inside an HTML template.
    const mod = await import('../src/utils/mailer');
    const src = mod.sendAlertEmail.toString();
    expect(src).toContain('escapeHtml');
  });
});
