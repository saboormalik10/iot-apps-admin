// Types
interface LoggingSession {
  id: string;
  deviceId: string;
  deviceName: string;
  timezoneName: string;
  timezoneOffset: string;
  turbidityEnabled: boolean;
  temperatureEnabled: boolean;
  timestamp: number;
  comment?: string;
}

interface LoggingSessionSample {
  loggingSessionId: string;
  timestamp: number;
  turbidityValue?: number | null;
  temperatureValue?: number | null;
  locationLat?: number | null;
  locationLng?: number | null;
  batteryLevel?: number;
  batteryRawVoltage?: number;
  demoModeEnabled?: boolean;
}

interface LoggingState {
  isLogging: boolean;
  loggingSessionId: string | null;
  loggingSession: LoggingSession | null;
  loggingSessions: LoggingSession[];
  loggingSessionSamplesLoaded: boolean;
  loggingSessionSamples: LoggingSessionSample[];
  loggingSessionSampleCount: number;
}

interface LoggingAction {
  type: string;
  meta?: any;
  payload?: any;
}

const initialState: LoggingState = {
  isLogging: false,
  loggingSessionId: null,
  loggingSession: null,
  loggingSessions: [],
  loggingSessionSamplesLoaded: false,
  loggingSessionSamples: [],
  loggingSessionSampleCount: 0,
};

export default function loggingReducer(
  state: LoggingState = initialState,
  action: LoggingAction
): LoggingState {
  switch (action.type) {
    case 'LOGGING_START_LOGGING':
      return {
        ...state,
        loggingSessionId: action.meta.newSession.id,
        isLogging: true,
        loggingSession: action.meta.newSession,
        loggingSessionSamples: [],
        loggingSessionSampleCount: 0,
      };

    case 'LOGGING_STOP_LOGGING':
      return {
        ...state,
        isLogging: false,
        loggingSessionSamples: [],
        loggingSessionSampleCount: 0,
      };

    case 'LOGGING_ADD_DATA_TO_SESSION': {
      const loggingSessionSamples = [action.payload.dataSample];
      return {
        ...state,
        loggingSessionSamples: loggingSessionSamples,
        loggingSessionSampleCount: state.loggingSessionSampleCount + 1,
      };
    }

    case 'LOGGING_FETCH_LOGGING_SESSIONS':
      return {
        ...state,
        loggingSessions: action.payload.loggingSessions,
      };

    case 'LOGGING_DELETE_LOGGING_SESSION': {
      const loggingSessions = state.loggingSessions.filter(
        loggingSession => loggingSession.id !== action.payload.loggingSessionId
      );
      return { ...state, loggingSessions };
    }

    case 'LOGGING_GET_LOGGING_SESSION':
    case 'LOGGING_UPDATE_LOGGING_SESSION_COMMENT':
      return {
        ...state,
        loggingSessionId: action.payload.loggingSession.id,
        loggingSession: action.payload.loggingSession,
      };

    case 'LOGGING_FETCH_LOGGING_SESSION_SAMPLES':
      console.log("XXX LOGGING_FETCH_LOGGING_SESSION_SAMPLES action",action)
      return {
        ...state,
        loggingSessionSamples: action.payload.loggingSessionSamples,
        loggingSessionSamplesLoaded: true,
        loggingSessionSampleCount: action.payload.loggingSessionSamples.length,
      };

    case 'LOGGING_CLEAR_LOGGING_SESSION':
      return {
        ...state,
        loggingSessionSamples: [],
        loggingSessionId: null,
        loggingSession: null,
        loggingSessionSamplesLoaded: false,
      };

    default:
      return state;
  }
}

// Export types for use in other files
export type { LoggingSession, LoggingSessionSample, LoggingState };
