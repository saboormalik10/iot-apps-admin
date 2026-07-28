// sessionSync.ts
import { sync_upload } from '../api/apiService'; // adjust path
import { DateTime } from 'luxon';
import type { SyncUploadDto, SampleDto } from '../types/types'; // adjust path

interface SessionSyncInput {
    sessionId: string;
    deviceId: string;
    deviceName: string;
    startTimestamp: number;
    endTimestamp: number;
    turbidityEnabled: boolean;
    temperatureEnabled: boolean;
    locationEnabled: boolean;
    comment?: string;
    samples: SampleDto[];
}

// Converts Luxon's "+05:00" style offset into a number (hours), since the
// API wants a number but Luxon gives you a formatted string.
const parseTimezoneOffsetToHours = (offsetStr: string): number => {
    const match = offsetStr.match(/^([+-])(\d{2}):(\d{2})$/);
    if (!match) return 0;
    const sign = match[1] === '-' ? -1 : 1;
    return sign * (parseInt(match[2], 10) + parseInt(match[3], 10) / 60);
};

/**
 * Sends one session (+ its samples) to the server.
 * Safe to call more than once for the same session — the server
 * dedupes by sessionId, so re-sending just re-upserts the same record.
 */
export const syncSession = async (
    input: SessionSyncInput
): Promise<{ success: boolean; error?: string }> => {
    const payload: SyncUploadDto = {
        type: 'nep_session',
        sessionId: input.sessionId,
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        startTimestamp: input.startTimestamp,
        endTimestamp: input.endTimestamp,
        timezoneName: DateTime.now().toFormat('z'),
        timezoneOffset: parseTimezoneOffsetToHours(DateTime.now().toFormat('Z')),
        turbidityEnabled: input.turbidityEnabled,
        temperatureEnabled: input.temperatureEnabled,
        locationEnabled: input.locationEnabled,
        comment: input.comment,
        samples: input.samples,
    };

    try {
        await sync_upload(payload);
        return { success: true };
    } catch (error: any) {
        const message = error?.response?.data?.error?.message || error?.message || 'Unknown sync error';
        return { success: false, error: message };
    }
};