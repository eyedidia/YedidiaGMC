import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as gmCrypto from '../services/gmCrypto';
import { authVerifyGM, authBleEnroll } from '../services/api';
import { BleEngine } from '../services/bleEngine';
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

// ─── Phase type ───────────────────────────────────────────────────────────────

type Phase = 1 | 2 | 3 | 4;

// ─── Enrollment log step ──────────────────────────────────────────────────────

type StepState = 'pending' | 'running' | 'done' | 'error';

interface LogStep {
  key: string;
  label: string;
  doneLabel: string;
  state: StepState;
}

const INITIAL_LOG_STEPS: LogStep[] = [
  { key: 'verify',  label: '🔐 מאמת פרטי myGMC...',         doneLabel: '✅ פרטי myGMC אומתו',        state: 'pending' },
  { key: 'keygen',  label: '🔑 יוצר מפתח הצפנה...',         doneLabel: '✅ מפתח נוצר',               state: 'pending' },
  { key: 'register',label: '📡 רושם מפתח ב-GM servers...', doneLabel: '✅ מפתח נרשם בשרת',           state: 'pending' },
  { key: 'store',   label: '💾 שומר מפתח פרטי...',          doneLabel: '✅ מפתח נשמר במכשיר',         state: 'pending' },
  { key: 'server',  label: '📲 שולח לשרת YedidiaGMC...',   doneLabel: '✅ Enrollment נרשם',          state: 'pending' },
];

// ─── BLE permissions ──────────────────────────────────────────────────────────

async function requestBlePerms(): Promise<boolean> {
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
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return r === 'granted';
  } catch {
    return false;
  }
}

// ─── Phase 1 — GM Credentials ────────────────────────────────────────────────

interface Phase1Props {
  onStart: (gmEmail: string, gmPass: string) => void;
}

const Phase1: React.FC<Phase1Props> = ({ onStart }) => {
  const [gmEmail, setGmEmail] = useState('');
  const [gmPass, setGmPass] = useState('');

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled">

      <View style={styles.phaseHeader}>
        <Text style={styles.phaseTitle}>Enrollment — Digital Key</Text>
        <Text style={styles.phaseSubtitle}>
          שלב חד-פעמי — מאפשר שליטה ב-Bluetooth ללא אינטרנט
        </Text>
      </View>

      <View style={styles.featureList}>
        {['✓ נעילה/פתיחה', '✓ הנעת מנוע', '✓ פתיחת מטען', '✓ צופר ואורות'].map(f => (
          <Text key={f} style={styles.featureItem}>{f}</Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>אימייל myGMC</Text>
        <TextInput
          style={styles.input}
          value={gmEmail}
          onChangeText={setGmEmail}
          placeholder="user@gm.com"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={styles.cardLabel}>סיסמת myGMC</Text>
        <TextInput
          style={styles.input}
          value={gmPass}
          onChangeText={setGmPass}
          placeholder="••••••••"
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry
        />
        <Text style={styles.noteSmall}>🔒 הסיסמה לא נשמרת לאחר ה-Enrollment</Text>
        <TouchableOpacity
          style={[styles.btnPrimary, (!gmEmail.trim() || !gmPass.trim()) && styles.btnDisabled]}
          onPress={() => onStart(gmEmail.trim(), gmPass)}
          disabled={!gmEmail.trim() || !gmPass.trim()}
          activeOpacity={0.85}>
          <Text style={styles.btnPrimaryText}>התחל Enrollment</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

// ─── Phase 2 — Live log ───────────────────────────────────────────────────────

interface Phase2Props {
  steps: LogStep[];
  error: string;
  onRetry: () => void;
}

const Phase2: React.FC<Phase2Props> = ({ steps, error, onRetry }) => {
  const allDone = steps.every(s => s.state === 'done');
  const hasError = !!error || steps.some(s => s.state === 'error');

  return (
    <View style={styles.scrollContent}>
      <Text style={styles.phaseTitle}>מבצע Enrollment...</Text>

      <View style={styles.logCard}>
        {steps.map(s => (
          <View key={s.key} style={styles.logRow}>
            {s.state === 'running' ? (
              <ActivityIndicator size="small" color={COLORS.orange} style={styles.logSpinner} />
            ) : (
              <View style={styles.logSpinner} />
            )}
            <Text
              style={[
                styles.logText,
                s.state === 'done' && styles.logTextDone,
                s.state === 'error' && styles.logTextError,
                s.state === 'pending' && styles.logTextPending,
              ]}>
              {s.state === 'done' ? s.doneLabel : s.state === 'error' ? `❌ ${s.label}` : s.label}
            </Text>
          </View>
        ))}
        {allDone && !hasError && (
          <Text style={styles.logDoneAll}>🎉 Enrollment הושלם!</Text>
        )}
        {hasError && (
          <>
            <Text style={styles.logError}>{error || 'שגיאה בתהליך Enrollment'}</Text>
            <TouchableOpacity style={styles.btnSecondary} onPress={onRetry} activeOpacity={0.85}>
              <Text style={styles.btnSecondaryText}>נסה שוב</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

// ─── Phase 3 — BLE Test ───────────────────────────────────────────────────────

interface Phase3Props {
  vin: string;
  onSkip: () => void;
  onDone: () => void;
}

const Phase3: React.FC<Phase3Props> = ({ vin, onSkip, onDone }) => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<'idle' | 'found' | 'notfound'>('idle');
  const engineRef = useRef<BleEngine | null>(null);
  // Use a ref to avoid stale closure in timeout
  const resultRef = useRef<'idle' | 'found' | 'notfound'>('idle');

  const updateResult = (r: 'idle' | 'found' | 'notfound') => {
    resultRef.current = r;
    setResult(r);
  };

  const handleTest = async () => {
    setTesting(true);
    updateResult('idle');
    const hasPerms = await requestBlePerms();
    if (!hasPerms) {
      updateResult('notfound');
      setTesting(false);
      return;
    }
    try {
      const eng = new BleEngine({
        onStatusChange: (s) => {
          if (s === 'ready') {
            eng.disconnect().catch(() => {});
            updateResult('found');
            setTesting(false);
            engineRef.current = null;
          }
        },
        onVehicleStatus: () => {},
        onError: () => {
          updateResult('notfound');
          setTesting(false);
          engineRef.current = null;
        },
      });
      eng.initialize().catch(() => {});
      engineRef.current = eng;
      // Quick scan — timeout after 10s
      const timeout = setTimeout(() => {
        if (resultRef.current === 'idle') {
          eng.cleanup();
          updateResult('notfound');
          setTesting(false);
        }
      }, 10000);
      await eng.connect(vin, '00000000', '').catch(() => {
        clearTimeout(timeout);
        updateResult('notfound');
        setTesting(false);
      });
    } catch {
      updateResult('notfound');
      setTesting(false);
    }
  };

  useEffect(() => {
    return () => {
      engineRef.current?.cleanup();
    };
  }, []);

  return (
    <View style={styles.scrollContent}>
      <Text style={styles.phaseTitle}>בדיקת חיבור BLE</Text>
      <Text style={styles.phaseSubtitle}>
        ניתן לדלג ולבדוק מאוחר יותר מהמסך הראשי.
      </Text>

      {result === 'found' && (
        <View style={styles.successBox}>
          <Text style={styles.successText}>✅ הרכב נמצא! החיבור תקין.</Text>
        </View>
      )}
      {result === 'notfound' && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>❌ הרכב לא נמצא. בדוק שהרכב קרוב ו-Bluetooth פעיל.</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.btnPrimary, testing && styles.btnDisabled]}
        onPress={result === 'found' ? onDone : handleTest}
        disabled={testing}
        activeOpacity={0.85}>
        {testing ? (
          <ActivityIndicator color={COLORS.textPrimary} />
        ) : result === 'found' ? (
          <Text style={styles.btnPrimaryText}>המשך ←</Text>
        ) : (
          <Text style={styles.btnPrimaryText}>בדוק חיבור BLE לרכב</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnBack} onPress={onSkip} activeOpacity={0.8}>
        <Text style={styles.btnBackText}>דלג — אבדוק מאוחר יותר</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Phase 4 — Success ────────────────────────────────────────────────────────

const Phase4: React.FC<{ onFinish: () => void }> = ({ onFinish }) => (
  <View style={[styles.scrollContent, { alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
    <Text style={styles.bigIcon}>✅</Text>
    <Text style={styles.successTitle}>Enrollment הושלם בהצלחה!</Text>
    <Text style={styles.successBody}>
      המפתח הדיגיטלי נוצר ונשמר. כעת תוכל לשלוט ברכב ישירות מהטלפון.
    </Text>
    <TouchableOpacity style={styles.btnPrimary} onPress={onFinish} activeOpacity={0.85}>
      <Text style={styles.btnPrimaryText}>לשליטה ברכב →</Text>
    </TouchableOpacity>
  </View>
);

// ─── EnrollmentScreen ─────────────────────────────────────────────────────────

interface Props { navigation: any; }

const EnrollmentScreen: React.FC<Props> = ({ navigation }) => {
  const user = useStore(s => s.user);
  const setUser = useStore(s => s.setUser);

  const vehicle = user?.vehicles?.[0] ?? null;
  const vin = vehicle?.vin ?? '';

  const [phase, setPhase] = useState<Phase>(1);
  const [logSteps, setLogSteps] = useState<LogStep[]>(INITIAL_LOG_STEPS);
  const [enrollError, setEnrollError] = useState('');
  const [gmEmail, setGmEmail] = useState('');
  const [gmPass, setGmPass] = useState('');

  const updateStep = (key: string, state: StepState) => {
    setLogSteps(prev =>
      prev.map(s => (s.key === key ? { ...s, state } : s)),
    );
  };

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  const runEnrollment = async (email: string, pass: string) => {
    setGmEmail(email);
    setGmPass(pass);
    setEnrollError('');
    setLogSteps(INITIAL_LOG_STEPS.map(s => ({ ...s, state: 'pending' })));
    setPhase(2);

    try {
      // Step 1: verify GM creds
      updateStep('verify', 'running');
      await sleep(800);
      const verifyRes = await authVerifyGM(email, pass);
      if (!verifyRes.valid) throw new Error(verifyRes.message || 'פרטי myGMC שגויים');
      updateStep('verify', 'done');

      // Step 2: generate key pair
      await sleep(800);
      updateStep('keygen', 'running');
      const keyPair = await gmCrypto.generateKeyPair();
      const keyId = await gmCrypto.generateKeyId();
      updateStep('keygen', 'done');

      // Step 3: (conceptually registering on GM servers via our backend)
      await sleep(800);
      updateStep('register', 'running');
      const enrollRes = await authBleEnroll({
        vin,
        publicKeyHex: keyPair.publicKeyHex,
        keyId,
        vehicleNickname: vehicle?.nickname,
      });
      if (!enrollRes.success) throw new Error('Enrollment נכשל בשרת');
      updateStep('register', 'done');

      // Step 4: store private key
      await sleep(800);
      updateStep('store', 'running');
      await gmCrypto.storePrivateKey(vin, keyPair);
      updateStep('store', 'done');

      // Step 5: confirm with YedidiaGMC server (already done in step 3 above; mark done)
      await sleep(800);
      updateStep('server', 'running');
      await sleep(600);
      updateStep('server', 'done');

      // Update store — mark vehicle as enrolled
      if (user) {
        const enrolled = [...(user.enrolledVehicles ?? [])];
        if (!enrolled.includes(vin)) enrolled.push(vin);
        setUser({ ...user, enrolledVehicles: enrolled });
      }

      await sleep(800);
      setPhase(3);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'שגיאה לא ידועה';
      setEnrollError(msg);
      // Mark currently running step as error
      setLogSteps(prev =>
        prev.map(s => (s.state === 'running' ? { ...s, state: 'error' } : s)),
      );
    }
  };

  const handleRetry = () => {
    if (gmEmail && gmPass) {
      runEnrollment(gmEmail, gmPass);
    } else {
      setPhase(1);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {phase === 1 && (
        <Phase1 onStart={runEnrollment} />
      )}
      {phase === 2 && (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <Phase2 steps={logSteps} error={enrollError} onRetry={handleRetry} />
        </ScrollView>
      )}
      {phase === 3 && (
        <Phase3
          vin={vin}
          onSkip={() => setPhase(4)}
          onDone={() => setPhase(4)}
        />
      )}
      {phase === 4 && (
        <Phase4 onFinish={() => navigation.goBack()} />
      )}
    </SafeAreaView>
  );
};

export default EnrollmentScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 20, paddingBottom: 40 },

  phaseHeader: { marginBottom: 20 },
  phaseTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 6, textAlign: 'right' },
  phaseSubtitle: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'right', lineHeight: 20 },

  featureList: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 14,
    gap: 8,
    marginBottom: 20,
  },
  featureItem: { color: COLORS.green, fontSize: 14, fontWeight: '600', textAlign: 'right' },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    gap: 10,
  },
  cardLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 15,
    textAlign: 'right',
  },
  noteSmall: { color: COLORS.textMuted, fontSize: 11, textAlign: 'right' },

  // Log view
  logCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    gap: 12,
    marginTop: 16,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logSpinner: { width: 20, height: 20 },
  logText: { color: COLORS.textSecondary, fontSize: 14, flex: 1, textAlign: 'right' },
  logTextDone: { color: COLORS.green },
  logTextError: { color: COLORS.accent },
  logTextPending: { color: COLORS.textMuted },
  logDoneAll: {
    color: COLORS.green,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
  },
  logError: { color: COLORS.accent, fontSize: 13, textAlign: 'right', marginTop: 4 },

  // Phase 4
  bigIcon: { fontSize: 72, marginBottom: 16, textAlign: 'center' },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  successBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },

  successBox: {
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.30)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  successText: { color: COLORS.green, fontSize: 13, textAlign: 'right' },
  errorBox: {
    backgroundColor: 'rgba(227,24,55,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(227,24,55,0.30)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { color: COLORS.accent, fontSize: 13, textAlign: 'right' },

  btnPrimary: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  btnSecondary: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  btnSecondaryText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  btnBack: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  btnBackText: { color: COLORS.textMuted, fontSize: 14, textDecorationLine: 'underline' },
});
