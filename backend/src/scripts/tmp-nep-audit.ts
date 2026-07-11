import 'dotenv/config';
import mongoose from 'mongoose';
import { NepSession } from '../models/NepSession';
import { NepSample } from '../models/NepSample';

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 15000 });
  const sessions = await NepSession.find({ deletedAt: null }).select('id deviceName sampleCount').lean();
  let mismatches = 0;
  for (const s of sessions) {
    const actual = await NepSample.countDocuments({ sessionId: s.id });
    const distinct = (await NepSample.distinct('timestamp', { sessionId: s.id })).length;
    if (actual !== s.sampleCount || actual !== distinct) {
      mismatches++;
      console.log(`  ${s.deviceName} ${s.id.slice(0,8)}…: sessionDoc.sampleCount=${s.sampleCount} actualRows=${actual} distinctTimestamps=${distinct}${actual !== distinct ? '  ← DUPLICATED SAMPLES' : ''}`);
    }
  }
  console.log(`${sessions.length} sessions checked, ${mismatches} inconsistent`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
