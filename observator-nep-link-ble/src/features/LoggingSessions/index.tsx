import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text, StyleSheet } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { fetchLoggingSessions } from '../../actions/LoggingActions';
import { fetchKnownDevices } from '../../actions/DeviceActions';
import IndexList from './IndexList';
import { LoggingStackParamList } from '../../navigation/RootNav';

// Types
interface RootState {
  devices: {
    knownDevices: any[];
    deviceIdNameHash: Record<string, string>;
  };
  logging: {
    loggingSessions: any[];
  };
}

type NavigationProp = NativeStackNavigationProp<LoggingStackParamList, 'LoggingSessions'>;

const LoggingSessions: React.FC = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation<NavigationProp>();

  // Redux selectors
  const devices = useSelector((state: RootState) => state.devices);
  const logging = useSelector((state: RootState) => state.logging);

  // State
  const [isFetching, setIsFetching] = useState<boolean>(false);

  // Fetch data on mount
  useEffect(() => {
    dispatch(fetchLoggingSessions());
    dispatch(fetchKnownDevices());
  }, [dispatch]);

  // Navigate to session view
  const routeToLoggingSessionsView = (loggingSessionId: string, formattedDateTime: string) => {
    const routeToLoggingSessionViewAction = CommonActions.navigate({
      name: 'LoggingSessionView',
      params: { loggingSessionId, formattedDateTime },
    });
    navigation.dispatch(routeToLoggingSessionViewAction);
  };

  // Refresh handler
  const onRefresh = () => {
    dispatch(fetchLoggingSessions());
  };

  return (
    <SafeAreaView style={styles.container}>
      {logging.loggingSessions.length === 0 ? (
        <Text style={styles.emptyText}>No logging sessions found.</Text>
      ) : (
        <IndexList
          devices={devices}
          logging={logging}
          isFetching={isFetching}
          listRefreshHandler={onRefresh}
          listItemPressHandler={routeToLoggingSessionsView}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default LoggingSessions;
