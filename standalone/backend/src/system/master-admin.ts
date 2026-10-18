import { Types } from 'mongoose';

import { User } from '../models/User';

/**
 * The master administrator: the site's FIRST active administrator — the one the
 * installer created. Stopping and starting the weather station from the portal is
 * theirs alone (client, 10 Oct 2026: "system admin only").
 */
export async function isMasterAdmin(userId: string, organizationId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(organizationId)) return false;
  const master = await User.findOne({
    organizationId: new Types.ObjectId(organizationId),
    role: 'admin',
    isActive: true,
    deletedAt: null,
  })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id')
    .lean();
  return master !== null && String(master._id) === userId;
}
