import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

interface Sample {
  timestamp: number;
  value: number;
  label: string;
}

interface SessionLineChartProps {
  samples: Sample[];
  dataType: 'turbidity' | 'temperature';
}

const SessionLineChart: React.FC<SessionLineChartProps> = ({ samples, dataType }) => {
  const limit = 200;
  const limitedList = samples.slice(0, limit);
  const valuesMap = limitedList.map(dp => dp.value);
  const maxValue = Math.ceil(Math.max(...valuesMap) / 10) * 10;
  const minValue = Math.floor(Math.min(...valuesMap) / 10) * 10;

  const chartData = limitedList.map(dp => ({
    value: dp.value,
    label: dp.label,
  }));

  // Set color based on data type
  const lineColor = dataType === 'turbidity' ? 'rgb(19,113,255)' : '#ff981a';
  const dataPointColor = dataType === 'turbidity' ? '#0d5dbf' : '#cc7a15';

  return (
    <View style={styles.container}>
      <LineChart
        data={chartData}
        curved
        adjustToWidth={true}
        isAnimated={true}
        dashGap={4}
        initialSpacing={0}
        spacing={40}
        dataPointsColor={dataPointColor}
        hideDataPoints
        thickness={3}
        noOfSectionsBelowXAxis={0}
        endSpacing={30}
        pressEnabled
        showDataPointOnPress
        showXAxisIndices={true}
        scrollAnimationEnabled={true}
        onDataChangeAnimationDuration={500}
        yAxisTextStyle={{ color: '#000', fontSize: 12 }}
        yAxisColor="#000"
        showVerticalLines
        verticalLinesColor="rgba(15, 16, 16, 0.5)"
        xAxisColor="#000"
        color={lineColor}
        maxValue={maxValue}
        minValue={minValue}
        yAxisLabel={'#000'}
        xAxisLabelTextStyle={{ width: 80, marginLeft: -36, color: '#000' }}
        xAxisIndicesHeight={2}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#2e2e2e',
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginHorizontal: 10,
  },
});

export default SessionLineChart;
