import React from 'react';
import { Text, View, TouchableOpacity, StyleSheet } from 'react-native';
import IonIcon from '@react-native-vector-icons/ionicons';

interface Device {
  id: string;
  name: string;
  address: string;
  inRange: boolean;
  isConnected: boolean;
}

interface AddEditDevicesListProps {
  bondedDevices: Device[];
  deviceOnPressHandler: (id: string, name: string) => void;
}

const AddEditDevicesList: React.FC<AddEditDevicesListProps> = ({
  bondedDevices,
  deviceOnPressHandler,
}) => {
  const renderDeviceItem = (device: Device) => {
    const { id, name } = device;

    return (
      <TouchableOpacity
        key={id}
        onPress={() => deviceOnPressHandler(id, name)}
      >
        <View style={styles.deviceItem}>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>{name}</Text>
          </View>
          <View style={styles.iconContainer}>
            <IonIcon
              name="chevron-forward"
              color="#666"
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {bondedDevices.map(renderDeviceItem)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 0,
    flex: 1,
    width: '100%',
  },
  deviceItem: {
    borderBottomWidth: 1,
    borderColor: '#CCC',
    flexDirection: 'row',
  },
  deviceInfo: {
    margin: 10,
    flex: 1,
  },
  deviceName: {
    fontSize: 20,
    color: '#666',
  },
  iconContainer: {
    margin: 5,
    width: 40,
    justifyContent: 'center',
  },
});

export default AddEditDevicesList;

