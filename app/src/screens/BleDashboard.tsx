import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { BleEngine, BleStatus, VehicleStatus, BLE_COMMANDS } from '../services/bleEngine';
import * as gmCrypto from '../services/gmCrypto';
import { useStore } from '../store';

// ─── Design System ────────────────────────────────────────────────────────────

const COLORS = {
  background: '#0A0E1A',
  card: '#111827',
  cardBorder: '#1A2535',
  accent: '#E31837',
  accentGlow: 'rgba(227, 24, 55, 0.3)',
  green: '#22C55E',
  orange: '#F59E0B',
  blue: '#3B82F6',
  gold: '#C8A951',
  textPrimary: '#F0F4F8',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7A8D',
  inputBg: '#0D1420',
};

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<BleStatus, string> = {
  idle: 'מנותק',
  scanning: 'סורק',
  connecting: 'מתחבר',
  authenticating: 'מאמת',
  ready: 'מחובר',
  error: 'שגיאה',
  disconnected: 'מנותק',
};

const STATUS_COLOR: Record<BleStatus, string> = {
  idle: COLORS.textMuted,
  scanning: COLORS.orange,
  connecting: COLORS.orange,
  authenticating: COLORS.orange,
  ready: COLORS.green,
  error: COLORS.accent,
  disconnected: COLORS.textMuted,
};

// ─── BLE permissions ──────────────────────────────────────────────────────────

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (Platform.Version >= 31) {
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return (
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
      );
    }
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return r === 'granted';
  } catch {
    return false;
  }
}

// ─── Pulsing dot ──────────────────────────────────────────────────────────────

const PulsingDot: React.FC<{ color: string }> = ({ color }) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.5, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale]);

  return (
    <Animated.View
      style={[
        pulsingDotStyles.dot,
        { backgroundColor: color, transform: [{ scale }] },
      ]}
    />
  );
};

const pulsingDotStyles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
});

// ─── Command definitions ──────────────────────────────────────────────────────

interface CmdDef {
  key: string;
  label: string;
  icon: string;
  command: number[];
  fullWidth?: boolean;
}

const COMMANDS: CmdDef[] = [
  { key: 'lock',          label: 'נעל',          icon: '🔒', command: BLE_COMMANDS.LOCK },
  { key: 'unlock',        label: 'פתח',          icon: '🔓', command: BLE_COMMANDS.UNLOCK },
  { key: 'start',         label: 'הנע מנוע',     icon: '🔑', command: BLE_COMMANDS.START },
  { key: 'stop',          label: 'עצור מנוע',    icon: '⛔', command: BLE_COMMANDS.STOP },
  { key: 'trunk',         label: 'פתח מטען',     icon: '📦', command: BLE_COMMANDS.TRUNK },
  { key: 'unlock_driver', label: 'פתח דלת נהג',  icon: '🚪', command: BLE_COMMANDS.UNLOCK_DRIVER },
  { key: 'windows_vent',  label: 'פתח חלונות',   icon: '🪟', command: BLE_COMMANDS.WINDOWS_VENT },
  { key: 'windows_close', label: 'סגור חלונות',  icon: '❎', command: BLE_COMMANDS.WINDOWS_CLOSE },
  { key: 'horn',          label: 'צופר + אורות', icon: '📯', command: BLE_COMMANDS.HORN, fullWidth: true },
];

// ─── StatusCell ───────────────────────────────────────────────────────────────

const StatusCell: React.FC<{ icon: string; label: string; color: string }> = ({ icon, label, color }) => (
  <View style={statusCellStyles.cell}>
    <Text style={statusCellStyles.icon}>{icon}</Text>
    <Text style={[statusCellStyles.label, { color }]}>{label}</Text>
  </View>
);

const statusCellStyles = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', paddingVertical: 8, minWidth: '25%' },
  icon: { fontSize: 22, marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
});

// ─── CmdButton ────────────────────────────────────────────────────────────────

interface CmdButtonProps {
  cmd: CmdDef;
  enabled: boolean;
  loading: boolean;
  onPress: () => void;
  fullWidth?: boolean;
}

const CmdButton: React.FC<CmdButtonProps> = ({ cmd, enabled, loading, onPress, fullWidth }) => (
  <TouchableOpacity
    style={[
      cmdBtnStyles.btn,
      fullWidth && cmdBtnStyles.fullWidth,
      !enabled && cmdBtnStyles.disabled,
    ]}
    onPress={onPress}
    disabled={!enabled || loading}
    activeOpacity={0.75}>
    {loading ? (
      <ActivityIndicator color={COLORS.textPrimary} size="small" />
    ) : (
      <>
        <Text style={cmdBtnStyles.icon}>{cmd.icon}</Text>
        <Text style={cmdBtnStyles.label}>{cmd.label}</Text>
      </>
    )}
  </TouchableOpacity>
);

const cmdBtnStyles = StyleSheet.create({
  btn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 10,
    minHeight: 80,
  },
  fullWidth: {
    flex: 0,
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 16,
  },
  disabled: { opacity: 0.35 },
  icon: { fontSize: 26, marginBottom: 6 },
  label: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' },
});

// ─── BleDashboard ─────────────────────────────────────────────────────────────

interface Props {
  navigation: any;
}

const BleDashboard: React.FC<Props> = ({ navigation }) => {
  const user = useStore(s => s.user);
  const vehicle = user?.vehicles?.[0] ?? null;
  const daysLeft = user?.daysLeft;

  const [bleStatus, setBleStatus] = useState<BleStatus>('idle');
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus | null>(null);
  const [rssi, setRssi] = useState<number | null>(null);
  const [loadingCmd, setLoadingCmd] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [noKeyPrompt, setNoKeyPrompt] = useState(false);

  const engineRef = useRef<BleEngine | null>(null);

  const initEngine = useCallback(() => {
    const eng = new BleEngine({
      onStatusChange: (s) => setBleStatus(s),
      onVehicleStatus: (vs) => setVehicleStatus(vs),
      onRssi: (r) => setRssi(r),
      onError: (msg) => {
        setBleStatus('error');
        console.warn('BLE error:', msg);
      },
    });
    eng.initialize().catch(() => {});
    engineRef.current = eng;
  }, []);

  useEffect(() => {
    initEngine();
    return () => {
      engineRef.current?.cleanup();
      engineRef.current = null;
    };
  }, [initEngine]);

  const handleConnect = async () => {
    if (!vehicle) return;
    setConnectLoading(true);
    try {
      const hasPerms = await requestBlePermissions();
      if (!hasPerms) {
        setBleStatus('error');
        setConnectLoading(false);
        return;
      }
      const privateKey = await gmCrypto.loadPrivateKey(vehicle.vin);
      if (!privateKey) {
        setNoKeyPrompt(true);
        setConnectLoading(false);
        return;
      }
      setNoKeyPrompt(false);
      const keyId = '00000000';
      await engineRef.current?.connect(vehicle.vin, keyId, privateKey);
    } catch {
      setBleStatus('error');
    } finally {
      setConnectLoading(false);
    }
  };

  const handleDisconnect = async () => {
    await engineRef.current?.disconnect();
    setVehicleStatus(null);
    setRssi(null);
  };

  const handleCmd = async (cmd: CmdDef) => {
    Vibration.vibrate(40);
    setLoadingCmd(cmd.key);
    try {
      await engineRef.current?.sendCommand(cmd.command);
      Vibration.vibrate([0, 50, 50, 50]);
    } catch {
      // BleEngine surfaces errors via onError callback
    } finally {
      setLoadingCmd(null);
    }
  };

  const isConnected = bleStatus === 'ready';
  const isAnimating =
    bleStatus === 'scanning' ||
    bleStatus === 'connecting' ||
    bleStatus === 'authenticating';
  const statusColor = STATUS_COLOR[bleStatus];
  const daysLeftWarn = daysLeft !== undefined && daysLeft > 0 && daysLeft < 30;

  const pairedCmds = COMMANDS.filter(c => !c.fullWidth);
  const fullWidthCmds = COMMANDS.filter(c => c.fullWidth);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.root} contentContainerStyle={styles.scrollContent}>

        {/* License warning banner */}
        {daysLeftWarn && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              {'⚠️ הרישיון פג בעוד ' + String(daysLeft) + ' ימים — פנה לידידיה'}
            </Text>
          </View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.vehicleName}>
              {vehicle?.nickname ?? vehicle?.vin ?? 'אין רכב'}
            </Text>
            {vehicle?.vin ? (
              <Text style={styles.vehicleVin} numberOfLines={1}>
                {vehicle.vin}
              </Text>
            ) : null}
            <Text style={styles.userName}>{user?.name ?? ''}</Text>
          </View>
          <TouchableOpacity
            style={styles.enrollBtn}
            onPress={() => navigation.navigate('Enrollment')}
            activeOpacity={0.8}>
            <Text style={styles.enrollBtnText}>🔑</Text>
          </TouchableOpacity>
        </View>

        {/* Connection status bar */}
        <View style={[styles.statusBar, { borderColor: statusColor + '44' }]}>
          <View style={styles.statusLeft}>
            {isAnimating ? (
              <PulsingDot color={statusColor} />
            ) : (
              <View style={[styles.staticDot, { backgroundColor: statusColor }]} />
            )}
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABEL[bleStatus]}
            </Text>
          </View>
          {isConnected && rssi !== null && (
            <Text style={styles.rssiText}>{'📶 ' + String(rssi) + ' dBm'}</Text>
          )}
        </View>

        {/* Connect / Disconnect button */}
        {!isConnected ? (
          <TouchableOpacity
            style={[
              styles.connectBtn,
              (connectLoading || isAnimating) && styles.btnDisabled,
            ]}
            onPress={handleConnect}
            disabled={connectLoading || isAnimating}
            activeOpacity={0.85}>
            {connectLoading || isAnimating ? (
              <ActivityIndicator color={COLORS.textPrimary} />
            ) : (
              <Text style={styles.connectBtnText}>🔗 התחבר לרכב (BLE)</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={handleDisconnect}
            activeOpacity={0.85}>
            <Text style={styles.disconnectBtnText}>✕ נתק</Text>
          </TouchableOpacity>
        )}

        {/* No key enrollment prompt */}
        {noKeyPrompt && (
          <View style={styles.enrollPrompt}>
            <Text style={styles.enrollPromptText}>
              לא נמצא מפתח דיגיטלי לרכב זה. נדרש Enrollment חד-פעמי.
            </Text>
            <TouchableOpacity
              style={styles.enrollPromptBtn}
              onPress={() => navigation.navigate('Enrollment')}
              activeOpacity={0.85}>
              <Text style={styles.enrollPromptBtnText}>עבור ל-Enrollment</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Vehicle status card */}
        {isConnected && vehicleStatus && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>סטטוס רכב</Text>
            <View style={styles.statusGrid}>
              <StatusCell
                icon={vehicleStatus.isLocked ? '🔒' : '🔓'}
                label={vehicleStatus.isLocked ? 'נעול' : 'פתוח'}
                color={vehicleStatus.isLocked ? COLORS.green : COLORS.orange}
              />
              <StatusCell
                icon={vehicleStatus.isRunning ? '▶️' : '🚗'}
                label={vehicleStatus.isRunning ? 'פועל' : 'כבוי'}
                color={vehicleStatus.isRunning ? COLORS.green : COLORS.textMuted}
              />
              <StatusCell
                icon={vehicleStatus.doorOpen ? '🚪' : '🚘'}
                label={vehicleStatus.doorOpen ? 'דלתות פתוחות' : 'דלתות סגורות'}
                color={vehicleStatus.doorOpen ? COLORS.orange : COLORS.textMuted}
              />
              {vehicleStatus.charging !== undefined && (
                <StatusCell
                  icon={
                    vehicleStatus.charging
                      ? '⚡'
                      : vehicleStatus.chargingConnected
                      ? '🔌'
                      : '🔋'
                  }
                  label={
                    vehicleStatus.charging
                      ? 'טוען'
                      : vehicleStatus.chargingConnected
                      ? 'מחובר'
                      : 'לא מחובר'
                  }
                  color={vehicleStatus.charging ? COLORS.green : COLORS.textMuted}
                />
              )}
            </View>
          </View>
        )}

        {/* Commands grid */}
        <Text style={styles.sectionTitle}>פקודות</Text>
        <View style={styles.commandGrid}>
          {pairedCmds.map((cmd, idx) => {
            if (idx % 2 !== 0) return null;
            const next = pairedCmds[idx + 1];
            return (
              <View key={cmd.key} style={styles.cmdRow}>
                <CmdButton
                  cmd={cmd}
                  enabled={isConnected}
                  loading={loadingCmd === cmd.key}
                  onPress={() => handleCmd(cmd)}
                />
                {next ? (
                  <CmdButton
                    cmd={next}
                    enabled={isConnected}
                    loading={loadingCmd === next.key}
                    onPress={() => handleCmd(next)}
                  />
                ) : (
                  <View style={styles.cmdPlaceholder} />
                )}
              </View>
            );
          })}
          {fullWidthCmds.map(cmd => (
            <CmdButton
              key={cmd.key}
              cmd={cmd}
              enabled={isConnected}
              loading={loadingCmd === cmd.key}
              onPress={() => handleCmd(cmd)}
              fullWidth
            />
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

export default BleDashboard;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  root: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  warningBanner: {
    backgroundColor: COLORS.orange,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  warningText: { color: '#000', fontSize: 13, fontWeight: '700', textAlign: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: { flex: 1 },
  vehicleName: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
  vehicleVin: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    letterSpacing: 1,
  },
  userName: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  enrollBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  enrollBtnText: { fontSize: 22 },

  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staticDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, fontWeight: '700' },
  rssiText: { color: COLORS.textSecondary, fontSize: 13 },

  connectBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  connectBtnText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  disconnectBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  disconnectBtnText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },

  enrollPrompt: {
    backgroundColor: 'rgba(227,24,55,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(227,24,55,0.25)',
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  enrollPromptText: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'right' },
  enrollPromptBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  enrollPromptBtnText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 14,
    marginBottom: 20,
  },
  cardTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'right',
  },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap' },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
    textAlign: 'right',
  },
  commandGrid: { gap: 10 },
  cmdRow: { flexDirection: 'row', gap: 10 },
  cmdPlaceholder: { flex: 1 },
});
