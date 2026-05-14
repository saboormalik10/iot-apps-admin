import RNFS from 'react-native-fs';
import { getDBConnection, createTables } from '../utils/db.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dispatch } from 'redux';

interface LoggingSession {
  id: string;
  deviceId: string;
  deviceName: string;
  timestamp: number;
  timezoneName: string;
  timezoneOffset: number;
  turbidityEnabled: boolean;
  temperatureEnabled: boolean;
  comment: string;
}

interface DataSample {
  timestamp: number;
  turbidityValue: number | null;
  temperatureValue: number | null;
  locationLat: number | null;
  locationLng: number | null;
  batteryLevel: number | null;
  batteryRawVoltage: number | null;
}

interface LoggingAction {
  type: string;
  payload?: any;
  meta?: any;
}

export const startLogging = (
  loggingSessionId: string,
  deviceId: string,
  deviceName: string,
  timezoneName: string,
  timezoneOffset: number,
  turbidityEnabled: boolean,
  temperatureEnabled: boolean,
) => {
  const newSession: LoggingSession = {
    id: loggingSessionId,
    deviceId,
    deviceName,
    timestamp: new Date().getTime(),
    timezoneName,
    timezoneOffset,
    turbidityEnabled,
    temperatureEnabled,
    comment: '',
  };

  return async (dispatch: Dispatch<LoggingAction>) => {
    const db = await getDBConnection();
    await db.executeSql(
      'INSERT INTO loggingSessions (id, deviceId, deviceName, timestamp, timezoneName, timezoneOffset, turbidityEnabled, temperatureEnabled, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        newSession.id,
        newSession.deviceId,
        newSession.deviceName,
        newSession.timestamp,
        newSession.timezoneName,
        newSession.timezoneOffset,
        newSession.turbidityEnabled ? 1 : 0,
        newSession.temperatureEnabled ? 1 : 0,
        '',
      ],
    );
    dispatch({
      type: 'LOGGING_START_LOGGING',
      meta: { newSession },
    });
  };
};

export const addDataToLoggingSession =
  (loggingSessionId: string, dataObj: DataSample) =>
  async (dispatch: Dispatch<LoggingAction>) => {
    try {
      const db = await getDBConnection();
      await db.executeSql(
        'INSERT INTO loggingSessionSamples (sessionId, timestamp, turbidityValue, temperatureValue, locationLat, locationLng, batteryLevel, batteryRawVoltage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          loggingSessionId,
          dataObj.timestamp,
          dataObj.turbidityValue,
          dataObj.temperatureValue,
          dataObj.locationLat,
          dataObj.locationLng,
          dataObj.batteryLevel,
          dataObj.batteryRawVoltage,
        ],
      );
      dispatch({
        type: 'LOGGING_ADD_DATA_TO_SESSION',
        payload: { dataSample: dataObj },
      });
    } catch (e) {
      console.log('Error in addDataToLoggingSession', e);
    }
  };

// export const saveLoggingSessionSamples = (
//   loggingSessionId: string,
//   dataSamples: DataSample[],
// ) => {
//   return (dispatch: Dispatch<LoggingAction>) => {
//     dispatch({
//       type: 'LOGGING_SAVE_LOGGING_SESSION_SAMPLES',
//       payload: dataSamples,
//     });
//   };
// };

export const stopLogging = () => {
  return (dispatch: Dispatch<LoggingAction>) => {
    dispatch({
      type: 'LOGGING_STOP_LOGGING',
    });
  };
};

export const fetchLoggingSessions =
  () => async (dispatch: Dispatch<LoggingAction>) => {
    try {
      const db = await getDBConnection();
      const [results] = await db.executeSql(
        'SELECT * FROM loggingSessions ORDER BY timestamp DESC',
      );

      const loggingSessions: LoggingSession[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        loggingSessions.push(results.rows.item(i));
      }
      console.log('Fetched logging sessions:', loggingSessions);
      dispatch({
        type: 'LOGGING_FETCH_LOGGING_SESSIONS',
        payload: { loggingSessions },
      });
    } catch (e) {
      console.log('Error in fetchLoggingSessions', e);
    }
  };

export const getLoggingSession =
  (loggingSessionId: string) => async (dispatch: Dispatch<LoggingAction>) => {
    try {
      const db = await getDBConnection();
      const [results] = await db.executeSql(
        'SELECT * FROM loggingSessions WHERE id = ?',
        [loggingSessionId],
      );
      const loggingSession: LoggingSession | null = results.rows.length
        ? results.rows.item(0)
        : null;
      console.log('XXX {loggingSession}', { loggingSession });
      dispatch({
        type: 'LOGGING_GET_LOGGING_SESSION',
        payload: { loggingSession },
      });
    } catch (e) {
      console.log('Error in getLoggingSession', e);
    }
  };

export const fetchLoggingSessionSamples =
  (loggingSessionId: string) => async (dispatch: Dispatch<LoggingAction>) => {
    try {
      const db = await getDBConnection();
      const [results] = await db.executeSql(
        'SELECT * FROM loggingSessionSamples WHERE sessionId = ? ORDER BY timestamp ASC',
        [loggingSessionId],
      );
      const loggingSessionSamples: DataSample[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        loggingSessionSamples.push(results.rows.item(i));
      }
      dispatch({
        type: 'LOGGING_FETCH_LOGGING_SESSION_SAMPLES',
        payload: { loggingSessionSamples },
      });
    } catch (e) {
      console.log('Error in fetchLoggingSessionSamples', e);
    }
  };

export const updateLoggingSessionComment =
  (loggingSessionId: string, comment: string) =>
  async (dispatch: Dispatch<LoggingAction>) => {
    try {
      const db = await getDBConnection();
      await db.executeSql(
        'UPDATE loggingSessions SET comment = ? WHERE id = ?',
        [comment, loggingSessionId],
      );
      const [results] = await db.executeSql(
        'SELECT * FROM loggingSessions WHERE id = ?',
        [loggingSessionId],
      );
      const loggingSession: LoggingSession | null = results.rows.length
        ? results.rows.item(0)
        : null;
      dispatch({
        type: 'LOGGING_UPDATE_LOGGING_SESSION_COMMENT',
        payload: { loggingSession },
      });
    } catch (e) {
      console.log('Error in updateLoggingSessionComment', e);
    }
  };

export const clearLoggingSession = () => {
  return (dispatch: Dispatch<LoggingAction>) => {
    dispatch({
      type: 'LOGGING_CLEAR_LOGGING_SESSION',
    });
  };
};

export const deleteLoggingSession =
  (loggingSessionId: string) => async (dispatch: Dispatch<LoggingAction>) => {
    try {
      const db = await getDBConnection();
      await db.executeSql(
        'DELETE FROM loggingSessionSamples WHERE sessionId = ?',
        [loggingSessionId],
      );
      await db.executeSql('DELETE FROM loggingSessions WHERE id = ?', [
        loggingSessionId,
      ]);

      RNFS.unlink(
        `${RNFS.DocumentDirectoryPath}/loggingSessionFiles/${loggingSessionId}`,
      ).catch((e) => console.log('RNFS.unlink error', e));
      RNFS.unlink(
        `${RNFS.DocumentDirectoryPath}/loggingSessionThumnails/${loggingSessionId}.jpg`,
      ).catch((e) => console.log('RNFS.unlink error', e));

      dispatch({
        type: 'LOGGING_DELETE_LOGGING_SESSION',
        payload: { loggingSessionId },
      });
    } catch (e) {
      console.log('Error in deleteLoggingSession', e);
    }
  };
