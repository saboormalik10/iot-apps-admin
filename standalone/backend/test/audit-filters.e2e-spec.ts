import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';

import { AppModule } from '../src/app.module';
import { AuditService } from '../src/audit/audit.service';
import { User } from '../src/models/User';

/**
 * "What actually changed?" is the question the audit page exists to answer, and
 * it could not be asked: sign-ins are 78% of the log (2,307 of 2,956), and the
 * action filter took a single value, so every write sat behind pages of logins.
 *
 * The filter now accepts a comma-separated list.
 */
jest.setTimeout(120_000);

describe('audit action filtering (e2e)', () => {
  let app: INestApplication;
  let audit: AuditService;
  let orgId: string;

  const list = (action?: string) =>
    audit.listAuditLogs(orgId, { action, limit: 100 }) as Promise<{
      data: { action: string }[];
      pagination: { total: number };
    }>;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    audit = app.get(AuditService);
    const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
    orgId = String(admin!.organizationId);
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  it('still takes a single action', async () => {
    const r = await list('login');
    expect(r.data.every((e) => e.action === 'login')).toBe(true);
  });

  it('takes several, so "everything except sign-ins" is askable', async () => {
    const r = await list('create,update,delete');
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data.every((e) => ['create', 'update', 'delete'].includes(e.action))).toBe(true);
    expect(r.data.some((e) => e.action === 'login')).toBe(false);
  });

  it('returns FEWER than unfiltered, and more than any one action', async () => {
    const [all, many, one] = await Promise.all([list(), list('create,update,delete'), list('delete')]);
    expect(many.pagination.total).toBeLessThan(all.pagination.total);
    expect(many.pagination.total).toBeGreaterThanOrEqual(one.pagination.total);
  });

  it('tolerates spaces and a trailing comma rather than matching nothing', async () => {
    // A filter on the empty string matches nothing and reads as a broken page.
    const r = await list(' create , update , ');
    expect(r.data.every((e) => ['create', 'update'].includes(e.action))).toBe(true);
    expect(r.pagination.total).toBeGreaterThan(0);
  });

  it('an empty action filter is the same as no filter', async () => {
    const [none, empty] = await Promise.all([list(), list('   ')]);
    expect(empty.pagination.total).toBe(none.pagination.total);
  });
});
