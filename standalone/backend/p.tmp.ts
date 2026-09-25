import 'dotenv/config';
import mongoose from 'mongoose';
(async () => {
  await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 8000 });
  const col = mongoose.connection.db!.collection('metmeasures');
  const n = await col.countDocuments({ phoneLng: { $exists: true } });
  const s = await mongoose.connection.db!.command({ collStats: 'metmeasures' });
  console.log(`${n}|${Math.round(s.avgObjSize)}`);
  await mongoose.disconnect();
})();
