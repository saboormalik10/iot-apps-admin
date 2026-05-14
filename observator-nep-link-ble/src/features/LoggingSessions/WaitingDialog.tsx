import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Dialog } from '@rneui/themed';

interface WaitingDialogProps {
  text?: string;
}

const WaitingDialog: React.FC<WaitingDialogProps> = ({ text }) => {
  return (
    <Dialog isVisible={true}>
      <Dialog.Loading />
      <View style={styles.container}>
        <Text style={styles.text}>{text || 'Waiting...'}</Text>
      </View>
    </Dialog>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  text: {
    color: '#000',
    fontSize: 14,
  },
});

export default WaitingDialog;
