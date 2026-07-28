import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView, ScrollView } from 'react-native';
import { useDispatch } from 'react-redux';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { saveDeviceName } from '../../actions/DeviceActions';
import EditDeviceNameForm from './EditDeviceNameForm';

import { DevicesStackParamList } from '../../navigation/RootNav';

type EditUnpairDeviceRouteProp = RouteProp<DevicesStackParamList, 'EditUnpairDevice'>;

const EditUnpairDevice: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<EditUnpairDeviceRouteProp>();
  const dispatch = useDispatch();

  // State
  const [deviceId, setDeviceId] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('');

  // Initialize state from route params
  useEffect(() => {
    if (route.params?.deviceId) {
      setDeviceId(route.params.deviceId);
    }
    if (route.params?.deviceName) {
      setDeviceName(route.params.deviceName);
    }
  }, [route.params]);

  // Save device name before leaving the screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      if (deviceId && deviceName) {
        dispatch(saveDeviceName(deviceId, deviceName));
      }
    });

    return unsubscribe;
  }, [navigation, dispatch, deviceId, deviceName]);

  // Handle device name change
  const deviceNameOnChange = useCallback((newValue: string) => {
    setDeviceName(newValue);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView>
        <EditDeviceNameForm
          deviceName={deviceName}
          deviceNameOnChangeHandler={deviceNameOnChange}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default EditUnpairDevice;

