import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';

interface DevicesListButtonsProps {
  enterDemoModeButtonPressHandler: () => void;
}

const DevicesListButtons: React.FC<DevicesListButtonsProps> = ({
  enterDemoModeButtonPressHandler,
}) => {
  return (
    <View style={styles.outerContainer}>
      <View style={styles.innerContainer}>
        <Button
          mode="outlined"
          style={styles.button}
          onPress={enterDemoModeButtonPressHandler}
          textColor="#007AFF"
        >
          Demo Mode
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    padding: 10,
    paddingTop: 0,
    width: '100%',
  },
  innerContainer: {
    padding: 10,
    marginTop: 50,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    borderRadius: 7,
  },
  button: {
    borderColor: '#007AFF',
    borderWidth: 1,
  },
});

export default DevicesListButtons;
