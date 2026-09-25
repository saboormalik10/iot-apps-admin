import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';

import { BCRYPT_COST } from '../common/bcrypt';
import { SEEDED_ROLES, sanitizePermissions } from '../common/permissions';
import { Device } from '../models/Device';
import { Organization } from '../models/Organization';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { canonicalTimeZone } from '../common/validators/is-time-zone.validator';

/**
 * Makes a fresh install usable, on every start.
 *
 * WHY THIS EXISTS
 * The cloud portal was set up once, by hand, with migration scripts — system
 * roles, the organisation, the first accounts. A standalone PC has nobody to run
 * those. On a fresh database there are no roles, so every user ends up with no
 * permissions at all; no organisation; and no one who can log in. This does all
 * of that the first time the service starts.
 *
 * IDEMPOTENT, AND SAFE TO RUN ON EVERY START
 * Each step creates only what is missing. The one exception is deliberate: the
 * system roles are re-synced to the code each time, so when an upgrade changes
 * what a built-in role may do, existing installs pick it up with no migration
 * for a technician to forget.
 *
 * INDEXES
 * The cloud creates indexes with migration scripts and runs with `autoIndex` off
 * in production, so a fresh site database would have none: no unique key on the
 * minute rows, and every query a scan. The code's schemas are the only source of
 * truth here, so each start syncs to them — creating what is missing and dropping
 * what the schemas no longer declare (the weather-data expiry indexes an earlier
 * build created, for instance: data is kept indefinitely).
 *
 * SINGLE SITE
 * One organisation and one station. If an organisation already exists, nothing
 * about it is changed — including its name and timezone, which the admin owns
 * once the install is running.
 */
@Injectable()
export class FirstRunService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FirstRunService.name);

  async onApplicationBootstrap(): Promise<void> {
    // First: the role upsert below relies on a unique index to settle a race.
    await this.ensureIndexes();
    await this.ensureSystemRoles();
    const org = await this.ensureOrganization();
    await this.ensureStation(org);
    await this.ensureFirstAdmin(org);
  }

  /**
   * Every registered model's indexes, synced to its schema.
   *
   * A failure is logged and does not stop the start: a unique index that cannot
   * be built over existing duplicates is a data problem to fix, and refusing to
   * start would take the whole site's display down with it.
   */
  async ensureIndexes(): Promise<void> {
    for (const name of mongoose.modelNames()) {
      try {
        const dropped = await mongoose.model(name).syncIndexes();
        if (dropped.length) this.logger.log(`${name}: dropped indexes not in the schema: ${dropped.join(', ')}`);
      } catch (err) {
        this.logger.error(`${name}: could not sync indexes — ${String(err)}`);
      }
    }
  }

  /** The three built-in roles, matching the code exactly. */
  async ensureSystemRoles(): Promise<void> {
    for (const seed of SEEDED_ROLES) {
      try {
        await Role.findOneAndUpdate(
          { organizationId: null, key: seed.key },
          {
            $set: {
              name: seed.name,
              description: seed.description,
              permissions: sanitizePermissions(seed.permissions),
              baseRole: seed.key,
              isSystem: true,
              deletedAt: null,
              isDefault: seed.key === 'viewer',
            },
          },
          { upsert: true },
        );
      } catch (err) {
        // Two processes starting at once can both try to insert; the unique index
        // lets exactly one win, and the loser's row is the same row. Anything
        // else is a real failure and must not be hidden.
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
  }

  /** The site's one organisation, created on a fresh database. */
  async ensureOrganization() {
    const existing = await Organization.findOne({ deletedAt: null }).sort({ createdAt: 1 });
    if (existing) return existing;

    const name = process.env.STANDALONE_SITE_NAME?.trim() || 'Weather Station';
    // The PC's own timezone. It decides where each day's record starts, so for a
    // machine sitting at the site it is the right default rather than UTC.
    // Validated: a typo would otherwise be stored as typed, and every day would be
    // cut at a UTC fallback.
    const configured = process.env.STANDALONE_TIMEZONE?.trim() ?? '';
    const pcZone = canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? 'UTC';
    let timezone = pcZone;
    if (configured) {
      const valid = canonicalTimeZone(configured);
      if (valid) timezone = valid;
      else this.logger.warn(`STANDALONE_TIMEZONE "${configured}" is not a time zone name; using this PC's (${pcZone}).`);
    }

    const org = await Organization.create({
      name,
      slug: `${slugify(name)}-${new Types.ObjectId().toString().slice(-6)}`,
      contactEmail: process.env.STANDALONE_ADMIN_EMAIL?.trim().toLowerCase() || 'admin@localhost',
      country: process.env.STANDALONE_COUNTRY?.trim() || 'AU',
      timezone,
    });
    this.logger.log(`created organisation "${name}" (timezone ${timezone})`);
    return org;
  }

  /** The station the sensor stream writes to. */
  async ensureStation(org: { _id: unknown }): Promise<void> {
    const orgId = org._id as Types.ObjectId;
    const existing = await Device.findOne({ organizationId: orgId, type: 'MET-LINK', deletedAt: null });
    if (existing) return;

    const name = process.env.STANDALONE_STATION_NAME?.trim() || 'GMX551 Station';
    await Device.create({
      organizationId: orgId,
      // `bleId` is required and unique per type. Nothing here is Bluetooth — it
      // is simply the station's stable identifier.
      bleId: `STANDALONE-${orgId.toString().slice(-8)}`,
      name,
      type: 'MET-LINK',
    });
    this.logger.log(`created station "${name}"`);
  }

  /**
   * The first administrator, from the installer — never a default password.
   *
   * A built-in `admin / admin` would be the same on every site the product is
   * installed at, and on a network-reachable PC that is an open door. So the
   * credentials must be supplied; without them the service still runs, and says
   * plainly what is missing.
   */
  async ensureFirstAdmin(org: { _id: unknown }): Promise<void> {
    const orgId = org._id as Types.ObjectId;
    const hasAdmin = await User.exists({ organizationId: orgId, role: 'admin', isActive: { $ne: false }, deletedAt: null });
    if (hasAdmin) return;

    const email = process.env.STANDALONE_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.STANDALONE_ADMIN_PASSWORD;
    if (!email || !password) {
      this.logger.warn(
        'No administrator exists and none was configured. Set STANDALONE_ADMIN_EMAIL and ' +
          'STANDALONE_ADMIN_PASSWORD and restart the service to create one.',
      );
      return;
    }
    if (password.length < 8) {
      this.logger.error('STANDALONE_ADMIN_PASSWORD must be at least 8 characters — no administrator created.');
      return;
    }

    const adminRole = await Role.findOne({ organizationId: null, key: 'admin', deletedAt: null }).select('_id').lean();
    await User.create({
      organizationId: orgId,
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      firstName: 'Administrator',
      role: 'admin',
      roleId: adminRole?._id ?? null,
      isActive: true,
    });
    this.logger.log(`created administrator ${email}`);
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'site';
}
