import { BLUETOOTH_DEVICE_NAME_REGEX } from '../constants/constants';

// Types
interface DeviceBase {
  id: string;
  name?: string;
  localName?: string;
}

interface Device {
  id: string;
  address: string;
  name: string;
  origName?: string;
  device?: DeviceBase;
  inRange?: boolean;
  inRangeSince?: number | null;
  lastSeenAt?: number;
  isConnected?: boolean;
  oldCustomName?: string;
  customName?: string;
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
  // Classic Bluetooth properties
  bondedDevicesRaw: any[];
  bondedDevicesFormatted: Device[];
  discoveredDevices: any[];
  unpairedDevices: any[];
  // Shared properties
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
  // Classic Bluetooth
  bondedDevicesRaw: [],
  bondedDevicesFormatted: [],
  discoveredDevices: [],
  unpairedDevices: [],
  // Shared
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
  devices: any[],
  deviceIdNameHash: Record<string, string>,
  state: DeviceState
): Device[] => {
  const normalizedDevices = devices.map(d => {
    return {
      id: d.id || '',
      address: d.address || d.id || '',
      name: d.name || '',
      origName: d.name || '',
    };
  });

  const filtered = normalizedDevices
    .filter(({ name }) => name) // && name.match(BLUETOOTH_DEVICE_NAME_REGEX))
    .map(device => {
      const customName = deviceIdNameHash[device.address];
      const deviceInRange = state.devicesInRange.find(
        d => d.address === device.address
      );
      const ret: Device = {
        id: device.id,
        address: device.address,
        name: customName || device.name,
        origName: device.origName,
        inRange: typeof deviceInRange !== 'undefined',
      };
      if (state.device?.address === device.address) {
        ret.isConnected = true;
      }
      return ret;
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

export default function deviceReducer(
  state: DeviceState = initialState,
  action: DeviceAction
): DeviceState {
  let newBondedDevicesFormatted: Device[];
  let filteredFormattedBondedDevices: Device[];
  let deviceIdNameHash: Record<string, string>;
  let newBondedDevice: any;

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
      return {
        ...state,
        connectionStateChanging: true,
        connectingDevice: action.meta,
        device: action.meta,
        status: 'connecting',
        connectError: null,
      };

    case 'DEVICE_CONNECTED':
      // Update Classic Bluetooth bonded devices
      newBondedDevicesFormatted = state.bondedDevicesFormatted.map(device => {
        const newDevice = { ...device };
        if (device.address === action.meta.address) {
          newDevice.isConnected = true;
          console.log(`🟢 Device marked as connected: ${device.name}`);
        }
        return newDevice;
      });

      return {
        ...state,
        connectionStateChanging: false,
        connectingDevice: null,
        device: action.meta,
        status: 'connected',
        bondedDevicesFormatted: newBondedDevicesFormatted,
      };

    case 'DEVICE_CONNECT_ERROR':
      return { ...state, connectingDevice: null, connectError: action.error || null };

    case 'DEVICE_DISCONNECTING':
      return {
        ...state,
        connectionStateChanging: true,
        device: action.meta,
        status: 'disconnecting',
        disconnecting: true,
        disconnectError: null,
      };

    case 'DEVICE_DISCONNECTED':
    case 'DEVICE_CLEAR_CONNECTED_DEVICE':
      // Clear connection status from Classic Bluetooth devices
      newBondedDevicesFormatted = state.bondedDevicesFormatted.map(device => ({
        ...device,
        isConnected: false,
      }));

      return {
        ...state,
        connectionStateChanging: false,
        connectingDevice: null,
        device: null,
        status: 'disconnected',
        bondedDevicesFormatted: newBondedDevicesFormatted,
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

      // Update Classic Bluetooth bonded devices with custom names
      newBondedDevicesFormatted = [...state.bondedDevicesFormatted];
      newBondedDevicesFormatted.forEach(bondedDevice => {
        const customName = deviceIdNameHash[bondedDevice.address];
        bondedDevice.name = customName || bondedDevice.origName || bondedDevice.name;
        if (!bondedDevice.origName) {
          bondedDevice.origName = bondedDevice.name;
        }
      });

      return {
        ...state,
        bondedDevicesFormatted: newBondedDevicesFormatted,
        knownDevices,
        deviceIdNameHash,
      };

    // Classic Bluetooth - Set Bonded Devices
    case 'DEVICE_SET_BONDED_DEVICES':
      filteredFormattedBondedDevices = filterAndSortDevices(
        action.payload.bondedDevices,
        state.deviceIdNameHash,
        state
      );
      return {
        ...state,
        bondedDevicesRaw: action.payload.bondedDevices,
        bondedDevicesFormatted: filteredFormattedBondedDevices,
      };

    // Classic Bluetooth - Add Bonded Device
    case 'DEVICE_ADD_BONDED_DEVICE':
      newBondedDevice = { ...action.payload.newBondedDevice };
      const newBondedDevicesRaw = [...state.bondedDevicesRaw, newBondedDevice];
      deviceIdNameHash = { ...state.deviceIdNameHash };
      deviceIdNameHash[action.payload.newBondedDevice.address] =
        action.payload.newBondedDevice.name;
      filteredFormattedBondedDevices = filterAndSortDevices(
        newBondedDevicesRaw,
        deviceIdNameHash,
        state
      );
      return {
        ...state,
        bondedDevicesRaw: newBondedDevicesRaw,
        bondedDevicesFormatted: filteredFormattedBondedDevices,
        deviceIdNameHash,
      };

    // Classic Bluetooth - Set Discovered Devices
    case 'DEVICE_SET_DISCOVERED_DEVICES': {
      const unpairedDevices: any[] = [];
      const currentTimestamp = new Date().getTime();
      const devicesInRange = [...action.payload.discoveredDevices];

      // Find unpaired devices (discovered but not bonded)
      action.payload.discoveredDevices
        .filter(({ name, address }: any) => {
          const bondedDevice = state.bondedDevicesRaw.find(
            (bondedDevice: any) => bondedDevice.address === address
          );
          return !bondedDevice && name;// && name?.match(BLUETOOTH_DEVICE_NAME_REGEX);
        })
        .filter(({name,address}) => (name!==address))
        .forEach((newDevice: any) => {
          newDevice.lastSeenAt = currentTimestamp;
          unpairedDevices.push({ ...newDevice });
        });

      // Add old custom names to unpaired devices
      unpairedDevices.forEach((unpairedDevice: any) => {
        unpairedDevice.oldCustomName = state.deviceIdNameHash[unpairedDevice.address];
      });

      // Update bonded devices with in-range status
      const bondedDevices: Device[] = [];
      state.bondedDevicesFormatted.forEach((bondedDevice: Device) => {
        const deviceInRange = devicesInRange.find(
          (d: any) => d.address === bondedDevice.address
        );
        newBondedDevice = { ...bondedDevice };
        if (deviceInRange) {
          newBondedDevice.inRange = true;
          newBondedDevice.inRangeSince = currentTimestamp;
        } else if (
          newBondedDevice.inRangeSince &&
          currentTimestamp - newBondedDevice.inRangeSince < 120000
        ) {
          newBondedDevice.inRange = true;
        } else {
          newBondedDevice.inRange = false;
          newBondedDevice.inRangeSince = null;
        }
        bondedDevices.push(newBondedDevice);
      });

      // Keep old unpaired devices that were recently seen
      state.unpairedDevices.forEach((oldUnpairedDevice: any) => {
        const newDevice = unpairedDevices.find(
          ({ address }: any) => oldUnpairedDevice.address === address
        );
        if (!newDevice) {
          if (currentTimestamp - oldUnpairedDevice.lastSeenAt < 120000) {
            unpairedDevices.push({ ...oldUnpairedDevice });
          }
        }
      });

      // Sort all device lists
      unpairedDevices.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
      devicesInRange.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
      bondedDevices.sort((a: Device, b: Device) => (a.name > b.name ? 1 : -1));

      return {
        ...state,
        unpairedDevices,
        devicesInRange,
        bondedDevicesFormatted: bondedDevices,
      };
    }

    default:
      return state;
  }
}

// Export types for use in other files
export type { Device, DeviceBase, KnownDevice, DeviceState };
