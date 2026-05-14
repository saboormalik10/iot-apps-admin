import React from 'react';
import { Text, View, Image, StyleSheet } from 'react-native';

const ObservatorBrandImg = require('../../assets/observator-logo.png');

const NepLinkHeader: React.FC = () => {
  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={ObservatorBrandImg}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>NEP-LINK BLE</Text>
        <Text style={styles.subtitle}>by Observator</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 20,
    flexDirection: 'row',
  },
  imageContainer: {
    // Container for logo
  },
  logo: {
    width: 100,
    height: 90,
  },
  textContainer: {
    paddingLeft: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#000',
  },
});

export default NepLinkHeader;
