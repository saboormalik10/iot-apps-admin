import { serverAuthApi, serverAuthForgetPasswordApi } from './apiConfig';
import { ENDPOINTS } from './endPoints';

export interface AuthUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
}

export interface AuthResponse {
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
}

export interface RefreshResponse {
    accessToken: string;
}

export interface VerifyResetCodeResponse {
    resetToken: string;
}

export type AppType = 'MET-LINK' | 'NEP-LINK';

export const signUp = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    appType: AppType
): Promise<AuthResponse> => {
    try {
        const response = await serverAuthApi.post(ENDPOINTS.SIGNUP, {
            email,
            password,
            firstName,
            lastName,
            appType,
        });
        console.log('[signUp] Signup successful:', response.data);
        return response.data.data;
    }
    catch (error: any) {
        console.error('[signUp] Signup failed:', error?.response?.data || error.message);
        throw error;
    }
};


export const loginApi = async (email: string, password: string): Promise<AuthResponse> => {
    try {
        const response = await serverAuthApi.post(ENDPOINTS.LOGIN, { email, password });
        console.log('[login] Login successful:', response.data);
        return response.data.data; // Return the response data containing tokens and user info
    }
    catch (error: any) {
        console.error('[login] Login failed:', error?.response?.data || error.message);
        throw error;
    }
};

export const logout = async (refreshToken: string): Promise<void> => {
    try {
        const response = await serverAuthApi.post(ENDPOINTS.LOGOUT, { refreshToken });
        console.log('[logout] Logout successful:', response.data);
    }
    catch (error: any) {

        console.error('[logout] Logout failed:', JSON.stringify(error));
        throw error;
    }
};

export const refreshAccessToken = async (refreshToken: string): Promise<RefreshResponse> => {
    try {
        const response = await serverAuthApi.post(ENDPOINTS.REFRESH_TOKEN, { refreshToken });
        console.log('[refresh] Token refreshed');
        return response.data.data;
    }
    catch (error: any) {
        console.error('[refresh] Refresh failed:', error?.response?.data || error.message);
        throw error;
    }
};

export const requestPasswordReset = async (email: string): Promise<void> => {
    try {
        await serverAuthForgetPasswordApi.post(ENDPOINTS.FORGOT_PASSWORD, { email });
        console.log('[requestPasswordReset] Reset email requested');
    }
    catch (error: any) {
        console.error('[requestPasswordReset] Failed:', {
            message: error.message,
            code: error.code,           // e.g. 'ERR_NETWORK', 'ECONNABORTED'
            hasResponse: !!error.response,
            responseStatus: error.response?.status,
            responseData: error.response?.data,
            requestExists: !!error.request,
        });
        throw error;
    }
};

export const verifyResetCode = async (email: string, code: string): Promise<VerifyResetCodeResponse> => {
    try {
        const response = await serverAuthForgetPasswordApi.post(ENDPOINTS.VERIFY_RESET_CODE, { email, code });
        console.log('[verifyResetCode] Code verified');
        return response.data.data;
    }
    catch (error: any) {
        console.error('[verifyResetCode] Failed:', error?.response?.data || error.message);
        throw error;
    }
};

export const resetPassword = async (resetToken: string, newPassword: string): Promise<void> => {
    try {
        await serverAuthForgetPasswordApi.post(ENDPOINTS.RESET_PASSWORD, { resetToken, newPassword });
        console.log('[resetPassword] Password reset successful');
    }
    catch (error: any) {
        console.error('[resetPassword] Failed:', error?.response?.data || error.message);
        throw error;
    }
};