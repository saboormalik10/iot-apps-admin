import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

interface RangeIndicatorProps {
  rangeLabel?: string;
}

const RangeIndicator: React.FC<RangeIndicatorProps> = ({ rangeLabel }) => {
  if (!rangeLabel) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.indicator}>
        <Text style={styles.text}>{rangeLabel}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 0,
    width: '100%',
  },
  indicator: {
    padding: 10,
    backgroundColor: 'rgb(0,179,88)',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default RangeIndicator;
