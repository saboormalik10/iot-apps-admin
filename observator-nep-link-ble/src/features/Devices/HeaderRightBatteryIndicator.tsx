import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import IonIcon from '@react-native-vector-icons/ionicons';

interface HeaderRightBatteryIndicatorProps {
  batteryLevel?: number;
  batteryRawVoltage?: number;
  batteryCharging?: boolean;
}

interface BatteryDisplayData {
  iconName: string;
  color: string;
  formattedLevel: number;
}

const HeaderRightBatteryIndicator: React.FC<HeaderRightBatteryIndicatorProps> = ({
  batteryLevel,
  batteryRawVoltage,
  batteryCharging,
}) => {
  const batteryData = useMemo<BatteryDisplayData | null>(() => {
    console.log("XXXX batteryLevel",batteryLevel);
    if (batteryLevel === null || batteryLevel === undefined) {
      return null;
    }

    let iconName: string;
    let color = '#FFF';

    if (batteryCharging) {
      iconName = 'battery-charging';
    } else if (batteryLevel > 80) {
      iconName = 'battery-full';
    } else if (batteryLevel > 20) {
      iconName = 'battery-half';
    } else {
      iconName = 'battery-dead';
      color = '#e03131';
    }

    let formattedLevel = Math.round(batteryLevel);
    formattedLevel = Math.max(0, Math.min(100, formattedLevel));

    return {
      iconName,
      color,
      formattedLevel,
    };
  }, [batteryLevel, batteryCharging]);

  if (!batteryData) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#FFF" />
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <IonIcon name={batteryData.iconName} size={24} color={batteryData.color} />
      <Text style={[styles.percentageText, { color: batteryData.color }]}>
        {`${batteryData.formattedLevel}%`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentageText: {
    fontSize: 12,
    lineHeight: 12,
  },
});

export default HeaderRightBatteryIndicator;
