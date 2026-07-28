import notifee, { AndroidImportance } from '@notifee/react-native';
import { Platform } from 'react-native';

const CHANNEL_ID = 'nep-link-sync';

let permissionRequested = false;
let currentNotificationId: string | null = null;

// Call once — safe to call repeatedly, only does real work the first time
const ensureNotificationChannel = async () => {
  if (!permissionRequested) {
    await notifee.requestPermission(); // handles Android 13+ POST_NOTIFICATIONS + iOS prompt
    permissionRequested = true;
  }

  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'Session Sync',
      importance: AndroidImportance.LOW, // no sound/heads-up popup — this is a background progress ping
    });
  }
};

export const startSyncNotification = async (sessionLabel: string): Promise<string> => {
  await ensureNotificationChannel();

  currentNotificationId = await notifee.displayNotification({
    title: 'Syncing session…',
    body: sessionLabel,
    android: {
      channelId: CHANNEL_ID,
      progress: { max: 100, current: 0, indeterminate: true },
      ongoing: true,
      autoCancel: false,
      smallIcon: 'ic_launcher', // must exist in android/app/src/main/res — swap for your own icon if you have one
    },
  });

  return currentNotificationId;
};

export const updateSyncNotification = async (percent: number, statusText: string) => {
  if (!currentNotificationId) return;

  await notifee.displayNotification({
    id: currentNotificationId,
    title: 'Syncing session…',
    body: statusText,
    android: {
      channelId: CHANNEL_ID,
      progress: { max: 100, current: percent, indeterminate: false },
      ongoing: true,
      autoCancel: false,
      smallIcon: 'ic_launcher',
    },
  });
};

export const completeSyncNotification = async (success: boolean, message: string) => {
  if (!currentNotificationId) return;

  await notifee.displayNotification({
    id: currentNotificationId,
    title: success ? 'Sync complete ✅' : 'Sync failed ❌',
    body: message,
    android: {
      channelId: CHANNEL_ID,
      ongoing: false,
      autoCancel: true,
      smallIcon: 'ic_launcher',
      // omitting `progress` clears the progress bar
    },
  });

  currentNotificationId = null;
};