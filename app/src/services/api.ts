import axios, { AxiosInstance } from 'axios';
import { useStore, User, Vehicle } from '../store';

const API_BASE = 'https://your-server.com/api'; // Change before production

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Bearer token from store
apiClient.interceptors.request.use(
  config => {
    const token = useStore.getState().token;
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

// Response interceptor: on 401 logout
apiClient.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      await useStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  licenseExpired: boolean;
  daysLeft?: number;
  user: User;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface BleEnrollData {
  vin: string;
  publicKeyHex: string;
  keyId: string;
  vehicleNickname?: string;
}

export interface CommandLog {
  id: string;
  command: string;
  timestamp: string;
  status: 'success' | 'failed' | 'pending';
  source: 'ble' | 'remote';
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function authLogin(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', {
    email,
    password,
  });
  return res.data;
}

export async function authRegister(
  data: RegisterData,
): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/register', data);
  return res.data;
}

export async function authVerifyGM(
  gmUsername: string,
  gmPassword: string,
): Promise<{ valid: boolean; message: string }> {
  const res = await apiClient.post<{ valid: boolean; message: string }>(
    '/auth/verify-gm',
    { gmUsername, gmPassword },
  );
  return res.data;
}

export async function authMe(): Promise<User> {
  const res = await apiClient.get<User>('/auth/me');
  return res.data;
}

export async function authBleEnroll(
  data: BleEnrollData,
): Promise<{ success: boolean; enrollmentId: string }> {
  const res = await apiClient.post<{ success: boolean; enrollmentId: string }>(
    '/auth/ble-enroll',
    data,
  );
  return res.data;
}

export async function authChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean }> {
  const res = await apiClient.post<{ success: boolean }>(
    '/auth/change-password',
    { currentPassword, newPassword },
  );
  return res.data;
}

// ─── Vehicles ────────────────────────────────────────────────────────────────

export async function vehiclesGet(): Promise<Vehicle[]> {
  const res = await apiClient.get<Vehicle[]>('/vehicles');
  return res.data;
}

export async function vehicleHistory(id: string): Promise<CommandLog[]> {
  const res = await apiClient.get<CommandLog[]>(`/vehicles/${id}/history`);
  return res.data;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function notificationsRegisterToken(
  token: string,
  platform: 'android' | 'ios',
): Promise<{ success: boolean }> {
  const res = await apiClient.post<{ success: boolean }>(
    '/notifications/register',
    { token, platform },
  );
  return res.data;
}

export default apiClient;
