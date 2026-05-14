
import React, { useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import IonIcon from '@react-native-vector-icons/ionicons';
import { Button } from 'react-native-paper';

interface BluetoothDisabledErrorProps {
  bluetoothAvailable: boolean;
  bluetoothEnabled: boolean;
  bluetoothPermissions: boolean;
  enterDemoModeButtonPressHandler?: () => void;
}

const BluetoothDisabledError: React.FC<BluetoothDisabledErrorProps> = ({
  bluetoothAvailable,
  bluetoothEnabled,
  bluetoothPermissions,
  enterDemoModeButtonPressHandler,
}) => {
  const { statusMessage, adviceMessage } = useMemo(() => {
    if (!bluetoothAvailable) {
      return {
        statusMessage: 'Bluetooth is Unavailable',
        adviceMessage: "Please check the phone's features to ensure Bluetooth is available.",
      };
    }

    if (!bluetoothEnabled) {
      return {
        statusMessage: 'Bluetooth is Disabled',
        adviceMessage: 'Please check your settings and ensure Bluetooth is turned on.',
      };
    }

    if (!bluetoothPermissions) {
      return {
        statusMessage: 'Bluetooth permissions are not enabled',
        adviceMessage: 'Please reload or reinstall the app and accept all Bluetooth permissions.',
      };
    }

    return {
      statusMessage: '',
      adviceMessage: '',
    };
  }, [bluetoothAvailable, bluetoothEnabled, bluetoothPermissions]);

  return (
    <View style={styles.container}>
      <View style={styles.messageContainer}>
        <View style={styles.iconContainer}>
          <IonIcon
            name={'warning'}
            size={60}
            color="#fc9803"
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.statusText}>{statusMessage}</Text>
          <Text style={styles.adviceText}>{adviceMessage}</Text>
        </View>
      </View>

      {enterDemoModeButtonPressHandler && (
        <View style={styles.buttonContainer}>
          <Button
            mode="outlined"
            style={styles.button}
            onPress={enterDemoModeButtonPressHandler}
            textColor="#007AFF"
          >
            Demo Mode
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 0,
    flexDirection: 'column',
  },
  messageContainer: {
    margin: 20,
    flexDirection: 'row',
  },
  iconContainer: {
    paddingTop: 20,
  },
  textContainer: {
    paddingLeft: 20,
    paddingTop: 20,
    flex: 1,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  adviceText: {
    fontSize: 14,
    fontWeight: '300',
    color: '#000',
    marginTop: 4,
  },
  buttonContainer: {
    marginTop: 60,
    paddingLeft: 40,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  button: {
    borderColor: '#007AFF',
    borderWidth: 1,
  },
});

export default BluetoothDisabledError;
