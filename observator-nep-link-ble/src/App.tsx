
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
import { AuthProvider } from './context/AuthContext';

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
      setIsInitializing(true);

      // Step 1: Initialize database and create tables
      const db = await getDBConnection();
      await createTables(db);
      console.log('Database tables created');

      // Step 2: Run migration
      const result = await migrateAsyncStorageToSQLite();

      if (result.success) {
        if (result.alreadyMigrated) {
          console.log('Data already migrated previously');
        } else {
          console.log(
            `Migration successful: ${result.migratedSessions} sessions, ${result.migratedSamples} samples`
          );
          setMigrationStatus(result);
        }
      } else {
        console.error('Migration failed:', result.error);
        // You might want to show an error to the user here
      }
      // Step 3: Continue with normal app initialization
      setIsInitializing(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      setIsInitializing(false);
    }
  };

  if (isInitializing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.text}>Initializing...</Text>
        {migrationStatus && migrationStatus.migratedSessions !== undefined && (
          <Text style={styles.migrationText}>
            Migrating your data: {migrationStatus.migratedSessions} sessions
          </Text>
        )}
      </View>
    );
  }

  return (
    <Provider store={store}>
      <AuthProvider>
        <PaperProvider>
          <SafeAreaProvider>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
              <RootNav />
            </SafeAreaView>
          </SafeAreaProvider>
        </PaperProvider>
      </AuthProvider>
    </Provider>
  );
};

export default App;
