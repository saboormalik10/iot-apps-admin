// endPoints.ts

export const BASE_URL = 'https://iot-apps-admin.onrender.com/';
export const BASE_URL_PASSWORD_RESET = 'https://iot-apps-backend.vercel.app/'; // Local development URL
// export const TOKEN = 'obs_mob_6a73a0d130c8aa2a0c432658208e595bdc730bf6e3af8ff037abbd1fa6eb215e';

export const ENDPOINTS = {
    // ── Auth ──────────────────────────────────────────────
    SIGNUP: `${BASE_URL}v1/auth/mobile/signup`,
    LOGIN: `${BASE_URL}v1/auth/mobile/login`,
    REFRESH_TOKEN: `${BASE_URL}v1/auth/mobile/refresh`,
    LOGOUT: `${BASE_URL}v1/auth/mobile/logout`,
    FORGOT_PASSWORD: `${BASE_URL_PASSWORD_RESET}v1/auth/forgot-password`,
    VERIFY_RESET_CODE: `${BASE_URL_PASSWORD_RESET}v1/auth/verify-reset-code`,
    RESET_PASSWORD: `${BASE_URL_PASSWORD_RESET}v1/auth/reset-password`,
    // ── Devices ──────────────────────────────────────────────
    CREATE_DEVICE: `${BASE_URL}v1/devices`,
    UPDATE_DEVICE_SETTINGS: (deviceId: string): string =>
        `${BASE_URL}v1/devices/${deviceId}/settings`,

    // ── NEP Sessions ─────────────────────────────────────────
    CREATE_SESSION: `${BASE_URL}v1/sessions`,
    BULK_INSERT_SAMPLES: (sessionId: string): string =>
        `${BASE_URL}v1/sessions/${sessionId}/samples`,

    UPDATE_SESSION_COMMENT: (sessionId: string): string =>
        `${BASE_URL}v1/sessions/${sessionId}`,

    // ── Files ────────────────────────────────────────────────
    UPLOAD_SESSION_FILE: (sessionId: string): string =>
        `${BASE_URL}v1/sessions/${sessionId}/files`,

    // ── Sync ─────────────────────────────────────────────────
    GET_SYNC_STATUS: `${BASE_URL}v1/sync/status`,
    SYNC_UPLOAD: `${BASE_URL}v1/sync/upload`,
    SYNC_DOWNLOAD: `${BASE_URL}v1/sync/download`,
    DEVICE_HEARTBEAT: `${BASE_URL}v1/sync/device-status`,
} as const;