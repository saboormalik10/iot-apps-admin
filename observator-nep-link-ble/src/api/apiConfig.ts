// apiConfig.ts
import axios, { AxiosError, InternalAxiosRequestConfig, AxiosInstance } from 'axios';
import { BASE_URL, BASE_URL_PASSWORD_RESET } from './endPoints';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { refreshAccessToken } from './authService';
import { forceLogoutHandler } from '../context/AuthContext';

const TOKEN_KEY = '_token';
const REFRESH_TOKEN_KEY = '_refreshToken';
const USER_KEY = '_user';

let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

// Server Instance for Auth Requests (login/signup/refresh) — no token needed
export const serverAuthApi = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
});

export const serverAuthForgetPasswordApi = axios.create({
    baseURL: BASE_URL_PASSWORD_RESET,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
    },
});

// Server Instance for Authenticated Requests
export const serverApi = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
});

export const uploadApi = axios.create({
    baseURL: BASE_URL,
    timeout: 120000,
    headers: {
        'Content-Type': 'multipart/form-data',
    },
});

// --- Request interceptors: attach bearer token (fixed key) ---
const attachToken = async (config: InternalAxiosRequestConfig) => {
    if (!config.headers) {
        config.headers = {} as any;
    }
    const token = await AsyncStorage.getItem(TOKEN_KEY); // FIXED: was 'TOKEN_KEY' literal
    console.log('🔍 ATTACHING TOKEN:', token);
    config.headers['Authorization'] = `Bearer ${token}`;
    return config;
};

const logRequestError = (error: AxiosError) => {
    console.log('❌ FAILED URL:', error.config?.baseURL, error.config?.url);
    console.log('❌ SERVER RESPONSE:', error.response?.data);
    return Promise.reject(error);
};

serverApi.interceptors.request.use(attachToken, logRequestError);
uploadApi.interceptors.request.use(attachToken, logRequestError);

// --- Response interceptor: refresh-on-401, attached to the instances
// that actually carry a bearer token and can receive TOKEN_INVALID ---
const handleTokenRefresh = async (error: any) => {
    const originalRequest = error.config;

    if (error?.response?.data?.error?.code === 'TOKEN_INVALID' && !originalRequest._retry) {
        originalRequest._retry = true;

        if (isRefreshing) {
            return new Promise((resolve) => {
                pendingRequests.push((newToken: string) => {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    resolve(serverApi(originalRequest));
                });
            });
        }

        isRefreshing = true;
        try {
            const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY); // FIXED key
            if (!refreshToken) throw new Error('No refresh token stored');

            const { accessToken } = await refreshAccessToken(refreshToken);
            await AsyncStorage.setItem(TOKEN_KEY, accessToken); // FIXED key

            pendingRequests.forEach((cb) => cb(accessToken));
            pendingRequests = [];

            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return serverApi(originalRequest);
        } catch (refreshError) {
            await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
            pendingRequests = [];
            forceLogoutHandler?.();
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }

    return Promise.reject(error);
};

serverApi.interceptors.response.use((response) => response, handleTokenRefresh);
uploadApi.interceptors.response.use((response) => response, handleTokenRefresh);