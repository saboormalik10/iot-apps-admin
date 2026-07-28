import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';

interface DevicesListButtonsProps {
  bluetoothAvailable: boolean;
  bluetoothEnabled: boolean;
  bluetoothPermissions: boolean;
  addEditDevicesButtonPressHandler: () => void;
  enterDemoModeButtonPressHandler: () => void;
}

const DevicesListButtons: React.FC<DevicesListButtonsProps> = ({
  bluetoothAvailable,
  bluetoothEnabled,
  bluetoothPermissions,
  addEditDevicesButtonPressHandler,
  enterDemoModeButtonPressHandler,
}) => {
  const isBluetoothReady = bluetoothAvailable && bluetoothEnabled && bluetoothPermissions;

  return (
    <View style={styles.outerContainer}>
      <View style={styles.innerContainer}>
        {isBluetoothReady && (
          <Button
            mode="outlined"
            style={styles.button}
            onPress={addEditDevicesButtonPressHandler}
            textColor="#007AFF"
          >
            Add/Edit Devices...
          </Button>
        )}
        <Button
          mode="outlined"
          style={styles.button}
          onPress={enterDemoModeButtonPressHandler}
          textColor="#007AFF"
        >
          Demo Mode
        </Button>
      </View>
     
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%'
  },
  innerContainer: {
    padding: 10,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center'
  },
  button: {
    borderColor: '#007AFF',
    borderWidth: 1,
  },
});

export default DevicesListButtons;
