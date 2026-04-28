import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { OBD2Service, OBD2Data, DTC } from '../services/obd2';

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

// ─── Metric card ──────────────────────────────────────────────────────────────

interface MetricProps {
  icon: string;
  label: string;
  value: string;
  unit: string;
  color?: string;
}

const Metric: React.FC<MetricProps> = ({ icon, label, value, unit, color }) => (
  <View style={metricStyles.cell}>
    <Text style={metricStyles.icon}>{icon}</Text>
    <Text style={[metricStyles.value, color ? { color } : undefined]}>
      {value}
      <Text style={metricStyles.unit}> {unit}</Text>
    </Text>
    <Text style={metricStyles.label}>{label}</Text>
  </View>
);

const metricStyles = StyleSheet.create({
  cell: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    minWidth: '45%',
  },
  icon: { fontSize: 26, marginBottom: 6 },
  value: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  unit: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  label: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
});

// ─── DTC row ──────────────────────────────────────────────────────────────────

const DtcRow: React.FC<{ dtc: DTC }> = ({ dtc }) => (
  <View style={dtcRowStyles.row}>
    <Text style={dtcRowStyles.code}>{dtc.code}</Text>
    <Text style={dtcRowStyles.desc} numberOfLines={2}>
      {dtc.description || 'קוד שגיאה לא מוכר'}
    </Text>
  </View>
);

const dtcRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    gap: 12,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.orange,
    width: 72,
    textAlign: 'center',
  },
  desc: { flex: 1, color: COLORS.textSecondary, fontSize: 13, textAlign: 'right' },
});

// ─── DiagnosticsScreen ────────────────────────────────────────────────────────

const DiagnosticsScreen: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [data, setData] = useState<OBD2Data | null>(null);
  const [dtcs, setDtcs] = useState<DTC[]>([]);
  const [clearingDtcs, setClearingDtcs] = useState(false);
  const [error, setError] = useState('');
  const [serviceRef] = useState<OBD2Service>(() => new OBD2Service());

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError('');
    try {
      await serviceRef.connect();
      setConnected(true);
    } catch (err: any) {
      setError(err?.message ?? 'חיבור ל-OBD2 נכשל');
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [serviceRef]);

  const fetchData = useCallback(async () => {
    if (!connected) return;
    try {
      const liveData = await serviceRef.getLiveData();
      setData(liveData);
      const codes = await serviceRef.getDTCs();
      setDtcs(codes);
    } catch (err: any) {
      setError(err?.message ?? 'שגיאה בקריאת נתונים');
    }
  }, [connected, serviceRef]);

  useEffect(() => {
    if (connected) {
      fetchData();
      const interval = setInterval(fetchData, 3000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [connected, fetchData]);

  useEffect(() => {
    return () => {
      serviceRef.disconnect().catch(() => {});
    };
  }, [serviceRef]);

  const handleClearDtcs = async () => {
    setClearingDtcs(true);
    try {
      await serviceRef.clearDTCs();
      setDtcs([]);
    } catch (err: any) {
      setError(err?.message ?? 'ניקוי קודי שגיאה נכשל');
    } finally {
      setClearingDtcs(false);
    }
  };

  // ─── Not connected view ────────────────────────────────────────────────────

  if (!connected) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.centeredContent}>
          <Text style={styles.pageTitle}>אבחון רכב</Text>
          <View style={styles.disconnectedCard}>
            <Text style={styles.disconnectedIcon}>🔌</Text>
            <Text style={styles.disconnectedTitle}>לא מחובר למתאם OBD2</Text>
            <Text style={styles.disconnectedNote}>
              מחייב מתאם OBD2 Bluetooth (ELM327)
            </Text>
            <View style={styles.instructionList}>
              {[
                'חבר את מתאם ELM327 ליציאת OBD2 (מתחת ללוח המחוונים)',
                'הפעל Bluetooth במכשיר',
                'וודא שהמתאם מופיע בהגדרות ה-Bluetooth',
                'לחץ "התחבר" להמשך',
              ].map((step, i) => (
                <View key={i} style={styles.instructionRow}>
                  <Text style={styles.instructionNum}>{i + 1}</Text>
                  <Text style={styles.instructionText}>{step}</Text>
                </View>
              ))}
            </View>
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.btnPrimary, connecting && styles.btnDisabled]}
              onPress={handleConnect}
              disabled={connecting}
              activeOpacity={0.85}>
              {connecting ? (
                <ActivityIndicator color={COLORS.textPrimary} />
              ) : (
                <Text style={styles.btnPrimaryText}>התחבר למתאם OBD2</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Connected view ────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>אבחון רכב</Text>
          <View style={styles.connectedBadge}>
            <View style={styles.connectedDot} />
            <Text style={styles.connectedText}>מחובר</Text>
          </View>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Live metrics */}
        {data ? (
          <>
            <Text style={styles.sectionTitle}>נתונים בזמן אמת</Text>
            <View style={styles.metricsGrid}>
              <Metric
                icon="⚙️"
                label="סל״ד מנוע"
                value={String(data.rpm ?? '—')}
                unit="RPM"
                color={data.rpm && data.rpm > 3500 ? COLORS.orange : undefined}
              />
              <Metric
                icon="🚗"
                label="מהירות"
                value={String(data.speed ?? '—')}
                unit="קמ״ש"
              />
              <Metric
                icon="🌡️"
                label="טמפ׳ מנוע"
                value={String(data.coolantTemp ?? '—')}
                unit="°C"
                color={
                  data.coolantTemp !== undefined && data.coolantTemp > 105
                    ? COLORS.accent
                    : data.coolantTemp !== undefined && data.coolantTemp > 90
                    ? COLORS.orange
                    : undefined
                }
              />
              <Metric
                icon="⛽"
                label="דלק"
                value={
                  data.fuelLevel !== undefined
                    ? String(Math.round(data.fuelLevel)) + '%'
                    : '—'
                }
                unit=""
                color={
                  data.fuelLevel !== undefined && data.fuelLevel < 15
                    ? COLORS.accent
                    : data.fuelLevel !== undefined && data.fuelLevel < 25
                    ? COLORS.orange
                    : COLORS.green
                }
              />
              <Metric
                icon="🔋"
                label="מתח סוללה"
                value={
                  data.batteryVoltage !== undefined
                    ? String(data.batteryVoltage.toFixed(1))
                    : '—'
                }
                unit="V"
                color={
                  data.batteryVoltage !== undefined && data.batteryVoltage < 12.0
                    ? COLORS.accent
                    : undefined
                }
              />
            </View>
          </>
        ) : (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.accent} size="small" />
            <Text style={styles.loadingText}>טוען נתונים...</Text>
          </View>
        )}

        {/* DTCs */}
        <View style={styles.dtcHeader}>
          <Text style={styles.sectionTitle}>
            {'קודי שגיאה (DTC)' + (dtcs.length > 0 ? ' — ' + String(dtcs.length) : '')}
          </Text>
          {dtcs.length > 0 && (
            <TouchableOpacity
              style={[styles.clearBtn, clearingDtcs && styles.btnDisabled]}
              onPress={handleClearDtcs}
              disabled={clearingDtcs}
              activeOpacity={0.85}>
              {clearingDtcs ? (
                <ActivityIndicator color={COLORS.textPrimary} size="small" />
              ) : (
                <Text style={styles.clearBtnText}>נקה קודי שגיאה</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {dtcs.length === 0 ? (
          <View style={styles.noDtcCard}>
            <Text style={styles.noDtcText}>✅ לא נמצאו קודי שגיאה</Text>
          </View>
        ) : (
          <View style={styles.dtcCard}>
            {dtcs.map(d => (
              <DtcRow key={d.code} dtc={d} />
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

export default DiagnosticsScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centeredContent: { flexGrow: 1, padding: 20, paddingBottom: 40 },

  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 16,
    textAlign: 'right',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green },
  connectedText: { color: COLORS.green, fontSize: 12, fontWeight: '700' },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
    textAlign: 'right',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },

  dtcHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  clearBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  clearBtnText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' },

  dtcCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  noDtcCard: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  noDtcText: { color: COLORS.green, fontSize: 14, fontWeight: '600' },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
    justifyContent: 'center',
  },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },

  // Disconnected view
  disconnectedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
    alignItems: 'center',
  },
  disconnectedIcon: { fontSize: 56, marginBottom: 12 },
  disconnectedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  disconnectedNote: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  instructionList: { width: '100%', gap: 10, marginBottom: 20 },
  instructionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  instructionNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 24,
    flexShrink: 0,
  },
  instructionText: { flex: 1, color: COLORS.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'right' },

  errorBox: {
    backgroundColor: 'rgba(227,24,55,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(227,24,55,0.30)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    width: '100%',
  },
  errorText: { color: COLORS.accent, fontSize: 13, textAlign: 'right' },

  btnPrimary: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});
