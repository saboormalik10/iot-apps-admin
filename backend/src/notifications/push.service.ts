import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationToken } from '../models/NotificationToken';

/**
 * Push transport seam. Delivery today is WebSocket (see NotificationsService);
 * real device push (FCM/APNs via OneSignal) fires only when
 * `PUSH_ONESIGNAL_APP_ID` + `PUSH_ONESIGNAL_API_KEY` are configured — otherwise
 * it is a logged no-op, mirroring the Month-5 Sentry env-gate. This is the one
 * place a real provider dispatch drops in, with zero API/model change.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  private get enabled(): boolean {
    return Boolean(process.env.PUSH_ONESIGNAL_APP_ID && process.env.PUSH_ONESIGNAL_API_KEY);
  }

  async sendToOrg(
    organizationId: string,
    payload: { title: string; body: string; data: Record<string, unknown> | null },
  ): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`[push disabled] "${payload.title}" (org ${organizationId})`);
      return;
    }
    const tokens = await NotificationToken.find({
      organizationId: new Types.ObjectId(organizationId),
    })
      .select('token platform')
      .lean();
    if (tokens.length === 0) return;
    // Real OneSignal/FCM/APNs dispatch drops in here (kept out until a provider
    // + credentials are decided). Structured so this is the only change point.
    this.logger.log(`[push] would dispatch ${tokens.length} token(s): "${payload.title}"`);
  }
}
