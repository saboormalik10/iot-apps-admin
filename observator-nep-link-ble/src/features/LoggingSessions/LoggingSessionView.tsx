import React, { useEffect, useState, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  ImageBackground,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  PermissionsAndroid,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DateTime } from 'luxon';
import RNFS from 'react-native-fs';
import { Dialog } from '@rneui/themed';
import Share from 'react-native-share';
// import RNFetchBlob from 'rn-fetch-blob';
import RNFetchBlob from 'react-native-blob-util';
import IonIcon from '@react-native-vector-icons/ionicons';

import {
  getLoggingSession,
  fetchLoggingSessionSamples,
  clearLoggingSession,
  deleteLoggingSession,
  updateLoggingSessionComment,
} from '../../actions/LoggingActions';
import ActionsMenu from './ActionsMenu';
import DataAverages from './DataAverages';
import SessionLineChart from './SessionLineChart';
import LoggingSessionCommentDialog from './LoggingSessionCommentDialog';
import WaitingDialog from './WaitingDialog';
import Comment from './Comment';
import { LoggingStackParamList } from '../../navigation/RootNav';
import { SafeAreaView } from 'react-native-safe-area-context';

// Types
interface RootState {
  devices: any;
  logging: {
    loggingSession: {
      id: string;
      timestamp: number;
      timezoneName?: string;
      timezoneOffset?: string;
      comment?: string;
      turbidityEnabled: boolean;
      temperatureEnabled: boolean;
    } | null;
    loggingSessionSamples: Array<{
      timestamp: number;
      turbidityValue: number;
      temperatureValue: number;
      locationLat?: number;
      locationLng?: number;
      batteryLevel?: number;
      batteryRawVoltage?: number;
    }>;
    loggingSessionSamplesLoaded: boolean;
  };
}

interface ImageItem {
  imageType: 'map' | 'photo';
  path: string;
  mtime?: Date;
}

interface Attachment {
  path: string;
  type: string;
}

type ChartDataType = 'turbidity' | 'temperature';

type NavigationProp = NativeStackNavigationProp<LoggingStackParamList, 'LoggingSessionView'>;
type RouteProps = RouteProp<LoggingStackParamList, 'LoggingSessionView'>;

// Delete Session Dialog Component
interface DeleteSessionDialogProps {
  visible: boolean;
  deleteSessionHandler: (action: string) => void;
}

const DeleteSessionDialog: React.FC<DeleteSessionDialogProps> = ({ visible, deleteSessionHandler }) => {
  if (!visible) {
    return null;
  }

  return (
    <Dialog isVisible={visible} onBackdropPress={() => deleteSessionHandler('cancel')}>
      <View style={styles.dialogContainer}>
        <Text style={styles.dialogTitle}>
          Are you sure you want to delete this session?
        </Text>
      </View>
      <Dialog.Button
        title="Cancel"
        buttonStyle={styles.dialogButton}
        onPress={() => deleteSessionHandler('cancel')}
      />
      <Dialog.Button
        title="Delete"
        buttonStyle={styles.dialogButton}
        onPress={() => deleteSessionHandler('confirm')}
      />
    </Dialog>
  );
};

const LoggingSessionView: React.FC = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();

  // Redux selectors
  const logging = useSelector((state: RootState) => state.logging);
  // console.log(`Redux Sate logging: ${JSON.stringify(logging)}`);
  // Route params
  const { loggingSessionId } = route.params;

  // State
  const [images, setImages] = useState<ImageItem[]>([]);
  const [comment, setComment] = useState<string>('');
  const [commentBackup, setCommentBackup] = useState<string>('');
  const [commentDialogVisible, setCommentDialogVisible] = useState<boolean>(false);
  const [deleteSessionDialogVisible, setDeleteSessionDialogVisible] = useState<boolean>(false);
  const [waitingDialogVisible, setWaitingDialogVisible] = useState<boolean>(false);
  const [waitingDialogText, setWaitingDialogText] = useState<string>('');
  const [chartDataType, setChartDataType] = useState<ChartDataType>('turbidity');
  const [processingExport, setProcessingExport] = useState<boolean>(false);

  const getAndroidApiLevel = (): number => {
    return Platform.OS === 'android' ? Platform.Version as number : 0;
  };

  // Update images when session ID changes
  const updateImages = useCallback(async (sessionId: string) => {
    console.log('🔍 RNFS LOG 100: updateImages called with sessionId:', sessionId);

    if (!sessionId) {
      console.log('🔍 RNFS LOG 100b: sessionId is null/undefined, returning');
      return;
    }

    const fileDirsRootPath = `${RNFS.DocumentDirectoryPath}/loggingSessionFiles/${sessionId}`;
    console.log('🔍 RNFS LOG 101: fileDirsRootPath:', fileDirsRootPath);

    const mapFilesDirName = `${fileDirsRootPath}/mapimage`;
    console.log('🔍 RNFS LOG 102: About to call RNFS.readDir for mapFilesDirName:', mapFilesDirName);

    let mapFiles: any[] = [];
    try {
      // Check if directory exists first
      const mapDirExists = await RNFS.exists(mapFilesDirName);
      console.log('🔍 RNFS LOG 102b: mapFilesDirName exists:', mapDirExists);

      if (mapDirExists) {
        const result = await RNFS.readDir(mapFilesDirName);
        console.log('🔍 RNFS LOG 102c: raw readDir result:', result);
        // Filter out any null/undefined entries
        mapFiles = (result || []).filter(file => file && file.path);
        console.log('🔍 RNFS LOG 105: mapFiles result:', mapFiles);
      } else {
        console.log('🔍 RNFS LOG 103: Map directory does not exist, creating it');
        await RNFS.mkdir(mapFilesDirName);
      }
    } catch (e) {
      console.log('🔍 RNFS LOG 103b: Error in map directory operations:', e);
      try {
        await RNFS.mkdir(mapFilesDirName);
      } catch (mkdirError) {
        console.log('🔍 RNFS LOG 104b: Error creating map directory:', mkdirError);
      }
    }

    const imageFilesDirName = `${fileDirsRootPath}/images`;
    console.log('🔍 RNFS LOG 106: About to call RNFS.readDir for imageFilesDirName:', imageFilesDirName);
    console.log('🔍 RNFS LOG 106b: imageFilesDirName type:', typeof imageFilesDirName);
    console.log('🔍 RNFS LOG 106c: imageFilesDirName value:', JSON.stringify(imageFilesDirName));

    let imageFiles: any[] = [];
    try {
      // Check if directory exists first
      console.log('🔍 RNFS LOG 106d: About to check if imageFilesDirName exists');
      const imageDirExists = await RNFS.exists(imageFilesDirName);
      console.log('🔍 RNFS LOG 106e: imageFilesDirName exists:', imageDirExists);

      if (imageDirExists) {
        console.log('🔍 RNFS LOG 106f: Calling RNFS.readDir');
        const result = await RNFS.readDir(imageFilesDirName);
        console.log('🔍 RNFS LOG 106g: raw readDir result:', result);
        // Filter out any null/undefined entries
        imageFiles = (result || []).filter(file => file && file.path);
        console.log('🔍 RNFS LOG 109: imageFiles result:', imageFiles);
      } else {
        console.log('🔍 RNFS LOG 107: Images directory does not exist, creating it');
        await RNFS.mkdir(imageFilesDirName);
      }
    } catch (e) {
      console.log('🔍 RNFS LOG 107b: Error in images directory operations:', e);
      console.log('🔍 RNFS LOG 107c: Error type:', typeof e);
      console.log('🔍 RNFS LOG 107d: Error details:', JSON.stringify(e));
      try {
        await RNFS.mkdir(imageFilesDirName);
      } catch (mkdirError) {
        console.log('🔍 RNFS LOG 108b: Error creating images directory:', mkdirError);
      }
    }

    const imagesArray: ImageItem[] = [];

    console.log('🔍 RNFS LOG 110: Processing mapFiles, count:', mapFiles.length);
    mapFiles.forEach((file, index) => {
      console.log(`🔍 RNFS LOG 111-${index}: mapFile:`, file);
      if (file && file.path) {
        imagesArray.push({
          imageType: 'map',
          path: file.path,
          mtime: file.mtime,
        });
      } else {
        console.log(`🔍 RNFS LOG 112-${index}: Invalid mapFile (no path):`, file);
      }
    });

    console.log('🔍 RNFS LOG 113: Processing imageFiles, count:', imageFiles.length);
    imageFiles.forEach((file, index) => {
      console.log(`🔍 RNFS LOG 114-${index}: imageFile:`, file);
      if (file && file.path) {
        imagesArray.push({
          imageType: 'photo',
          path: file.path,
          mtime: file.mtime,
        });
      } else {
        console.log(`🔍 RNFS LOG 115-${index}: Invalid imageFile (no path):`, file);
      }
    });

    console.log('🔍 RNFS LOG 116: Sorting imagesArray, count:', imagesArray.length);
    // Sort by modification time, ascending (oldest first)
    imagesArray.sort((a, b) => {
      const timeA = a.mtime ? new Date(a.mtime).getTime() : 0;
      const timeB = b.mtime ? new Date(b.mtime).getTime() : 0;
      return timeA - timeB;
    });

    console.log('🔍 RNFS LOG 117: Setting images state with count:', imagesArray.length);
    setImages(imagesArray);
  }, []);
  // Load session data on mount
  useEffect(() => {
    console.log('🔍 RNFS LOG 118: Component mounted, loggingSessionId:', loggingSessionId);
    setWaitingDialogVisible(true);
    setWaitingDialogText('Loading...');

    dispatch(getLoggingSession(loggingSessionId));
    dispatch(fetchLoggingSessionSamples(loggingSessionId));

    updateImages(loggingSessionId).catch(e => {
      console.log(`🔍 RNFS LOG 119: Failed to update images for session ${loggingSessionId}:`, e);
    });
  }, [dispatch, loggingSessionId, updateImages]);

  // Update waiting dialog and comment when data loads
  useEffect(() => {
    if (waitingDialogVisible && logging.loggingSessionSamplesLoaded && !processingExport) {
      setWaitingDialogVisible(false);
      setWaitingDialogText('');
    }
  }, [waitingDialogVisible, logging.loggingSessionSamplesLoaded, processingExport]);

  useEffect(() => {
    const { loggingSession } = logging;
    if (
      !commentDialogVisible &&
      loggingSession?.comment &&
      comment !== loggingSession.comment
    ) {
      setComment(loggingSession.comment);
    }
  }, [logging.loggingSession, commentDialogVisible, comment]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispatch(clearLoggingSession());
    };
  }, [dispatch]);

  // Get attachments for export
  const getAttachments = useCallback(async (): Promise<Attachment[]> => {
    console.log('🔍 RNFS LOG 120: getAttachments called');

    const { loggingSession, loggingSessionSamples } = logging;
    if (!loggingSession) {
      console.log('🔍 RNFS LOG 121: No logging session, returning empty array');
      return [];
    }

    const { timezoneName, timezoneOffset, comment: sessionComment } = loggingSession;

    const csvArray = [
      [
        'Date',
        'Time',
        'Lat',
        'Lon',
        'Turbidity',
        'Temperature',
        '',
        'Comment',
        'Battery Level',
      ].join(','),
      [timezoneName || 'UTC', '', '', '', 'NTU', '°C', '', '', '%'].join(','),
    ];

    const commentRows = (sessionComment || '').split('\n');
    let commentIterator = 0;
    const localTimezoneOffsetSecs = ((Platform.OS === 'ios') ? (parseFloat(timezoneOffset || '0') * 60 * 60 * 1000) : 0);

    loggingSessionSamples.forEach(item => {

      const timestamp = Math.round(item.timestamp / 1000) * 1000 + localTimezoneOffsetSecs

      const dateTime = DateTime.fromMillis(timestamp);
      const dateStr = dateTime.toFormat('dd LLL yyyy');
      const timeStr = dateTime.toFormat('HH:mm:ss');

      csvArray.push(
        [
          dateStr,
          timeStr,
          item.locationLat || '',
          item.locationLng || '',
          item.turbidityValue || '',
          item.temperatureValue || '',
          '',
          commentRows[commentIterator] || '',
          item.batteryLevel || '',
        ].join(',')
      );
      commentIterator++;
    });

    const csvStr = csvArray.join('\r\n');

    const dirName = `${RNFS.DocumentDirectoryPath}/loggingSessionFiles/${loggingSessionId}/csv`;
    console.log('🔍 RNFS LOG 122: About to call RNFS.mkdir for CSV dirName:', dirName);

    await RNFS.mkdir(dirName).catch(error => {
      console.log('🔍 RNFS LOG 123: Error creating CSV directory:', error);
    });
    console.log('🔍 RNFS LOG 124: mkdir (CSV) completed');

    const imagesDirPath = `${RNFS.DocumentDirectoryPath}/loggingSessionFiles/${loggingSessionId}/images`;
    console.log('🔍 RNFS LOG 125: About to call RNFS.readDir for images:', imagesDirPath);

    const imageFiles = await RNFS.readDir(imagesDirPath).catch((error) => {
      console.log('🔍 RNFS LOG 126: Error reading images directory:', error);
      return [];
    });
    console.log('🔍 RNFS LOG 127: imageFiles result:', imageFiles);

    const mapDirPath = `${RNFS.DocumentDirectoryPath}/loggingSessionFiles/${loggingSessionId}/mapimage`;
    console.log('🔍 RNFS LOG 128: About to call RNFS.readDir for mapimage:', mapDirPath);

    const mapFiles = await RNFS.readDir(mapDirPath).catch((error) => {
      console.log('🔍 RNFS LOG 129: Error reading mapimage directory:', error);
      return [];
    });
    console.log('🔍 RNFS LOG 130: mapFiles result:', mapFiles);

    const attachments: Attachment[] = [];

    console.log('🔍 RNFS LOG 131: Processing imageFiles for attachments, count:', imageFiles?.length || 0);
    if (imageFiles && Array.isArray(imageFiles)) {
      imageFiles.forEach((fileItem, index) => {
        console.log(`🔍 RNFS LOG 132-${index}: imageFile for attachment:`, fileItem);
        if (fileItem && fileItem.path) {
          attachments.push({
            path: fileItem.path,
            type: 'jpg',
          });
        } else {
          console.log(`🔍 RNFS LOG 133-${index}: Invalid imageFile (no path):`, fileItem);
        }
      });
    }

    console.log('🔍 RNFS LOG 134: Processing mapFiles for attachments, count:', mapFiles?.length || 0);
    if (mapFiles && Array.isArray(mapFiles)) {
      mapFiles.forEach((fileItem, index) => {
        console.log(`🔍 RNFS LOG 135-${index}: mapFile for attachment:`, fileItem);
        if (fileItem && fileItem.path) {
          attachments.push({
            path: fileItem.path,
            type: 'jpg',
          });
        } else {
          console.log(`🔍 RNFS LOG 136-${index}: Invalid mapFile (no path):`, fileItem);
        }
      });
    }

    const sessionTimestamp = loggingSession.timestamp;
    const fileDateTime = new Date(sessionTimestamp);

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const formattedFileName = `${pad(fileDateTime.getDate())}-${fileDateTime.toLocaleString(
      'default',
      { month: 'short' }
    )}-${fileDateTime.getFullYear()}-${pad(fileDateTime.getHours())}${pad(
      fileDateTime.getMinutes()
    )}${pad(fileDateTime.getSeconds())}`;

    const filePath = `${dirName}/NEP-Link-data-${formattedFileName}.csv`;
    console.log('🔍 RNFS LOG 137: About to call RNFS.writeFile for CSV, filePath:', filePath);

    const csvFile = await RNFS.writeFile(filePath, csvStr, 'utf8')
      .then(() => {
        console.log('🔍 RNFS LOG 138: writeFile (CSV) completed successfully');
        return {
          path: filePath,
          type: 'csv',
        };
      })
      .catch(error => {
        console.log('🔍 RNFS LOG 139: Error writing CSV file:', error);
        return null;
      });

    if (csvFile) {
      attachments.push(csvFile);
    }

    console.log('🔍 RNFS LOG 140: Returning attachments, count:', attachments.length);
    return attachments;
  }, [logging, loggingSessionId]);

  const getSaveFolderPath = useCallback((): string => {
    if (Platform.OS === 'android') {
      if (RNFS.DownloadDirectoryPath) {
        return `${RNFS.DownloadDirectoryPath}/BleSessions`;
      }
      if (RNFS.ExternalDirectoryPath) {
        return `${RNFS.ExternalDirectoryPath}/BleSessions`;
      }
    }

    return `${RNFS.DocumentDirectoryPath}/BleSessions`;
  }, []);

  const buildCsvFile = useCallback(async (directoryPath: string): Promise<{ filePath: string; fileName: string } | null> => {
    const { loggingSession, loggingSessionSamples } = logging;
    if (!loggingSession) {
      return null;
    }

    const { timezoneName, timezoneOffset, comment: sessionComment } = loggingSession;

    const csvArray = [
      [
        'Date',
        'Time',
        'Lat',
        'Lon',
        'Turbidity',
        'Temperature',
        '',
        'Comment',
        'Battery Level',
      ].join(','),
      [timezoneName || 'UTC', '', '', '', 'NTU', '°C', '', '', '%'].join(','),
    ];

    const commentRows = (sessionComment || '').split('\n');
    let commentIterator = 0;
    const localTimezoneOffsetSecs = Platform.OS === 'ios' ? parseFloat(timezoneOffset || '0') * 60 * 60 * 1000 : 0;

    loggingSessionSamples.forEach(item => {
      const timestamp = Math.round(item.timestamp / 1000) * 1000 + localTimezoneOffsetSecs;
      const dateTime = DateTime.fromMillis(timestamp);
      const dateStr = dateTime.toFormat('dd LLL yyyy');
      const timeStr = dateTime.toFormat('HH:mm:ss');

      csvArray.push(
        [
          dateStr,
          timeStr,
          item.locationLat || '',
          item.locationLng || '',
          item.turbidityValue || '',
          item.temperatureValue || '',
          '',
          commentRows[commentIterator] || '',
          item.batteryLevel || '',
        ].join(',')
      );
      commentIterator++;
    });

    const csvStr = csvArray.join('\r\n');

    try {
      const directoryExists = await RNFS.exists(directoryPath);
      if (!directoryExists) {
        await RNFS.mkdir(directoryPath);
      }
    } catch (error) {
      console.log('🔍 RNFS LOG save folder creation error:', error);
      return null;
    }

    const sessionTimestamp = loggingSession.timestamp;
    const fileDateTime = new Date(sessionTimestamp);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const formattedFileName = `${pad(fileDateTime.getDate())}-${fileDateTime.toLocaleString(
      'default',
      { month: 'short' }
    )}-${fileDateTime.getFullYear()}-${pad(fileDateTime.getHours())}${pad(
      fileDateTime.getMinutes()
    )}${pad(fileDateTime.getSeconds())}`;

    const fileName = `NEP-Link-data-${formattedFileName}.csv`;
    const filePath = `${directoryPath}/${fileName}`;

    try {
      await RNFS.writeFile(filePath, csvStr, 'utf8');
      return { filePath, fileName };
    } catch (error) {
      console.log('🔍 RNFS LOG save file error:', error);
      return null;
    }
  }, [logging]);

  const requestStoragePermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    const apiLevel = getAndroidApiLevel();

    // API 29+ : no runtime permission needed/available for this flow
    if (apiLevel >= 29) return true;

    // API 26–28 : must request the legacy permission
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        {
          title: 'Storage Permission',
          message: 'NEP-LINK needs permission to save logging files to your phone.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.log('🔍 requestStoragePermission error:', error);
      return false;
    }
  }, []);

  const saveSessionToPhone = useCallback(async () => {
    setProcessingExport(true);
    setWaitingDialogVisible(true);
    setWaitingDialogText('Saving to phone...');
    await new Promise(resolve => setTimeout(resolve, 100));

    const { loggingSession } = logging;
    if (!loggingSession) {
      Alert.alert('Save failed', 'Unable to save session because session data is missing.');
      setWaitingDialogVisible(false);
      setProcessingExport(false);
      return;
    }

    try {
      if (Platform.OS === 'android') {
        // Write the CSV to a private location first — this is just a staging
        // area, never touched by other apps or DownloadManager.
        const csvFile = await buildCsvFile(RNFS.CachesDirectoryPath);
        if (!csvFile) throw new Error('Failed to create CSV file.');

        // Now copy it into the real public Downloads collection via MediaStore.
        // This is the scoped-storage-correct path — it's what makes the file
        // visible in the system Files app / Downloads app.
        await RNFetchBlob.MediaCollection.copyToMediaStore(
          {
            name: csvFile.fileName,
            parentFolder: 'BleSessions', // creates Downloads/BleSessions/
            mimeType: 'text/csv',
          },
          'Download',
          csvFile.filePath
        );

        Alert.alert('Saved', `Session saved to Downloads/BleSessions/${csvFile.fileName}`);
      } else {
        const csvFile = await buildCsvFile(RNFS.CachesDirectoryPath);
        if (!csvFile) throw new Error('Failed to create CSV file.');

        const iosPath = `${RNFS.DocumentDirectoryPath}/${csvFile.fileName}`;
        await RNFS.copyFile(csvFile.filePath, iosPath);
        Alert.alert('Saved', `Session saved to ${iosPath}`);
      }
    } catch (error: any) {
      console.log('🔍 saveSessionToPhone error:', error);
      Alert.alert(
        'Save failed',
        error?.message || 'Unable to save the logging session to phone storage.'
      );
    } finally {
      setWaitingDialogVisible(false);
      setProcessingExport(false);
    }
  }, [logging, buildCsvFile]);

  // Export data handler
  const exportData = useCallback(async () => {
    console.log('🔍 RNFS LOG 141: exportData called');

    setProcessingExport(true);
    setWaitingDialogVisible(true);
    setWaitingDialogText('Preparing...');
    await new Promise(resolve => setTimeout(resolve, 100));

    const { loggingSession } = logging;
    console.log('logging session', loggingSession);
    if (!loggingSession) {
      console.log('🔍 RNFS LOG 142: No logging session in exportData');
      Alert.alert('Export failed', 'No session data available to export.');
      setWaitingDialogVisible(false);
      setProcessingExport(false);
      return;
    }

    try {
      const timestamp = loggingSession.timestamp;
      const dateTime = DateTime.fromMillis(timestamp);

      setWaitingDialogText('Building CSV...');
      console.log('🔍 RNFS LOG 143: About to build CSV file');
      // Private cache is fine here — Share reads the file itself, no
      // MediaStore/DownloadManager involvement like the save-to-phone flow.
      const csvFile = await buildCsvFile(RNFS.CachesDirectoryPath);

      if (!csvFile) {
        throw new Error('Could not generate the CSV file.');
      }
      console.log('🔍 RNFS LOG 144: CSV built at', csvFile.filePath);

      const mailSubject = `NEP-LINK Files for logging session at ${dateTime.toFormat(
        'dd-LLL-yyyy HH:mm:ss'
      )}`;
      const mailBody = `Hello, here is the CSV export for the NEP-LINK logging session conducted at ${dateTime.toFormat(
        'dd-LLL-yyyy HH:mm:ss'
      )}.`;

      setProcessingExport(false);
      setWaitingDialogVisible(false);
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('🔍 RNFS LOG 149: About to call Share.open');

      await Share.open({
        title: mailSubject,
        subject: mailSubject,
        message: mailBody,
        url: `file://${csvFile.filePath}`, // react-native-share wraps this in a content:// URI on Android internally
        type: 'text/csv',
        filename: csvFile.fileName,
        failOnCancel: false, // user dismissing the sheet shouldn't surface as an error
      });

      console.log('🔍 RNFS LOG 150: Share.open completed');
    } catch (error: any) {
      console.error('🔍 RNFS LOG 151: Error exporting data:', error);
      Alert.alert('Export failed', error?.message || 'Unable to export the logging session.');
    } finally {
      setProcessingExport(false);
      setWaitingDialogVisible(false);
    }
  }, [logging, buildCsvFile]);

  // Delete session handler
  const deleteSession = useCallback((action: string = 'showConfirmationDialog') => {
    if (action === 'showConfirmationDialog') {
      setDeleteSessionDialogVisible(true);
    } else if (action === 'cancel') {
      setDeleteSessionDialogVisible(false);
    } else if (action === 'confirm') {
      navigation.goBack();
      const { loggingSession } = logging;
      if (loggingSession) {
        dispatch(deleteLoggingSession(loggingSession.id));
      }
    }
  }, [logging, navigation, dispatch]);

  // Comment handlers
  const commentDialogOnChangeText = useCallback((value: string) => {
    setComment(value);
  }, []);

  const commentDialogCancelButtonOnPress = useCallback(() => {
    setComment(commentBackup);
    setCommentDialogVisible(false);
  }, [commentBackup]);

  const commentDialogOkButtonOnPress = useCallback(() => {
    setCommentDialogVisible(false);
    const { loggingSession } = logging;
    if (loggingSession) {
      dispatch(updateLoggingSessionComment(loggingSession.id, comment));
    }
  }, [logging, comment, dispatch]);

  const commentIconOnPress = useCallback(() => {
    setCommentBackup(comment);
    setCommentDialogVisible(true);
  }, [comment]);

  // Chart data type toggle handler
  const handleChartDataTypeToggle = useCallback((type: ChartDataType) => {
    setChartDataType(type);
  }, []);

  // Image press handler
  const handleImagePress = useCallback((index: number) => {
    navigation.navigate('ImageCarousel', {
      images,
      index,
    });
  }, [navigation, images]);

  // Render functions
  const renderActionsMenu = useCallback(() => {
    const { loggingSession } = logging;
    if (!loggingSession) return null;

    return (
      <ActionsMenu
        loggingSessionId={loggingSession.id}
        exportDataHandler={exportData}
        saveDataHandler={saveSessionToPhone}
        deleteSessionHandler={deleteSession}
      />
    );
  }, [logging, exportData, deleteSession]);

  const renderDataAverages = useCallback(() => {
    const { loggingSessionSamples, loggingSession } = logging;

    if (!loggingSessionSamples?.length || !loggingSession) {
      console.log('No samples or session data available');
      return null;
    }

    const { turbidityEnabled, temperatureEnabled } = loggingSession;

    let turbidityAverage = 0;
    let temperatureAverage = 0;

    if (turbidityEnabled) {
      const turbidityValues = loggingSessionSamples.map(({ turbidityValue }) => turbidityValue);
      const turbiditySum = turbidityValues.reduce((sum, x) => sum + x, 0);
      turbidityAverage = parseFloat((turbiditySum / turbidityValues.length).toFixed(2));
    }

    if (temperatureEnabled) {
      const temperatureValues = loggingSessionSamples.map(({ temperatureValue }) => temperatureValue);
      const temperatureSum = temperatureValues.reduce((sum, x) => sum + x, 0);
      temperatureAverage = parseFloat((temperatureSum / temperatureValues.length).toFixed(2));
    }

    return (
      <DataAverages
        turbidityEnabled={turbidityEnabled}
        turbidityAverage={turbidityAverage}
        temperatureEnabled={temperatureEnabled}
        temperatureAverage={temperatureAverage}
        chartDataType={chartDataType}
        onChartDataTypeChange={handleChartDataTypeToggle}
      />
    );
  }, [logging, chartDataType, handleChartDataTypeToggle]);

  const renderSessionLineChart = useCallback(() => {
    const { loggingSessionSamples } = logging;

    if (!Array.isArray(loggingSessionSamples) || loggingSessionSamples.length === 0) {
      return null;
    }

    if (chartDataType === 'turbidity') {
      const turbiditySamples = loggingSessionSamples
        .filter(({ turbidityValue }) => turbidityValue != null && !isNaN(turbidityValue))
        .map(({ timestamp, turbidityValue }) => {
          const time = parseInt(timestamp.toString(), 10);
          const value = parseFloat(turbidityValue.toString());
          const label = DateTime.fromMillis(time).toFormat('ss');
          return { timestamp: time, value, label };
        });

      return <SessionLineChart samples={turbiditySamples} dataType="turbidity" />;
    } else {
      const temperatureSamples = loggingSessionSamples
        .filter(({ temperatureValue }) => temperatureValue != null && !isNaN(temperatureValue))
        .map(({ timestamp, temperatureValue }) => {
          const time = parseInt(timestamp.toString(), 10);
          const value = parseFloat(temperatureValue.toString());
          const label = DateTime.fromMillis(time).toFormat('ss');
          return { timestamp: time, value, label };
        });

      return <SessionLineChart samples={temperatureSamples} dataType="temperature" />;
    }
  }, [logging, chartDataType]);

  const renderComment = useCallback(() => {
    const { loggingSession } = logging;
    if (!loggingSession) return null;

    return (
      <Comment
        comment={comment}
        commentEditOnPressHandler={commentIconOnPress}
      />
    );
  }, [logging, comment, commentIconOnPress]);

  const renderImages = useCallback(() => {
    if (!images.length) return null;

    return (
      <View style={styles.imagesSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.imagesScrollContent}
        >
          {images.map((image, index) => (
            <TouchableOpacity
              key={index.toString()}
              onPress={() => handleImagePress(index)}
              activeOpacity={0.8}
              style={styles.imageTouchable}
            >
              <ImageBackground
                source={{ uri: `file://${image.path}` }}
                resizeMode="cover"
                style={styles.imageBackground}
              >
                <View style={styles.imageOverlay}>
                  <IonIcon
                    name={image.imageType === 'map' ? 'map-outline' : 'camera-outline'}
                    size={24}
                    color="#FFF"
                  />
                </View>
              </ImageBackground>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }, [images, handleImagePress]);

  console.log("XXX waitingDialogVisible", waitingDialogVisible);

  return (
    <SafeAreaView style={styles.container}>
      {waitingDialogVisible && <WaitingDialog text={waitingDialogText} />}

      <DeleteSessionDialog
        visible={deleteSessionDialogVisible}
        deleteSessionHandler={deleteSession}
      />

      {commentDialogVisible && (
        <LoggingSessionCommentDialog
          commentValue={comment}
          commentOnChangeTextHandler={commentDialogOnChangeText}
          cancelButtonHandler={commentDialogCancelButtonOnPress}
          okButtonHandler={commentDialogOkButtonOnPress}
        />
      )}

      <ScrollView>
        {renderActionsMenu()}
        {renderDataAverages()}
        {renderSessionLineChart()}
        {renderComment()}
        {renderImages()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dialogContainer: {
    display: 'flex',
    alignItems: 'center',
  },
  dialogTitle: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  dialogButton: {
    marginTop: 20,
  },
  imagesSection: {
    marginVertical: 16,
  },
  imagesScrollContent: {
    paddingHorizontal: 16,
  },
  imageTouchable: {
    marginRight: 12,
  },
  imageBackground: {
    height: 120,
    width: 120,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    overflow: 'hidden',
  },
  imageOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 16,
    padding: 4,
  },
});

export default LoggingSessionView;
