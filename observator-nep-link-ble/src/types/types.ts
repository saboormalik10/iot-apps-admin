// types.ts
// Shared request/response shapes for the NEP-LINK API layer.

export interface SignupRequest {
    email: string;       // Valid email address
    password: string;    // 8+ characters
    firstName: string;
    lastName: string;
    appType: 'MET-LINK' | 'NEP-LINK'; // Tags user to the correct app tab
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RefreshTokenRequest {
    refreshToken: string; // The 64-char hex string from the signup/login response
}

export interface LogoutRequest {
    refreshToken: string; // Used to invalidate the session on the server
}

export interface ForgotPasswordRequest {
    email: string; // Triggers the password reset email
}

export interface ResetPasswordRequest {
    token: string;       // The token received from the reset email
    password: string;    // The new password (8+ characters)
}

export interface CreateDeviceDto {
    bleId: string;
    name: string;
    type: 'NEP-LINK';
    firmwareVersion?: string;
    serialNo?: string;
    customName?: string;
}

export interface UpdateDeviceSettingsDto {
    qqEnabled?: boolean;
    qqGpsHeight?: boolean;
    qfeHeightM?: number;
    qnhHeightM?: number;
    dewPointEnabled?: boolean;
    windRoseUnit?: string;
    windRosePeriod?: string;
    windRoseOrient?: string;
    graphicalType?: string;
    graphItem?: number;
    colorScheme?: number;
    pageLayout?: number;
    unitWindSpeed?: string;
    unitPressure?: string;
    unitTemperature?: string;
    unitAltitude?: string;
}

export type ProbeRange = 'R1' | 'R2' | 'R3';

export interface SampleDto {
    timestamp: number; // Unix ms
    turbidityValue?: number;
    temperatureValue?: number;
    probeRange?: ProbeRange;
    locationLat?: number;
    locationLng?: number;
    batteryLevel?: number;
    batteryRawVoltage?: number;
    batteryCharging?: boolean;
    demoModeEnabled?: boolean;
}

export interface CreateSessionDto {
    id: string; // client-generated UUID v4 (idempotency key)
    deviceId: string;
    deviceName: string;
    startTimestamp: number; // Unix ms
    endTimestamp?: number; // Unix ms
    timezoneName: string;
    timezoneOffset: number;
    turbidityEnabled?: boolean;
    temperatureEnabled?: boolean;
    locationEnabled?: boolean;
    comment?: string;
    isDemoMode?: boolean;
    samples?: SampleDto[];
}

export interface RNFile {
    uri: string;
    name: string;
    type: string; // MIME type, e.g. 'image/jpeg'
}

export type SessionFileType = 'map' | 'photo' | 'thumbnail';

export type SyncType = 'nep_session' | 'met_record';

export interface SyncUploadDto {
    type: SyncType;
    sessionId?: string;
    deviceId: string;
    deviceName?: string;
    startTimestamp?: number;
    endTimestamp?: number;
    timezoneName?: string;
    timezoneOffset?: number;
    turbidityEnabled?: boolean;
    temperatureEnabled?: boolean;
    locationEnabled?: boolean;
    comment?: string;
    isDemoMode?: boolean;
    samples?: SampleDto[];
}

export type AppType = 'NEP-LINK' | 'MET-LINK';

export interface DeviceStatusDto {
    deviceId: string;
    batteryPct?: number;
    batteryVoltage?: number;
    batteryCharging?: boolean;
    firmwareVersion?: string;
    appType: AppType;
}

// ── API response envelopes ──────────────────────────────────

export interface ApiErrorBody {
    error: {
        code: string;
        message: string;
    };
}

export interface CreatedDevice {
    _id: string;
    organizationId: string;
    bleId: string;
    name: string;
    type: AppType;
    firmwareVersion?: string;
    isOnline: boolean;
    createdAt: string;
}

export interface CreatedSession {
    id: string;
    deviceId: string;
    deviceName: string;
    startTimestamp: number;
    endTimestamp?: number;
    probeRange?: ProbeRange;
    sampleCount: number;
    syncedAt: string;
}

export interface BulkInsertResult {
    inserted: number;
}

export interface UploadedFileResult {
    file: {
        _id: string;
        fileType: SessionFileType;
        mimeType: string;
        sizeBytes: number;
        url: string;
    };
    url: string;
}

export interface SyncStatusResult {
    organizationId: string;
    deviceId?: string;
    nepSessions: {
        total: number;
        lastSyncedAt?: string;
        lastSession?: {
            id: string;
            deviceName: string;
            syncedAt: string;
            sampleCount: number;
        };
    };
    metRecords: {
        total: number;
        lastSyncedAt?: string;
    };
    serverTime: string;
}

export interface SyncDownloadResult {
    device: {
        id: string;
        name: string;
        type: AppType;
    };
    since?: string;
    nepSessions: CreatedSession[];
    metRecords: unknown[];
}

export interface DeviceHeartbeatResult {
    deviceId: string;
    lastSeenAt: string;
    isOnline: boolean;
    firmwareVersion?: string;
    batteryPct?: number;
}