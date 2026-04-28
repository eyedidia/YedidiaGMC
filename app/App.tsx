import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthScreen from './src/screens/AuthScreen';
import BleDashboard from './src/screens/BleDashboard';
import EnrollmentScreen from './src/screens/EnrollmentScreen';
import LicenseExpiredScreen from './src/screens/LicenseExpiredScreen';
import { useStore } from './src/store';
import { authMe } from './src/services/api';

// ─── Theme ────────────────────────────────────────────────────────────────────

const COLORS = {
  background: '#0A0E1A',
  card: '#111827',
  accent: '#E31837',
  text: '#F0F4F8',
  subtext: '#9CA3AF',
  border: '#374151',
  success: '#10B981',
  warning: '#F59E0B',
};

// ─── Settings Screen (inline) ─────────────────────────────────────────────────

function SettingsScreen(): React.JSX.Element {
  const user = useStore(s => s.user);
  const logout = useStore(s => s.logout);

  const handleLogout = () => {
    Alert.alert('התנתקות', 'האם אתה בטוח שברצונך להתנתק?', [
      { text: 'בטל', style: 'cancel' },
      { text: 'התנתק', style: 'destructive', onPress: () => logout() },
    ]);
  };

  if (!user) {
    return (
      <View style={settingsStyles.container}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const expiryDate = user.licenseExpiresAt
    ? new Date(user.licenseExpiresAt).toLocaleDateString('he-IL')
    : 'לא ידוע';

  const daysLeft = user.daysLeft ?? 0;
  const daysColor =
    daysLeft <= 7
      ? COLORS.accent
      : daysLeft <= 30
      ? COLORS.warning
      : COLORS.success;

  const primaryVehicle = user.vehicles?.[0] ?? null;
  const isEnrolled =
    primaryVehicle &&
    user.enrolledVehicles?.includes(primaryVehicle.vin);

  return (
    <ScrollView
      style={settingsStyles.scroll}
      contentContainerStyle={settingsStyles.container}>
      <Text style={settingsStyles.pageTitle}>הגדרות</Text>

      {/* License info card */}
      <View style={settingsStyles.card}>
        <Text style={settingsStyles.cardTitle}>פרטי רישיון</Text>

        <View style={settingsStyles.row}>
          <Text style={settingsStyles.label}>שם</Text>
          <Text style={settingsStyles.value}>{user.name}</Text>
        </View>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.label}>אימייל</Text>
          <Text style={settingsStyles.value}>{user.email}</Text>
        </View>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.label}>תוקף</Text>
          <Text style={settingsStyles.value}>{expiryDate}</Text>
        </View>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.label}>ימים שנותרו</Text>
          <Text style={[settingsStyles.value, { color: daysColor }]}>
            {daysLeft} ימים
          </Text>
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowLast]}>
          <Text style={settingsStyles.label}>סטטוס</Text>
          <Text
            style={[
              settingsStyles.value,
              { color: user.status === 'active' ? COLORS.success : COLORS.warning },
            ]}>
            {user.status === 'active' ? 'פעיל' : user.status}
          </Text>
        </View>
      </View>

      {/* Vehicle info card */}
      {primaryVehicle ? (
        <View style={settingsStyles.card}>
          <Text style={settingsStyles.cardTitle}>פרטי רכב</Text>

          <View style={settingsStyles.row}>
            <Text style={settingsStyles.label}>VIN</Text>
            <Text style={[settingsStyles.value, settingsStyles.mono]}>
              {primaryVehicle.vin}
            </Text>
          </View>
          {primaryVehicle.nickname && (
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.label}>כינוי</Text>
              <Text style={settingsStyles.value}>{primaryVehicle.nickname}</Text>
            </View>
          )}
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.label}>יצרן</Text>
            <Text style={settingsStyles.value}>
              {primaryVehicle.make}
              {primaryVehicle.model ? ` ${primaryVehicle.model}` : ''}
              {primaryVehicle.year ? ` (${primaryVehicle.year})` : ''}
            </Text>
          </View>
          <View style={[settingsStyles.row, settingsStyles.rowLast]}>
            <Text style={settingsStyles.label}>סטטוס הרשמה</Text>
            <Text
              style={[
                settingsStyles.value,
                { color: isEnrolled ? COLORS.success : COLORS.warning },
              ]}>
              {isEnrolled ? 'רשום ✓' : 'לא רשום'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={settingsStyles.card}>
          <Text style={settingsStyles.noVehicleText}>
            לא נמצא רכב משויך לחשבון זה.
          </Text>
        </View>
      )}

      {/* GM Credentials (read-only) */}
      <View style={settingsStyles.card}>
        <Text style={settingsStyles.cardTitle}>פרטי OnStar / myChevrolet</Text>
        <View style={[settingsStyles.row, settingsStyles.rowLast]}>
          <Text style={settingsStyles.label}>אימייל GM</Text>
          <Text style={settingsStyles.value}>
            {user.hasGmCredentials ? user.email : 'לא מוגדר'}
          </Text>
        </View>
        <Text style={settingsStyles.readOnlyNote}>
          * פרטי GM מנוהלים בשרת ואינם ניתנים לשינוי כאן.
        </Text>
      </View>

      {/* Logout */}
      <TouchableOpacity style={settingsStyles.logoutButton} onPress={handleLogout}>
        <Text style={settingsStyles.logoutButtonText}>התנתק</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Navigator types ──────────────────────────────────────────────────────────

type RootStackParamList = {
  Auth: undefined;
  LicenseExpired: undefined;
  Main: undefined;
  Enrollment: undefined;
};

type MainTabParamList = {
  Control: undefined;
  Settings: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

// ─── Tab Navigator ────────────────────────────────────────────────────────────

function MainTabNavigator(): React.JSX.Element {
  return (
    <MainTab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.card },
        headerTintColor: COLORS.text,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.subtext,
      }}>
      <MainTab.Screen
        name="Control"
        component={BleDashboard}
        options={{
          title: 'שליטה',
          tabBarLabel: 'שליטה',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>🚗</Text>
          ),
        }}
      />
      <MainTab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'הגדרות',
          tabBarLabel: 'הגדרות',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>⚙️</Text>
          ),
        }}
      />
    </MainTab.Navigator>
  );
}

// ─── App (Root) ───────────────────────────────────────────────────────────────

const LICENSE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function App(): React.JSX.Element {
  const token = useStore(s => s.token);
  const user = useStore(s => s.user);
  const licenseExpired = useStore(s => s.licenseExpired);
  const isLoading = useStore(s => s.isLoading);
  const setUser = useStore(s => s.setUser);
  const setLoading = useStore(s => s.setLoading);
  const loadFromStorage = useStore(s => s.loadFromStorage);
  const logout = useStore(s => s.logout);

  const licenseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Boot: load token, validate session ─────────────────────────────────

  useEffect(() => {
    const boot = async () => {
      setLoading(true);
      await loadFromStorage();
      setLoading(false);
    };
    boot();
  }, [loadFromStorage, setLoading]);

  // ─── Validate session whenever token changes ──────────────────────────────

  useEffect(() => {
    if (!token) {
      return;
    }

    const validate = async () => {
      try {
        const me = await authMe();
        setUser(me);
      } catch {
        await logout();
      }
    };

    validate();
  }, [token, setUser, logout]);

  // ─── 24h license re-check ──────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      if (licenseIntervalRef.current) {
        clearInterval(licenseIntervalRef.current);
        licenseIntervalRef.current = null;
      }
      return;
    }

    const checkLicense = async () => {
      try {
        const me = await authMe();
        setUser(me);
      } catch {
        // if 401 the response interceptor handles logout
      }
    };

    licenseIntervalRef.current = setInterval(checkLicense, LICENSE_CHECK_INTERVAL_MS);

    return () => {
      if (licenseIntervalRef.current) {
        clearInterval(licenseIntervalRef.current);
        licenseIntervalRef.current = null;
      }
    };
  }, [token, setUser]);

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={appStyles.splash}>
        <Text style={appStyles.splashIcon}>🚗</Text>
        <Text style={appStyles.splashName}>YedidiaGMC</Text>
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: 20 }} />
      </View>
    );
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  const isLoggedIn = !!token && !!user;

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: COLORS.accent,
            background: COLORS.background,
            card: COLORS.card,
            text: COLORS.text,
            border: COLORS.border,
            notification: COLORS.accent,
          },
        }}>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {!isLoggedIn ? (
            <RootStack.Screen name="Auth" component={AuthScreen} />
          ) : licenseExpired ? (
            <RootStack.Screen
              name="LicenseExpired"
              component={LicenseExpiredScreen}
            />
          ) : (
            <>
              <RootStack.Screen name="Main" component={MainTabNavigator} />
              <RootStack.Screen
                name="Enrollment"
                component={EnrollmentScreen}
                options={{
                  headerShown: true,
                  title: 'רישום רכב',
                  headerStyle: { backgroundColor: COLORS.card },
                  headerTintColor: COLORS.text,
                }}
              />
            </>
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const appStyles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashIcon: { fontSize: 72 },
  splashName: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
  },
});

const settingsStyles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 16, paddingBottom: 32 },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
    marginBottom: 12,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    color: COLORS.subtext,
    fontSize: 13,
  },
  value: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  },
  readOnlyNote: {
    color: COLORS.subtext,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'right',
  },
  noVehicleText: {
    color: COLORS.subtext,
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 8,
  },
  logoutButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
