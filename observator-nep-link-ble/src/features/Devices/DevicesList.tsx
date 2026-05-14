import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  ListRenderItem,
} from 'react-native';
import { Text } from 'react-native-paper';
import IonIcon from '@react-native-vector-icons/ionicons';

// Types
interface Device {
  id: string;
  name: string;
  address?: string;
  rssi?: number;
  inRange: boolean;
  isConnected: boolean;
}

interface DevicesListProps {
  bleDevicesFound: Device[];
  connectToDeviceHandler: (device: Device) => void;
  disconnectDeviceHandler?: (device: Device) => void;
  startScanHandler?: () => void;
  stopScanHandler?: () => void;
}

const styles = StyleSheet.create({
  container: {
    margin: 20,
    marginTop: 0,
  },
  title: {
    marginBottom: 0,
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  subtitle: {
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  listContainer: {
    height: 160,
    borderWidth: 1,
    borderColor: '#CCC',
  },
  deviceRow: {
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
  },
  deviceNameInRange: {
    color: '#666',
  },
  deviceNameOutOfRange: {
    color: '#999',
  },
  iconContainer: {
    margin: 5,
    width: 40,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  rescanButton: {
    marginVertical: 10,
    padding: 10,
    backgroundColor: '#007AFF',
    borderRadius: 6,
    alignItems: 'center',
  },
  rescanButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    marginVertical: 8,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 10,
    alignItems: 'center',
  },
});

const DevicesList: React.FC<DevicesListProps> = ({
  bleDevicesFound,
  connectToDeviceHandler,
  disconnectDeviceHandler,
  startScanHandler,
  stopScanHandler,
}) => {
  const [showAvailableDevices, setShowAvailableDevices] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      if (stopScanHandler) {
        stopScanHandler();
      }
    };
  }, [stopScanHandler]);

  const toggleAvailableDevices = useCallback(() => {
    setShowAvailableDevices(prev => {
      const newValue = !prev;
      setIsScanning(newValue);
      setError(null);

      if (newValue && startScanHandler) {
        startScanHandler();

        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
        }

        scanTimeoutRef.current = setTimeout(() => {
          setIsScanning(false);
          if (stopScanHandler) {
            stopScanHandler();
          }
        }, 10000);
      } else {
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
        }
        if (stopScanHandler) {
          stopScanHandler();
        }
        setIsScanning(false);
      }

      return newValue;
    });
  }, [startScanHandler, stopScanHandler]);

  const handleRescan = useCallback(() => {
    if (startScanHandler) {
      setIsScanning(true);
      setError(null);
      startScanHandler();

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }

      scanTimeoutRef.current = setTimeout(() => {
        setIsScanning(false);
        if (stopScanHandler) {
          stopScanHandler();
        }
      }, 10000);
    }
  }, [startScanHandler, stopScanHandler]);

  const handleConnect = useCallback(async (device: Device) => {
    setConnectingDeviceId(device.id);
    setError(null);

    try {
      await connectToDeviceHandler(device);
      setConnectingDeviceId(null);
    } catch (e) {
      console.error('Connection error:', e);
      setConnectingDeviceId(null);
      setError('Failed to connect. Try again.');
    }
  }, [connectToDeviceHandler]);

  const renderDevice: ListRenderItem<Device> = useCallback(({ item }) => {
    const isConnecting = connectingDeviceId === item.id;

    return (
      <TouchableOpacity
        onPress={() => handleConnect(item)}
        disabled={isConnecting || item.isConnected}
      >
        <View style={styles.deviceRow}>
          <View style={styles.deviceInfo}>
            <Text
              style={[
                styles.deviceName,
                item.inRange ? styles.deviceNameInRange : styles.deviceNameOutOfRange,
              ]}
            >
              {item.name}
            </Text>
{/*            {item.address && (
              <Text style={{ fontSize: 12, color: '#888' }}>{item.address}</Text>
            )}
*/}
          </View>
          <View style={styles.iconContainer}>
            {isConnecting ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : item.isConnected ? (
              <IonIcon
                name={'checkmark-circle-outline'}
                size={24}
                color="#02b016"
              />
            ) : item.inRange ? (
              <IonIcon
                name={'radio-outline'}
                size={24}
                color="#666"
              />
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [connectingDeviceId, handleConnect]);

  const keyExtractor = useCallback((item: Device, index: number) => {
    return item.id || `device-${index}`;
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Devices List</Text>
      <Text style={styles.subtitle}>Tap to connect</Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        style={styles.listContainer}
        data={bleDevicesFound}
        keyExtractor={keyExtractor}
        renderItem={renderDevice}
        ListEmptyComponent={
          <View style={styles.loadingContainer}>
            {isScanning ? (
              <>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={{ marginTop: 10, color: '#666' }}>Scanning for devices...</Text>
              </>
            ) : (
              <Text style={{ color: '#888' }}>No devices found</Text>
            )}
          </View>
        }
      />

      {startScanHandler && (
        <TouchableOpacity
          style={styles.rescanButton}
          onPress={handleRescan}
          disabled={isScanning}
        >
          <Text style={styles.rescanButtonText}>
            {isScanning ? 'Scanning...' : 'Rescan'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default DevicesList;
