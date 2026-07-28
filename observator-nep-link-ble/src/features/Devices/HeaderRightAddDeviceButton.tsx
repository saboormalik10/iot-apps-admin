import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';

interface HeaderRightAddDeviceButtonProps {
  pressHandler: () => void;
}

const HeaderRightAddDeviceButton: React.FC<HeaderRightAddDeviceButtonProps> = ({
  pressHandler,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={pressHandler} style={styles.button}>
        <Text style={styles.buttonText}>Add...</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    alignItems: 'center',
    marginRight: 10,
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default HeaderRightAddDeviceButton;

