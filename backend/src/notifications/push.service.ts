import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { ServiceAccount } from 'firebase-admin/app';
import type { BatchResponse, Messaging, MulticastMessage } from 'firebase-admin/messaging';
import { NotificationType } from '../models/Notification';
import { NotificationToken, TOKEN_TTL_DAYS } from '../models/NotificationToken';

/** FCM caps a multicast send at 500 tokens per call. */
const MULTICAST_CHUNK = 500;

/** Named app so we never clobber a default firebase app initialised elsewhere. */
const FIREBASE_APP_NAME = 'observator-push';

/**
 * Android notification channel ids. The mobile apps must create channels with
 * exactly these ids — on API 26+ Android silently drops a notification whose
 * channel does not exist.
 */
export const ANDROID_CHANNEL_ALERTS = 'observator-alerts';
export const ANDROID_CHANNEL_UPDATES = 'observator-updates';

/**
 * Per-token failures meaning "this token is dead" (app uninstalled, reinstalled,
 * or token rotated). Everything else — quota, transport, internal — is transient
 * and must NOT delete the row.
 */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Keys FCM reserves in the data block — passing them through gets the send rejected. */
const RESERVED_DATA_KEYS = new Set(['from', 'message_type', 'notification', 'collapse_key']);

export interface PushPayload {
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

export interface PushResult {
  sent: number;
  failed: number;
  pruned: number;
}

/**
 * Real device push (FCM for Android, and FCM → APNs for iOS) for the
 * notifications raised by alert rules, session-complete and firmware checks.
 *
 * Delivery stays env-gated exactly as before: with no service account
 * configured this is a logged no-op, so unconfigured environments behave as
 * they always have. The credential is a Firebase service-account JSON in
 * `FCM_SERVICE_ACCOUNT_B64` (base64) or `FCM_SERVICE_ACCOUNT_JSON` (raw); iOS
 * works through the APNs auth key uploaded in the Firebase console, so this
 * server never talks to Apple directly.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private messagingPromise: Promise<Messaging | null> | null = null;

  /**
   * Push the notification to the given users' registered devices.
   *
   * Scoped by userId, not just organization: an alert rule names the people it
   * should reach in `notifyUserIds`, and broadcasting to every phone in the org
   * would both leak and drown the fleet in irrelevant alerts.
   */
  async sendToUsers(
    organizationId: string,
    userIds: string[],
    payload: PushPayload,
  ): Promise<PushResult> {
    const empty: PushResult = { sent: 0, failed: 0, pruned: 0 };

    const messaging = await this.getMessaging();
    if (!messaging) {
      this.logger.debug(`[push disabled] "${payload.title}" (org ${organizationId})`);
      return empty;
    }

    const targets = userIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (targets.length === 0) return empty;

    const docs = await NotificationToken.find({
      organizationId: new Types.ObjectId(organizationId),
      userId: { $in: targets },
    })
      .select('token')
      .lean();

    const tokens = [...new Set(docs.map((d) => d.token).filter(Boolean))];
    if (tokens.length === 0) return empty;

    const message = this.buildMessage(payload);
    const delivered: string[] = [];
    const dead: string[] = [];
    let failed = 0;

    for (let i = 0; i < tokens.length; i += MULTICAST_CHUNK) {
      const chunk = tokens.slice(i, i + MULTICAST_CHUNK);
      let res: BatchResponse;
      try {
        res = await messaging.sendEachForMulticast({ ...message, tokens: chunk });
      } catch (err) {
        // Whole-call failure (network, auth). Transient by assumption — keep the tokens.
        failed += chunk.length;
        this.logger.error(`[push] batch send failed: ${(err as Error).message}`);
        continue;
      }

      // `invalid-argument` is ambiguous: FCM returns it for a dead token AND for a
      // malformed message. If every token in the chunk fails that way the fault is
      // almost certainly ours, so shout rather than wipe the whole table.
      const allInvalidArgument =
        res.successCount === 0 &&
        res.responses.every((r) => r.error?.code === 'messaging/invalid-argument');
      if (allInvalidArgument) {
        failed += chunk.length;
        this.logger.error(
          `[push] entire batch rejected as invalid-argument — message is malformed, ${chunk.length} token(s) kept`,
        );
        continue;
      }

      res.responses.forEach((r, idx) => {
        const token = chunk[idx];
        if (r.success) {
          delivered.push(token);
          return;
        }
        failed += 1;
        const code = r.error?.code ?? 'unknown';
        if (DEAD_TOKEN_CODES.has(code)) {
          dead.push(token);
        } else {
          this.logger.warn(`[push] delivery failed (${code}) for token …${token.slice(-8)}`);
        }
      });
    }

    if (dead.length > 0) {
      await NotificationToken.deleteMany({ token: { $in: dead } });
    }
    if (delivered.length > 0) {
      // A device that just accepted a push is demonstrably alive — slide its TTL
      // forward so an app that keeps running but rarely restarts is not reaped.
      await NotificationToken.updateMany(
        { token: { $in: delivered } },
        { $set: { expiresAt: new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000) } },
      );
    }

    this.logger.log(
      `[push] "${payload.title}" → ${delivered.length} delivered, ${failed} failed, ${dead.length} pruned`,
    );
    return { sent: delivered.length, failed, pruned: dead.length };
  }

  // ── Message shape ──────────────────────────────────────────────────────────

  private buildMessage(payload: PushPayload): Omit<MulticastMessage, 'tokens'> {
    // Alerts are the reason this exists — they wake the screen. Session-complete
    // and firmware are informational and must not buzz a phone at 3am.
    const urgent = payload.type === 'alert';

    return {
      // `notification` (rather than data-only) so Android/iOS render it from the
      // system tray while the app is backgrounded or killed, with no JS running.
      notification: { title: payload.title, body: payload.body },
      // `data` carries deviceId / sessionId / ruleId so a tap can deep-link.
      data: this.flattenData(payload),
      android: {
        priority: urgent ? 'high' : 'normal',
        notification: {
          channelId: urgent ? ANDROID_CHANNEL_ALERTS : ANDROID_CHANNEL_UPDATES,
          priority: urgent ? 'high' : 'default',
          ...(urgent ? { sound: 'default' } : {}),
        },
      },
      apns: {
        headers: { 'apns-priority': urgent ? '10' : '5' },
        payload: { aps: urgent ? { sound: 'default' } : {} },
      },
    };
  }

  /** FCM requires every data value to be a string. */
  private flattenData(payload: PushPayload): Record<string, string> {
    const out: Record<string, string> = { type: payload.type };
    for (const [key, value] of Object.entries(payload.data ?? {})) {
      if (value === null || value === undefined) continue;
      if (RESERVED_DATA_KEYS.has(key)) continue;
      out[key] =
        typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : JSON.stringify(value);
    }
    return out;
  }

  // ── Lazy, fail-soft SDK init ───────────────────────────────────────────────

  /** Resolved once; `null` means push is disabled or misconfigured. */
  private getMessaging(): Promise<Messaging | null> {
    if (!this.messagingPromise) this.messagingPromise = this.initMessaging();
    return this.messagingPromise;
  }

  private async initMessaging(): Promise<Messaging | null> {
    const raw = this.readServiceAccount();
    if (!raw) return null;

    try {
      // Imported lazily so an unconfigured deploy never pays the firebase-admin
      // load cost — it is a heavy dependency and this is a cold-start path.
      const [{ initializeApp, getApps, cert }, { getMessaging }] = await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/messaging'),
      ]);

      const parsed = JSON.parse(raw) as Record<string, string | undefined>;
      const { project_id: projectId, client_email: clientEmail } = parsed;
      let privateKey = parsed.private_key;
      if (!projectId || !clientEmail || !privateKey) {
        throw new Error('missing project_id / client_email / private_key');
      }
      // Render/Vercel dashboards store newlines as a literal "\n"; without this
      // the RS256 signature fails with an opaque "Invalid PEM formatted message".
      privateKey = privateKey.replace(/\\n/g, '\n');

      const credential: ServiceAccount = { projectId, clientEmail, privateKey };
      const existing = getApps().find((a) => a.name === FIREBASE_APP_NAME);
      const app = existing ?? initializeApp({ credential: cert(credential) }, FIREBASE_APP_NAME);

      this.logger.log(`[push] FCM enabled (project ${projectId})`);
      return getMessaging(app);
    } catch (err) {
      // Never take the API down over a bad push credential — degrade to the
      // no-op the rest of the system already tolerates.
      this.logger.error(`[push] FCM init failed, push disabled: ${(err as Error).message}`);
      return null;
    }
  }

  private readServiceAccount(): string | null {
    const b64 = process.env.FCM_SERVICE_ACCOUNT_B64?.trim();
    if (b64) return Buffer.from(b64, 'base64').toString('utf8');
    const json = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
    if (json) return json;
    return null;
  }
}
