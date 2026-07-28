import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, PermissionsAndroid, Platform } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { CommonActions, useNavigation } from '@react-navigation/native';
import RNBluetoothClassic, { BluetoothDevice, BluetoothDeviceEvent } from 'react-native-bluetooth-classic';
import Geolocation from '@react-native-community/geolocation';
import { DateTime } from 'luxon';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  setDeviceConnecting,
  setDeviceConnected,
  setDeviceDisconnecting,
  setDeviceDisconnected,
  clearConnectedDevice,
  setWiping,
  setSensorDataReceived,
  setSensorError,
  setDiscoveredDevices,
  setBondedDevices,
  addKnownDevices,
} from '../../actions/DeviceActions';
import { updateValues, resetValues, updateBatteryStatus } from '../../actions/SensorDataActions';
import { addDataToLoggingSession } from '../../actions/LoggingActions';
import { setDemoModeEnabled } from '../../actions/DemoActions';
import NepLinkHeader from './NepLinkHeader';
import BluetoothDisabledError from './BluetoothDisabledError';
import DevicesList from './DevicesList';
import DevicesListButtons from './DevicesListButtons';
import DeviceConnectingDialog from './DeviceConnectingDialog';

// Types
interface DeviceState {
  bluetoothAvailable: boolean;
  bluetoothEnabled: boolean;
  bluetoothPermissions: boolean;
  locationEnabled: boolean;
  awaitingDevice: boolean;
  connectionAttemptStarted: boolean;
  connectingDevice: any | null;
  connectedDevice: any | null;
  locationLat: number | null;
  locationLng: number | null;
  attemptingConnection: boolean;
  demoModeEnabled: boolean;
  isDiscovering: boolean;
}

interface RootState {
  demo: {
    demoModeEnabled: boolean;
  };
  devices: {
    bondedDevicesRaw: any[];
    bondedDevicesFormatted: any[];
    connectedDevice: any | null;
    status: string;
    wiping: boolean;
    sensorError: boolean;
    sensorDataReceived: boolean;
  };
  logging: {
    isLogging: boolean;
    loggingSessionId: string;
    loggingSessionSamples: any[];
  };
  sensorData: {
    batteryLevel: number;
    batteryVoltage: number;
  };
}

const Devices: React.FC = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();

  // Redux selectors
  const demo = useSelector((state: RootState) => state.demo);
  const devices = useSelector((state: RootState) => state.devices);
  const logging = useSelector((state: RootState) => state.logging);
  const sensorData = useSelector((state: RootState) => state.sensorData);

  // State
  const [state, setState] = useState<DeviceState>({
    bluetoothAvailable: true,
    bluetoothEnabled: true,
    bluetoothPermissions: true,
    locationEnabled: true,
    awaitingDevice: false,
    connectionAttemptStarted: false,
    connectingDevice: null,
    connectedDevice: null,
    locationLat: null,
    locationLng: null,
    attemptingConnection: false,
    demoModeEnabled: false,
    isDiscovering: false, // ADD THIS
  });

  // Refs
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const locationUpdateIdRef = useRef<NodeJS.Timeout | null>(null);
  const currentTurbidityValueRef = useRef<number | null>(null);
  const currentTemperatureValueRef = useRef<number | null>(null);
  const batteryLastDecrementTimeRef = useRef<number | null>(null);
  const sensorDataRef = useRef(sensorData);
  const loggingRef = useRef(logging);
  const devicesRef = useRef(devices);
  const stateRef = useRef(state);
  const onDataReceivedSubscriptionRef = useRef<any>(null);
  const disconnectSubscriptionRef = useRef<any>(null);
  const bluetoothEnabledSubscriptionRef = useRef<any>(null);
  const bluetoothDisabledSubscriptionRef = useRef<any>(null);
  const isDiscoveringRef = useRef(false);
  const userCancelledConnectionRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sensorErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Timeout refs for discovery
  const discoveryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const discoveryRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs updated
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    loggingRef.current = logging;
  }, [logging]);

  useEffect(() => {
    sensorDataRef.current = sensorData;
  }, [sensorData]);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  // Get Bluetooth permissions
  const getBluetoothPermissionsAndStartBluetoothProcesses = useCallback(async () => {
    const isBluetoothAvailable = await RNBluetoothClassic.isBluetoothAvailable().catch(() => {
      console.log("Can't run isBluetoothAvailable");
      return false;
    });

    if (!isBluetoothAvailable) {
      setState(prev => ({ ...prev, bluetoothAvailable: false }));
      return;
    } else {
      setState(prev => ({ ...prev, bluetoothAvailable: true }));
    }

    let fineLocationPermission = true;
    let bluetoothScanPermission = true;
    let bluetoothConnectPermission = true;

    if (Platform.OS === 'android') {
      if (Platform.Version < 31) {
        try {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          fineLocationPermission = result === PermissionsAndroid.RESULTS.GRANTED;
        } catch (error) {
          console.log("Can't request ACCESS_FINE_LOCATION permission", error);
          fineLocationPermission = false;
        }
      } else {
        const requestMultiplePermissionsResult = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        fineLocationPermission =
          requestMultiplePermissionsResult[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
          PermissionsAndroid.RESULTS.GRANTED;
        bluetoothScanPermission =
          requestMultiplePermissionsResult[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
          PermissionsAndroid.RESULTS.GRANTED;
        bluetoothConnectPermission =
          requestMultiplePermissionsResult[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
          PermissionsAndroid.RESULTS.GRANTED;
      }
    }

    if (bluetoothScanPermission && bluetoothConnectPermission && fineLocationPermission) {
      setState(prev => ({ ...prev, bluetoothPermissions: true }));
    } else {
      setState(prev => ({ ...prev, bluetoothPermissions: false }));
      return false;
    }

    await RNBluetoothClassic.requestBluetoothEnabled().catch(() => {
      console.log("Can't run requestBluetoothEnabled");
    });

    const isBluetoothEnabled = await RNBluetoothClassic.isBluetoothEnabled().catch(() => {
      console.log("Can't run isBluetoothEnabled");
      return false;
    });

    if (!isBluetoothEnabled) {
      setState(prev => ({ ...prev, bluetoothEnabled: false }));
    } else {
      setState(prev => ({ ...prev, bluetoothEnabled: true }));
    }

    getBondedDevices();
    startDiscovery();
  }, []);

  // Get bonded devices
  const getBondedDevices = useCallback(async () => {
    await RNBluetoothClassic.requestBluetoothEnabled().catch(() => {
      console.log("Can't run requestBluetoothEnabled");
    });

    const isBluetoothEnabled = await RNBluetoothClassic.isBluetoothEnabled();

    if (!isBluetoothEnabled) {
      setState(prev => ({ ...prev, bluetoothEnabled: false }));
      return;
    }

    try {
      console.log('RNBluetoothClassic.getBondedDevices running');
      const bonded = await RNBluetoothClassic.getBondedDevices();

      // Check connection status for each device
      const bondedWithStatus = await Promise.all(
        bonded.map(async (device) => {
          try {
            const isConnected = await device.isConnected();
            console.log(`XXX device ${device.name} connected`, isConnected);
            return {
              ...device,
              isConnected,
            };
          } catch (error) {
            console.log(`Error checking connection status for ${device.name}:`, error);
            return {
              ...device,
              isConnected: false,
            };
          }
        })
      );

      console.log('Bonded devices with connection status:', bondedWithStatus);
      dispatch(setBondedDevices(bondedWithStatus));
      dispatch(addKnownDevices(bondedWithStatus));

      setTimeout(() => {
        getBondedDevices();
      }, 10000);
    } catch (error) {
      console.log('RNBluetoothClassic.getBondedDevices error', error);
      setTimeout(() => {
        getBondedDevices();
      }, 2000);
    }
  }, [dispatch]);

  // Periodically check connection status and clean up disconnected devices
  const checkConnectionStatus = useCallback(async () => {
    const currentDevices = devicesRef.current;
    const currentState = stateRef.current;

    // If we think we have a connected device, verify it's still connected
    if (currentDevices.connectedDevice || currentState.connectedDevice) {
      try {
        const connectedDevices = await RNBluetoothClassic.getConnectedDevices();
        console.log('XXX checkConnectionStatus: currently connected devices:', connectedDevices.length);

        // If no devices are connected, clean up
        if (connectedDevices.length === 0) {
          console.log('XXX checkConnectionStatus: No devices connected, cleaning up');

          // Remove data subscription if it exists
          if (onDataReceivedSubscriptionRef.current) {
            onDataReceivedSubscriptionRef.current.remove();
            onDataReceivedSubscriptionRef.current = null;
          }

          // Clear Redux state
          console.log("XXX clearConnectedDevice 2 (from checkConnectionStatus)");
          dispatch(clearConnectedDevice());
          // console.log("XXX resetting 1");
          // dispatch(resetValues());

          // Clear local state
          setState(prev => ({
            ...prev,
            connectedDevice: null,
            connectingDevice: null,
          }));
        } else {
          // Verify our connected device is in the list
          const deviceStillConnected = connectedDevices.some(
            (device: any) =>
              device.address === currentDevices.connectedDevice?.address ||
              device.address === currentState.connectedDevice?.address
          );

          if (!deviceStillConnected) {
            console.log('XXX checkConnectionStatus: Our device is no longer connected, cleaning up');

            // Remove data subscription if it exists
            if (onDataReceivedSubscriptionRef.current) {
              onDataReceivedSubscriptionRef.current.remove();
              onDataReceivedSubscriptionRef.current = null;
            }

            // Clear Redux state
            console.log("XXX clearConnectedDevice 3 (from checkConnectionStatus)");
            dispatch(clearConnectedDevice());
            console.log("XXX resetting 2");
            dispatch(resetValues());

            // Clear local state
            setState(prev => ({
              ...prev,
              connectedDevice: null,
              connectingDevice: null,
            }));
          }
        }
      } catch (error) {
        console.log('XXX checkConnectionStatus error:', error);
      }
    }
  }, [dispatch]);

  // Start discovery
  const startDiscovery = useCallback(async () => {
    // Prevent multiple simultaneous discoveries
    if (isDiscoveringRef.current) {
      console.log('Discovery already in progress, skipping...');
      return;
    }

    console.log('XXX Starting discovery...');
    isDiscoveringRef.current = true;
    setState(prev => ({ ...prev, isDiscovering: true }));

    RNBluetoothClassic.startDiscovery()
      .then(discoveredDevices => {
        console.log('xxx startDiscovery', discoveredDevices);
        dispatch(setDiscoveredDevices(discoveredDevices));

        // Cancel discovery after 30 seconds
        discoveryTimeoutRef.current = setTimeout(() => {
          RNBluetoothClassic.cancelDiscovery()
            .then(() => {
              console.log('Discovery cancelled 1');
              isDiscoveringRef.current = false;
              setState(prev => ({ ...prev, isDiscovering: false }));

              // Wait 5 seconds before starting next discovery
              discoveryRestartTimeoutRef.current = setTimeout(() => {
                startDiscovery();
              }, 5000);
            })
            .catch((error) => {
              console.log('cancelDiscovery error 1', error);
              isDiscoveringRef.current = false;
              setState(prev => ({ ...prev, isDiscovering: false }));

              // Retry after error
              discoveryRestartTimeoutRef.current = setTimeout(() => {
                startDiscovery();
              }, 5000);
            });
        }, 10000);
      })
      .catch(error => {
        console.error("Can't start discovery XXX", error);
        isDiscoveringRef.current = false;
        setState(prev => ({ ...prev, isDiscovering: false }));

        // Retry after error
        RNBluetoothClassic.cancelDiscovery()
          .then(() => {
            console.log('Discovery cancelled 2');
            isDiscoveringRef.current = false;
            setState(prev => ({ ...prev, isDiscovering: false }));

            // Wait 5 seconds before starting next discovery
            discoveryRestartTimeoutRef.current = setTimeout(() => {
              startDiscovery();
            }, 5000);
          })
          .catch((error) => {
            console.log('cancelDiscovery error 2', error);
            isDiscoveringRef.current = false;
            setState(prev => ({ ...prev, isDiscovering: false }));

            // Retry after error
            discoveryRestartTimeoutRef.current = setTimeout(() => {
              startDiscovery();
            }, 5000);
          });

      });
  }, [dispatch]);

  // Location permission request
  const requestLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs access to your location to provide location-based features.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.log('Location permission request error:', err);
        return false;
      }
    }
    return true;
  };

  // Get current location
  const getCurrentLocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        position => {
          console.log('Current location obtained:', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          resolve(position.coords);
        },
        error => {
          console.log('Error getting current location:', error);
          reject(error);
        },
        {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  };

  // Stop location updates
  const stopLocationUpdates = useCallback(() => {
    console.log('stopLocationUpdates called, watchId:', watchIdRef.current);
    if (watchIdRef.current) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (locationUpdateIdRef.current) {
      clearInterval(locationUpdateIdRef.current);
      locationUpdateIdRef.current = null;
    }
  }, []);

  // Start fallback location updates
  const startFallbackLocationUpdates = useCallback(() => {
    console.log('Starting fallback location updates...');

    locationUpdateIdRef.current = setInterval(async () => {
      const currentState = stateRef.current;
      if (currentState.locationLat && currentState.locationLng) {
        stopLocationUpdates();
        return;
      }

      try {
        const coords = await getCurrentLocation();
        setState(prev => ({
          ...prev,
          locationEnabled: true,
          locationLat: coords.latitude,
          locationLng: coords.longitude,
        }));
        stopLocationUpdates();
      } catch (error) {
        console.log('Fallback location update failed:', error);
        setState(prev => ({ ...prev, locationEnabled: false }));
      }
    }, 30000);
  }, [stopLocationUpdates]);

  // Start location updates
  const startLocationUpdates = useCallback(async () => {
    console.log('Starting location updates...');
    console.log("XXX about to run requestLocationPermission");

    // Create a flag to track if the permission request completed
    let permissionResolved = false;
    let hasPermission = false;
    let timeoutId: NodeJS.Timeout | null = null;

    // Wrap the permission request to track completion
    const permissionPromise = requestLocationPermission().then(result => {
      permissionResolved = true;
      // Clear the timeout since we got a result
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      return result;
    });

    // Create a timeout promise that resolves after 10 seconds
    const timeoutPromise = new Promise<boolean>((resolve) => {
      timeoutId = setTimeout(() => {
        if (!permissionResolved) {
          console.log("XXX requestLocationPermission timed out after 10 seconds");
        }
        resolve(false);
      }, 10000);
    });

    // Race between the permission request and the timeout
    hasPermission = await Promise.race([
      permissionPromise,
      timeoutPromise
    ]);

    console.log("XXX ran requestLocationPermission - hasPermission", hasPermission, "permissionResolved", permissionResolved);

    // If the permission request didn't resolve (timed out), retry
    if (!permissionResolved) {
      console.log('XXX Permission request did not resolve, retrying...');
      setTimeout(() => {
        startLocationUpdates();
      }, 1000);
      return;
    }

    // If permission was explicitly denied, stop and don't retry
    if (!hasPermission) {
      console.log('Location permission denied by user or device settings');
      setState(prev => ({ ...prev, locationEnabled: false }));
      return;
    }

    // Permission granted, proceed with location setup
    console.log("XXX Permission granted, proceeding with location setup");
    stopLocationUpdates();

    try {
      console.log("XXX location starting getCurrentLocation");
      const coords = await getCurrentLocation();
      setState(prev => ({
        ...prev,
        locationEnabled: true,
        locationLat: coords.latitude,
        locationLng: coords.longitude,
      }));

      console.log("XXX location starting Geolocation.watchPosition");
      watchIdRef.current = Geolocation.watchPosition(
        position => {
          const { latitude, longitude } = position.coords;
          console.log('✅ Location update received:', {
            lat: latitude,
            lng: longitude,
            watchId: watchIdRef.current
          });
          setState(prev => ({
            ...prev,
            locationEnabled: true,
            locationLat: latitude,
            locationLng: longitude,
          }));
        },
        error => {
          console.log('Location watch error:', error);
          setState(prev => ({ ...prev, locationEnabled: false }));
        },
        {
          enableHighAccuracy: true,
          timeout: 40000,
          maximumAge: 60000,
          distanceFilter: 5,
        }
      );
      console.log('📍 Watch established with ID:', watchIdRef.current);
    } catch (error) {
      console.log('Failed to start location updates:', error);
      setState(prev => ({ ...prev, locationEnabled: false }));
      startFallbackLocationUpdates();
    }
  }, [stopLocationUpdates, startFallbackLocationUpdates]);

  // Handle data received from device
  const onDataReceived = useCallback((event: any) => {
    console.log('event.data', event.data);

    const probeDataMatch = event.data.match(/(R\d),(\d+\.\d+),?(\d+\.\d+)?/);
    const statsMatch = event.data.match(/~,stats,(\d+),(\d)/);

    if (!probeDataMatch && !statsMatch) {
      console.log('UNMATCHED event.data', event.data);
      return;
    }

    if (probeDataMatch) {
      console.log('probeDataMatch', probeDataMatch);
      const probeSetting = probeDataMatch[1];

      let rangeLabel = 'High range';
      if (probeSetting === 'R1') rangeLabel = 'Low range';
      else if (probeSetting === 'R2') rangeLabel = 'Medium range';

      const turbidityEnabled = !!probeDataMatch[2];
      const turbidityValue = turbidityEnabled ? parseFloat(probeDataMatch[2]) : null;

      const temperatureEnabled =
        !!probeDataMatch[3] && parseFloat(probeDataMatch[3]) > 0;
      const temperatureValue = temperatureEnabled ? parseFloat(probeDataMatch[3]) : null;

      const sampleDateObj = DateTime.fromMillis(Date.parse(event.timestamp));
      const tzOffsetStr = sampleDateObj.toFormat('Z');
      const tzOffsetMs = parseInt(tzOffsetStr) * 1000 * 60 * 60;
      const dataObjTimestamp = parseInt(sampleDateObj.toFormat('x')) - tzOffsetMs;

      const currentState = stateRef.current;

      dispatch(
        updateValues({
          probeSetting,
          rangeLabel,
          temperatureEnabled,
          turbidityEnabled,
          turbidityValue,
          temperatureValue,
          locationEnabled: currentState.locationEnabled,
          locationLat: currentState.locationLat,
          locationLng: currentState.locationLng,
          sampleDateObj,
        })
      );

      const currentLogging = loggingRef.current;
      const currentSensorData = sensorDataRef.current;

      if (currentLogging.isLogging) {
        const dataObj = {
          loggingSessionId: currentLogging.loggingSessionId,
          timestamp: dataObjTimestamp,
          turbidityValue,
          temperatureValue,
          locationLat: currentState.locationLat,
          locationLng: currentState.locationLng,
          batteryLevel: currentSensorData.batteryLevel,
          batteryRawVoltage: currentSensorData.batteryRawVoltage,
        };
        dispatch(addDataToLoggingSession(currentLogging.loggingSessionId, dataObj));
      }

      const currentDevices = devicesRef.current;
      if (currentDevices.wiping) dispatch(setWiping(false));
      if (currentDevices.sensorError) dispatch(setSensorError(false));
      if (!currentDevices.sensorDataReceived) {
        dispatch(setSensorDataReceived(true));
        if (sensorErrorTimeoutRef.current) {
          clearTimeout(sensorErrorTimeoutRef.current);
          sensorErrorTimeoutRef.current = null;
          console.log('Sensor error timeout cleared');
        }
      }
    } else if (statsMatch) {
      console.log('statsMatch', statsMatch);
      const batteryLevel = parseFloat(statsMatch[1]);
      const batteryRawVoltage = 0;
      const batteryCharging = statsMatch[2] === '1';
      dispatch(updateBatteryStatus({ batteryLevel, batteryRawVoltage, batteryCharging }));
    }
  }, [dispatch]);

  // Handle device disconnection
  const onDeviceDisconnected = useCallback((event: BluetoothDeviceEvent) => {
    console.log('XXX Devices index onDeviceDisconnected');
    const currentState = stateRef.current;
    const currentDevices = devicesRef.current;

    if (onDataReceivedSubscriptionRef.current) {
      onDataReceivedSubscriptionRef.current.remove();
      onDataReceivedSubscriptionRef.current = null;
    }

    if (currentState.connectedDevice) {
      const deviceDataObj = currentDevices.bondedDevicesFormatted.find(
        (o: any) => o.address === currentState.connectedDevice.address
      );
      console.log("XXX setDeviceDisconnected 1")
      dispatch(setDeviceDisconnected(deviceDataObj));
    } else {
      console.log("XXX clearConnectedDevice 1")
      dispatch(clearConnectedDevice());
    }
    //console.log("XXX resetting 1")
    // dispatch(resetValues());

    // if (navigation.canGoBack()) {
    //   navigation.goBack();
    // }
  }, [dispatch, navigation]);

  // Bluetooth state change handler
  const onBluetoothStateChange = useCallback((event: any) => {
    console.log('onBluetoothStateChange', event.enabled);
    setState(prev => ({ ...prev, bluetoothEnabled: event.enabled }));
  }, []);

  // Update the connectToDevice function
  const connectToDevice = useCallback(async (id: string) => {
    // Reset cancellation flag when starting a new connection
    userCancelledConnectionRef.current = false;

    const currentDevices = devicesRef.current;
    const deviceDataObj = currentDevices.bondedDevicesFormatted.find((o: any) => o.id === id);

    if (!deviceDataObj) {
      console.log('Device data not found');
      return;
    }

    console.log('Attempting to connect to device:', deviceDataObj.name);
    setState(prev => ({ ...prev, awaitingDevice: true, connectingDevice: null, connectedDevice: null }));

    try {
      // Get fresh device list from RNBluetoothClassic
      const bondedDevices = await RNBluetoothClassic.getBondedDevices();
      const deviceToConnect = bondedDevices.find((device: any) => device.id === id);

      if (!deviceToConnect) {
        // Check if user cancelled before retrying
        if (userCancelledConnectionRef.current) {
          console.log('Connection cancelled by user, not retrying');
          setState(prev => ({ ...prev, awaitingDevice: false }));
          return;
        }

        console.log('Device not found in bonded devices, waiting and retrying...');
        // Keep awaitingDevice: true

        // Store the timeout ID so we can cancel it later
        retryTimeoutRef.current = setTimeout(() => {
          connectToDevice(id);
        }, 1000);
        return;
      }

      // Device found in bonded list, but check if it's actually connectable
      console.log('Device found in bonded list, checking if connectable...');

      // Check if device has the isConnected method (meaning it's a real device object)
      if (!deviceToConnect.isConnected) {
        console.log('Device object not ready (no isConnected method), retrying...');

        // Check if user cancelled before retrying
        if (userCancelledConnectionRef.current) {
          console.log('Connection cancelled by user, not retrying');
          setState(prev => ({ ...prev, awaitingDevice: false }));
          return;
        }

        // Keep awaitingDevice: true and retry
        retryTimeoutRef.current = setTimeout(() => {
          connectToDevice(id);
        }, 1000);
        return;
      }

      // Device object is ready, now proceed with connection
      console.log('Device ready, checking connection status...');
      setState(prev => ({ ...prev, connectingDevice: deviceToConnect }));

      const connection = await deviceToConnect.isConnected();

      // Check if user cancelled
      if (userCancelledConnectionRef.current) {
        console.log('Connection cancelled by user');
        setState(prev => ({ ...prev, awaitingDevice: false, connectingDevice: null }));
        return;
      }

      console.log('isConnected check result:', connection);

      if (!connection) {
        // Device is not currently connected
        // Check if device is in range using the formatted device data
        const deviceInfo = currentDevices.bondedDevicesFormatted.find((o: any) => o.id === id);

        if (!deviceInfo || !deviceInfo.inRange) {
          console.log('Device not in range, waiting and retrying...');

          // Check if user cancelled before retrying
          if (userCancelledConnectionRef.current) {
            console.log('Connection cancelled by user');
            setState(prev => ({ ...prev, awaitingDevice: false, connectingDevice: null }));
            return;
          }

          // Keep awaitingDevice: true and retry
          retryTimeoutRef.current = setTimeout(() => {
            connectToDevice(id);
          }, 1000);
          return;
        }

        // Device is in range! Now we can proceed with connection
        console.log('Device is in range, proceeding with connection...');
        setState(prev => ({ ...prev, awaitingDevice: false, connectionAttemptStarted: true }));
        dispatch(setDeviceConnecting(deviceDataObj));

        if (onDataReceivedSubscriptionRef.current) {
          onDataReceivedSubscriptionRef.current.remove();
        }

        try {
          console.log('Attempting to connect...');
          await deviceToConnect.connect();

          // Check if user cancelled during connection
          if (userCancelledConnectionRef.current) {
            console.log('Connection cancelled by user, disconnecting');
            await deviceToConnect.disconnect();
            setState(prev => ({ ...prev, awaitingDevice: false, connectionAttemptStarted: false }));
            return;
          }

          console.log('Connection established');
          console.log("XXX resetting 3");
          dispatch(resetValues());
          dispatch(setDeviceConnected(deviceDataObj));

          setTimeout(() => {
            if (!devicesRef.current.sensorDataReceived) {
              dispatch(setWiping(true));
              setTimeout(() => {
                if (devicesRef.current.wiping) {
                  dispatch(setWiping(false));
                }
              }, 8000);
            }
          }, 2000);

          // Clear any existing timeout first
          if (sensorErrorTimeoutRef.current) {
            clearTimeout(sensorErrorTimeoutRef.current);
          }

          sensorErrorTimeoutRef.current = setTimeout(() => {
            if (!devicesRef.current.sensorDataReceived) {
              dispatch(setSensorError(true));
            }
          }, 40000);

          onDataReceivedSubscriptionRef.current = deviceToConnect.onDataReceived((event: any) => {
            onDataReceived(event);
          });

          setState(prev => ({
            ...prev,
            connectingDevice: null,
            connectedDevice: deviceToConnect,
            connectionAttemptStarted: false,
          }));

          const routeToDeviceView = CommonActions.navigate({
            name: 'DeviceView',
            params: {
              deviceDataObj,
              deviceName: deviceDataObj.name,
            },
          });
          navigation.dispatch(routeToDeviceView);
        } catch (error) {
          console.log("Connection failed:", error);
          dispatch(setDeviceDisconnecting(deviceDataObj));

          try {
            await deviceToConnect.disconnect();
            console.log('Disconnected after failed connection');
            console.log("XXX setDeviceDisconnected 2")
            dispatch(setDeviceDisconnected(deviceDataObj));
            console.log("XXX resetting 4");
            dispatch(resetValues());
            setState(prev => ({ ...prev, awaitingDevice: false, connectionAttemptStarted: false }));
          } catch (disconnectError) {
            console.log("Couldn't disconnect", disconnectError);
            console.log("XXX setDeviceDisconnected 3")
            dispatch(setDeviceDisconnected(deviceDataObj));
            console.log("XXX resetting 5");
            dispatch(resetValues());
            setState(prev => ({ ...prev, awaitingDevice: false, connectionAttemptStarted: false }));
          }
        }
      } else {
        console.log('Device already connected, navigating to DeviceView');
        setState(prev => ({ ...prev, awaitingDevice: false }));
        const routeToDeviceView = CommonActions.navigate({
          name: 'DeviceView',
          params: {
            deviceDataObj,
            deviceName: deviceDataObj.name,
          },
        });
        navigation.dispatch(routeToDeviceView);
      }
    } catch (error) {
      console.log('Error in connectToDevice:', error);

      // Check if user cancelled
      if (userCancelledConnectionRef.current) {
        console.log('Connection cancelled by user after error');
        setState(prev => ({ ...prev, awaitingDevice: false }));
        return;
      }

      // Retry on error
      console.log('Retrying after error...');
      retryTimeoutRef.current = setTimeout(() => {
        connectToDevice(id);
      }, 1000);
    }
  }, [dispatch, navigation, onDataReceived]);

  // Update the cancelConnectToDevice function
  const cancelConnectToDevice = useCallback(() => {
    console.log('User cancelled connection');

    // Set the cancellation flag
    userCancelledConnectionRef.current = true;

    // Clear any pending retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
      console.log('Cleared pending retry timeout');
    }

    setState(prev => ({
      ...prev,
      connectingDevice: null,
      connectedDevice: null,
      connectionAttemptStarted: false,
      awaitingDevice: false,
    }));
  }, []);

  // Enter demo mode
  const enterDemoModeButtonPress = useCallback(() => {
    dispatch(setDemoModeEnabled(true));
    setState(prev => ({ ...prev, demoModeEnabled: true }));

    const routeToDeviceView = CommonActions.navigate({
      name: 'DeviceView',
      params: {
        deviceDataObj: null,
        demoModeEnabled: true,
        deviceName: 'DEMO',
      },
    });
    navigation.dispatch(routeToDeviceView);
  }, [dispatch, navigation]);

  // Navigate to Add/Edit Devices
  const addEditDevicesButtonPress = useCallback(() => {
    const routeToAddEditDevicesList = CommonActions.navigate({
      name: 'AddEditDevices',
    });
    navigation.dispatch(routeToAddEditDevicesList);
  }, [navigation]);

  // Create demo data reading
  const createDemoDataReading = useCallback(() => {
    const turbidityRangeMin = 1500;
    const turbidityRangeMax = 4500;
    const temperatureRangeMin = 12;
    const temperatureRangeMax = 18;

    let turbidityValue: number;
    if (currentTurbidityValueRef.current === null) {
      // 20% chance to start with low turbidity (0-50 NTU)
      if (Math.random() < 0.2) {
        turbidityValue = Math.round(50 * Math.random() * 100) / 100;
      } else {
        turbidityValue = Math.round(((turbidityRangeMax - turbidityRangeMin) * Math.random() + turbidityRangeMin) * 100) / 100;
      }
    } else {
      const turbidityAdjust = 300 * Math.random() - 150;
      let newTurbidityValue = currentTurbidityValueRef.current + turbidityAdjust;

      // 10% chance to drop significantly toward zero
      if (Math.random() < 0.1) {
        newTurbidityValue = Math.max(0, currentTurbidityValueRef.current - Math.random() * 500);
      }

      // Allow full range from 0 to max
      newTurbidityValue = Math.max(0, newTurbidityValue);
      newTurbidityValue = Math.min(turbidityRangeMax, newTurbidityValue);
      turbidityValue = Math.round(newTurbidityValue * 100) / 100;
    }
    currentTurbidityValueRef.current = turbidityValue;

    let temperatureValue: number;
    if (currentTemperatureValueRef.current === null) {
      temperatureValue = Math.round(((temperatureRangeMax - temperatureRangeMin) * Math.random() + temperatureRangeMin) * 10) / 10;
    } else {
      const temperatureAdjust = 2 * Math.random() - 1;
      let newTemperatureValue = currentTemperatureValueRef.current + temperatureAdjust;
      newTemperatureValue = Math.max(temperatureRangeMin, newTemperatureValue);
      newTemperatureValue = Math.min(temperatureRangeMax, newTemperatureValue);
      temperatureValue = Math.round(newTemperatureValue * 10) / 10;
    }
    currentTemperatureValueRef.current = temperatureValue;

    let probeSetting = 'R3';
    let rangeLabel = 'High range';
    if (turbidityValue < 1000) {
      probeSetting = 'R2';
      rangeLabel = 'Medium range';
    }
    if (turbidityValue < 10) {
      probeSetting = 'R1';
      rangeLabel = 'Low range';
    }

    const sampleDateObj = DateTime.now();
    const tzOffsetStr = sampleDateObj.toFormat('Z');
    const tzOffsetMs = parseInt(tzOffsetStr) * 1000 * 60 * 60;
    const dataObjTimestamp = parseInt(sampleDateObj.toFormat('x')) - tzOffsetMs;

    const currentState = stateRef.current;

    dispatch(
      updateValues({
        probeSetting,
        rangeLabel,
        temperatureEnabled: true,
        turbidityEnabled: true,
        turbidityValue,
        temperatureValue,
        locationEnabled: currentState.locationEnabled,
        locationLat: currentState.locationLat,
        locationLng: currentState.locationLng,
        sampleDateObj,
      })
    );

    const currentLogging = loggingRef.current;
    const currentSensorData = sensorDataRef.current;

    if (currentLogging.isLogging) {
      const dataObj = {
        loggingSessionId: currentLogging.loggingSessionId,
        timestamp: dataObjTimestamp,
        turbidityValue,
        temperatureValue,
        locationLat: currentState.locationLat,
        locationLng: currentState.locationLng,
        batteryLevel: currentSensorData.batteryLevel,
        batteryRawVoltage: currentSensorData.batteryRawVoltage,
        demoModeEnabled: currentState.demoModeEnabled,
      };
      console.log("XXX addDataToLoggingSession", { loggingSessionId: currentLogging.loggingSessionId, dataObj })
      dispatch(addDataToLoggingSession(currentLogging.loggingSessionId, dataObj));
    }

    // FIXED: Use devicesRef
    const currentDevices = devicesRef.current;
    if (currentDevices.wiping) dispatch(setWiping(false));
    if (!currentDevices.sensorDataReceived) {
      dispatch(setSensorDataReceived(true));
      if (sensorErrorTimeoutRef.current) {
        clearTimeout(sensorErrorTimeoutRef.current);
        sensorErrorTimeoutRef.current = null;
        console.log('Sensor error timeout cleared');
      }
    }

    // Battery management - use ref to get current battery level
    const currentTime = Date.now();

    if (!currentSensorData.batteryLevel) {
      // Initialize battery at random level between 60-90
      const batteryLevel = Math.round(30 * Math.random() + 60);
      batteryLastDecrementTimeRef.current = currentTime;
      dispatch(updateBatteryStatus({ batteryLevel, batteryCharging: false }));
    } else {
      // Decrement battery by 1 every 5 minutes (300000 ms)
      const timeSinceLastDecrement = currentTime - (batteryLastDecrementTimeRef.current || currentTime);

      if (timeSinceLastDecrement >= 300000) { // 5 minutes in milliseconds
        const newBatteryLevel = Math.max(0, currentSensorData.batteryLevel - 1);
        batteryLastDecrementTimeRef.current = currentTime;
        dispatch(updateBatteryStatus({ batteryLevel: newBatteryLevel, batteryCharging: false }));
      }
    }
  }, [dispatch]); // FIXED: Only dispatch in dependencies, using refs for all state

  // Mount effect
  useEffect(() => {
    getBluetoothPermissionsAndStartBluetoothProcesses();
    startLocationUpdates();

    // Set up Classic Bluetooth event subscriptions
    disconnectSubscriptionRef.current =
      RNBluetoothClassic.onDeviceDisconnected(onDeviceDisconnected);
    bluetoothEnabledSubscriptionRef.current =
      RNBluetoothClassic.onBluetoothEnabled(onBluetoothStateChange);
    bluetoothDisabledSubscriptionRef.current =
      RNBluetoothClassic.onBluetoothDisabled(onBluetoothStateChange);

    // Start connection status check interval (every 5 seconds)
    connectionCheckIntervalRef.current = setInterval(() => {
      checkConnectionStatus();
    }, 5000);

    return () => {
      console.log("XXXX removing subscriptions");
      if (disconnectSubscriptionRef.current) {
        disconnectSubscriptionRef.current.remove();
      }
      if (bluetoothEnabledSubscriptionRef.current) {
        bluetoothEnabledSubscriptionRef.current.remove();
      }
      if (bluetoothDisabledSubscriptionRef.current) {
        bluetoothDisabledSubscriptionRef.current.remove();
      }
      if (onDataReceivedSubscriptionRef.current) {
        onDataReceivedSubscriptionRef.current.remove();
      }

      // Clear connection check interval
      if (connectionCheckIntervalRef.current) {
        clearInterval(connectionCheckIntervalRef.current);
        connectionCheckIntervalRef.current = null;
      }

      // 🟢 NEW: pending discovery timers clear karo, taake yeh remount ke baad
      // stale chain na banayein
      if (discoveryTimeoutRef.current) {
        clearTimeout(discoveryTimeoutRef.current);
        discoveryTimeoutRef.current = null;
      }
      if (discoveryRestartTimeoutRef.current) {
        clearTimeout(discoveryRestartTimeoutRef.current);
        discoveryRestartTimeoutRef.current = null;
      }
      if (isDiscoveringRef.current) {
        RNBluetoothClassic.cancelDiscovery().catch(() => { });
        isDiscoveringRef.current = false;
      }

      console.log("XXX resetting 6");
      dispatch(resetValues());
      stopLocationUpdates();
    };
  }, [
    getBluetoothPermissionsAndStartBluetoothProcesses,
    startLocationUpdates,
    onDeviceDisconnected,
    onBluetoothStateChange,
    checkConnectionStatus, // Add this
    dispatch,
    stopLocationUpdates,
  ]);

  /// Demo mode effect
  useEffect(() => {
    if (state.demoModeEnabled && !intervalIdRef.current) {
      intervalIdRef.current = setInterval(() => {
        createDemoDataReading();
      }, 1000);
    }

    if (!demo.demoModeEnabled && intervalIdRef.current) {
      console.log("Stopping demo interval");
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
      currentTurbidityValueRef.current = null;
      currentTemperatureValueRef.current = null;
      setState(prev => ({ ...prev, demoModeEnabled: false }));
      console.log("XXX resetting 7");
      dispatch(resetValues());
    }

    return () => {
      if (intervalIdRef.current) {
        console.log("Cleanup: clearing interval");
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [state.demoModeEnabled, demo.demoModeEnabled, createDemoDataReading, dispatch]);

  // Render
  const connectingDeviceLabel = state.connectingDevice ? state.connectingDevice.name : null;
  const deviceAddress = state.connectingDevice ? state.connectingDevice.address : null;
  const dialogVisible = state.connectingDevice !== null || state.awaitingDevice;

  return (
    <SafeAreaView>
      <DeviceConnectingDialog
        visible={dialogVisible}
        awaitingDevice={state.awaitingDevice}
        deviceStatus={devices.status}
        deviceLabel={connectingDeviceLabel}
        deviceAddress={deviceAddress}
        connectingDevice={state.connectingDevice}
        connectionAttemptStarted={state.connectionAttemptStarted}
        connectToDeviceHandler={connectToDevice}
        cancelConnectToDeviceHandler={cancelConnectToDevice}
      />

      <View>
        <NepLinkHeader />
        {!(state.bluetoothAvailable && state.bluetoothEnabled && state.bluetoothPermissions) ? (
          <BluetoothDisabledError
            bluetoothAvailable={state.bluetoothAvailable}
            bluetoothEnabled={state.bluetoothEnabled}
            bluetoothPermissions={state.bluetoothPermissions}
          />
        ) : (
          <>
            <DevicesList
              bondedDevices={devices.bondedDevicesFormatted}
              connectToDeviceHandler={connectToDevice}
            />

            <DevicesListButtons
              bluetoothAvailable={state.bluetoothAvailable}
              bluetoothEnabled={state.bluetoothEnabled}
              bluetoothPermissions={state.bluetoothPermissions}
              addEditDevicesButtonPressHandler={addEditDevicesButtonPress}
              enterDemoModeButtonPressHandler={enterDemoModeButtonPress}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

export default Devices;
