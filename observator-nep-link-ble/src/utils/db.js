import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

export const getDBConnection = async () => {
  return SQLite.openDatabase({name: 'app.db', location: 'default'});
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
};
