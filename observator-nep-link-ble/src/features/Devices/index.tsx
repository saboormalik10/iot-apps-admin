import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView, View, PermissionsAndroid, Platform,  NativeEventEmitter, NativeModules } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { CommonActions, useNavigation } from '@react-navigation/native';
import Geolocation from '@react-native-community/geolocation';
import { DateTime } from 'luxon';

import BleService from '../../services/BleService';
import { setDemoModeEnabled } from '../../actions/DemoActions';
import {
  setDeviceConnected,
  setDeviceDisconnected,
  clearConnectedDevice,
  setWiping,
  setSensorDataReceived,
  setSensorError,
  setBleDevicesFound,
  addKnownDevices,
} from '../../actions/DeviceActions';
import { updateValues, resetValues, updateBatteryStatus } from '../../actions/SensorDataActions';
import { addDataToLoggingSession } from '../../actions/LoggingActions';
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
  lastSaveLoggingSessionSamplesCount: number;
  attemptingConnection: boolean;
  demoModeEnabled: boolean;
}

interface RootState {
  demo: {
    demoModeEnabled: boolean;
  };
  devices: {
    bleDevicesFoundRaw: any[];
    bleDevicesFoundFormatted: any[];
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
    batteryRawVoltage: number;
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
    lastSaveLoggingSessionSamplesCount: 0,
    attemptingConnection: false,
    demoModeEnabled: false,
    isScanning: false, // ADD THIS
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

  // Add ref for state
  const stateRef = useRef(state);

  // Keep ref updated
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Keep logging ref updated
  useEffect(() => {
    loggingRef.current = logging;
  }, [logging]);

  // Keep sensorData ref updated
  useEffect(() => {
    sensorDataRef.current = sensorData;
  }, [sensorData]);

  // Keep devices ref updated
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  // Start Bluetooth scan
  const startScan = useCallback(() => {
    // Prevent multiple simultaneous scans
    if (stateRef.current.isScanning) {
      console.log('Scan already in progress, skipping...');
      return;
    }

    console.log('Starting BLE scan...');
    setState(prev => ({ ...prev, isScanning: true }));

    BleService.startScan(
      () => {
        console.log('Scan stopped');
        setState(prev => ({ ...prev, isScanning: false }));
      },
      (bleDevicesFound: any[]) => {
        dispatch(setBleDevicesFound(bleDevicesFound));
        dispatch(addKnownDevices(bleDevicesFound));
      }
    );
  }, [dispatch]);
  // Get Bluetooth permissions

  // Stop Bluetooth scan
  const stopScan = useCallback(() => {
    if (stateRef.current.isScanning) {
      console.log('Stopping BLE scan...');
      BleService.stopScan();
      setState(prev => ({ ...prev, isScanning: false }));
    }
  }, []);

  // Get Bluetooth permissions
  const getBluetoothPermissionsAndStartBluetoothProcesses = useCallback(async () => {
    let fineLocationPermission = true;
    let bluetoothScanPermission = true;
    let bluetoothConnectPermission = true;

    if (Platform.OS === 'android') {
      if (Platform.Version < 31) {
        try {
          fineLocationPermission = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          ) === PermissionsAndroid.RESULTS.GRANTED;
        } catch (error) {
          console.log("Can't request ACCESS_FINE_LOCATION permission", error);
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

      // Add a small delay to ensure Bluetooth is ready before scanning
      setTimeout(() => {
        startScan();
      }, 500);
    } else {
      setState(prev => ({ ...prev, bluetoothPermissions: false }));
      return false;
    }
  }, [startScan]);

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
          enableHighAccuracy: false, // CHANGED: Use false on first attempt for faster result
          timeout: 15000, // CHANGED: Shorter timeout
          maximumAge: 0, // CHANGED: Don't use cached location on first call
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

  // Start fallback location updates - FIXED: Uses stateRef instead of state
  const startFallbackLocationUpdates = useCallback(() => {
    console.log('Starting fallback location updates...');

    locationUpdateIdRef.current = setInterval(async () => {
      // FIXED: Use stateRef to get current location values
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
  }, [stopLocationUpdates]); // FIXED: Removed state dependencies

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

  // Mount effect
  useEffect(() => {
    BleService.init();
    getBluetoothPermissionsAndStartBluetoothProcesses();
    startLocationUpdates(); // CHANGED: Call directly instead of through locationUpdate

    let stateSubscription: any = null;

    const checkBluetoothState = async () => {
      try {
        const isEnabled = await BleService.isBluetoothEnabled();
        setState(prev => ({ ...prev, bluetoothEnabled: isEnabled }));
      } catch (error) {
        console.log('Error checking Bluetooth state:', error);
        setState(prev => ({ ...prev, bluetoothEnabled: false }));
      }
    };

    // Initialize Bluetooth monitoring after BLE service is ready
    const initBluetoothMonitoring = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));

      await checkBluetoothState();

      stateSubscription = BleService.onStateChange((bleState: string) => {
        console.log('Bluetooth state changed:', bleState);
        // Include 'Unsupported' for iOS simulator
        const isEnabled = ['PoweredOn', 'Unsupported'].includes(bleState);
        setState(prev => ({ ...prev, bluetoothEnabled: isEnabled }));
      });
    };

    initBluetoothMonitoring();

    return () => {
      if (stateSubscription) {
        stateSubscription.remove();
      }
      dispatch(resetValues());
      stopLocationUpdates();
    };
  }, [getBluetoothPermissionsAndStartBluetoothProcesses, startLocationUpdates, dispatch, stopLocationUpdates]); // CHANGED: Added startLocationUpdates dependency
  // Update bonded devices - REMOVED: Function was redundant with startScan callback

  // Handle battery data
  const onBatteryDataReceived = useCallback((batteryDataObj: any) => {
    const batteryPercentage = !isNaN(batteryDataObj.percentage)
      ? parseInt(batteryDataObj.percentage)
      : 0;
    const batteryRawVoltage = !isNaN(batteryDataObj.rawVoltage)
      ? parseInt(batteryDataObj.rawVoltage)
      : 0;
    const batteryLevel = batteryPercentage > 0 ? batteryPercentage : 0;
    const batteryCharging = batteryDataObj.isCharging === 1;

    dispatch(
      updateBatteryStatus({
        batteryLevel,
        batteryCharging,
        batteryRawVoltage,
      })
    );
  }, [dispatch]);

  // Handle sensor data - FIXED: Uses refs consistently
  const onSensorDataReceived = useCallback((responseStr: string) => {
    const probeDataMatch = responseStr.match(/(R\d),(\d+\.\d+),?(\d+\.\d+)?/);
    const statsMatch = responseStr.match(/~,stats,(\d+),(\d)/);

    if (!probeDataMatch && !statsMatch) {
      console.log('UNMATCHED responseStr:', responseStr);
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
        !!probeDataMatch[3] &&
        parseFloat(probeDataMatch[3]) !== 0.0 &&
        parseFloat(probeDataMatch[3]) > -100;
      const temperatureValue = temperatureEnabled ? parseFloat(probeDataMatch[3]) : null;

      const sampleDateObj = DateTime.now();
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

      // FIXED: Use loggingRef and sensorDataRef
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

      // FIXED: Use devicesRef
      const currentDevices = devicesRef.current;
      if (currentDevices.wiping) dispatch(setWiping(false));
      if (currentDevices.sensorError) dispatch(setSensorError(false));
      if (!currentDevices.sensorDataReceived) dispatch(setSensorDataReceived(true));
    } else if (statsMatch) {
      console.log('statsMatch', statsMatch);
      const batteryLevel = parseFloat(statsMatch[1]);
      const batteryCharging = statsMatch[2] === '1';
      dispatch(updateBatteryStatus({ batteryLevel, batteryCharging }));
    }
  }, [dispatch]); // FIXED: Removed state dependencies, using refs

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
      dispatch(addDataToLoggingSession(currentLogging.loggingSessionId, dataObj));
    }

    // FIXED: Use devicesRef
    const currentDevices = devicesRef.current;
    if (currentDevices.wiping) dispatch(setWiping(false));
    if (!currentDevices.sensorDataReceived) dispatch(setSensorDataReceived(true));

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

  // Device callbacks
  const onConnected = useCallback(() => {
    dispatch(setWiping(true));
    setTimeout(() => {
      dispatch(setWiping(false));
    }, 10000);
  }, [dispatch]);

  // FIXED: Use refs to avoid stale closures
  const onDeviceDisconnected = useCallback(() => {
    console.log("XXXX onDeviceDisconnected");
    const currentState = stateRef.current;
    const currentDevices = devicesRef.current;

    if (currentState.connectedDevice) {
      const deviceDataObj = currentDevices.bleDevicesFoundFormatted.find(
        (o: any) => o.address === currentState.connectedDevice.address
      );
      dispatch(setDeviceDisconnected(deviceDataObj));
    } else {
      dispatch(clearConnectedDevice());
    }
    startScan();
  }, [dispatch, navigation]); // FIXED: Removed state/devices dependencies

  // Connect to device - FIXED: Use devicesRef
  const connectToDevice = useCallback((device: any) => {
    stopScan(); // CHANGED: Stop scan before connecting

    const currentDevices = devicesRef.current;
    const deviceToConnect = currentDevices.bleDevicesFoundRaw.find((o: any) => o.bleDevice.id === device.id);
    const deviceDataObj = currentDevices.bleDevicesFoundFormatted.find((o: any) => o.id === device.id);

    setState(prev => ({ ...prev, awaitingDevice: true, connectingDevice: null, connectedDevice: null }));

    if (!deviceToConnect) {
      setTimeout(() => {
        console.log('Retrying connection...');
        connectToDevice(device);
      }, 1000);
      return;
    }

    dispatch(resetValues());
    dispatch(setWiping(false));
    dispatch(setSensorError(false));
    dispatch(setSensorDataReceived(false));
    setState(prev => ({ ...prev, awaitingDevice: false, connectingDevice: deviceToConnect, connectedDevice: null }));

    BleService.connectAndListen(
      deviceToConnect.bleDevice,
      onConnected,
      onSensorDataReceived,
      onBatteryDataReceived,
      onDeviceDisconnected
    );

    dispatch(setDeviceConnected(deviceToConnect));

    const routeToDeviceView = CommonActions.navigate({
      name: 'DeviceView',
      params: {
        deviceDataObj,
        deviceName: deviceDataObj.name,
      },
    });
    navigation.dispatch(routeToDeviceView);
  }, [stopScan, dispatch, navigation, onConnected, onSensorDataReceived, onBatteryDataReceived, onDeviceDisconnected]);

  // Cancel connection
  const cancelConnectToDevice = useCallback(() => {
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

  // Mount effect
  useEffect(() => {
    BleService.init();
    getBluetoothPermissionsAndStartBluetoothProcesses();

    let stateSubscription: any = null;

    const checkBluetoothState = async () => {
      try {
        const isEnabled = await BleService.isBluetoothEnabled();
        setState(prev => ({ ...prev, bluetoothEnabled: isEnabled }));
      } catch (error) {
        console.log('Error checking Bluetooth state:', error);
        setState(prev => ({ ...prev, bluetoothEnabled: false }));
      }
    };

    // Initialize Bluetooth monitoring after BLE service is ready
    const initBluetoothMonitoring = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));

      await checkBluetoothState();

      stateSubscription = BleService.onStateChange((bleState: string) => {
        console.log('Bluetooth state changed:', bleState);
        // Include 'Unsupported' for iOS simulator
        const isEnabled = ['PoweredOn', 'Unsupported'].includes(bleState);
        setState(prev => ({ ...prev, bluetoothEnabled: isEnabled }));
      });
    };

    initBluetoothMonitoring();

    return () => {
      if (stateSubscription) {
        stateSubscription.remove();
      }
      stopScan(); // ADD THIS
      dispatch(resetValues());
      stopLocationUpdates();
    };
  }, [getBluetoothPermissionsAndStartBluetoothProcesses, dispatch, stopLocationUpdates]);

  // Demo mode effect
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

      dispatch(resetValues());
    }

    return () => {
      if (intervalIdRef.current) {
        console.log("Cleanup: clearing interval");
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [state.demoModeEnabled, demo.demoModeEnabled, createDemoDataReading, dispatch]); // FIXED: Added createDemoDataReading

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
              bleDevicesFound={devices.bleDevicesFoundFormatted}
              //bondedDevices={[{ name: 'NEP-LINK BLE', id: 'demo', inRange: true }]}
              connectToDeviceHandler={connectToDevice}
            />
          </>
        )}
        <DevicesListButtons enterDemoModeButtonPressHandler={enterDemoModeButtonPress} />
      </View>
    </SafeAreaView>
  );
};

export default Devices;
