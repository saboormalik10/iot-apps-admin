/** READ-ONLY. What the chart now gets for the real record, vs the old slice. */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { RecordsService } from '../records/records.service';
import { MetRecord } from '../models/MetRecord';
import { User } from '../models/User';

(async () => {
  await mongoose.connect(process.env.MONGO_URI as string);
  const app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  await app.init();
  const records = app.get(RecordsService);

  const admin = await User.findOne({ email: 'admin@observator.com' }).lean();
  const rec = await MetRecord.findOne({ organizationId: admin!.organizationId }).sort({ dateStartMs: -1 }).lean();

  const res = await records.getSeries({
    organizationId: String(admin!.organizationId),
    recordId: String(rec!._id),
    fields: ['tempC', 'humidityPct', 'pressureHpa', 'dewPointC', 'windSpeedMs'],
  });

  console.log(`record ${rec!.dayKey}, bucket = ${res.intervalMs / 1000}s, ${res.data.length} buckets\n`);
  for (const f of ['tempC', 'humidityPct', 'pressureHpa', 'dewPointC', 'windSpeedMs']) {
    const pts = res.data.filter((b) => b[f] !== null);
    const first = pts[0]?.ts as number | undefined;
    const lastPt = pts[pts.length - 1]?.ts as number | undefined;
    console.log(
      `  ${f.padEnd(14)} ${String(pts.length).padStart(4)} points` +
        (first ? `  ${new Date(first).toISOString().slice(11, 16)} → ${new Date(lastPt!).toISOString().slice(11, 16)}` : ''),
    );
  }
  await app.close();
  await mongoose.disconnect();
})();
