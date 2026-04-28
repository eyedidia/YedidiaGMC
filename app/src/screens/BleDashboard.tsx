import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { PermissionsAndroid } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BleEngine, BleStatus, VehicleStatus, BLE_COMMANDS } from '../services/bleEngine';
import { loadPrivateKey } from '../services/gmCrypto';
import { useStore } from '../store';

const COLORS = {
  background: '#0A0E1A',
  card: '#111827',
  accent: '#E31837',
  text: '#F0F4F8',
  subtext: '#9CA3AF',
  border: '#374151',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',
};

const STATUS_LABELS: Record<BleStatus, string> = {
  idle: 'מנותק',
  scanning: 'סורק...',
  connecting: 'מתחבר...',
  authenticating: 'מאמת...',
  ready: 'מחובר ✓',
  error: 'שגיאה',
  disconnected: 'מנותק',
};

const STATUS_COLORS: Record<BleStatus, string> = {
  idle: COLORS.subtext,
  scanning: COLORS.info,
  connecting: COLORS.warning,
  authenticating: COLORS.warning,
  ready: COLORS.success,
  error: COLORS.accent,
  disconnected: COLORS.subtext,
};

interface CommandButton {
  label: string;
  icon: string;
  command: number[];
  color?: string;
}

const COMMAND_BUTTONS: CommandButton[] = [
  { label: 'נעל', icon: '🔒', command: BLE_COMMANDS.LOCK },
  { label: 'פתח', icon: '🔓', command: BLE_COMMANDS.UNLOCK },
  { label: 'פתח נהג', icon: '🚗', command: BLE_COMMANDS.UNLOCK_DRIVER },
  { label: 'הפעל', icon: '🟢', command: BLE_COMMANDS.START, color: COLORS.success },
  { label: 'כבה', icon: '🔴', command: BLE_COMMANDS.STOP, color: COLORS.accent },
  { label: 'תא מטען', icon: '🪝', command: BLE_COMMANDS.TRUNK },
  { label: 'חלונות אוויר', icon: '🌬️', command: BLE_COMMANDS.WINDOWS_VENT },
  { label: 'סגור חלונות', icon: '🪟', command: BLE_COMMANDS.WINDOWS_CLOSE },
  { label: 'צפצף', icon: '📣', command: BLE_COMMANDS.HORN },
];

export default function BleDashboard(): React.JSX.Element {
  const [bleStatus, setBleStatus] = useState<BleStatus>('idle');
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus | null>(null);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);
  const engineRef = useRef<BleEngine | null>(null);
  const navigation = useNavigation();
  const user = useStore(s => s.user);

  const selectedVehicle = user?.vehicles?.[0] ?? null;

  const initEngine = useCallback(() => {
    const engine = new BleEngine({
      onStatusChange: status => setBleStatus(status),
      onVehicleStatus: status => setVehicleStatus(status),
      onError: err => Alert.alert('שגיאת BLE', err),
    });
    engine.initialize().catch(() => {});
    engineRef.current = engine;
  }, []);

  useEffect(() => {
    initEngine();
    return () => {
      engineRef.current?.cleanup();
      engineRef.current = null;
    };
  }, [initEngine]);

  const requestBlePermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return true;
    }
    try {
      if (Platform.Version >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return (
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
        );
      } else {
        const r = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return r === 'granted';
      }
    } catch {
      return false;
    }
  };

  const handleConnect = async () => {
    if (!selectedVehicle) {
      Alert.alert(
        'אין רכב',
        'לא נמצא רכב משויך לחשבון. נא לרשום רכב תחילה.',
        [
          { text: 'בטל', style: 'cancel' },
          {
            text: 'רשום רכב',
            onPress: () => (navigation as any).navigate('Enrollment'),
          },
        ],
      );
      return;
    }

    const hasPerms = await requestBlePermissions();
    if (!hasPerms) {
      Alert.alert('שגיאה', 'הרשאות Bluetooth נדחו');
      return;
    }

    const vin = selectedVehicle.vin;
    const privateKey = await loadPrivateKey(vin);
    if (!privateKey) {
      Alert.alert(
        'אין מפתח',
        'לא נמצא מפתח דיגיטלי לרכב זה. נא לרשום את הרכב תחילה.',
        [
          { text: 'בטל', style: 'cancel' },
          {
            text: 'רשום',
            onPress: () => (navigation as any).navigate('Enrollment'),
          },
        ],
      );
      return;
    }

    // keyId placeholder — in real flow it's stored alongside the private key
    const keyId = '00000000';

    try {
      await engineRef.current?.connect(vin, keyId, privateKey);
    } catch (err) {
      Alert.alert('שגיאה', String(err));
    }
  };

  const handleDisconnect = async () => {
    await engineRef.current?.disconnect();
    setVehicleStatus(null);
  };

  const handleCommand = async (btn: CommandButton) => {
    if (bleStatus !== 'ready') {
      Alert.alert('לא מחובר', 'נא להתחבר לרכב תחילה');
      return;
    }
    setCommandLoading(btn.label);
    try {
      await engineRef.current?.sendCommand(btn.command);
    } catch (err) {
      Alert.alert('שגיאה', String(err));
    } finally {
      setCommandLoading(null);
    }
  };

  const isConnecting = ['scanning', 'connecting', 'authenticating'].includes(bleStatus);
  const isReady = bleStatus === 'ready';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>שליטה</Text>
        {selectedVehicle && (
          <Text style={styles.vehicleName}>
            {selectedVehicle.nickname ?? selectedVehicle.vin}
          </Text>
        )}
      </View>

      {/* Status card */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>סטטוס BLE</Text>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[bleStatus] + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[bleStatus] }]} />
            <Text style={[styles.statusText, { color: STATUS_COLORS[bleStatus] }]}>
              {STATUS_LABELS[bleStatus]}
            </Text>
          </View>
        </View>

        {vehicleStatus && (
          <View style={styles.vehicleStatusGrid}>
            <StatusPill label="נעול" active={vehicleStatus.isLocked} icon="🔒" />
            <StatusPill label="פועל" active={vehicleStatus.isRunning} icon="🟢" />
            <StatusPill label="תא מטען" active={vehicleStatus.trunkOpen} icon="🪝" alertWhenActive />
            <StatusPill label="דלת פתוחה" active={vehicleStatus.doorOpen} icon="🚪" alertWhenActive />
            <StatusPill label="סוללה חלשה" active={vehicleStatus.batteryLow} icon="🔋" alertWhenActive />
            <StatusPill label="טעינה" active={vehicleStatus.charging} icon="⚡" />
          </View>
        )}

        {/* Connect / Disconnect */}
        {!isReady && !isConnecting && (
          <TouchableOpacity style={styles.connectButton} onPress={handleConnect}>
            <Text style={styles.connectButtonText}>📡 התחבר לרכב</Text>
          </TouchableOpacity>
        )}
        {isConnecting && (
          <View style={styles.connectingRow}>
            <ActivityIndicator color={COLORS.accent} size="small" />
            <Text style={styles.connectingText}>{STATUS_LABELS[bleStatus]}</Text>
          </View>
        )}
        {isReady && (
          <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
            <Text style={styles.disconnectButtonText}>⛔ נתק</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Command grid */}
      <Text style={styles.sectionTitle}>פקודות</Text>
      <View style={styles.commandGrid}>
        {COMMAND_BUTTONS.map(btn => (
          <TouchableOpacity
            key={btn.label}
            style={[
              styles.commandButton,
              !isReady && styles.commandButtonDisabled,
            ]}
            onPress={() => handleCommand(btn)}
            disabled={!isReady || commandLoading !== null}>
            {commandLoading === btn.label ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.commandIcon}>{btn.icon}</Text>
                <Text
                  style={[
                    styles.commandLabel,
                    btn.color ? { color: btn.color } : null,
                  ]}>
                  {btn.label}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* No vehicle enrolled hint */}
      {!selectedVehicle && (
        <View style={styles.enrollHint}>
          <Text style={styles.enrollHintText}>
            לא נמצא רכב משויך. עבור להגדרות כדי לרשום רכב.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── StatusPill ───────────────────────────────────────────────────────────────

interface StatusPillProps {
  label: string;
  active: boolean;
  icon: string;
  alertWhenActive?: boolean;
}

function StatusPill({ label, active, icon, alertWhenActive }: StatusPillProps) {
  const activeColor = alertWhenActive ? COLORS.warning : COLORS.success;
  const color = active ? activeColor : COLORS.subtext;
  return (
    <View style={[pillStyles.pill, { borderColor: active ? color + '66' : COLORS.border }]}>
      <Text style={pillStyles.icon}>{icon}</Text>
      <Text style={[pillStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: '30%',
    flex: 1,
    margin: 4,
  },
  icon: { fontSize: 20, marginBottom: 2 },
  label: { fontSize: 11, fontWeight: '600' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 16 },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
  },
  vehicleName: {
    fontSize: 14,
    color: COLORS.subtext,
    marginTop: 2,
  },
  statusCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: { color: COLORS.subtext, fontSize: 14 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: { fontSize: 13, fontWeight: '600' },
  vehicleStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 8,
    marginHorizontal: -4,
  },
  connectButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  connectButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  connectingText: { color: COLORS.subtext, fontSize: 14 },
  disconnectButton: {
    backgroundColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  disconnectButtonText: { color: COLORS.subtext, fontWeight: '600', fontSize: 14 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  commandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  commandButton: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '30%',
    margin: '1.5%',
    minHeight: 72,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  commandButtonDisabled: {
    opacity: 0.4,
  },
  commandIcon: { fontSize: 24, marginBottom: 4 },
  commandLabel: { color: COLORS.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  enrollHint: {
    marginTop: 20,
    padding: 16,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  enrollHintText: { color: COLORS.subtext, textAlign: 'center', fontSize: 14 },
});
