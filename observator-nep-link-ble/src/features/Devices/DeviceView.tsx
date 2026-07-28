import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollView, View, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import RNBluetoothClassic, { BluetoothDeviceEvent } from 'react-native-bluetooth-classic';
import { launchCamera, CameraOptions, ImagePickerResponse } from 'react-native-image-picker';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { DateTime } from 'luxon';
import RNFS from 'react-native-fs';
import uuid from 'react-native-uuid';

import {
  startLogging,
  stopLogging,
  fetchLoggingSessions,
} from '../../actions/LoggingActions';
import { setSensorError } from '../../actions/DeviceActions';
import { setDemoModeEnabled } from '../../actions/DemoActions';

import TakePhotoDialog from './TakePhotoDialog';
import WaitingScreen from './WaitingScreen';
import LiveValues from './LiveValues';
import RangeIndicator from './RangeIndicator';
import LocationMap from './LocationMap';
import LoggingButtons from './LoggingButtons';
import HeaderRightBatteryIndicator from './HeaderRightBatteryIndicator';
import HeaderRightCameraButton from './HeaderRightCameraButton';
import { upload_session_file } from '../../api/apiService';

// Types
interface RootState {
  devices: {
    device: any;
    sensorError: boolean;
    wiping: boolean;
  };
  sensorData: {
    batteryLevel?: number;
    batteryVoltage?: number;
    batteryCharging?: boolean;
    turbidityEnabled: boolean;
    temperatureEnabled: boolean;
    turbidityValue?: number;
    temperatureValue?: number;
    rangeLabel?: string;
    locationLat?: number | null;
    locationLng?: number | null;
    locationEnabled: boolean;
  };
  logging: {
    isLogging: boolean;
    loggingSessionId: string;
    loggingSessionSamples: any[];
    loggingSessionSampleCount: number;
    loggingSession?: {
      timestamp: number;
    };
  };
  demo: {
    demoModeEnabled: boolean;
  };
}

const DeviceView: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();

  // Redux selectors
  const devices = useSelector((state: RootState) => state.devices);
  const sensorData = useSelector((state: RootState) => state.sensorData);
  const logging = useSelector((state: RootState) => state.logging);
  const demo = useSelector((state: RootState) => state.demo);

  // State
  const [loggingSessionId, setLoggingSessionId] = useState<string | null>(null);
  const [lastCompletedSessionId, setLastCompletedSessionId] = useState<string | null>(null);
  const [showTakePhotoDialog, setShowTakePhotoDialog] = useState<boolean>(false);
  const [goBackAfterPhoto, setGoBackAfterPhoto] = useState<boolean>(false);

  // Refs
  const mapViewShotRef = useRef<any>(null);
  const loggingSessionIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const disconnectSubscriptionRef = useRef<any>(null);
  const loggingRef = useRef(logging);
  const lastCompletedSessionIdRef = useRef<string | null>(null);
  const sensorErrorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loggingRef.current = logging;
  }, [logging]);

  // Keep ref in sync
  useEffect(() => {
    lastCompletedSessionIdRef.current = lastCompletedSessionId;
  }, [lastCompletedSessionId]);

  // Constants
  const mapHeight = parseInt((Dimensions.get('screen').width * 0.6).toString());

  // Add cleanup effect
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    loggingSessionIdRef.current = loggingSessionId;
  }, [loggingSessionId]);

  // Update header with battery indicator
  useEffect(() => {
    const batteryLevel = sensorData.batteryLevel;
    const batteryVoltage = sensorData.batteryVoltage || 0;

    navigation.setOptions({
      headerBackButtonMenuEnabled: false,
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
          <HeaderRightBatteryIndicator
            batteryLevel={batteryLevel}
            batteryVoltage={batteryVoltage}
            batteryCharging={sensorData.batteryCharging}
          />
          <HeaderRightCameraButton
            isLogging={logging.isLogging}
            onPress={handleHeaderCameraPress}
          />
        </View>
      ),
    });
  }, [
    navigation,
    sensorData.batteryLevel,
    sensorData.batteryVoltage,
    sensorData.batteryCharging,
    logging.isLogging,
  ]);

  // Set sensor error after timeout if no data received
  useEffect(() => {
    // Clear any existing timeout
    if (sensorErrorTimeoutRef.current) {
      clearTimeout(sensorErrorTimeoutRef.current);
    }

    sensorErrorTimeoutRef.current = setTimeout(() => {
      if (!sensorData.turbidityEnabled && !sensorData.temperatureEnabled) {
        console.log("XXXX setting sensorError true 2");
        dispatch(setSensorError(true));
      }
    }, 40000);

    return () => {
      if (sensorErrorTimeoutRef.current) {
        clearTimeout(sensorErrorTimeoutRef.current);
        sensorErrorTimeoutRef.current = null;
      }
    };
  }, [dispatch, sensorData.turbidityEnabled, sensorData.temperatureEnabled]);

  useEffect(() => {
    console.log('loggingSessionId logging.isLogging change', logging.isLogging);
  }, [logging.isLogging]);

  useEffect(() => {
    console.log('loggingSessionId loggingSessionId change', loggingSessionId);
  }, [loggingSessionId]);

  const prevLoggingRef = useRef(logging.isLogging);

  // Clear logging session ID after logging stops and photo dialog closes
  useEffect(() => {
    if (prevLoggingRef.current && !logging.isLogging && loggingSessionId && !showTakePhotoDialog) {
      console.log('Clearing loggingSessionId after logging stopped and photo dialog closed');
      setLoggingSessionId(null);
    }
    prevLoggingRef.current = logging.isLogging;
  }, [logging.isLogging, loggingSessionId, showTakePhotoDialog]);

  // Disconnect connected devices
  const disconnectConnectedDevices = useCallback(async () => {
    console.log("XXX disconnectConnectedDevices")
    await RNBluetoothClassic.getConnectedDevices()
      .then(connected => {
        connected.forEach(deviceToDisconnect => {
          console.log("XXX disconnectConnectedDevices deviceToDisconnect", deviceToDisconnect)
          deviceToDisconnect
            .disconnect()
            .then(connection => {
              console.log('DeviceView disconnect', connection);
            })
            .catch(error => {
              console.log("DeviceView Error - Couldn't disconnect", error);
            });
        });
      })
      .catch(error => {
        console.log('Error getting connected devices', error);
      });
  }, []);

  // Handle device disconnection
  const onDeviceDisconnected = useCallback(
    (event: BluetoothDeviceEvent) => {
      console.log('Device disconnected event');
      console.log("XXX DeviceView onDeviceDisconnected");
      const currentLogging = loggingRef.current;

      console.log("XXXX currentLogging", currentLogging)

      // if (currentLogging.isLogging) {
      //   // Save the current session ID before stopping
      //   const currentSessionId = loggingSessionIdRef.current;
      //   if (currentSessionId) {
      //     setLastCompletedSessionId(currentSessionId);
      //     lastCompletedSessionIdRef.current = currentSessionId;
      //   }

      //   dispatch(stopLogging());
      //   console.log("XXXX calling disconnectConnectedDevices 1");
      //   disconnectConnectedDevices();
      //   takeMapImageCapture();
      //   dispatch(fetchLoggingSessions());
      //   setShowTakePhotoDialog(true);
      //   setGoBackAfterPhoto(true);
      // } else {
      //   console.log("XXXX calling disconnectConnectedDevices 2");
      //   disconnectConnectedDevices();
      //   console.log("XXXX navigation.canGoBack() 1");
      //   if (navigation.canGoBack()) {
      //     console.log("XXXX navigation.goBack() 1");
      //     navigation.goBack();
      //   }
      // }

    },
    [dispatch, navigation, disconnectConnectedDevices, takeMapImageCapture]
  );

  // Prevent navigation away during logging
  usePreventRemove(logging.isLogging, ({ data }) => {
    console.log('🚨 PREVENT REMOVE: Navigation blocked because logging is active');
    console.log('🚨 PREVENT REMOVE: Current logging state:', logging.isLogging);
    console.log('🚨 PREVENT REMOVE: Current loggingSessionId:', loggingSessionIdRef.current);
    console.log('🚨 PREVENT REMOVE: Navigation data:', data);

    const connectedDevice = devices.device;
    const deviceName = connectedDevice?.name || '';

    Alert.alert(
      'End Logging and Disconnect?',
      `Do you want to end your logging session and disconnect from ${deviceName}?`,
      [
        {
          text: 'Continue Logging',
          style: 'cancel',
          onPress: () => {
            console.log('🚨 PREVENT REMOVE: User chose to continue logging');
          },
        },
        {
          text: 'End Logging and Disconnect',
          style: 'destructive',
          onPress: () => {
            console.log('🚨 PREVENT REMOVE: User chose to end logging and disconnect');

            // Save the current session ID BEFORE stopping
            const currentSessionId = loggingSessionIdRef.current;
            console.log('🚨 PREVENT REMOVE: Current session ID:', currentSessionId);

            if (currentSessionId) {
              console.log('🚨 PREVENT REMOVE: Setting lastCompletedSessionId to:', currentSessionId);
              setLastCompletedSessionId(currentSessionId);
              lastCompletedSessionIdRef.current = currentSessionId;
              console.log('🚨 PREVENT REMOVE: lastCompletedSessionIdRef set to:', lastCompletedSessionIdRef.current);
            } else {
              console.log('🚨 PREVENT REMOVE: WARNING - No current session ID found!');
            }

            console.log('🚨 PREVENT REMOVE: About to dispatch stopLogging');
            dispatch(stopLogging());
            console.log('🚨 PREVENT REMOVE: stopLogging dispatched');

            console.log('🚨 PREVENT REMOVE: About to disconnect device');
            console.log("XXXX calling disconnectConnectedDevices 3");
            disconnectConnectedDevices();
            console.log('🚨 PREVENT REMOVE: Device disconnect called');

            console.log('🚨 PREVENT REMOVE: About to take map image capture');
            takeMapImageCapture();
            console.log('🚨 PREVENT REMOVE: takeMapImageCapture called');

            console.log('🚨 PREVENT REMOVE: About to fetch logging sessions');
            dispatch(fetchLoggingSessions());
            console.log('🚨 PREVENT REMOVE: fetchLoggingSessions dispatched');

            console.log('🚨 PREVENT REMOVE: About to show take photo dialog');
            setShowTakePhotoDialog(true);
            console.log('🚨 PREVENT REMOVE: showTakePhotoDialog set to true');

            console.log('🚨 PREVENT REMOVE: Setting goBackAfterPhoto to true');
            setGoBackAfterPhoto(true);
            console.log('🚨 PREVENT REMOVE: goBackAfterPhoto set to true');

            console.log('🚨 PREVENT REMOVE: Photo dialog will handle navigation');
          },
        },
      ],
      { cancelable: false }
    );
  });

  // Setup Classic Bluetooth subscriptions and listeners
  useEffect(() => {
    // Disconnect subscription
    disconnectSubscriptionRef.current =
      RNBluetoothClassic.onDeviceDisconnected(onDeviceDisconnected);

    // Cleanup on unmount
    return () => {
      if (disconnectSubscriptionRef.current) {
        disconnectSubscriptionRef.current.remove();
      }
    };
  }, [onDeviceDisconnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("XXXX calling disconnectConnectedDevices 4");
      disconnectConnectedDevices();
      if (demo.demoModeEnabled) {
        dispatch(setDemoModeEnabled(false));
      }
    };
  }, [demo.demoModeEnabled, dispatch, disconnectConnectedDevices]);

  // Helper function to get next available filename
  const getNextAvailableFilename = async (
    basePath: string,
    baseFilename: string,
    extension: string
  ): Promise<string> => {
    try {
      console.log('🔍 RNFS LOG 1: getNextAvailableFilename called with:', { basePath, baseFilename, extension });

      let counter = 1;
      let filePath = `${basePath}/${baseFilename}-${counter}.${extension}`;

      console.log('🔍 RNFS LOG 2: About to call RNFS.exists with filePath:', filePath);

      while (await RNFS.exists(filePath)) {
        console.log('🔍 RNFS LOG 3: File exists, incrementing counter');
        counter++;
        filePath = `${basePath}/${baseFilename}-${counter}.${extension}`;
        console.log('🔍 RNFS LOG 4: New filePath:', filePath);
      }

      console.log('🔍 RNFS LOG 5: Returning filePath:', filePath);
      return filePath;
    } catch (error) {
      console.error('🔍 RNFS LOG 6: Error in getNextAvailableFilename:', error);
      // Return a default path if something goes wrong
      return `${basePath}/${baseFilename}-1.${extension}`;
    }
  };

  // Capture map image
  const takeMapImageCapture = useCallback(async (): Promise<void> => {
    const sessionId = loggingSessionIdRef.current;
    console.log('🔍 RNFS LOG 7: takeMapImageCapture called, sessionId:', sessionId);

    if (!sensorData.locationLat || !sensorData.locationLng) {
      console.log('🔍 RNFS LOG 8: Skipping - no location data');
      return;
    }

    if (!mapViewShotRef.current || !sessionId) {
      console.log('🔍 RNFS LOG 9: Skipping - no ref or session ID');
      return;
    }

    try {
      console.log('🔍 RNFS LOG 10: About to captureRef');
      const uri = await captureRef(mapViewShotRef, {
        format: 'jpg',
        quality: 0.8,
      });
      console.log('🔍 RNFS LOG 11: Map capture URI:', uri);

      const timestamp = logging?.loggingSession?.timestamp || Date.now();
      const dateTime = DateTime.fromMillis(timestamp);

      const dirPath = `${RNFS.DocumentDirectoryPath}/loggingSessionFiles/${sessionId}/mapimage`;
      console.log('🔍 RNFS LOG 12: About to call RNFS.mkdir with dirPath:', dirPath);

      await RNFS.mkdir(dirPath);
      console.log('🔍 RNFS LOG 13: mkdir completed');

      // Delete any existing map images in the directory
      try {
        console.log('🔍 RNFS LOG 14: About to call RNFS.readDir with dirPath:', dirPath);
        const existingFiles = await RNFS.readDir(dirPath);
        console.log('🔍 RNFS LOG 15: readDir completed, files:', existingFiles);

        if (existingFiles && Array.isArray(existingFiles)) {
          for (const file of existingFiles) {
            if (file && file.path) {
              console.log('🔍 RNFS LOG 16: About to unlink file:', file.path);
              await RNFS.unlink(file.path).catch(err => {
                console.log('🔍 RNFS LOG 17: Failed to delete file:', file.path, err);
              });
            }
          }
        }
      } catch (readDirError) {
        console.log('🔍 RNFS LOG 18: Error reading directory:', readDirError);
      }

      // Save the new map image
      const filePath = `${dirPath}/NEP-Link-map-${dateTime.toFormat('dd-LLL-yyyy_HHmmss')}.jpg`;
      console.log('🔍 RNFS LOG 19: About to call RNFS.copyFile from:', uri, 'to:', filePath);

      await RNFS.copyFile(uri, filePath);
      console.log('🔍 RNFS LOG 20: copyFile (map) completed');

      // Save thumbnail
      const thumbPath = `${RNFS.DocumentDirectoryPath}/loggingSessionThumnails/${sessionId}.jpg`;
      console.log('🔍 RNFS LOG 21: About to call RNFS.mkdir for thumbnails:', `${RNFS.DocumentDirectoryPath}/loggingSessionThumnails`);

      await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/loggingSessionThumnails`);
      console.log('🔍 RNFS LOG 22: mkdir (thumbnails) completed');

      // Delete existing thumbnail if it exists
      try {
        console.log('🔍 RNFS LOG 23: About to check if thumbnail exists:', thumbPath);
        const thumbExists = await RNFS.exists(thumbPath);
        console.log('🔍 RNFS LOG 24: thumbExists:', thumbExists);

        if (thumbExists) {
          console.log('🔍 RNFS LOG 25: About to unlink thumbnail:', thumbPath);
          await RNFS.unlink(thumbPath);
          console.log('🔍 RNFS LOG 26: unlink (thumbnail) completed');
        }
      } catch (thumbError) {
        console.log('🔍 RNFS LOG 27: Error checking/deleting thumbnail:', thumbError);
      }

      console.log('🔍 RNFS LOG 28: About to call RNFS.copyFile for thumbnail from:', uri, 'to:', thumbPath);
      await RNFS.copyFile(uri, thumbPath);
      console.log('🔍 RNFS LOG 29: copyFile (thumbnail) completed');

      console.log('🔍 RNFS LOG 30: Map image captured successfully:', filePath);
    } catch (error) {
      console.error('🔍 RNFS LOG 31: Error in takeMapImageCapture:', error);
      // Retry after 1 second if failed
      setTimeout(() => {
        takeMapImageCapture();
      }, 1000);
    }
  }, [logging?.loggingSession?.timestamp, sensorData.locationLat, sensorData.locationLng]);

  // In DeviceView, add this at the top of the component
  useEffect(() => {
    console.log('🔍 DeviceView mounted');
    return () => {
      console.log('🔍 DeviceView unmounting');
    };
  }, []);

  // Watch for photo dialog closing and navigate back if needed
  useEffect(() => {
    console.log('📸 EFFECT: showTakePhotoDialog changed to:', showTakePhotoDialog);
    console.log('📸 EFFECT: goBackAfterPhoto is:', goBackAfterPhoto);

    if (!showTakePhotoDialog && goBackAfterPhoto) {
      console.log('📸 EFFECT: Photo dialog closed and goBackAfterPhoto is true, navigating back');
      // Small delay to ensure state is settled
      setTimeout(() => {
        setGoBackAfterPhoto(false); // Reset the flag
        if (navigation.canGoBack()) {
          console.log("XXXX navigation.goBack() 2");
          navigation.goBack();
        }
      }, 100);
    }
  }, [showTakePhotoDialog, goBackAfterPhoto, navigation]);

  // Add logging when starting logging
  const startLoggingHandler = useCallback(() => {
    console.log('🟢 Starting logging...');
    const id = uuid.v4() as string;
    console.log(`UUID for new session ${id}`)
    // Update BOTH the state AND the ref immediately
    setLoggingSessionId(id);
    loggingSessionIdRef.current = id;

    const connectedDevice = devices.device;
    const deviceId = connectedDevice?.id || 'demo';
    const deviceName = connectedDevice?.name || 'DEMO';

    const timezoneName = DateTime.now().toFormat('z');
    const timezoneOffset = DateTime.now().toFormat('Z');

    dispatch(
      startLogging(
        id,
        deviceId,
        deviceName,
        timezoneName,
        timezoneOffset,
        sensorData.turbidityEnabled,
        sensorData.temperatureEnabled
      )
    );

    // Delay map capture to ensure view is rendered and has location data
    setTimeout(() => {
      takeMapImageCapture();
    }, 2000);
  }, [devices.device, sensorData.turbidityEnabled, sensorData.temperatureEnabled, dispatch, takeMapImageCapture]);

  const stopLoggingHandler = useCallback(() => {
    // Save the current session ID before stopping
    const currentSessionId = loggingSessionIdRef.current;
    if (currentSessionId) {
      setLastCompletedSessionId(currentSessionId);
      lastCompletedSessionIdRef.current = currentSessionId;
    }

    // Capture map BEFORE stopping (while view is still active)
    Object.entries(logging).map(([key, value]) => {
      console.log(key, value);
    });
    takeMapImageCapture()
      .then(async () => {
        dispatch(stopLogging());
        dispatch(fetchLoggingSessions());
        setShowTakePhotoDialog(true);
      })
      .catch((error) => {
        console.error('Error capturing map image before stopping logging:', error);
        // Even if capture fails, still stop logging
        dispatch(stopLogging());
        dispatch(fetchLoggingSessions());
        setShowTakePhotoDialog(true);
      });
  }, [dispatch, takeMapImageCapture]);

  // Launch camera
  const execLaunchCamera = useCallback(async (): Promise<void> => {
    const options: CameraOptions = {
      cameraType: 'back',
      mediaType: 'photo',
    };

    await launchCamera(options, async (response: ImagePickerResponse) => {
      console.log('🔍 RNFS LOG 32: Camera response received');

      if (!response.didCancel && !response.errorCode && response.assets?.[0]?.uri) {
        // Use lastCompletedSessionId if logging has stopped, otherwise use current session ID
        const currentLogging = loggingRef.current;
        const sessionId = currentLogging.isLogging
          ? loggingSessionIdRef.current
          : lastCompletedSessionIdRef.current;

        console.log('🔍 RNFS LOG 33: sessionId for photo:', sessionId, 'isLogging:', currentLogging.isLogging);

        if (!sessionId) {
          console.error('🔍 RNFS LOG 34: No logging session ID available for photo');
          setShowTakePhotoDialog(false);
          if (goBackAfterPhoto && navigation.canGoBack()) {
            console.log("XXXX navigation.goBack() 3");
            navigation.goBack();
          }
          return;
        }

        const timestamp = logging?.loggingSession?.timestamp || Date.now();
        const dateTime = DateTime.fromMillis(timestamp);
        const capturedAt = DateTime.now().toISO();
        const dirPath = `${RNFS.DocumentDirectoryPath}/loggingSessionFiles/${sessionId}/images`;
        console.log('🔍 RNFS LOG 35: Photo dirPath:', dirPath);

        try {
          // console.log('🔍 RNFS LOG 36: About to call RNFS.mkdir for images');
          await RNFS.mkdir(dirPath);
          console.log('🔍 RNFS LOG 37: mkdir (images) completed');

          // Get next available filename
          console.log('🔍 RNFS LOG 38: About to call getNextAvailableFilename');
          const fileBaseName = `NEP-Link-image-${dateTime.toFormat('dd-LLL-yyyy_HHmmss')}`;

          // old way to create filePath

          // const filePath = await getNextAvailableFilename(
          //   dirPath,
          //   `NEP-Link-image-${dateTime.toFormat('dd-LLL-yyyy_HHmmss')}`,
          //   'jpg'
          // );

          const filePath = await getNextAvailableFilename(dirPath, fileBaseName, 'jpg');
          console.log('🔍 RNFS LOG 39: getNextAvailableFilename returned:', filePath);

          const asset = response.assets[0];

          // old way to copy file
          if (response.assets[0].uri) {
            console.log('🔍 RNFS LOG 40: About to call RNFS.copyFile for camera image from:', response.assets[0].uri, 'to:', filePath);
            await RNFS.copyFile(response.assets[0].uri, filePath);
            console.log('🔍 RNFS LOG 41: copyFile (camera) completed successfully:', filePath);
          }



          // new way to copy file and upload to cloud
          // if (asset.uri) {
          //   await RNFS.copyFile(asset.uri, filePath);
          //   console.log('🔍 RNFS LOG 41: copyFile (camera) completed successfully:', filePath);

          //   // Fire-and-forget: upload using your existing apiService function
          //   const uploadUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
          //   console.log(`current session for file upload: ${sessionId}`);
          //   upload_session_file(
          //     sessionId,
          //     {
          //       uri: uploadUri,
          //       name: `${fileBaseName}.jpg`,
          //       type: asset.type || 'image/jpeg',
          //     },
          //     'photo',
          //     capturedAt
          //   )
          //     .then((result: any) => {
          //       console.log('🔍 UPLOAD: Photo uploaded successfully:', result);
          //       // TODO: mark local record synced, e.g. update SQLite row for this file
          //     })
          //     .catch((error: any) => {
          //       console.error('🔍 UPLOAD: Photo upload failed, will retry via sync sweep:', error);
          //       // TODO: mark local record with sync_error so your sync sweep retries it
          //     });
          // }
          

          // Only clear session IDs if logging has stopped
          if (!currentLogging.isLogging) {
            setLoggingSessionId(null);
            setLastCompletedSessionId(null);
            lastCompletedSessionIdRef.current = null;
            console.log('🔍 RNFS LOG 42: Session IDs cleared (logging stopped)');
          } else {
            console.log('🔍 RNFS LOG 42b: Session IDs NOT cleared (logging still active)');
          }
        } catch (error) {
          console.error('🔍 RNFS LOG 43: Error saving camera image:', error);
          // Only clear session IDs on error if logging has stopped
          if (!currentLogging.isLogging) {
            setLoggingSessionId(null);
            setLastCompletedSessionId(null);
            lastCompletedSessionIdRef.current = null;
          }
        }
      } else {
        console.log('🔍 RNFS LOG 44: Camera cancelled or error');
        // Only clear if user cancels AND logging has stopped
        const currentLogging = loggingRef.current;
        if (!currentLogging.isLogging) {
          setLoggingSessionId(null);
          setLastCompletedSessionId(null);
          lastCompletedSessionIdRef.current = null;
          console.log('🔍 RNFS LOG 44b: Session IDs cleared on cancel (logging stopped)');
        } else {
          console.log('🔍 RNFS LOG 44c: Session IDs NOT cleared on cancel (logging still active)');
        }
      }

      setShowTakePhotoDialog(false);
      if (goBackAfterPhoto && navigation.canGoBack()) {
        console.log("XXXX navigation.goBack() 4");
        navigation.goBack();
      }
    });
  }, [logging?.loggingSession?.timestamp, goBackAfterPhoto, navigation]);

  // Add the camera handler function
  const handleHeaderCameraPress = useCallback(() => {
    execLaunchCamera();
  }, [execLaunchCamera]);

  // Also add logging to closeTakePhotoDialog
  const closeTakePhotoDialog = useCallback(() => {
    console.log('📸 closeTakePhotoDialog called');
    console.log('📸 Current goBackAfterPhoto value:', goBackAfterPhoto);
    setShowTakePhotoDialog(false);
  }, [goBackAfterPhoto]);

  // Render loading/error states
  // console.log("XXXX devices.sensorError", devices.sensorError);

  if (devices.sensorError) return <WaitingScreen waitingText="Sensor Error..." />;
  if (devices.wiping) return <WaitingScreen waitingText="Wiping..." />;
  if (!sensorData.turbidityEnabled && !sensorData.temperatureEnabled) return <WaitingScreen waitingText="Waiting for data..." />;


  clearTimeout(sensorErrorTimeoutRef.current);

  // Main render
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <TakePhotoDialog
        visible={showTakePhotoDialog}
        closeDialog={closeTakePhotoDialog}
        launchCamera={execLaunchCamera}
      />
      <ScrollView>
        <LiveValues
          turbidityValue={sensorData.turbidityValue}
          temperatureEnabled={sensorData.temperatureEnabled}
          temperatureValue={sensorData.temperatureValue}
        />
        <RangeIndicator rangeLabel={sensorData.rangeLabel} />
        <View
          ref={mapViewShotRef}
          collapsable={false}
          style={{
            flex: 1,
            paddingHorizontal: 20,
            backgroundColor: '#FFF0',
          }}>
          <LocationMap
            locationEnabled={sensorData.locationEnabled}
            lat={sensorData.locationLat}
            lng={sensorData.locationLng}
            mapHeight={mapHeight}
          />
        </View>
        <LoggingButtons
          isLogging={logging.isLogging}
          loggingSessionSampleCount={logging.loggingSessionSampleCount}
          startLoggingHandler={startLoggingHandler}
          stopLoggingHandler={stopLoggingHandler}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default DeviceView;
