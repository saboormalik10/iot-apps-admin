import React from 'react';
import { Text, View, SafeAreaView, StyleSheet } from 'react-native';
import DeviceInfo from 'react-native-device-info';

export default function About() {
  const version = DeviceInfo.getVersion();
  const buildNumber = DeviceInfo.getBuildNumber();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Observator NEP-LINK</Text>
        <Text style={styles.version}>
          Version {version} ({buildNumber})
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  version: {
    fontSize: 16,
    fontWeight: '400',
    color: '#666',
  },
});
