import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import IonIcon from '@react-native-vector-icons/ionicons';

interface HeaderRightCameraButtonProps {
  isLogging: boolean;
  onPress: () => void;
}

const HeaderRightCameraButton: React.FC<HeaderRightCameraButtonProps> = ({
  isLogging,
  onPress,
}) => {
  if (!isLogging) {
    return null;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.container}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <IonIcon name={"camera-outline"} size={24} color={"#FFF"} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginLeft: 16,
  },
  iconContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default HeaderRightCameraButton;
