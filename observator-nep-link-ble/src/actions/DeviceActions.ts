import { Dispatch } from 'redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

interface SetDiscoveredDevicesAction {
  type: 'DEVICE_SET_DISCOVERED_DEVICES';
  payload: { discoveredDevices: any[] };
}

interface SetBondedDevicesAction {
  type: 'DEVICE_SET_BONDED_DEVICES';
  payload: { bondedDevices: any[] };
}

interface AddBondedDeviceAction {
  type: 'DEVICE_ADD_BONDED_DEVICE';
  payload: { newBondedDevice: any };
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
  | SetDiscoveredDevicesAction
  | SetBondedDevicesAction
  | AddBondedDeviceAction
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

// Classic Bluetooth - Discovered Devices
export const setDiscoveredDevices = (discoveredDevices: any[]) => {
  return async (dispatch: Dispatch<DeviceAction>) => {
    try {
      const filteredDiscoveredDevices = discoveredDevices.filter(
        ({ name }) => name //?.match(BLUETOOTH_DEVICE_NAME_REGEX)
      );
      dispatch({
        type: 'DEVICE_SET_DISCOVERED_DEVICES',
        payload: { discoveredDevices: filteredDiscoveredDevices },
      });
    } catch (e) {
      console.log('Error in setDiscoveredDevices', e);
    }
  };
};

// Classic Bluetooth - Bonded Devices
export const setBondedDevices = (bondedDevices: any[]) => {
  return async (dispatch: Dispatch<DeviceAction>) => {
    try {
      dispatch({
        type: 'DEVICE_SET_BONDED_DEVICES',
        payload: { bondedDevices },
      });
    } catch (e) {
      console.log('Error in setBondedDevices', e);
    }
  };
};

// Classic Bluetooth - Add Bonded Device
export const addBondedDevice = (newBondedDevice: any) => {
  return async (dispatch: Dispatch<DeviceAction>) => {
    try {
      const deviceToAdd = { ...newBondedDevice };
      delete deviceToAdd.customName;
      delete deviceToAdd.oldCustomName;

      dispatch({
        type: 'DEVICE_ADD_BONDED_DEVICE',
        payload: { newBondedDevice: deviceToAdd },
      });

      const knownDevicesJson = await AsyncStorage.getItem('knownDevices');
      const knownDevices = knownDevicesJson ? JSON.parse(knownDevicesJson) : [];

      const filteredKnownDevices = knownDevices.filter(
        ({ name, address }: any) =>
          //name?.match(BLUETOOTH_DEVICE_NAME_REGEX) &&
          address !== deviceToAdd.address
      );

      filteredKnownDevices.push(deviceToAdd);

      const sortedFilteredKnownDevices = filteredKnownDevices.sort((a: any, b: any) =>
        a.name > b.name ? 1 : -1
      );

      await AsyncStorage.setItem(
        'knownDevices',
        JSON.stringify(sortedFilteredKnownDevices)
      );
    } catch (e) {
      console.log('Error in addBondedDevice', e);
    }
  };
};

// BLE - Set BLE Devices Found
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

// BLE - Add BLE Device
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

// Add Known Devices (works for both BLE and Classic Bluetooth)
export const addKnownDevices = (devices: any[]) => {
  return async (dispatch: Dispatch<DeviceAction>) => {
    try {
      const knownDevicesJson = await AsyncStorage.getItem('knownDevices');
      let knownDevices = knownDevicesJson ? JSON.parse(knownDevicesJson) : [];

      devices.forEach((newDevice: any) => {
        const existingDevice = knownDevices.find(({ id }: any) => newDevice.id === id);
        if (!existingDevice) {
          knownDevices.push(newDevice);
        }
      });

      // Remove duplicates
      const newKnownDevices: any[] = [];
      knownDevices.forEach((device: any) => {
        const existingDevice = newKnownDevices.find(({ id }: any) => device.id === id);
        if (!existingDevice) {
          newKnownDevices.push(device);
        }
      });

      const sortedFilteredKnownDevices = newKnownDevices
        .filter(({ name }: any) => name) //?.match(BLUETOOTH_DEVICE_NAME_REGEX))
        .sort((a: any, b: any) => (a.name > b.name ? 1 : -1));

      await AsyncStorage.setItem('knownDevices', JSON.stringify(sortedFilteredKnownDevices));

      dispatch({
        type: 'DEVICE_ADD_KNOWN_DEVICES',
        payload: { knownDevices: sortedFilteredKnownDevices },
      });
    } catch (e) {
      console.log('Error in addKnownDevices', e);
    }
  };
};

// Fetch Known Devices
export const fetchKnownDevices = () => {
  return async (dispatch: Dispatch<DeviceAction>) => {
    try {
      const knownDevicesJson = await AsyncStorage.getItem('knownDevices');
      const knownDevices = knownDevicesJson ? JSON.parse(knownDevicesJson) : [];

      dispatch({ type: 'DEVICE_FETCH_KNOWN_DEVICES', payload: { knownDevices } });
    } catch (e) {
      console.log('Error in fetchKnownDevices', e);
    }
  };
};

// Save Device Name
export const saveDeviceName = (deviceId: string, deviceName: string) => {
  return async (dispatch: Dispatch<DeviceAction>) => {
    try {
      const knownDevicesJson = await AsyncStorage.getItem('knownDevices');
      const knownDevices = knownDevicesJson ? JSON.parse(knownDevicesJson) : [];

      const deviceToEdit = knownDevices.find(({ id }: any) => deviceId === id);
      if (deviceToEdit) {
        deviceToEdit.customName = deviceName;
      }

      const sortedKnownDevices = knownDevices.sort((a: any, b: any) =>
        a.name > b.name ? 1 : -1
      );

      await AsyncStorage.setItem('knownDevices', JSON.stringify(sortedKnownDevices));

      dispatch({ type: 'DEVICE_SAVE_DEVICE_NAME', payload: { knownDevices: sortedKnownDevices } });
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
