import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Dialog } from '@rneui/themed';

interface TakePhotoDialogProps {
  visible: boolean;
  closeDialog: () => void;
  launchCamera: () => void;
}

const TakePhotoDialog: React.FC<TakePhotoDialogProps> = ({
  visible,
  closeDialog,
  launchCamera,
}) => {
  return (
    <Dialog isVisible={visible} onBackdropPress={closeDialog}>
      <Dialog.Title title="Take Photo" titleStyle={styles.title} />
      <Text style={styles.message}>Would you like to take a photo?</Text>
      <Dialog.Actions>
        <Dialog.Button title="Yes" onPress={launchCamera} />
        <Dialog.Button title="No" onPress={closeDialog} />
      </Dialog.Actions>
    </Dialog>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    color: '#000',
  },
  message: {
    fontSize: 16,
    color: '#000',
  },
});

export default TakePhotoDialog;
