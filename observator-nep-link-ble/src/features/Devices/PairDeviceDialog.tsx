import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Dialog, Icon, lightColors } from '@rneui/themed';

interface Device {
  name: string;
  address: string;
}

interface PairDeviceDialogProps {
  isVisible: boolean;
  isPairing: boolean;
  pairingFailed: boolean;
  unpairedDevices?: Device[]; // Made optional
  deviceIdNameHash: Record<string, string>;
  pairingWithDevice?: Device | null;
  pairWithDeviceHandler: (address: string) => void;
  closeDialog: () => void;
}

const PairDeviceDialog: React.FC<PairDeviceDialogProps> = ({
  isVisible,
  isPairing,
  pairingFailed,
  unpairedDevices = [], // Default to empty array
  deviceIdNameHash,
  pairingWithDevice,
  pairWithDeviceHandler,
  closeDialog,
}) => {
  const renderDevices = () => {
    // Extra safety check
    if (!unpairedDevices || unpairedDevices.length === 0) {
      return (
        <View style={styles.waitingContainer}>
          <View>
            <Text>Waiting for devices...</Text>
          </View>
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="small" color={lightColors.primary} />
          </View>
        </View>
      );
    }

    return unpairedDevices
      .filter((device) => device?.name && device?.address)
      .map((device, index) => {
        const { name, address } = device;
        const formerName = deviceIdNameHash[address];
        const label = formerName && formerName !== name
          ? `${name} (was: ${formerName})`
          : name;

        return (
          <TouchableOpacity
            key={address || index}
            onPress={() => pairWithDeviceHandler(address)}
          >
            <View style={styles.deviceItem}>
              <Text style={styles.deviceLabel}>{label}</Text>
            </View>
          </TouchableOpacity>
        );
      });
  };

  // Show pairing loading dialog
  if (isVisible && isPairing) {
    return (
      <Dialog isVisible>
        <Dialog.Loading />
        <View style={styles.centerContent}>
          <Text>Pairing with {pairingWithDevice?.name}...</Text>
        </View>
      </Dialog>
    );
  }

  // Show device selection dialog
  return (
    <Dialog isVisible={isVisible} onBackdropPress={closeDialog}>
      {pairingFailed && (
        <View style={styles.errorContainer}>
          <View style={styles.iconWrapper}>
            <Icon
              name="warning"
              type="ionicon"
              color="#fc9803"
              size={40}
            />
          </View>
          <View style={styles.errorTextContainer}>
            <Text>
              Pairing failed with device {pairingWithDevice?.name}. Please ensure
              device is turned on and in range and try again.
            </Text>
          </View>
        </View>
      )}

      <Dialog.Title title="Choose Device to Pair..." />

      <View>{renderDevices()}</View>

      <Dialog.Actions>
        <Dialog.Button title="Cancel" onPress={closeDialog} />
      </Dialog.Actions>
    </Dialog>
  );
};

const styles = StyleSheet.create({
  waitingContainer: {
    flexDirection: 'column',
    width: '100%',
  },
  loaderContainer: {
    width: 20,
    marginTop: 10,
    alignItems: 'flex-start',
  },
  deviceItem: {
    flexDirection: 'column',
    width: '100%',
    backgroundColor: '#EEE',
    padding: 6,
    marginBottom: 6,
  },
  deviceLabel: {
    fontSize: 18,
    color: lightColors.primary,
    fontWeight: '700',
  },
  centerContent: {
    alignItems: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  iconWrapper: {
    width: 40,
  },
  errorTextContainer: {
    flex: 1,
    paddingLeft: 10,
  },
});

export default PairDeviceDialog;
