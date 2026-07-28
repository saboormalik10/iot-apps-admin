// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import {
//   View,
//   TouchableOpacity,
//   FlatList,
//   ActivityIndicator,
//   StyleSheet,
//   ListRenderItem,
// } from 'react-native';
// import { Text } from 'react-native-paper';
// import IonIcon, { Ionicons } from '@react-native-vector-icons/ionicons';
// import {lightColors} from '@rneui/themed';

// // Types
// interface Device {
//   id: string;
//   name: string;
//   address?: string;
//   rssi?: number;
//   inRange?: boolean;
//   isConnected?: boolean;
// }

// interface DevicesListProps {
//   bondedDevices: Device[];
//   connectToDeviceHandler: (id: string, name: string) => void;
// }

// const styles = StyleSheet.create({
//   container: {
//     margin: 20,
//     marginTop: 0,
//   },
//   title: {
//     marginBottom: 0,
//     fontSize: 18,
//     fontWeight: '700',
//     color: '#000',
//   },
//   subtitle: {
//     marginBottom: 6,
//     fontSize: 14,
//     fontWeight: '500',
//     color: '#000',
//   },
//   listContainer: {
//     height: 200,
//     borderWidth: 1,
//     borderColor: '#CCC',
//   },
//   deviceRow: {
//     borderBottomWidth: 1,
//     borderColor: '#CCC',
//     flexDirection: 'row',
//   },
//   deviceInfo: {
//     margin: 10,
//     flex: 1,
//   },
//   deviceName: {
//     fontSize: 18,
//   },
//   deviceNameInRange: {
//     color: '#666',
//     fontWeight: 700,
//   },
//   deviceNameOutOfRange: {
//     color: '#AAA',
//     fontWeight: 500,
//   },
//   iconContainer: {
//     margin: 5,
//     width: 40,
//     flexDirection: 'column',
//     justifyContent: 'center',
//   },
//   errorText: {
//     color: 'red',
//     marginVertical: 8,
//     textAlign: 'center',
//   },
//   loadingContainer: {
//     padding: 10,
//     alignItems: 'center',
//     justifyContent: 'center'
//   },
// });

// const DevicesList: React.FC<DevicesListProps> = ({
//   bondedDevices,
//   connectToDeviceHandler,
// }) => {
//   const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
//   const [error, setError] = useState<string | null>(null);

//   const handleConnect = useCallback(async (device: Device) => {
//     setConnectingDeviceId(device.id);
//     setError(null);

//     try {
//       await connectToDeviceHandler(device.id, device.name);
//       setConnectingDeviceId(null);
//     } catch (e) {
//       console.error('Connection error:', e);
//       setConnectingDeviceId(null);
//       setError('Failed to connect. Try again.');
//     }
//   }, [connectToDeviceHandler]);

//   const renderDevice: ListRenderItem<Device> = useCallback(({ item }) => {
//     const isConnecting = connectingDeviceId === item.id;

//     return (
//       <TouchableOpacity
//         onPress={() => handleConnect(item)}
//         disabled={isConnecting || item.isConnected}
//       >
//         <View style={styles.deviceRow}>
//           <View style={styles.deviceInfo}>
//             <Text
//               style={[
//                 styles.deviceName,
//                 item.inRange ? styles.deviceNameInRange : styles.deviceNameOutOfRange,
//               ]}
//             >
//               {item.name}
//             </Text>
//           </View>
//           <View style={styles.iconContainer}>
//             {isConnecting ? (
//               <ActivityIndicator size="small" color={lightColors.primary} />
//             ) : item.isConnected ? (
//               <IonIcon
//                 name="checkmark-circle-outline"
//                 size={24}
//                 color={lightColors.success}
//               />
//             ) : item.inRange ? (
//               <IonIcon
//                 name="radio-outline"
//                 size={24}
//                 color={lightColors.primary}
//               />
//             ) : null}
//           </View>
//         </View>
//       </TouchableOpacity>
//     );
//   }, [connectingDeviceId, handleConnect]);

//   const keyExtractor = useCallback((item: Device, index: number) => {
//     return item.id || `device-${index}`;
//   }, []);

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>Devices List</Text>
//       <Text style={styles.subtitle}>Tap to connect</Text>

//       {error && <Text style={styles.errorText}>{error}</Text>}

//       <FlatList
//         style={styles.listContainer}
//         data={bondedDevices}
//         keyExtractor={keyExtractor}
//         renderItem={renderDevice}
//         ListEmptyComponent={
//           <View style={styles.loadingContainer}>
//             <Ionicons name="bluetooth-outline" size={28} color={lightColors.primary} />
//             <Text style={{ color: lightColors.greyOutline, marginTop: 6 }}>No bonded devices found</Text>
//           </View>
//         }
//       />
//     </View>
//   );
// };

// export default DevicesList;






import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  ListRenderItem,
  Animated,
  Dimensions,
} from 'react-native';
import { Text } from 'react-native-paper';
import IonIcon, { Ionicons } from '@react-native-vector-icons/ionicons';
import { lightColors } from '@rneui/themed';

// Types
interface Device {
  id: string;
  name: string;
  address?: string;
  rssi?: number;
  inRange?: boolean;
  isConnected?: boolean;
}

interface DevicesListProps {
  bondedDevices: Device[];
  connectToDeviceHandler: (id: string, name: string) => void;
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    marginTop: 0
  },
  headerContainer: {
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
    marginBottom: 0,
  },
  listContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
  },
  emptyStateContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#AAA',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  deviceRowLast: {
    borderBottomWidth: 0,
  },
  deviceRowConnecting: {
    backgroundColor: '#F0F4FF',
  },
  deviceRowConnected: {
    backgroundColor: '#F0FDF4',
  },
  deviceAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
  },
  deviceAvatarConnected: {
    backgroundColor: '#DCFCE7',
  },
  deviceAvatarConnecting: {
    backgroundColor: '#DBEAFE',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  deviceAddress: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  rssiContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  rssiText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginLeft: 4,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#F3F4F6',
  },
  statusBadgeInRange: {
    backgroundColor: '#DBEAFE',
  },
  statusBadgeOutOfRange: {
    backgroundColor: '#F3F4F6',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 4,
  },
  statusBadgeTextInRange: {
    color: '#0369A1',
  },
  iconContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  iconContainerConnecting: {
    backgroundColor: '#DBEAFE',
  },
  iconContainerConnected: {
    backgroundColor: '#DCFCE7',
  },
  errorContainer: {
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    borderLeftWidth: 4,
    borderColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorIcon: {
    marginRight: 10,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 0,
  },
});

const DevicesList: React.FC<DevicesListProps> = ({
  bondedDevices,
  connectToDeviceHandler,
}) => {
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleConnect = useCallback(async (device: Device) => {
    if (device.isConnected) return;

    setConnectingDeviceId(device.id);
    setError(null);

    // Trigger scale animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.98,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      await connectToDeviceHandler(device.id, device.name);
      setConnectingDeviceId(null);
    } catch (e) {
      console.error('Connection error:', e);
      setConnectingDeviceId(null);
      setError('Failed to connect. Try again.');
    }
  }, [connectToDeviceHandler, scaleAnim]);

  const getRSSIBars = (rssi?: number) => {
    if (!rssi) return 0;
    if (rssi > -50) return 4;
    if (rssi > -60) return 3;
    if (rssi > -70) return 2;
    return 1;
  };

  const renderDevice: ListRenderItem<Device> = useCallback(
    ({ item, index }) => {
      const isConnecting = connectingDeviceId === item.id;
      const isConnected = item.isConnected;
      const isInRange = item.inRange;
      const rssiStrength = getRSSIBars(item.rssi);

      return (
        <TouchableOpacity
          onPress={() => handleConnect(item)}
          disabled={isConnecting || isConnected}
          activeOpacity={isConnecting || isConnected ? 1 : 0.7}
        >
          <Animated.View
            style={[
              styles.deviceRow,
              index === bondedDevices.length - 1 && styles.deviceRowLast,
              isConnecting && styles.deviceRowConnecting,
              isConnected && styles.deviceRowConnected,
              { transform: [{ scale: scaleAnim }] },
            ]}
          >
            {/* Device Avatar */}
            <View
              style={[
                styles.deviceAvatar,
                isConnected && styles.deviceAvatarConnected,
                isConnecting && styles.deviceAvatarConnecting,
              ]}
            >
              <Ionicons
                name={isConnected ? 'phone-landscape' : 'bluetooth'}
                size={24}
                color={
                  isConnected
                    ? '#16A34A'
                    : isConnecting
                    ? '#0284C7'
                    : '#6366F1'
                }
              />
            </View>

            {/* Device Info */}
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>{item.name}</Text>
              {item.address && (
                <Text style={styles.deviceAddress}>{item.address}</Text>
              )}

              {/* RSSI Indicator */}
              {item.rssi !== undefined && (
                <View style={styles.rssiContainer}>
                  {[1, 2, 3, 4].map((bar) => (
                    <View
                      key={bar}
                      style={{
                        width: 2,
                        height: 8 + bar * 2,
                        backgroundColor:
                          bar <= rssiStrength
                            ? isInRange
                              ? '#0284C7'
                              : '#D1D5DB'
                            : '#E5E7EB',
                        marginRight: 2,
                        borderRadius: 1,
                      }}
                    />
                  ))}
                  <Text style={styles.rssiText}>
                    {item.rssi} dBm
                  </Text>
                </View>
              )}
            </View>

            {/* Status Badge */}
            {isInRange && !isConnected && !isConnecting && (
              <View
                style={[
                  styles.statusBadge,
                  styles.statusBadgeInRange,
                ]}
              >
                <Ionicons
                  name="radio-button-on"
                  size={12}
                  color="#0369A1"
                />
                <Text
                  style={[
                    styles.statusBadgeText,
                    styles.statusBadgeTextInRange,
                  ]}
                >
                  In Range
                </Text>
              </View>
            )}

            {/* Action Icon */}
            <View
              style={[
                styles.iconContainer,
                isConnected && styles.iconContainerConnected,
                isConnecting && styles.iconContainerConnecting,
              ]}
            >
              {isConnecting ? (
                <ActivityIndicator
                  size="small"
                  color="#0284C7"
                />
              ) : isConnected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={28}
                  color="#16A34A"
                />
              ) : isInRange ? (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color="#6366F1"
                />
              ) : (
                <Ionicons
                  name="radio-outline"
                  size={20}
                  color="#9CA3AF"
                />
              )}
            </View>
          </Animated.View>
        </TouchableOpacity>
      );
    },
    [connectingDeviceId, bondedDevices, handleConnect, scaleAnim]
  );

  const keyExtractor = useCallback((item: Device, index: number) => {
    return item.id || `device-${index}`;
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Paired Devices</Text>
        <Text style={styles.subtitle}>
          {bondedDevices.length} device{bondedDevices.length !== 1 ? 's' : ''} available
        </Text>
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle" size={20} color="#DC2626" />
          </View>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Devices List */}
      <View style={styles.listContainer}>
        <FlatList
          data={bondedDevices}
          keyExtractor={keyExtractor}
          renderItem={renderDevice}
          scrollEnabled={bondedDevices.length > 5}
          ListEmptyComponent={
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="bluetooth-outline"
                  size={56}
                  color={lightColors.greyOutline}
                />
              </View>
              <Text style={styles.emptyText}>No Devices Found</Text>
              <Text style={styles.emptySubtext}>
                Please pair a device first
              </Text>
            </View>
          }
        />
      </View>
    </View>
  );
};

export default DevicesList;
