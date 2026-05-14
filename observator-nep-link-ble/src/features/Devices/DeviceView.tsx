import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SafeAreaView, ScrollView, View, Text, Dimensions, Alert } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { launchCamera, CameraOptions, ImagePickerResponse } from 'react-native-image-picker';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { DateTime } from 'luxon';
import RNFS from 'react-native-fs';
import uuid from 'react-native-uuid';

import BleService from '../../services/BleService';

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

// Types
interface RootState {
  devices: {
    device: any;
    sensorError: boolean;
    wiping: boolean;
  };
  sensorData: {
    batteryLevel?: number;
    batteryRawVoltage?: number;
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

  const [loggingSessionId, setLoggingSessionId] = useState<string | null>(null);
  const [lastCompletedSessionId, setLastCompletedSessionId] = useState<string | null>(null);
  const [showTakePhotoDialog, setShowTakePhotoDialog] = useState<boolean>(false);
  const [goBackAfterPhoto, setGoBackAfterPhoto] = useState<boolean>(false);

  // Refs
  const mapViewShotRef = useRef<any>(null);
  const loggingSessionIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const disconnectSubscriptionRef = useRef<any>(null);
  const appStateSubscriptionRef = useRef<any>(null);
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
    const batteryLevel = sensorData.batteryLevel || undefined;
    const batteryRawVoltage = sensorData.batteryRawVoltage || 0;

    navigation.setOptions({
      headerBackButtonMenuEnabled: false,
      headerRight: () => (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
        <HeaderRightBatteryIndicator
          batteryLevel={batteryLevel}
          batteryRawVoltage={batteryRawVoltage}
          batteryCharging={sensorData.batteryCharging}
        />
        <HeaderRightCameraButton
          isLogging={logging.isLogging}
          onPress={handleHeaderCameraPress}
        />
      </View>),
    });
  }, [navigation, sensorData.batteryLevel, sensorData.batteryRawVoltage, sensorData.batteryCharging, logging.isLogging]);

  // Set sensor error after timeout if no data received
  useEffect(() => {
    // Clear any existing timeout
    if (sensorErrorTimeoutRef.current) {
      clearTimeout(sensorErrorTimeoutRef.current);
    }

    sensorErrorTimeoutRef.current = setTimeout(() => {
      if (!sensorData.turbidityEnabled && !sensorData.temperatureEnabled) {
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

  // Remove the auto-clearing effect entirely, or modify it to only clear when dialog is false
  useEffect(() => {
    // Only clear when photo dialog is closed AND logging has stopped
    if (prevLoggingRef.current && !logging.isLogging && loggingSessionId && !showTakePhotoDialog) {
      console.log('Clearing loggingSessionId after logging stopped and photo dialog closed');
      // Clear immediately when dialog closes (no setTimeout needed)
      setLoggingSessionId(null);
    }
    prevLoggingRef.current = logging.isLogging;
  }, [logging.isLogging, loggingSessionId, showTakePhotoDialog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("XXX Disconnecting here");
      BleService.disconnectConnectedDevice();
      if (demo.demoModeEnabled) {
        dispatch(setDemoModeEnabled(false));
      }
    };
  }, [demo.demoModeEnabled, dispatch]);

  // Track photo dialog visibility changes
  useEffect(() => {
    console.log('📸 PHOTO DIALOG: showTakePhotoDialog changed to:', showTakePhotoDialog);
    console.log('📸 PHOTO DIALOG: goBackAfterPhoto is:', goBackAfterPhoto);
    console.log('📸 PHOTO DIALOG: lastCompletedSessionId is:', lastCompletedSessionIdRef.current);
  }, [showTakePhotoDialog, goBackAfterPhoto]);

  // Prevent navigation away during logging
  usePreventRemove(logging.isLogging, ({ data }) => {
    console.log('🚨 PREVENT REMOVE: Navigation blocked because logging is active');
    console.log('🚨 PREVENT REMOVE: Current logging state:', logging.isLogging);
    console.log('🚨 PREVENT REMOVE: Current loggingSessionId:', loggingSessionIdRef.current);
    console.log('🚨 PREVENT REMOVE: Navigation data:', data);

    Alert.alert(
      'End Logging and Disconnect?',
      `Do you want to end your logging session and disconnect from ${devices.device?.bleDevice?.name || ''}?`,
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
            BleService.disconnectConnectedDevice();
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

            // DON'T dispatch navigation immediately - let the photo dialog handle it
            console.log('🚨 PREVENT REMOVE: NOT dispatching navigation - photo dialog will handle going back');
            // navigation.dispatch(data.action); // REMOVE THIS LINE
          },
        },
      ],
      { cancelable: false }
    );
  });

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
          console.log("XXX navigation.goBack()");
          navigation.goBack();
        }
      }, 100);
    }
  }, [showTakePhotoDialog, goBackAfterPhoto, navigation]);

  // Add logging when starting logging
  const startLoggingHandler = useCallback(() => {
    console.log('🟢 Starting logging...');
    const id = uuid.v4() as string;

    // Update BOTH the state AND the ref immediately
    setLoggingSessionId(id);
    loggingSessionIdRef.current = id;

    const demoModeEnabled = demo.demoModeEnabled;
    const connectedDevice = devices.device;
    console.log("XXX startLoggingHandler demoModeEnabled",demoModeEnabled);
    console.log("XXX startLoggingHandler connectedDevice",connectedDevice);
    console.log("XXX startLoggingHandler devices",devices);
    const deviceId = demo.demoModeEnabled ? 'demo' : connectedDevice?.bleDevice?.id;
    const deviceName = demo.demoModeEnabled ? 'DEMO' : connectedDevice?.bleDevice?.name;

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
  }, [devices.device, demo.demoModeEnabled, sensorData.turbidityEnabled, sensorData.temperatureEnabled, dispatch, takeMapImageCapture]);

  const stopLoggingHandler = useCallback(() => {
    // Save the current session ID before stopping
    const currentSessionId = loggingSessionIdRef.current;
    if (currentSessionId) {
      setLastCompletedSessionId(currentSessionId); // REMOVED the extra 'r'
      lastCompletedSessionIdRef.current = currentSessionId;
    }

    // Capture map BEFORE stopping (while view is still active)
    takeMapImageCapture()
      .then(() => {
        dispatch(stopLogging());
        dispatch(fetchLoggingSessions());
        setShowTakePhotoDialog(true);
      })
      .catch(() => {
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
            console.log("XXX navigation.goBack()");
            navigation.goBack();
          }
          return;
        }

        const timestamp = logging?.loggingSession?.timestamp || Date.now();
        const dateTime = DateTime.fromMillis(timestamp);

        const dirPath = `${RNFS.DocumentDirectoryPath}/loggingSessionFiles/${sessionId}/images`;
        console.log('🔍 RNFS LOG 35: Photo dirPath:', dirPath);

        try {
          console.log('🔍 RNFS LOG 36: About to call RNFS.mkdir for images');
          await RNFS.mkdir(dirPath);
          console.log('🔍 RNFS LOG 37: mkdir (images) completed');

          // Get next available filename
          console.log('🔍 RNFS LOG 38: About to call getNextAvailableFilename');
          const filePath = await getNextAvailableFilename(
            dirPath,
            `NEP-Link-image-${dateTime.toFormat('dd-LLL-yyyy_HHmmss')}`,
            'jpg'
          );
          console.log('🔍 RNFS LOG 39: getNextAvailableFilename returned:', filePath);

          if (response.assets[0].uri) {
            console.log('🔍 RNFS LOG 40: About to call RNFS.copyFile for camera image from:', response.assets[0].uri, 'to:', filePath);
            await RNFS.copyFile(response.assets[0].uri, filePath);
            console.log('🔍 RNFS LOG 41: copyFile (camera) completed successfully:', filePath);
          }

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
        console.log("XXX navigation.goBack()");
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
  if (devices.sensorError) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <WaitingScreen waitingText="Sensor Error..." />
      </SafeAreaView>
    );
  }

  if (devices.wiping) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <WaitingScreen waitingText="Wiping..." />
      </SafeAreaView>
    );
  }

  if (!sensorData.turbidityEnabled && !sensorData.temperatureEnabled) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <WaitingScreen waitingText="Waiting for data..." />
      </SafeAreaView>
    );
  }

  clearTimeout(sensorErrorTimeoutRef.current);

  // Main render
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <TakePhotoDialog
        visible={showTakePhotoDialog}
        closeDialog={() => setShowTakePhotoDialog(false)}
        launchCamera={execLaunchCamera}
      />
      <ScrollView>
        <LiveValues
          turbidityValue={sensorData.turbidityValue}
          temperatureEnabled={sensorData.temperatureEnabled}
          temperatureValue={sensorData.temperatureValue}
        />
        <RangeIndicator rangeLabel={sensorData.rangeLabel} />
        <ViewShot ref={mapViewShotRef}>
          <View
            style={{
              flex: 1,
              paddingHorizontal: 20,
              backgroundColor: 'transparent',
            }}>
              <LocationMap
                locationEnabled={sensorData.locationEnabled}
                lat={sensorData.locationLat}
                lng={sensorData.locationLng}
                mapHeight={mapHeight}
              />
          </View>
        </ViewShot>
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
