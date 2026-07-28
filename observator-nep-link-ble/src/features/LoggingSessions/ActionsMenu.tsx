import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';

interface DropdownItem {
  label: string;
  value: string;
}

interface PickerCmpProps {
  onValueChange: (value: string) => void;
}

interface ActionsMenuProps {
  loggingSessionId: string;
  exportDataHandler: () => void;
  saveDataHandler: () => void;
  deleteSessionHandler: () => void;
}

const PickerCmp: React.FC<PickerCmpProps> = ({ onValueChange }) => {
  const data = useMemo<DropdownItem[]>(
    () => [
      { label: 'Export Data', value: 'export_data' },
      { label: 'Save to Phone', value: 'save_to_phone' },
      { label: 'Delete Session', value: 'delete_session' },
    ],
    []
  );

  const handleChange = useCallback(
    (item: DropdownItem) => {
      onValueChange(item.value);
    },
    [onValueChange]
  );

  return (
    <View style={styles.container}>
      <Dropdown
        data={data}
        labelField="label"
        valueField="value"
        style={styles.dropdown}
        placeholderStyle={styles.placeholderStyle}
        selectedTextStyle={styles.selectedTextStyle}
        itemTextStyle={styles.itemTextStyle}
        inputSearchStyle={styles.inputSearchStyle}
        placeholder="Actions..."
        onChange={handleChange}
      />
    </View>
  );
};

const ActionsMenu: React.FC<ActionsMenuProps> = ({
  exportDataHandler,
  saveDataHandler,
  deleteSessionHandler,
}) => {
  const handleValueChange = useCallback(
    (itemValue: string) => {
      switch (itemValue) {
        case 'export_data':
          exportDataHandler();
          break;
        case 'save_to_phone':
          saveDataHandler();
          break;
        case 'delete_session':
          deleteSessionHandler();
          break;
        default:
          break;
      }
    },
    [exportDataHandler, saveDataHandler, deleteSessionHandler]
  );

  return (
    <View style={styles.menuContainer}>
      <PickerCmp onValueChange={handleValueChange} />
    </View>
  );
};

const styles = StyleSheet.create({
  menuContainer: {
    padding: 6,
    alignItems: 'flex-end',
  },
  container: {
    padding: 10,
    width: 200,
  },
  dropdown: {
    height: 50,
    borderColor: 'gray',
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
  },
  placeholderStyle: {
    fontSize: 16,
    color: '#000',
  },
  selectedTextStyle: {
    fontSize: 14,
    color: '#000',
  },
  itemTextStyle: {
    fontSize: 14,
    color: '#000',
  },
  inputSearchStyle: {
    height: 40,
    fontSize: 16,
    color: '#000',
  },
});

export default ActionsMenu;
