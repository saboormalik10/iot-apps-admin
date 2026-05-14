
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar, useColorScheme } from 'react-native';
import { Provider } from 'react-redux';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import BootSplash from 'react-native-bootsplash';
import { PaperProvider } from 'react-native-paper';
import { lightColors } from '@rneui/themed';

import { createTables, getDBConnection } from './utils/db';
import { migrateAsyncStorageToSQLite } from './utils/migration';
import RootNav from './navigation/RootNav';
import store from './store/';

// Types
interface MigrationStatus {
  success: boolean;
  alreadyMigrated?: boolean;
  migratedSessions?: number;
  migratedSamples?: number;
  error?: string;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    marginTop: 10,
    fontSize: 16,
  },
  migrationText: {
    marginTop: 5,
    fontSize: 14,
    color: lightColors.primary,
  },
  safeArea: {
    flex: 1,
    backgroundColor: lightColors.primary,
  },
});

const App: React.FC = () => {
  const isDarkMode = useColorScheme() === 'dark';
  const [isInitializing, setIsInitializing] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);

  useEffect(() => {
    // Initialize app if needed
    initializeApp();
  }, []);

  useEffect(() => {
    console.log('Hiding splash screen');
    BootSplash.hide({ fade: true });
  }, []);

  const initializeApp = async (): Promise<void> => {
    try {
      console.log('Initializing app...');

      // Step 1: Initialize database and create tables
      const db = await getDBConnection();
      await createTables(db);
      console.log('Database tables created');

    } catch (error) {
      console.error('Error initializing app:', error);
    }
  };

  return (
    <Provider store={store}>
      <PaperProvider>
        <SafeAreaProvider>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <RootNav />
          </SafeAreaView>
        </SafeAreaProvider>
      </PaperProvider>
    </Provider>
  );
};

export default App;
