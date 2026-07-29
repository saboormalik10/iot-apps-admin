import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { PushService } from '../src/notifications/push.service';
import { NotificationToken, TOKEN_TTL_DAYS } from '../src/models/NotificationToken';

/**
 * Device push dispatch — targeting, dead-token pruning and TTL refresh.
 *
 * The FCM transport is faked (no credentials, no network); everything below the
 * transport — which tokens get selected, which rows get deleted, which get their
 * TTL slid forward — runs for real against Mongo.
 */
describe('PushService (e2e)', () => {
  const orgId = new Types.ObjectId();
  const userA = new Types.ObjectId();
  const userB = new Types.ObjectId();
  const staleExpiry = new Date(Date.now() + 5 * 86_400_000);

  /** Installs a fake Messaging and records the tokens each batch was sent to. */
  const withFakeFcm = (
    respond: (token: string) => { success: boolean; error?: { code: string } },
  ) => {
    const service = new PushService();
    const batches: string[][] = [];
    const fake = {
      sendEachForMulticast: (msg: { tokens: string[] }) => {
        batches.push(msg.tokens);
        const responses = msg.tokens.map(respond);
        return Promise.resolve({
          successCount: responses.filter((r) => r.success).length,
          failureCount: responses.filter((r) => !r.success).length,
          responses,
        });
      },
    };
    const internals = service as unknown as {
      messagingPromise: Promise<unknown>;
      pushEnabled: boolean;
    };
    internals.messagingPromise = Promise.resolve(fake);
    // Push is switched off in production right now; flip the instance copy so
    // the dispatch/pruning logic below stays covered and ready to re-enable.
    internals.pushEnabled = true;
    return { service, batches };
  };

  const seed = async () => {
    await NotificationToken.insertMany([
      { userId: userA, organizationId: orgId, platform: 'android', token: 'tok-a-live', appId: 'ci', expiresAt: staleExpiry },
      { userId: userA, organizationId: orgId, platform: 'android', token: 'tok-a-dead', appId: 'ci', expiresAt: staleExpiry },
      { userId: userA, organizationId: orgId, platform: 'ios', token: 'tok-a-flaky', appId: 'ci', expiresAt: staleExpiry },
      { userId: userB, organizationId: orgId, platform: 'android', token: 'tok-b-other', appId: 'ci', expiresAt: staleExpiry },
    ]);
  };

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30000 });
  });

  beforeEach(async () => {
    await NotificationToken.deleteMany({ organizationId: orgId });
    await seed();
  });

  afterAll(async () => {
    await NotificationToken.deleteMany({ organizationId: orgId });
    await mongoose.disconnect();
  });

  it('sends only to the named users, not the whole organization', async () => {
    const { service, batches } = withFakeFcm(() => ({ success: true }));

    await service.sendToUsers(orgId.toString(), [userA.toString()], {
      type: 'alert', title: 'Turbidity high', body: '512 NTU', data: { ruleId: 'r1' },
    });

    expect(batches).toHaveLength(1);
    expect(batches[0].sort()).toEqual(['tok-a-dead', 'tok-a-flaky', 'tok-a-live']);
    expect(batches[0]).not.toContain('tok-b-other');
  });

  it('prunes dead tokens, keeps transient failures, and slides the TTL on delivery', async () => {
    const { service } = withFakeFcm((token) => {
      if (token === 'tok-a-dead') {
        return { success: false, error: { code: 'messaging/registration-token-not-registered' } };
      }
      if (token === 'tok-a-flaky') {
        return { success: false, error: { code: 'messaging/internal-error' } };
      }
      return { success: true };
    });

    const res = await service.sendToUsers(orgId.toString(), [userA.toString()], {
      type: 'alert', title: 'Turbidity high', body: '512 NTU', data: null,
    });

    expect(res).toEqual({ sent: 1, failed: 2, pruned: 1 });

    const remaining = await NotificationToken.find({ organizationId: orgId }).lean();
    const tokens = remaining.map((t) => t.token).sort();
    expect(tokens).toEqual(['tok-a-flaky', 'tok-a-live', 'tok-b-other']);

    // Delivered token proves the device is alive → full TTL again.
    const live = remaining.find((t) => t.token === 'tok-a-live');
    const expectedFloor = Date.now() + (TOKEN_TTL_DAYS - 1) * 86_400_000;
    expect(new Date(live!.expiresAt).getTime()).toBeGreaterThan(expectedFloor);

    // A transient failure must not touch the row's lifetime.
    const flaky = remaining.find((t) => t.token === 'tok-a-flaky');
    expect(new Date(flaky!.expiresAt).getTime()).toBe(staleExpiry.getTime());
  });

  it('keeps every token when a whole batch is rejected as invalid-argument', async () => {
    // Ambiguous code: a malformed message looks exactly like a batch of dead
    // tokens. Deleting on that would wipe the fleet over one bad payload.
    const { service } = withFakeFcm(() => ({
      success: false,
      error: { code: 'messaging/invalid-argument' },
    }));

    const res = await service.sendToUsers(orgId.toString(), [userA.toString()], {
      type: 'alert', title: 'bad', body: 'bad', data: null,
    });

    expect(res).toEqual({ sent: 0, failed: 3, pruned: 0 });
    expect(await NotificationToken.countDocuments({ organizationId: orgId })).toBe(4);
  });

  it('is a no-op with no users, no tokens, or push unconfigured', async () => {
    const { service, batches } = withFakeFcm(() => ({ success: true }));

    expect(await service.sendToUsers(orgId.toString(), [], { type: 'alert', title: 't', body: 'b', data: null }))
      .toEqual({ sent: 0, failed: 0, pruned: 0 });
    expect(await service.sendToUsers(orgId.toString(), [new Types.ObjectId().toString()], { type: 'alert', title: 't', body: 'b', data: null }))
      .toEqual({ sent: 0, failed: 0, pruned: 0 });
    expect(batches).toHaveLength(0);

    // No FCM_SERVICE_ACCOUNT_* in the environment → disabled, never queries.
    delete process.env.FCM_SERVICE_ACCOUNT_B64;
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    const unconfigured = new PushService();
    expect(await unconfigured.sendToUsers(orgId.toString(), [userA.toString()], { type: 'alert', title: 't', body: 'b', data: null }))
      .toEqual({ sent: 0, failed: 0, pruned: 0 });
  });

  it('is off by the master switch — WebSocket is the only delivery path', async () => {
    // Guards the current product decision: even with credentials present and
    // tokens registered, a default PushService must not dispatch anything.
    process.env.FCM_SERVICE_ACCOUNT_B64 = Buffer.from('{"unused":true}').toString('base64');
    const prod = new PushService();

    expect(await prod.sendToUsers(orgId.toString(), [userA.toString()], {
      type: 'alert', title: 'Turbidity high', body: '512 NTU', data: null,
    })).toEqual({ sent: 0, failed: 0, pruned: 0 });

    // Tokens are deliberately left untouched so the registry keeps filling.
    expect(await NotificationToken.countDocuments({ organizationId: orgId })).toBe(4);
  });
});
