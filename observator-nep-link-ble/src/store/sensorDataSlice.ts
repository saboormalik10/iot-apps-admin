import { SensorDataAction } from '../actions/SensorDataActions';

interface SensorDataState {
  probeSetting: string | null;
  rangeLabel: string | null;
  turbidityEnabled: boolean;
  temperatureEnabled: boolean;
  turbidityValue: number | null;
  temperatureValue: number | null;
  sampleDateObj: any | null;
  locationEnabled: boolean;
  locationLat: number | null;
  locationLng: number | null;
  batteryLevel: number | null;
  batteryRawVoltage: number | null;
  batteryCharging: boolean | null;
}

const initialState: SensorDataState = {
  probeSetting: null,
  rangeLabel: null,
  turbidityEnabled: false,
  temperatureEnabled: false,
  turbidityValue: null,
  temperatureValue: null,
  sampleDateObj: null,
  locationEnabled: true,
  locationLat: null,
  locationLng: null,
  batteryLevel: null,
  batteryRawVoltage: null,
  batteryCharging: null,
};

export default function sensorDataReducer(
  state: SensorDataState = initialState,
  action: SensorDataAction
): SensorDataState {
  switch (action.type) {
    case 'SENSOR_DATA_UPDATE_VALUES':
      return {
        ...state,
        probeSetting: action.meta.probeSetting ?? state.probeSetting,
        rangeLabel: action.meta.rangeLabel ?? state.rangeLabel,
        turbidityEnabled: action.meta.turbidityEnabled ?? state.turbidityEnabled,
        temperatureEnabled: action.meta.temperatureEnabled ?? state.temperatureEnabled,
        turbidityValue: action.meta.turbidityValue ?? state.turbidityValue,
        temperatureValue: action.meta.temperatureValue ?? state.temperatureValue,
        sampleDateObj: action.meta.sampleDateObj ?? state.sampleDateObj,
        locationEnabled: action.meta.locationEnabled ?? state.locationEnabled,
        locationLat: action.meta.locationLat ?? state.locationLat,
        locationLng: action.meta.locationLng ?? state.locationLng,
      };
    case 'SENSOR_DATA_UPDATE_BATTERY_STATUS':
      return {
        ...state,
        batteryLevel: action.meta.batteryLevel ?? state.batteryLevel,
        batteryRawVoltage: action.meta.batteryRawVoltage ?? state.batteryRawVoltage,
        batteryCharging: action.meta.batteryCharging ?? state.batteryCharging,
      };
    case 'SENSOR_DATA_RESET_VALUES':
      return {
        ...initialState,
        locationEnabled: state.locationEnabled,
        locationLat: state.locationLat,
        locationLng: state.locationLng,
      };
    default:
      return state;
  }
}
