import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface DataAveragesProps {
  turbidityEnabled: boolean;
  turbidityAverage: number;
  temperatureEnabled: boolean;
  temperatureAverage: number;
  chartDataType: 'turbidity' | 'temperature';
  onChartDataTypeChange: (type: 'turbidity' | 'temperature') => void;
}

const DataAverages: React.FC<DataAveragesProps> = ({
  turbidityEnabled,
  turbidityAverage,
  temperatureEnabled,
  temperatureAverage,
  chartDataType,
  onChartDataTypeChange,
}) => {
  return (
    <View style={styles.container}>
      {(!!turbidityEnabled) && (
        <TouchableOpacity
          style={styles.card}
          onPress={() => onChartDataTypeChange('turbidity')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.cardContent,
              styles.turbidityCard,
              chartDataType === 'turbidity' && styles.selectedCard,
            ]}
          >
            <View style={styles.textContainer}>
              {chartDataType === 'turbidity' && (
                <View style={styles.bullet} />
              )}
              <Text style={styles.cardText}>
                Average Turbidity Value: {turbidityAverage} NTU
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}
      {(!!temperatureEnabled) && (
        <TouchableOpacity
          style={styles.card}
          onPress={() => onChartDataTypeChange('temperature')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.cardContent,
              styles.temperatureCard,
              chartDataType === 'temperature' && styles.selectedCard,
            ]}
          >
            <View style={styles.textContainer}>
              {chartDataType === 'temperature' && (
                <View style={styles.bullet} />
              )}
              <Text style={styles.cardText}>
                Average Temperature Value: {temperatureAverage}°C
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 0,
    marginBottom: 16,
  },
  card: {
    margin: 10,
  },
  cardContent: {
    padding: 16,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  turbidityCard: {
    backgroundColor: 'rgb(19,113,255)',
  },
  temperatureCard: {
    backgroundColor: '#ff981a',
  },
  selectedCard: {
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 12,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
});

export default DataAverages;
