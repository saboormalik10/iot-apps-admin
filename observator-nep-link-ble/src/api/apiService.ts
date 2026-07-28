// apiService.ts
import { serverApi, uploadApi } from './apiConfig';
import { ENDPOINTS } from './endPoints';
import type {
    CreateDeviceDto,
    CreatedDevice,
    UpdateDeviceSettingsDto,
    CreateSessionDto,
    CreatedSession,
    SampleDto,
    BulkInsertResult,
    RNFile,
    SessionFileType,
    UploadedFileResult,
    SyncStatusResult,
    SyncUploadDto,
    SyncDownloadResult,
    DeviceStatusDto,
    DeviceHeartbeatResult,
} from '../types/types';

// Shared helper: turns an axios progress event into a clean 0-100 integer
const toPercent = (progressEvent: any): number => {
    if (!progressEvent?.total) return 0;
    return Math.round((progressEvent.loaded / progressEvent.total) * 100);
};


/**
 * ============================================================
 *  DEVICES
 * ============================================================
 */

/**
 * Register a new device on first BLE pairing.
 * Save the returned `_id` as `deviceId` — you'll need it for every other call.
 */
export const create_device = async (payload: CreateDeviceDto): Promise<CreatedDevice> => {
    try {
        const response = await serverApi.post(ENDPOINTS.CREATE_DEVICE, payload);
        return response.data.data;
    } catch (error: any) {
        console.error('[create_device] Failed to register device:', error?.response?.data || error.message);
        throw error;
    }
};

/**
 * Update per-device settings. Only send the keys that changed.
 */
export const update_device_settings = async (
    deviceId: string,
    settings: UpdateDeviceSettingsDto
): Promise<UpdateDeviceSettingsDto> => {
    try {
        const response = await serverApi.patch(
            ENDPOINTS.UPDATE_DEVICE_SETTINGS(deviceId),
            settings
        );
        return response.data.data;
    } catch (error: any) {
        console.error('[update_device_settings] Failed to update settings:', error?.response?.data || error.message);
        throw error;
    }
};

/**
 * ============================================================
 *  NEP SESSIONS
 * ============================================================
 */

/**
 * Create/upload a NEP-LINK session.
 * `id` must be a client-generated UUID v4 — reuse the same id if you retry.
 */
export const create_session = async (
    payload: CreateSessionDto,
    onProgress?: (percent: number) => void
): Promise<CreatedSession> => {
    try {
        const response = await serverApi.post(ENDPOINTS.CREATE_SESSION, payload, {
            onUploadProgress: onProgress ? (e) => onProgress(toPercent(e)) : undefined,
        });
        return response.data.data;
    } catch (error: any) {
        console.error('[create_session] Failed to create session:', error?.response?.data || error.message);
        throw error;
    }
};

/**
 * Bulk insert samples for a session. Max 7200 samples per call.
 */
export const bulk_insert_samples = async (
    sessionId: string,
    samples: SampleDto[],
    onProgress?: (percent: number) => void
): Promise<BulkInsertResult> => {
    try {
        const response = await serverApi.post(
            ENDPOINTS.BULK_INSERT_SAMPLES(sessionId),
            { samples },
            { onUploadProgress: onProgress ? (e) => onProgress(toPercent(e)) : undefined }
        );
        console.log(`[bulk_insert_samples] Successfully inserted ${response.data.data.inserted} samples for session ${sessionId}`);
        return response.data.data;
    } catch (error: any) {
        console.error('[bulk_insert_samples] Failed to insert samples:', error?.response?.data || error.message);
        throw error;
    }
};



export const update_session_comment = async (
    sessionId: string,
    comment: string
): Promise<unknown> => {
    try {
        const response = await serverApi.patch(
            ENDPOINTS.UPDATE_SESSION_COMMENT(sessionId),
            { comment }
        );
        return { success: true, data: response.data.data };
    } catch (error: any) {
        console.error('[update_session_comment] Failed to update session comment:', error?.response?.data || error.message);
        throw error;
    }
};

/**
 * ============================================================
 *  FILES
 * ============================================================
 */

/**
 * Upload a file (photo, map screenshot, or thumbnail) to a session.
 */
export const upload_session_file = async (
    sessionId: string,
    file: RNFile,
    fileType: SessionFileType = 'photo',
    capturedAt?: string,
    onProgress?: (percent: number) => void
): Promise<UploadedFileResult> => {
    try {
        // Force fully qualified file protocol prefix for Android
        const cleanUri = file.uri.startsWith('file://') ? file.uri : `file://${file.uri}`;

        const formData = new FormData();
        formData.append('file', {
            uri: cleanUri,
            name: file.name,
            type: file.type,
        } as any); // RN's FormData typing for files differs slightly from DOM lib

        formData.append('fileType', fileType);

        if (capturedAt) {
            formData.append('capturedAt', capturedAt);
        }

        const response = await uploadApi.post(
            ENDPOINTS.UPLOAD_SESSION_FILE(sessionId),
            formData,
            { onUploadProgress: onProgress ? (e) => onProgress(toPercent(e)) : undefined }
        );
        return response.data.data;
    } catch (error: any) {
        console.error('[upload_session_file] Failed to upload file:', error?.response?.data || error.message);
        throw error;
    }
};

/**
 * ============================================================
 *  SYNC
 * ============================================================
 */

/**
 * Get sync status, optionally scoped to a single device.
 */
export const get_sync_status = async (deviceId?: string): Promise<SyncStatusResult> => {
    try {
        const response = await serverApi.get(ENDPOINTS.GET_SYNC_STATUS, {
            params: deviceId ? { deviceId } : {},
        });
        return response.data.data;
    } catch (error: any) {
        console.error('[get_sync_status] Failed to fetch sync status:', error?.response?.data || error.message);
        throw error;
    }
};

/**
 * One-shot upsert of a full NEP session (with samples included).
 * Safe to call multiple times — the server dedupes by sessionId.
 */
export const sync_upload = async (payload: SyncUploadDto): Promise<unknown> => {
    try {
        const response = await serverApi.post(ENDPOINTS.SYNC_UPLOAD, payload);
        return response.data.data;
    } catch (error: any) {
        console.error('[sync_upload] Failed to sync upload:', error?.response?.data || error.message);
        throw error;
    }
};

/**
 * Pull sessions synced since a given timestamp (cursor-based).
 */
export const sync_download = async (
    deviceId: string,
    since?: string | number
): Promise<SyncDownloadResult> => {
    try {
        const response = await serverApi.get(ENDPOINTS.SYNC_DOWNLOAD, {
            params: since ? { deviceId, since } : { deviceId },
        });
        return response.data.data;
    } catch (error: any) {
        console.error('[sync_download] Failed to download sync data:', error?.response?.data || error.message);
        throw error;
    }
};

/**
 * Device heartbeat — call on BLE connect and roughly every 60s while connected.
 */
export const device_heartbeat = async (
    payload: DeviceStatusDto
): Promise<DeviceHeartbeatResult> => {
    try {
        const response = await serverApi.patch(ENDPOINTS.DEVICE_HEARTBEAT, payload);
        return response.data.data;
    } catch (error: any) {
        console.error('[device_heartbeat] Failed to send heartbeat:', error?.response?.data || error.message);
        throw error;
    }
};