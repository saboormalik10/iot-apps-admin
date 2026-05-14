// Types
interface BleDevice {
  id: string;
  name?: string;
  localName?: string;
}

interface Device {
  id: string;
  address: string;
  name: string;
  origName?: string;
  bleDevice?: BleDevice;
  inRange?: boolean;
  inRangeSince?: number | null;
  lastSeenAt?: number;
  isConnected?: boolean;
  oldCustomName?: string;
  customName?: string;
}

interface BleDeviceFoundRaw {
  bleDevice?: BleDevice;
  id?: string;
  address?: string;
  name?: string;
}

interface KnownDevice {
  id: string;
  name: string;
  customName?: string;
}

interface DeviceState {
  connectionStateChanging: boolean;
  wiping: boolean;
  sensorDataReceived: boolean;
  sensorError: boolean;
  bleDevicesFoundRaw: BleDeviceFoundRaw[];
  bleDevicesFoundFormatted: Device[];
  devicesInRange: Device[];
  knownDevices: KnownDevice[];
  deviceIdNameHash: Record<string, string>;
  device: Device | null;
  status: 'disconnected' | 'connected' | 'connecting' | 'disconnecting';
  isScanning: boolean;
  scanError: string | null;
  availableDevices: Device[];
  connectingDevice: Device | null;
  connectError: string | null;
  disconnecting: boolean;
  disconnectError: string | null;
}

interface DeviceAction {
  type: string;
  meta?: any;
  payload?: any;
  error?: string;
  devices?: Device[];
}

const initialState: DeviceState = {
  connectionStateChanging: false,
  wiping: false,
  sensorDataReceived: false,
  sensorError: false,
  bleDevicesFoundRaw: [],
  bleDevicesFoundFormatted: [],
  devicesInRange: [],
  knownDevices: [],
  deviceIdNameHash: {},
  device: null,
  status: 'disconnected',
  isScanning: false,
  scanError: null,
  availableDevices: [],
  connectingDevice: null,
  connectError: null,
  disconnecting: false,
  disconnectError: null,
};

const filterAndSortDevices = (
  devices: BleDeviceFoundRaw[],
  deviceIdNameHash: Record<string, string>,
  state: DeviceState
): Device[] => {
  const normalizedDevices = devices.map(d => {
    if (d.bleDevice) {
      return {
        id: d.bleDevice.id,
        address: d.bleDevice.id,
        name: d.bleDevice.name || d.bleDevice.localName || '',
        origName: d.bleDevice.name || d.bleDevice.localName || '',
      };
    } else {
      return {
        id: d.id || '',
        address: d.address || d.id || '',
        name: d.name || '',
        origName: d.name || '',
      };
    }
  });

  const filtered = normalizedDevices
    .filter(({ name }) => name && name.trim().length > 0)
    .map(device => {
      const customName = deviceIdNameHash[device.address];
      return {
        ...device,
        name: customName || device.name,
        inRange: true,
      };
    })
    .sort((a, b) => {
      let sortVal = 0;
      if (a.name > b.name) {
        sortVal += 1;
      } else {
        sortVal -= 1;
      }
      if (a.inRange) {
        sortVal -= 1000;
      }
      return sortVal;
    });

  return filtered;
};

const devicesAreSame = (a: BleDeviceFoundRaw[], b: BleDeviceFoundRaw[]): boolean => {
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

export default function deviceReducer(
  state: DeviceState = initialState,
  action: DeviceAction
): DeviceState {
  let newBleDevicesFoundFormatted: Device[];
  let filteredFormattedBleDevicesFound: Device[];
  let deviceIdNameHash: Record<string, string>;
  let newBleDeviceFound: any;

  switch (action.type) {
    case 'SCAN_START':
      return { ...state, isScanning: true, scanError: null, availableDevices: [] };

    case 'SCAN_STOP':
      return { ...state, isScanning: false };

    case 'SCAN_ERROR':
      return { ...state, isScanning: false, scanError: action.error || null };

    case 'SET_AVAILABLE_DEVICES':
      return { ...state, availableDevices: action.devices || [] };

    case 'DEVICE_CONNECTING':
      return { ...state, connectingDevice: action.meta, connectError: null };

    case 'DEVICE_CONNECTED':
      newBleDevicesFoundFormatted = state.bleDevicesFoundFormatted.map(device => {
        const newDevice = { ...device };
        if (device.id === action.meta.id || device.address === action.meta.address) {
          newDevice.isConnected = true;
          console.log(`🟢 Device marked as connected in redux state: ${device.name}`);
        }
        return newDevice;
      });
      return {
        ...state,
        connectionStateChanging: false,
        device: action.meta,
        status: 'connected',
        bleDevicesFoundFormatted: newBleDevicesFoundFormatted,
      };

    case 'DEVICE_CONNECT_ERROR':
      return { ...state, connectingDevice: null, connectError: action.error || null };

    case 'DEVICE_DISCONNECTING':
      return { ...state, disconnecting: true, disconnectError: null };

    case 'DEVICE_DISCONNECTED':
    case 'DEVICE_CLEAR_CONNECTED_DEVICE':
      newBleDevicesFoundFormatted = state.bleDevicesFoundFormatted.map(device => {
        const newDevice = { ...device };
        if (newDevice.isConnected) {
          delete newDevice.isConnected;
          console.log(`🔴 Device marked as disconnected in redux state: ${device.name}`);
        }
        return newDevice;
      });
      return {
        ...state,
        connectionStateChanging: false,
        device: null,
        status: 'disconnected',
        bleDevicesFoundFormatted: newBleDevicesFoundFormatted,
        wiping: false,
        sensorDataReceived: false,
        sensorError: false,
      };

    case 'DEVICE_SET_WIPING':
      return { ...state, wiping: action.meta.wiping };

    case 'DEVICE_SET_SENSOR_DATA_RECEIVED':
      return { ...state, sensorDataReceived: action.meta.sensorDataReceived };

    case 'DEVICE_SET_SENSOR_ERROR':
      return { ...state, sensorError: action.meta.sensorError };

    case 'DEVICE_ADD_KNOWN_DEVICES':
      console.log(`📱 Connected device ID: ${state.device?.id ?? 'None'}`);
    // Fall through to next cases
    case 'DEVICE_FETCH_KNOWN_DEVICES':
    case 'DEVICE_SAVE_DEVICE_NAME':
      deviceIdNameHash = {};
      const knownDevices = action.payload.knownDevices;
      knownDevices.forEach((device: KnownDevice) => {
        deviceIdNameHash[device.id] = device.customName || device.name;
      });
      newBleDevicesFoundFormatted = [...state.bleDevicesFoundFormatted];
      newBleDevicesFoundFormatted.forEach(bleDeviceFound => {
        const customName = deviceIdNameHash[bleDeviceFound.address];
        bleDeviceFound.name = customName || bleDeviceFound.name;
        bleDeviceFound.origName = bleDeviceFound.name;
      });
      return {
        ...state,
        bleDevicesFoundFormatted: newBleDevicesFoundFormatted,
        knownDevices,
        deviceIdNameHash,
      };

    case 'DEVICE_SET_BLE_DEVICES_FOUND': {
      const newBleDevicesFound = action.payload.bleDevicesFound;

      if (devicesAreSame(state.bleDevicesFoundRaw, newBleDevicesFound)) {
        console.log('🔁 Reducer skipped DEVICE_SET_BLE_DEVICES_FOUND: same data');
        return state;
      }

      filteredFormattedBleDevicesFound = filterAndSortDevices(
        action.payload.bleDevicesFound,
        state.deviceIdNameHash,
        state
      );

      return {
        ...state,
        bleDevicesFoundRaw: action.payload.bleDevicesFound,
        devicesInRange: filteredFormattedBleDevicesFound,
        bleDevicesFoundFormatted: filteredFormattedBleDevicesFound,
      };
    }

    case 'DEVICE_ADD_BLE_DEVICE_FOUND':
      newBleDeviceFound = { ...action.payload.newBleDeviceFound };
      const newBleDevicesFoundRaw = [...state.bleDevicesFoundRaw, newBleDeviceFound];
      deviceIdNameHash = { ...state.deviceIdNameHash };
      deviceIdNameHash[action.payload.newBleDeviceFound.address] =
        action.payload.newBleDeviceFound.name;
      filteredFormattedBleDevicesFound = filterAndSortDevices(
        newBleDevicesFoundRaw,
        deviceIdNameHash,
        state
      );
      return {
        ...state,
        bleDevicesFoundRaw: newBleDevicesFoundRaw,
        bleDevicesFoundFormatted: filteredFormattedBleDevicesFound,
        deviceIdNameHash,
      };

    default:
      return state;
  }
}

// Export types for use in other files
export type { Device, BleDevice, KnownDevice, DeviceState, BleDeviceFoundRaw };
