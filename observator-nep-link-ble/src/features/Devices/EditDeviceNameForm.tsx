import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Input } from '@rneui/themed';

interface EditDeviceNameFormProps {
  deviceName: string;
  deviceNameOnChangeHandler: (value: string) => void;
}

const EditDeviceNameForm: React.FC<EditDeviceNameFormProps> = ({
  deviceName,
  deviceNameOnChangeHandler,
}) => {
  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.label}>Edit Device Name...</Text>
        <Input
          style={styles.input}
          placeholder="Device name"
          inputStyle={styles.inputInner}
          value={deviceName}
          onChangeText={deviceNameOnChangeHandler}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 20,
    flexDirection: 'column',
    flex: 1,
    width: '100%',
  },
  label: {
    fontSize: 14,
    margin: 10,
  },
  input: {
    fontSize: 16,
    borderWidth: 0,
    borderColor: '#CCC',
  },
  inputInner: {
    height: 20,
    backgroundColor: '#EEE',
  },
});

export default EditDeviceNameForm;

