import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Dialog } from '@rneui/themed';

interface DeviceConnectingDialogProps {
  visible: boolean;
  deviceStatus?: string;
  deviceLabel?: string;
  deviceAddress?: string;
  awaitingDevice: boolean;
  connectionAttemptStarted: boolean;
  connectingDevice?: any;
  cancelConnectToDeviceHandler: () => void;
  connectToDeviceHandler: (device: any) => void;
}

const DeviceConnectingDialog: React.FC<DeviceConnectingDialogProps> = ({
  visible,
  deviceStatus,
  deviceLabel,
  awaitingDevice,
  connectionAttemptStarted,
  connectingDevice,
  cancelConnectToDeviceHandler,
  connectToDeviceHandler,
}) => {
  if (visible && deviceStatus === 'connecting') {
    return (
      <Dialog isVisible={true}>
        <Dialog.Loading />
        <View style={styles.container}>
          <Text style={styles.text}>Connecting to {deviceLabel}...</Text>
        </View>
      </Dialog>
    );
  }

  if (visible && awaitingDevice) {
    return (
      <Dialog isVisible={true}>
        <Dialog.Loading />
        <View style={styles.container}>
          <Text style={styles.smallText}>
            Waiting for device to be ready for connection...
          </Text>
        </View>
        <Dialog.Button
          title="Cancel"
          buttonStyle={styles.button}
          onPress={cancelConnectToDeviceHandler}
        />
      </Dialog>
    );
  }

  if (visible && connectionAttemptStarted) {
    return (
      <Dialog isVisible={true}>
        <View style={styles.container}>
          <Text style={styles.smallText}>
            Couldn't connect to {deviceLabel}.
          </Text>
        </View>
        <Dialog.Button
          title="Retry"
          buttonStyle={styles.button}
          onPress={() => connectToDeviceHandler(connectingDevice)}
        />
        <Dialog.Button
          title="Cancel"
          buttonStyle={styles.button}
          onPress={cancelConnectToDeviceHandler}
        />
      </Dialog>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    color: '#000',
  },
  smallText: {
    fontSize: 14,
    color: '#000',
  },
  button: {
    marginTop: 20,
  },
});

export default DeviceConnectingDialog;
