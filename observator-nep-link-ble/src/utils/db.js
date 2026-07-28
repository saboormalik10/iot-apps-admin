import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

export const getDBConnection = async () => {
  return SQLite.openDatabase({ name: 'app.db', location: 'default' });
};

const columnExists = async (db, table, column) => {
  const [result] = await db.executeSql(`PRAGMA table_info(${table});`);
  for (let i = 0; i < result.rows.length; i++) {
    if (result.rows.item(i).name === column) return true;
  }
  return false;
};

export const createTables = async db => {
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS loggingSessions (
      id TEXT PRIMARY KEY,
      deviceId TEXT,
      deviceName TEXT,
      timestamp INTEGER,
      timezoneName TEXT,
      timezoneOffset INTEGER,
      turbidityEnabled INTEGER,
      temperatureEnabled INTEGER,
      comment TEXT
    );
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS loggingSessionSamples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT,
      timestamp INTEGER,
      turbidityValue REAL,
      temperatureValue REAL,
      locationLat REAL,
      locationLng REAL,
      batteryLevel INTEGER,
      batteryRawVoltage REAL
    );
  `);

  await db.executeSql(`
  CREATE TABLE IF NOT EXISTS knownDevices (
    id TEXT PRIMARY KEY,
    name TEXT,
    address TEXT,
    customName TEXT
  );
`);

  const hasUpdateStatus = await columnExists(db, 'loggingSessions', 'update_status');
  if (!hasUpdateStatus) {
    await db.executeSql(`ALTER TABLE loggingSessions ADD COLUMN update_status BOOLEAN DEFAULT 0;`);
  }
};
