import { Dispatch } from 'redux';

interface SensorDataObject {
  probeSetting?: string;
  rangeLabel?: string;
  temperatureEnabled?: boolean;
  turbidityEnabled?: boolean;
  turbidityValue?: number | null;
  temperatureValue?: number | null;
  locationEnabled?: boolean;
  locationLat?: number | null;
  locationLng?: number | null;
  sampleDateObj?: any;
}

interface BatteryStatusObject {
  batteryLevel?: number;
  batteryCharging?: boolean;
  batteryRawVoltage?: number;
}

interface SensorDataUpdateAction {
  type: 'SENSOR_DATA_UPDATE_VALUES';
  meta: SensorDataObject;
}

interface SensorDataResetAction {
  type: 'SENSOR_DATA_RESET_VALUES';
}

interface BatteryStatusUpdateAction {
  type: 'SENSOR_DATA_UPDATE_BATTERY_STATUS';
  meta: BatteryStatusObject;
}

export type SensorDataAction =
  | SensorDataUpdateAction
  | SensorDataResetAction
  | BatteryStatusUpdateAction;

export const updateValues = (sensorDataObj: SensorDataObject) => {
  return (dispatch: Dispatch<SensorDataAction>) => {
    dispatch({
      type: 'SENSOR_DATA_UPDATE_VALUES',
      meta: { ...sensorDataObj },
    });
  };
};

export const resetValues = () => {
  return (dispatch: Dispatch<SensorDataAction>) => {
    dispatch({
      type: 'SENSOR_DATA_RESET_VALUES',
    });
  };
};

export const updateBatteryStatus = (batteryStatusObj: BatteryStatusObject) => {
  return (dispatch: Dispatch<SensorDataAction>) => {
    dispatch({
      type: 'SENSOR_DATA_UPDATE_BATTERY_STATUS',
      meta: { ...batteryStatusObj },
    });
  };
};
