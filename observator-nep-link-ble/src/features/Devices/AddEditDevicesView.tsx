import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView, ScrollView } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import AddEditDevicesList from './AddEditDevicesList';
import PairDeviceDialog from './PairDeviceDialog';
import HeaderRightAddDeviceButton from './HeaderRightAddDeviceButton';
import { addBondedDevice } from '../../actions/DeviceActions';

// Types
interface Device {
  address: string;
  name: string;
  bonded?: boolean;
}

interface RootState {
  devices: {
    unpairedDevices: Device[];
    deviceIdNameHash: Record<string, string>;
    bondedDevicesFormatted: any[];
  };
}

const AddEditDevicesView: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();

  // Redux selectors
  const devices = useSelector((state: RootState) => state.devices);

  // State
  const [pairDeviceDialogVisible, setPairDeviceDialogVisible] = useState(false);
  const [isPairing, setIsPairing] = useState(false);
  const [pairingFailed, setPairingFailed] = useState(false);
  const [pairingWithDevice, setPairingWithDevice] = useState<Device | null>(null);

  // Set header right button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderRightAddDeviceButton pressHandler={addPairedDeviceButtonPress} />
      ),
    });
  }, [navigation]);

  // Navigate to device edit screen
  const deviceListItemPress = useCallback(
    (deviceId: string, deviceName: string) => {
      const routeToEditUnpairDevice = CommonActions.navigate({
        name: 'EditUnpairDevice',
        params: {
          deviceId,
          deviceName,
        },
      });
      navigation.dispatch(routeToEditUnpairDevice);
    },
    [navigation]
  );

  // Pair with device
  const pairWithDevice = useCallback(
    (address: string) => {
      const deviceToPair = devices.unpairedDevices.find(
        unpairedDevice => unpairedDevice.address === address
      );

      setPairingWithDevice(deviceToPair || null);
      setIsPairing(true);
      setPairingFailed(false);

      RNBluetoothClassic.pairDevice(address)
        .then(device => {
          if (device.bonded) {
            setIsPairing(false);
            setPairDeviceDialogVisible(false);
            setPairingFailed(false);
            if (deviceToPair) {
              dispatch(addBondedDevice(deviceToPair));
            }
          } else {
            setIsPairing(false);
            setPairDeviceDialogVisible(true);
            setPairingFailed(true);
          }
        })
        .catch(error => {
          console.log('pairDevice error', error);
          console.warn('pairDevice error', error);
          setIsPairing(false);
          setPairDeviceDialogVisible(true);
          setPairingFailed(true);
        });
    },
    [devices.unpairedDevices, dispatch]
  );

  // Open pair device dialog
  const addPairedDeviceButtonPress = useCallback(() => {
    setPairDeviceDialogVisible(true);
  }, []);

  // Close pair device dialog
  const closeAddPairedDeviceDialog = useCallback(() => {
    setPairDeviceDialogVisible(false);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <PairDeviceDialog
        unpairedDevices={devices.unpairedDevices}
        deviceIdNameHash={devices.deviceIdNameHash}
        isVisible={pairDeviceDialogVisible}
        isPairing={isPairing}
        pairingFailed={pairingFailed}
        pairingWithDevice={pairingWithDevice}
        closeDialog={closeAddPairedDeviceDialog}
        pairWithDeviceHandler={pairWithDevice}
      />
      <ScrollView>
        <AddEditDevicesList
          bondedDevices={devices.bondedDevicesFormatted}
          deviceOnPressHandler={deviceListItemPress}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default AddEditDevicesView;

