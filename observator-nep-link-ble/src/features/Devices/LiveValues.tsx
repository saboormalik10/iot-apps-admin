import React, { useMemo } from 'react';
import { Text, View, Dimensions, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

interface LiveValuesProps {
  turbidityEnabled?: boolean;
  temperatureEnabled: boolean;
  turbidityValue?: number;
  temperatureValue?: number;
}

type ScreenSize = 'largeScreen' | 'mediumScreen' | 'smallScreen';
type ViewType = 'singleView' | 'dualView';

const fontSizeHash: Record<ViewType, Record<ScreenSize, number>> = {
  singleView: {
    largeScreen: 60,
    mediumScreen: 50,
    smallScreen: 40,
  },
  dualView: {
    largeScreen: 50,
    mediumScreen: 40,
    smallScreen: 30,
  },
};

const valueContainerHeight: Record<ScreenSize, number> = {
  largeScreen: 260,
  mediumScreen: 180,
  smallScreen: 140,
};

const getScreenSizeKey = (): ScreenSize => {
  const screenWidth = Dimensions.get('window').width;
  if (screenWidth >= 800) {
    return 'largeScreen';
  }
  if (screenWidth >= 500) {
    return 'mediumScreen';
  }
  return 'smallScreen';
};

const LiveValues: React.FC<LiveValuesProps> = ({
  turbidityEnabled = true,
  temperatureEnabled,
  turbidityValue,
  temperatureValue,
}) => {
  const { viewKey, screenSizeKey, fontSize, containerHeight } = useMemo(() => {
    const viewType: ViewType = temperatureEnabled ? 'dualView' : 'singleView';
    const screenSize = getScreenSizeKey();
    return {
      viewKey: viewType,
      screenSizeKey: screenSize,
      fontSize: fontSizeHash[viewType][screenSize],
      containerHeight: valueContainerHeight[screenSize],
    };
  }, [temperatureEnabled]);

  const renderTurbidityView = () => {
    if (!turbidityEnabled) return null;

    const hasValue = turbidityValue !== undefined && !isNaN(turbidityValue);

    return (
      <LinearGradient
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.valueContainer,
          { height: containerHeight },
          temperatureEnabled && styles.turbidityMargin,
        ]}
        colors={['#1f68d6ff', '#346fc8ff', '#2c7bf2ff']}
      >
        <Text style={[styles.valueText, { fontSize }]}>
          {hasValue ? turbidityValue.toFixed(2) : ''}
        </Text>
        <Text style={styles.unitText}>
          {hasValue ? 'NTU' : ''}
        </Text>
      </LinearGradient>
    );
  };

  const renderTemperatureView = () => {
    if (!temperatureEnabled) return null;

    const hasValue = temperatureValue !== undefined && !isNaN(temperatureValue);

    return (
      <LinearGradient
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.valueContainer,
          { height: containerHeight },
          styles.temperatureMargin,
        ]}
        colors={['#ff981a', '#e67e00', '#ff8c00']}
      >
        <Text style={[styles.valueText, { fontSize }]}>
          {hasValue ? temperatureValue.toFixed(1) : ''}
        </Text>
        <Text style={styles.unitText}>
          {hasValue ? '°C' : ''}
        </Text>
      </LinearGradient>
    );
  };

  return (
    <View style={styles.container}>
      {renderTurbidityView()}
      {renderTemperatureView()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 10,
    width: '100%',
    flexDirection: 'row',
  },
  valueContainer: {
    padding: 0,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  turbidityMargin: {
    marginRight: 5,
  },
  temperatureMargin: {
    marginLeft: 5,
  },
  valueText: {
    fontWeight: '600',
    color: '#FFF',
    textAlign: 'center',
  },
  unitText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    textAlign: 'center',
  },
});

export default LiveValues;
