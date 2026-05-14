import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';

interface LoggingButtonsProps {
  isLogging: boolean;
  loggingSessionSampleCount: number;
  startLoggingHandler: () => void;
  stopLoggingHandler: () => void;
}

const LoggingButtons: React.FC<LoggingButtonsProps> = ({
  isLogging,
  loggingSessionSampleCount,
  startLoggingHandler,
  stopLoggingHandler,
}) => {
  return (
    <View style={styles.container}>
      {isLogging ? (
        <>
          <Button
            mode="outlined"
            style={styles.button}
            textColor="#007AFF"
            onPress={stopLoggingHandler}
          >
            Stop Logging
          </Button>
          <Button
            mode="outlined"
            disabled
            style={styles.countButton}
          >
            <Text style={styles.countText}>
              {loggingSessionSampleCount} readings
            </Text>
          </Button>
        </>
      ) : (
        <Button
          mode="outlined"
          style={styles.button}
          textColor="#007AFF"
          onPress={startLoggingHandler}
        >
          Start Logging
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 40,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    borderColor: '#007AFF',
    borderWidth: 1,
  },
  countButton: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: '#eaf1f3ff',
    marginLeft: 8,
  },
  countText: {
    color: '#000',
    fontSize: 14,
  },
});

export default LoggingButtons;
