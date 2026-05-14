import AsyncStorage from '@react-native-async-storage/async-storage';
import {getDBConnection} from '../utils/db.js';

/**
 * Migration utility to transfer logging data from AsyncStorage to SQLite
 */
export const migrateAsyncStorageToSQLite = async () => {
  try {
    console.log('Starting migration from AsyncStorage to SQLite...');

    // Check if migration has already been completed
    const migrationComplete = await AsyncStorage.getItem('migrationCompleted');
    if (migrationComplete === 'true') {
      console.log('Migration already completed. Skipping...');
      return { success: true, alreadyMigrated: true };
    }

    const db = await getDBConnection();

    // Step 1: Migrate logging sessions
    const loggingSessions = await AsyncStorage.getItem('loggingSessions');
    let migratedSessions = 0;
    let migratedSamples = 0;

    if (loggingSessions) {
      const sessions = JSON.parse(loggingSessions);
      console.log(`Found ${sessions.length} logging sessions to migrate`);

      for (const session of sessions) {
        try {
          // Insert session into SQLite
          await db.executeSql(
            `INSERT OR IGNORE INTO loggingSessions
            (id, deviceId, deviceName, timestamp, timezoneName, timezoneOffset, turbidityEnabled, temperatureEnabled, comment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              session.id,
              session.deviceId,
              session.deviceName,
              session.timestamp,
              session.timezoneName,
              session.timezoneOffset,
              session.turbidityEnabled ? 1 : 0,
              session.temperatureEnabled ? 1 : 0,
              session.comment || '',
            ]
          );
          migratedSessions++;

          // Step 2: Migrate data samples for this session
          const samplesKey = `loggingSessionsData_${session.id}`;
          const samplesData = await AsyncStorage.getItem(samplesKey);

          if (samplesData) {
            const samples = JSON.parse(samplesData);
            console.log(`Migrating ${samples.length} samples for session ${session.id}`);

            for (const sample of samples) {
              try {
                await db.executeSql(
                  `INSERT OR IGNORE INTO loggingSessionSamples
                  (sessionId, timestamp, turbidityValue, temperatureValue, locationLat, locationLng, batteryLevel, batteryRawVoltage)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    session.id,
                    sample.timestamp,
                    sample.turbidityValue || null,
                    sample.temperatureValue || null,
                    sample.locationLat || null,
                    sample.locationLng || null,
                    sample.batteryLevel || null,
                    sample.batteryRawVoltage || null,
                  ]
                );
                migratedSamples++;
              } catch (sampleError) {
                console.warn(`Error migrating sample for session ${session.id}:`, sampleError);
              }
            }
          }
        } catch (sessionError) {
          console.warn(`Error migrating session ${session.id}:`, sessionError);
        }
      }
    } else {
      console.log('No logging sessions found in AsyncStorage');
    }

    // Mark migration as complete
    await AsyncStorage.setItem('migrationCompleted', 'true');

    console.log(`Migration completed successfully! Migrated ${migratedSessions} sessions and ${migratedSamples} samples`);

    return {
      success: true,
      migratedSessions,
      migratedSamples,
      alreadyMigrated: false,
    };
  } catch (error) {
    console.error('Error during migration:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Optional: Clean up AsyncStorage after successful migration
 * Only call this after verifying the migration was successful
 */
export const cleanupAsyncStorageAfterMigration = async () => {
  try {
    console.log('Cleaning up AsyncStorage data...');

    // Get all logging sessions to find their data keys
    const loggingSessions = await AsyncStorage.getItem('loggingSessions');

    if (loggingSessions) {
      const sessions = JSON.parse(loggingSessions);

      // Remove each session's data
      for (const session of sessions) {
        await AsyncStorage.removeItem(`loggingSessionsData_${session.id}`);
      }

      // Remove the sessions list
      await AsyncStorage.removeItem('loggingSessions');
    }

    console.log('AsyncStorage cleanup completed');
    return { success: true };
  } catch (error) {
    console.error('Error cleaning up AsyncStorage:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Reset migration flag (for testing purposes only)
 */
export const resetMigrationFlag = async () => {
  await AsyncStorage.removeItem('migrationCompleted');
  console.log('Migration flag reset');
};
