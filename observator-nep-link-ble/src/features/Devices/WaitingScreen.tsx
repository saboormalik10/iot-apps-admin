import React from 'react';
import { Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { lightColors } from '@rneui/themed';

interface WaitingScreenProps {
  waitingText: string;
}

const WaitingScreen: React.FC<WaitingScreenProps> = ({ waitingText }) => {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={lightColors.primary} />
      <Text style={styles.text}>{waitingText}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 14,
    fontWeight: '300',
    color: '#000',
    marginTop: 20,
  },
});

export default WaitingScreen;
