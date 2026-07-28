import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ImageBackground,
  StyleSheet,
  ListRenderItem,
  Pressable,
  Alert,
  ActivityIndicator
} from 'react-native';
import RNFS from 'react-native-fs';
import { getDBConnection } from '../../utils/db';
import { bulk_insert_samples, create_session, upload_session_file } from '../../api/apiService';
import { CreateSessionDto, SampleDto, RNFile } from '../../types/types';
import IonIcon from '@react-native-vector-icons/ionicons';
import { lightColors } from '@rneui/themed';
import { startSyncNotification, completeSyncNotification, updateSyncNotification } from '../../utils/syncNotifications';

interface LoggingSession {
  id: string;
  timestamp: number;
  deviceId: string;
  deviceName?: string;
  update_status?: number;
}

interface DeviceIdNameHash {
  [key: string]: string;
}

interface Devices {
  deviceIdNameHash: DeviceIdNameHash;
}

interface Logging {
  loggingSessions: LoggingSession[];
}

interface ListItemProps extends LoggingSession {
  itemName: string;
  onPressHandler: (id: string, formattedDateTime: string) => void;
}

interface IndexListProps {
  logging: Logging;
  devices: Devices;
  listItemPressHandler: (id: string, formattedDateTime: string) => void;
  listRefreshHandler: () => void;
  isFetching: boolean;
}

const formatDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Phase weights — must sum to 100
const WEIGHTS = { session: 5, samples: 20, images: 75 };

const ListItem: React.FC<ListItemProps> = ({ id, timestamp, itemName, onPressHandler, update_status }) => {
  const formattedDateTime = formatDateTime(timestamp);
  const thumbnailUri = `file://${RNFS.DocumentDirectoryPath}/loggingSessionThumnails/${id}.jpg`;

  // Local hook to handle individual list-row item loading spinner metrics
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncPercent, setSyncPercent] = useState(0);
  // 🟢 local synced flag, seeded from DB value passed down as a prop
  const [isSynced, setIsSynced] = useState(update_status === 1);

  const handleSyncPress = async (id: string) => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncPercent(0);

    // completedWeight tracks how much of the 0-100 total is "locked in"
    // from finished phases; the current phase adds on top of it live.
    let completedWeight = 0;

    const reportProgress = (phaseWeight: number, phasePercent: number) => {
      const overall = Math.min(100, Math.round(completedWeight + (phaseWeight * phasePercent) / 100));
      setSyncPercent(overall);
      updateSyncNotification(overall, `${overall}% complete`);
    };

    await startSyncNotification(`Session from ${formattedDateTime}`);

    console.log('Session id', id)

    try {
      console.log(`📡 Fetching data from SQLite for Session ID: ${id}`);
      let db = await getDBConnection();

      // 1. Fetch the primary session meta attributes row matching this ID
      const [sessionResult] = await db.executeSql(
        'SELECT * FROM loggingSessions WHERE id = ?',
        [id]
      );


      if (sessionResult.rows.length === 0) {
        throw new Error('Session metadata not found in local database.');
      }
      const sessionRow = sessionResult.rows.item(0);

      // 2. Fetch all tracking telemetry frames compiled for this session
      const [samplesResult] = await db.executeSql(
        'SELECT * FROM loggingSessionSamples WHERE sessionId = ? ORDER BY timestamp ASC',
        [id]
      );

      const compiledSamples: SampleDto[] = [];
      for (let i = 0; i < samplesResult.rows.length; i++) {
        const row = samplesResult.rows.item(i);
        compiledSamples.push({
          timestamp: Number(row.timestamp),
          turbidityValue: row.turbidityValue ?? undefined,
          temperatureValue: row.temperatureValue ?? undefined,
          locationLat: row.locationLat ?? undefined,
          locationLng: row.locationLng ?? undefined,
          batteryLevel: row.batteryLevel ?? undefined,
          batteryRawVoltage: row.batteryRawVoltage ?? undefined,
          demoModeEnabled: Boolean(row.demoModeEnabled),
        });
      }

      console.log(`📦 Found meta parameters & compiled ${compiledSamples.length} samples. Transmitting...`);

      // 3. 🟢 FIXED: Correctly mapped keys to match 'CreateSessionDto' rules
      const sessionPayload: CreateSessionDto = {
        id: sessionRow.id,
        deviceId: sessionRow.deviceId != 'demo' ? sessionRow.deviceId : '664a1f2e3c4d5e6f7a8b9c0f', // Fix: mapped deviceId correctly
        deviceName: sessionRow.deviceName || 'Unknown Device',
        startTimestamp: Number(sessionRow.timestamp), // Fix: mapped timestamp to startTimestamp
        timezoneName: sessionRow.timezoneName || 'Asia/Karachi',
        timezoneOffset: Number(sessionRow.timezoneOffset || 5), // Fix: converted string offset safely to a number
        turbidityEnabled: Boolean(sessionRow.turbidityEnabled),
        temperatureEnabled: Boolean(sessionRow.temperatureEnabled),
        comment: sessionRow.comment || '',
        // isDemoMode: compiledSamples.length > 0 ? compiledSamples[0].demoModeEnabled : false,
      };

      // 4. STEP 1 API CALL: Create the base session container registry entry
      console.log('📡 [Step 1/2] Creating session profile on server...');
      console.log('sessionPayload', sessionPayload);
      console.log('compiledSamples', compiledSamples);
      // ── Phase 1: create session (5%) ──────────────────────
      await create_session(sessionPayload, (p) => reportProgress(WEIGHTS.session, p));
      completedWeight += WEIGHTS.session;
      setSyncPercent(completedWeight);
      updateSyncNotification(completedWeight, 'Session created');

      // 5. STEP 2 API CALL: Bulk upload telemetry arrays if samples exist
      // ── Phase 2: bulk insert samples (20%) ────────────────
      if (compiledSamples.length > 0) {
        await bulk_insert_samples(id, compiledSamples, (p) => reportProgress(WEIGHTS.samples, p));
      }
      completedWeight += WEIGHTS.samples;
      setSyncPercent(completedWeight);
      updateSyncNotification(completedWeight, 'Samples uploaded');


      // upload session related images
      // 6. Upload session images (photos only — map images are excluded on purpose)
      // Path matches the "images" folder used in LoggingSessionView's updateImages/getAttachments
      // ── Phase 3: images (75%, split evenly per image) ─────
      const imagesDirPath = `${RNFS.DocumentDirectoryPath}/loggingSessionFiles/${id}/images`;
      console.log(`📡 [Step 3/3] Checking for local images at: ${imagesDirPath}`);

      try {
        const imagesDirExists = await RNFS.exists(imagesDirPath);

        if (imagesDirExists) {
          const dirEntries = await RNFS.readDir(imagesDirPath);
          // readDir returns dirs too on some platforms — keep only actual files
          const imageFiles = (dirEntries || []).filter(entry => entry && entry.isFile() && entry.path);

          if (imageFiles.length > 0) {
            const perImageWeight = WEIGHTS.images / imageFiles.length;
            console.log(`📡 Found ${imageFiles.length} image(s) to upload...`);

            for (let i = 0; i < imageFiles.length; i++) {
              const imageFile = imageFiles[i];
              try {
                const extension = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
                const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';

                // upload_session_file already normalizes the uri (adds file:// if missing),
                // so passing the raw RNFS path works identically on iOS and Android.
                const rnFile: RNFile = {
                  uri: imageFile.path,
                  name: imageFile.name,
                  type: mimeType,
                };

                const capturedAt = imageFile.mtime ? new Date(imageFile.mtime).toISOString() : undefined;

                await upload_session_file(id, rnFile, 'photo', capturedAt, (p) => {
                  const overall = Math.min(
                    100,
                    Math.round(completedWeight + i * perImageWeight + (perImageWeight * p) / 100)
                  );
                  setSyncPercent(overall);
                  updateSyncNotification(overall, `Uploading image ${i + 1} of ${imageFiles.length}`);
                });
                console.log(`✅ Uploaded image: ${imageFile.name}`);
              } catch (imageUploadError: any) {
                // One bad image shouldn't fail the whole sync — session + samples are already synced
                console.error(`[Image Upload Failure] ${imageFile.name}:`, imageUploadError);
              }
            }
          } else {
            console.log('📡 No local images found for this session.');
          }
        } else {
          console.log('📡 Images directory does not exist for this session — nothing to upload.');
        }
      } catch (imagesDirError: any) {
        console.error('[Images Directory Read Failure]:', imagesDirError);
        // Non-fatal: session + samples sync already succeeded
      }
      setSyncPercent(100);
      // 🟢 mark this session as synced in SQLite
      try {
        const db = await getDBConnection();
        await db.executeSql(
          'UPDATE loggingSessions SET update_status = 1 WHERE id = ?',
          [id]
        );
        setIsSynced(true);
      } catch (dbUpdateError: any) {
        // Non-fatal: upload itself succeeded, only the local flag failed to persist.
        // Icon will re-show on next screen refresh (which is safe, just re-syncs).
        console.error('[update_status DB update failed]:', dbUpdateError);
      }
      await completeSyncNotification(true, 'Session and images uploaded successfully.');
      Alert.alert('Sync Complete', 'Session container, timeline samples, and images successfully uploaded.');
    } catch (error: any) {
      console.error('[Sync Event Failure]:', error);
      // Display detailed server validation info if rejected by remote endpoints
      const serverErrorMessage = error?.response?.data?.message || error.message;
      await completeSyncNotification(false, serverErrorMessage || 'Could not upload session data.');
      Alert.alert('Sync Failed', serverErrorMessage || 'Could not upload session metrics.');
    } finally {
      setIsSyncing(false);
      setSyncPercent(0);
    }
  };

  return (
    <TouchableOpacity onPress={() => onPressHandler(id, formattedDateTime)} activeOpacity={0.7}>
      <View style={styles.itemContainer}>
        <View style={styles.itemContent}>
          <View style={styles.thumbnailContainer}>
            <ImageBackground
              source={{ uri: thumbnailUri }}
              resizeMode="cover"
              style={styles.thumbnail}
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.deviceName}>{itemName}</Text>
            <Text style={styles.dateTime}>{formattedDateTime}</Text>
          </View>

          {isSynced ? (
            <Pressable style={{ flex: .1, justifyContent: 'center', alignItems: 'center' }}>
              <IonIcon name="checkmark-circle" size={26} color="green" />
            </Pressable>
          ) : (
            <Pressable style={{ flex: .1, justifyContent: 'center', alignItems: 'center' }} onPress={() => handleSyncPress(id)}>
              {isSyncing ? (
                <Text style={styles.syncPercentText}>{syncPercent}%</Text>
              ) : (
                <IonIcon name="cloud-upload-outline" size={26} color={lightColors.primary} />
              )}
            </Pressable>
          )}

        </View>
      </View>
    </TouchableOpacity>
  );
};

const IndexList: React.FC<IndexListProps> = ({
  logging,
  devices,
  listItemPressHandler,
  listRefreshHandler,
  isFetching,
}) => {
  const { deviceIdNameHash } = devices;

  // console.log('IndexList logging.loggingSessions', logging);

  const renderItem: ListRenderItem<LoggingSession> = useCallback(
    ({ item }) => {
      const itemName = deviceIdNameHash[item.deviceId] || item.deviceName || 'Unknown Device';
      return <ListItem {...item} itemName={itemName} onPressHandler={listItemPressHandler} />;
    },
    [deviceIdNameHash, listItemPressHandler]
  );

  const keyExtractor = useCallback((item: LoggingSession) => item.id, []);

  return (
    <FlatList
      data={logging.loggingSessions}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onRefresh={listRefreshHandler}
      refreshing={isFetching}
    />
  );
};

const styles = StyleSheet.create({
  itemContainer: {
    flex: 1,
    margin: 10,
    borderBottomWidth: 1,
    borderColor: '#CCC',
  },
  itemContent: {
    borderBottomWidth: 1,
    borderColor: '#AAA',
    paddingBottom: 10,
    flexDirection: 'row',
  },
  thumbnailContainer: {
    flex: 0.2,
    height: 60,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  thumbnail: {
    justifyContent: 'center',
  },
  textContainer: {
    flex: .7,
    justifyContent: 'center',
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  dateTime: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  syncButton: {
    flex: 0.2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    minWidth: 55,
  },
  syncButtonText: {
    fontSize: 14,
    color: '#0055ff',
    fontWeight: '600'
  },
  syncPercentText: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.primary,
  },
});

export default IndexList;
