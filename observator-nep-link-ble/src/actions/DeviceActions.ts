import { Dispatch } from 'redux';
import { BLUETOOTH_DEVICE_NAME_REGEX } from '../constants/constants';
import { getDBConnection } from '../utils/db';

// Types
interface DeviceDataObject {
  id?: string;
  name?: string;
  address?: string;
  bleDevice?: any;
}

interface BleDevice {
  id: string;
  name?: string;
  localName?: string;
  bleDevice?: any;
}

interface KnownDevice {
  id: string;
  name: string;
  address: string;
  customName?: string;
}

// Action Types
interface DeviceConnectingAction {
  type: 'DEVICE_CONNECTING';
  meta: DeviceDataObject;
}

interface DeviceConnectedAction {
  type: 'DEVICE_CONNECTED';
  meta: DeviceDataObject;
}

interface DeviceDisconnectingAction {
  type: 'DEVICE_DISCONNECTING';
  meta: DeviceDataObject;
}

interface DeviceDisconnectedAction {
  type: 'DEVICE_DISCONNECTED';
  meta: DeviceDataObject;
}

interface ClearConnectedDeviceAction {
  type: 'DEVICE_CLEAR_CONNECTED_DEVICE';
}

interface SetWipingAction {
  type: 'DEVICE_SET_WIPING';
  meta: { wiping: boolean };
}

interface SetSensorDataReceivedAction {
  type: 'DEVICE_SET_SENSOR_DATA_RECEIVED';
  meta: { sensorDataReceived: boolean };
}

interface SetSensorErrorAction {
  type: 'DEVICE_SET_SENSOR_ERROR';
  meta: { sensorError: boolean };
}

interface SetBleDiscoveredDevicesAction {
  type: 'DEVICE_SET_BLE_DEVICES_FOUND';
  payload: { bleDevicesFound: BleDevice[] };
}

interface AddBleDeviceFoundAction {
  type: 'DEVICE_ADD_BLE_DEVICE_FOUND';
  payload: { newBleDevice: BleDevice };
}

interface AddKnownDevicesAction {
  type: 'DEVICE_ADD_KNOWN_DEVICES';
  payload: { knownDevices: KnownDevice[] };
}

interface FetchKnownDevicesAction {
  type: 'DEVICE_FETCH_KNOWN_DEVICES';
  payload: { knownDevices: KnownDevice[] };
}

interface SaveDeviceNameAction {
  type: 'DEVICE_SAVE_DEVICE_NAME';
  payload: { knownDevices: KnownDevice[] };
}

interface ScanStartAction {
  type: 'SCAN_START';
}

interface ScanStopAction {
  type: 'SCAN_STOP';
}

interface ScanErrorAction {
  type: 'SCAN_ERROR';
  error: any;
}

interface SetAvailableDevicesAction {
  type: 'SET_AVAILABLE_DEVICES';
  devices: BleDevice[];
}

interface DeviceConnectErrorAction {
  type: 'DEVICE_CONNECT_ERROR';
  error: any;
}

interface DeviceDisconnectErrorAction {
  type: 'DEVICE_DISCONNECT_ERROR';
  error: any;
}

export type DeviceAction =
  | DeviceConnectingAction
  | DeviceConnectedAction
  | DeviceDisconnectingAction
  | DeviceDisconnectedAction
  | ClearConnectedDeviceAction
  | SetWipingAction
  | SetSensorDataReceivedAction
  | SetSensorErrorAction
  | SetBleDiscoveredDevicesAction
  | AddBleDeviceFoundAction
  | AddKnownDevicesAction
  | FetchKnownDevicesAction
  | SaveDeviceNameAction
  | ScanStartAction
  | ScanStopAction
  | ScanErrorAction
  | SetAvailableDevicesAction
  | DeviceConnectErrorAction
  | DeviceDisconnectErrorAction;

// Action Creators
export const setDeviceConnecting = (deviceDataObj: DeviceDataObject) => {
  console.log('🔵 Device connecting action triggered', deviceDataObj);
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({ type: 'DEVICE_CONNECTING', meta: { ...deviceDataObj } });
  };
};

export const setDeviceConnected = (deviceDataObj: DeviceDataObject) => {
  console.log('🟢 Device connected action triggered', deviceDataObj);
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({ type: 'DEVICE_CONNECTED', meta: { ...deviceDataObj } });
  };
};

export const setDeviceDisconnecting = (deviceDataObj: DeviceDataObject) => {
  console.log('🟠 Device disconnecting action triggered', deviceDataObj);
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({ type: 'DEVICE_DISCONNECTING', meta: { ...deviceDataObj } });
  };
};

export const setDeviceDisconnected = (deviceDataObj: DeviceDataObject) => {
  console.log('🔴 Device disconnected action triggered', deviceDataObj);
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({ type: 'DEVICE_DISCONNECTED', meta: { ...deviceDataObj } });
  };
};

export const clearConnectedDevice = () => {
  console.log('🔴 Running clearConnectedDevice');
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({ type: 'DEVICE_CLEAR_CONNECTED_DEVICE' });
  };
};

export const setWiping = (wiping: boolean) => {
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({ type: 'DEVICE_SET_WIPING', meta: { wiping } });
  };
};

export const setSensorDataReceived = (sensorDataReceived: boolean) => {
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({
      type: 'DEVICE_SET_SENSOR_DATA_RECEIVED',
      meta: { sensorDataReceived },
    });
  };
};

export const setSensorError = (sensorError: boolean) => {
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({ type: 'DEVICE_SET_SENSOR_ERROR', meta: { sensorError } });
  };
};


export const setBleDevicesFound = (bleDevicesFound: BleDevice[]) => {
  return async (dispatch: Dispatch<DeviceAction>, getState: any) => {
    try {
      if (!bleDevicesFound || bleDevicesFound.length === 0) {
        dispatch({ type: 'DEVICE_SET_BLE_DEVICES_FOUND', payload: { bleDevicesFound: [] } });
        return;
      }

      const {
        devices: { bleDevicesFoundRaw: currentBleDevicesFound },
      } = getState();

      const devicesAreSame = (a: BleDevice[], b: BleDevice[]): boolean => {
        if (a.length !== b.length) {
          return false;
        }
        return a.every(deviceA =>
          b.some(
            deviceB =>
              deviceA.id === deviceB.id &&
              (deviceA.name === deviceB.name || !deviceA.name || !deviceB.name)
          )
        );
      };

      const isSame = devicesAreSame(bleDevicesFound, currentBleDevicesFound);
      console.log('isSame check result:', isSame);

      if (isSame) {
        console.log('⏭️ Skipping DEVICE_SET_BLE_DEVICES_FOUND: identical list');
        return;
      }

      dispatch({ type: 'DEVICE_SET_BLE_DEVICES_FOUND', payload: { bleDevicesFound } });
    } catch (e) {
      console.log('Error in setBleDevicesFound:', e);
    }
  };
};

export const addBleDevice = (newBleDevice: BleDevice) => {
  return async (dispatch: Dispatch<DeviceAction>) => {
    try {
      const db = await getDBConnection();
      await db.executeSql(
        'REPLACE INTO knownDevices (id, name, address) VALUES (?, ?, ?)',
        [newBleDevice.id, newBleDevice.name, newBleDevice.id]
      );
      dispatch({ type: 'DEVICE_ADD_BLE_DEVICE_FOUND', payload: { newBleDevice } });
    } catch (e) {
      console.log('Error in addBleDevice', e);
    }
  };
};

export const addKnownDevices = (devices: BleDevice[]) => {
  return async (dispatch: Dispatch<DeviceAction>, getState: any) => {
    try {
      const db = await getDBConnection();
      for (const device of devices) {
        await db.executeSql(
          'REPLACE INTO knownDevices (id, name, address) VALUES (?, ?, ?)',
          [device.id, device.name, device.id]
        );
      }

      const [results] = await db.executeSql('SELECT * FROM knownDevices');
      const knownDevices: KnownDevice[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        knownDevices.push(results.rows.item(i));
      }

      const {
        devices: { knownDevices: currentKnownDevices },
      } = getState();

      const isSame =
        knownDevices.length === currentKnownDevices.length &&
        knownDevices.every(
          (d, i) =>
            d.id === currentKnownDevices[i]?.id &&
            d.name === currentKnownDevices[i]?.name
        );

      dispatch({ type: 'DEVICE_ADD_KNOWN_DEVICES', payload: { knownDevices } });
    } catch (e) {
      console.log('Error in addKnownDevices', e);
    }
  };
};

export const fetchKnownDevices = () => {
  return async (dispatch: Dispatch<DeviceAction>) => {
    try {
      const db = await getDBConnection();
      const [results] = await db.executeSql('SELECT * FROM knownDevices');
      const knownDevices: KnownDevice[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        knownDevices.push(results.rows.item(i));
      }
      dispatch({ type: 'DEVICE_FETCH_KNOWN_DEVICES', payload: { knownDevices } });
    } catch (e) {
      console.log('Error in fetchKnownDevices', e);
    }
  };
};

export const saveDeviceName = (deviceId: string, deviceName: string) => {
  return async (dispatch: Dispatch<DeviceAction>) => {
    try {
      const db = await getDBConnection();
      await db.executeSql('UPDATE knownDevices SET customName = ? WHERE id = ?', [
        deviceName,
        deviceId,
      ]);

      const [results] = await db.executeSql('SELECT * FROM knownDevices');
      const knownDevices: KnownDevice[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        knownDevices.push(results.rows.item(i));
      }

      dispatch({ type: 'DEVICE_SAVE_DEVICE_NAME', payload: { knownDevices } });
    } catch (e) {
      console.log('Error in saveDeviceName', e);
    }
  };
};

// BLE Scan/Connect/Disconnect Actions
export const scanStart = (): ScanStartAction => {
  console.log('[BLE] Scan started');
  return { type: 'SCAN_START' };
};

export const scanStop = (): ScanStopAction => {
  console.log('[BLE] Scan stopped');
  return { type: 'SCAN_STOP' };
};

export const scanError = (error: any): ScanErrorAction => {
  console.error('[BLE] Scan error:', error);
  return { type: 'SCAN_ERROR', error };
};

export const setAvailableDevices = (devices: BleDevice[]): SetAvailableDevicesAction => {
  console.log('[BLE] Available devices:', devices);
  return { type: 'SET_AVAILABLE_DEVICES', devices };
};

export const deviceConnecting = (device: DeviceDataObject) => {
  console.log('[BLE] Connecting to device:', device);
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({ type: 'DEVICE_CONNECTING', meta: device });
  };
};

export const deviceConnectError = (error: any): DeviceConnectErrorAction => {
  console.error('[BLE] Device connect error:', error);
  return { type: 'DEVICE_CONNECT_ERROR', error };
};

export const deviceDisconnecting = (device: DeviceDataObject) => {
  console.log('[BLE] Disconnecting device:', device);
  return (dispatch: Dispatch<DeviceAction>) => {
    dispatch({ type: 'DEVICE_DISCONNECTING', meta: device });
  };
};

export const deviceDisconnectError = (error: any): DeviceDisconnectErrorAction => {
  console.error('[BLE] Device disconnect error:', error);
  return { type: 'DEVICE_DISCONNECT_ERROR', error };
};
