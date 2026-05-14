import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Dialog, Input } from '@rneui/themed';

interface LoggingSessionCommentDialogProps {
  commentValue: string;
  commentOnChangeTextHandler: (text: string) => void;
  cancelButtonHandler: () => void;
  okButtonHandler: () => void;
}

const LoggingSessionCommentDialog: React.FC<LoggingSessionCommentDialogProps> = ({
  commentValue,
  commentOnChangeTextHandler,
  cancelButtonHandler,
  okButtonHandler,
}) => {
  return (
    <Dialog isVisible={true}>
      <View style={styles.container}>
        <Text style={styles.promptText}>
          Please enter a comment for the session...
        </Text>
        <Input
          placeholder="Enter comment..."
          multiline
          textAlignVertical="top"
          value={commentValue}
          onChangeText={commentOnChangeTextHandler}
          inputStyle={styles.input}
          inputContainerStyle={styles.inputContainer}
        />
        <View style={styles.buttonContainer}>
          <Dialog.Button title="Cancel" onPress={cancelButtonHandler} />
          <Dialog.Button title="OK" onPress={okButtonHandler} />
        </View>
      </View>
    </Dialog>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  promptText: {
    marginBottom: 10,
    color: '#000',
  },
  inputContainer: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 4,
    paddingHorizontal: 8,
  },
  input: {
    fontSize: 14,
    height: 80,
    backgroundColor: '#EEE',
    textAlignVertical: 'top',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
  },
});

export default LoggingSessionCommentDialog;
