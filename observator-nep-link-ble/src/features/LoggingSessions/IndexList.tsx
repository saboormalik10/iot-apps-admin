import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ImageBackground,
  StyleSheet,
  ListRenderItem,
} from 'react-native';
import RNFS from 'react-native-fs';

interface LoggingSession {
  id: string;
  timestamp: number;
  deviceId: string;
  deviceName?: string;
}

interface DeviceIdNameHash {
  [key: string]: string;
}

interface Devices {
  deviceIdNameHash: DeviceIdNameHash;
}

interface Logging {
  loggingSessions: LoggingSession[];
}

interface ListItemProps extends LoggingSession {
  itemName: string;
  onPressHandler: (id: string, formattedDateTime: string) => void;
}

interface IndexListProps {
  logging: Logging;
  devices: Devices;
  listItemPressHandler: (id: string, formattedDateTime: string) => void;
  listRefreshHandler: () => void;
  isFetching: boolean;
}

const formatDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ListItem: React.FC<ListItemProps> = ({ id, timestamp, itemName, onPressHandler }) => {
  const formattedDateTime = formatDateTime(timestamp);
  const thumbnailUri = `file://${RNFS.DocumentDirectoryPath}/loggingSessionThumnails/${id}.jpg`;

  return (
    <TouchableOpacity onPress={() => onPressHandler(id, formattedDateTime)} activeOpacity={0.7}>
      <View style={styles.itemContainer}>
        <View style={styles.itemContent}>
          <View style={styles.thumbnailContainer}>
            <ImageBackground
              source={{ uri: thumbnailUri }}
              resizeMode="cover"
              style={styles.thumbnail}
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.deviceName}>{itemName}</Text>
            <Text style={styles.dateTime}>{formattedDateTime}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const IndexList: React.FC<IndexListProps> = ({
  logging,
  devices,
  listItemPressHandler,
  listRefreshHandler,
  isFetching,
}) => {
  const { deviceIdNameHash } = devices;

  const renderItem: ListRenderItem<LoggingSession> = useCallback(
    ({ item }) => {
      const itemName = deviceIdNameHash[item.deviceId] || item.deviceName || 'Unknown Device';
      return <ListItem {...item} itemName={itemName} onPressHandler={listItemPressHandler} />;
    },
    [deviceIdNameHash, listItemPressHandler]
  );

  const keyExtractor = useCallback((item: LoggingSession) => item.id, []);

  return (
    <FlatList
      data={logging.loggingSessions}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onRefresh={listRefreshHandler}
      refreshing={isFetching}
    />
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    margin: 10,
    borderBottomWidth: 1,
    borderColor: '#CCC',
  },
  itemContent: {
    borderBottomWidth: 1,
    borderColor: '#AAA',
    paddingBottom: 10,
    flexDirection: 'row',
  },
  thumbnailContainer: {
    width: 60,
    height: 60,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  thumbnail: {
    flex: 1,
    justifyContent: 'center',
  },
  textContainer: {
    justifyContent: 'center',
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  dateTime: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
});

export default IndexList;
