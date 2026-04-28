import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'yedidiagmc_token';

export interface Vehicle {
  id: string;
  vin: string;
  nickname?: string;
  make: string;
  model?: string;
  year?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'user';
  status: string;
  licenseExpiresAt?: string;
  daysLeft?: number;
  hasGmCredentials?: boolean;
  enrolledVehicles?: string[];
  vehicles: Vehicle[];
}

interface AppStore {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  licenseExpired: boolean;
  setToken: (t: string | null) => void;
  setUser: (u: User | null) => void;
  setLoading: (v: boolean) => void;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

function computeLicenseExpired(user: User | null): boolean {
  if (!user) {
    return false;
  }
  if (user.daysLeft !== undefined && user.daysLeft <= 0) {
    return true;
  }
  if (user.licenseExpiresAt) {
    return new Date(user.licenseExpiresAt) < new Date();
  }
  return false;
}

export const useStore = create<AppStore>((set, get) => ({
  token: null,
  user: null,
  isLoading: false,
  licenseExpired: false,

  setToken: (t: string | null) => {
    set({ token: t });
    if (t !== null) {
      AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {});
    }
  },

  setUser: (u: User | null) => {
    set({
      user: u,
      licenseExpired: computeLicenseExpired(u),
    });
  },

  setLoading: (v: boolean) => {
    set({ isLoading: v });
  },

  logout: async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors on logout
    }
    set({
      token: null,
      user: null,
      licenseExpired: false,
      isLoading: false,
    });
  },

  loadFromStorage: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        set({ token: stored });
      }
    } catch {
      // ignore storage read errors
    }
  },
}));
