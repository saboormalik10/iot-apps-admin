import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { lightColors } from '@rneui/themed';

interface LocationMapProps {
  locationEnabled: boolean;
  lat: number;
  lng: number;
  mapHeight: number;
}

const LocationMap: React.FC<LocationMapProps> = ({ locationEnabled, lat, lng, mapHeight }) => {

  if (!locationEnabled) {
    return <View style={styles.container}>
      <View style={[styles.content, { height: mapHeight }]}>
        <Text style={styles.text}>Can't get permission for location updates. Please check your settings in the device's location permission settings and NEP-LINK BLE settings.</Text>
      </View>
    </View>
  }

  if (!lat && !lng) {
    return <View style={styles.container}>
      <View style={[styles.content, { height: mapHeight }]}>
        <ActivityIndicator
          size="small"
          color={lightColors.primary}
          style={styles.loader}
        />
        <Text style={styles.text}>Waiting for location...</Text>
      </View>
    </View>
  }

  const region = useMemo<Region>(() => ({
    latitude: lat || 0.1,
    longitude: lng || 0.1,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  }), [lat, lng]);

  const mapRef = useRef<MapView | null>(null);

  const [isMapReady, setIsMapReady] = useState(false);

  setTimeout(() => {
    mapRef.current?.animateToRegion(region);
  },100);

  function handleOnMapReady() {
    console.log("YYY handleOnMapReady");
    setIsMapReady(true);
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        key={`#{lat}-#{lng}`}
        provider={MapView.PROVIDER_DEFAULT}
        style={{
          minHeight: mapHeight,
          height: mapHeight,
          width: '100%',
          padding: 0,
        }}
        initialRegion={region}
        region={region}
        showsUserLocation={false}
        scrollEnabled={false}
        showsPointsOfInterest={false}
        onMapReady={handleOnMapReady}
      >
        <Marker coordinate={{latitude: lat, longitude: lng}} />
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderColor: '#CCC',
    borderWidth: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  content: {
    width: '100%',
    padding: 20,
    backgroundColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    width: '100%',
  },
  loader: {
    marginBottom: 10,
  },
  text: {
    fontSize: 14,
    fontWeight: '300',
    color: '#000',
    textAlign: 'center',
  },
});

export default LocationMap;
