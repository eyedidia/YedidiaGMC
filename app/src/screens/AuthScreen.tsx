import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { authLogin, authVerifyGM, authRegister } from '../services/api';
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

// ─── VIN helpers ──────────────────────────────────────────────────────────────

const VIN_YEAR_MAP: Record<string, number> = {
  A: 1980, B: 1981, C: 1982, D: 1983, E: 1984, F: 1985, G: 1986, H: 1987,
  J: 1988, K: 1989, L: 1990, M: 1991, N: 1992, P: 1993, R: 1994, S: 1995,
  T: 1996, V: 1997, W: 1998, X: 1999, Y: 2000,
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005, '6': 2006,
  '7': 2007, '8': 2008, '9': 2009,
  a: 2010, b: 2011, c: 2012, d: 2013, e: 2014, f: 2015, g: 2016, h: 2017,
  j: 2018, k: 2019, l: 2020, m: 2021, n: 2022, p: 2023, r: 2024, s: 2025,
};

function decodeVinYear(vin: string): number | null {
  if (vin.length < 10) return null;
  const code = vin[9];
  return VIN_YEAR_MAP[code] ?? VIN_YEAR_MAP[code.toLowerCase()] ?? null;
}

function decodeVinMake(vin: string): string {
  const wmi = vin.substring(0, 3).toUpperCase();
  if (wmi.startsWith('1GK') || wmi.startsWith('2GK') || wmi.startsWith('1GT') || wmi.startsWith('2GT')) {
    return 'GMC';
  }
  if (wmi.startsWith('1G')) return 'GM';
  return '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

interface StepperProps {
  currentStep: number;
  steps: string[];
}

const Stepper: React.FC<StepperProps> = ({ currentStep, steps }) => (
  <View style={styles.stepperRow}>
    {steps.map((label, idx) => {
      const num = idx + 1;
      const isActive = num === currentStep;
      const isDone = num < currentStep;
      return (
        <React.Fragment key={num}>
          <View style={styles.stepperItem}>
            <View
              style={[
                styles.stepperCircle,
                isActive && styles.stepperCircleActive,
                isDone && styles.stepperCircleDone,
              ]}>
              <Text style={[styles.stepperNum, (isActive || isDone) && styles.stepperNumActive]}>
                {isDone ? '✓' : num}
              </Text>
            </View>
            <Text style={[styles.stepperLabel, isActive && styles.stepperLabelActive]}>
              {label}
            </Text>
          </View>
          {idx < steps.length - 1 && (
            <View style={[styles.stepperLine, idx + 1 < currentStep && styles.stepperLineDone]} />
          )}
        </React.Fragment>
      );
    })}
  </View>
);

// ─── VIN dots ─────────────────────────────────────────────────────────────────

const VinDots: React.FC<{ length: number }> = ({ length }) => (
  <View style={styles.vinDotsRow}>
    {Array.from({ length: 17 }, (_, i) => (
      <View key={i} style={[styles.vinDot, i < length && styles.vinDotFilled]} />
    ))}
  </View>
);

// ─── Shared input field ───────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  maxLength?: number;
  mono?: boolean;
}

const Field: React.FC<FieldProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'none',
  keyboardType = 'default',
  maxLength,
  mono,
}) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, mono && styles.inputMono]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      secureTextEntry={secureTextEntry}
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
      maxLength={maxLength}
    />
  </View>
);

// ─── Error / Success boxes ────────────────────────────────────────────────────

const ErrorBox: React.FC<{ msg: string }> = ({ msg }) =>
  msg ? (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{msg}</Text>
    </View>
  ) : null;

const SuccessBox: React.FC<{ msg: string }> = ({ msg }) =>
  msg ? (
    <View style={styles.successBox}>
      <Text style={styles.successText}>{msg}</Text>
    </View>
  ) : null;

// ─── Login Tab ────────────────────────────────────────────────────────────────

const LoginTab: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const setToken = useStore(s => s.setToken);
  const setUser = useStore(s => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handle = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('נא למלא אימייל וסיסמה');
      return;
    }
    setLoading(true);
    try {
      const res = await authLogin(email.trim(), password);
      setToken(res.token);
      setUser(res.user);
      onSuccess();
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;
      const msg: string = err?.response?.data?.message ?? '';
      if (status === 403) {
        const lc = msg.toLowerCase();
        if (lc.includes('pending') || lc.includes('ממתין')) {
          setError('חשבונך ממתין לאישור ידידיה');
        } else if (lc.includes('suspend') || lc.includes('מושעה')) {
          setError('חשבונך מושעה — פנה לידידיה');
        } else if (lc.includes('reject') || lc.includes('נדחה')) {
          setError('חשבונך נדחה — פנה לידידיה');
        } else {
          setError(msg || 'הגישה נדחתה — פנה לידידיה');
        }
      } else if (status === 401) {
        setError('אימייל או סיסמה שגויים');
      } else {
        setError('שגיאת שרת — נסה שוב מאוחר יותר');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.tabContent}>
      <Field label="אימייל" value={email} onChangeText={setEmail}
        placeholder="user@example.com" keyboardType="email-address" />
      <Field label="סיסמה" value={password} onChangeText={setPassword}
        placeholder="••••••••" secureTextEntry />
      <ErrorBox msg={error} />
      <TouchableOpacity
        style={[styles.btnPrimary, loading && styles.btnDisabled]}
        onPress={handle}
        disabled={loading}
        activeOpacity={0.85}>
        {loading
          ? <ActivityIndicator color={COLORS.textPrimary} />
          : <Text style={styles.btnPrimaryText}>כניסה</Text>}
      </TouchableOpacity>
    </View>
  );
};

// ─── Register Step 1 — חשבון ──────────────────────────────────────────────────

interface S1 { name: string; email: string; phone: string; password: string; confirm: string; }

const Step1: React.FC<{ data: S1; set: (p: Partial<S1>) => void; onNext: () => void }> = ({ data, set, onNext }) => {
  const [error, setError] = useState('');

  const next = () => {
    if (!data.name.trim()) { setError('נא להזין שם מלא'); return; }
    if (!isValidEmail(data.email)) { setError('כתובת אימייל לא תקינה'); return; }
    if (data.password.length < 8) { setError('הסיסמה חייבת להכיל לפחות 8 תווים'); return; }
    if (data.password !== data.confirm) { setError('הסיסמאות אינן תואמות'); return; }
    setError('');
    onNext();
  };

  return (
    <View style={styles.tabContent}>
      <Field label="שם מלא" value={data.name} onChangeText={v => set({ name: v })}
        placeholder="ישראל ישראלי" autoCapitalize="words" />
      <Field label="אימייל" value={data.email} onChangeText={v => set({ email: v })}
        placeholder="user@example.com" keyboardType="email-address" />
      <Field label="טלפון (אופציונלי)" value={data.phone} onChangeText={v => set({ phone: v })}
        placeholder="05X-XXXXXXX" keyboardType="phone-pad" />
      <Field label="סיסמה" value={data.password} onChangeText={v => set({ password: v })}
        placeholder="לפחות 8 תווים" secureTextEntry />
      <Field label="אימות סיסמה" value={data.confirm} onChangeText={v => set({ confirm: v })}
        placeholder="חזור על הסיסמה" secureTextEntry />
      <ErrorBox msg={error} />
      <TouchableOpacity style={styles.btnPrimary} onPress={next} activeOpacity={0.85}>
        <Text style={styles.btnPrimaryText}>הבא ←</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Register Step 2 — myGMC ──────────────────────────────────────────────────

interface S2 { gmEmail: string; gmPass: string; verified: boolean; verifyErr: string; verifying: boolean; }

const Step2: React.FC<{ data: S2; set: (p: Partial<S2>) => void; onNext: () => void; onBack: () => void }> = ({
  data, set, onNext, onBack,
}) => {
  const verify = async () => {
    set({ verifying: true, verifyErr: '', verified: false });
    try {
      const res = await authVerifyGM(data.gmEmail.trim(), data.gmPass);
      if (res.valid) {
        set({ verified: true, verifyErr: '', verifying: false });
      } else {
        set({ verified: false, verifyErr: res.message || 'פרטי myGMC שגויים', verifying: false });
      }
    } catch (err: any) {
      set({
        verified: false,
        verifyErr: err?.response?.data?.message ?? 'שגיאה באימות — בדוק פרטים',
        verifying: false,
      });
    }
  };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.stepNote}>
        אימות חשבון myGMC מאפשר רישום מפתח הצפנה לרכב שלך.
      </Text>
      <Field label="אימייל myGMC" value={data.gmEmail}
        onChangeText={v => set({ gmEmail: v, verified: false })}
        placeholder="user@gm.com" keyboardType="email-address" />
      <Field label="סיסמת myGMC" value={data.gmPass}
        onChangeText={v => set({ gmPass: v, verified: false })}
        placeholder="••••••••" secureTextEntry />
      <Text style={styles.noteSmall}>🔒 הסיסמה לא נשמרת לאחר ההרשמה</Text>
      <TouchableOpacity
        style={[styles.btnBlue, data.verifying && styles.btnDisabled]}
        onPress={verify}
        disabled={data.verifying}
        activeOpacity={0.85}>
        {data.verifying
          ? <ActivityIndicator color={COLORS.textPrimary} size="small" />
          : <Text style={styles.btnBlueText}>אמת</Text>}
      </TouchableOpacity>
      {data.verified && <SuccessBox msg="✅ פרטי myGMC אומתו" />}
      <ErrorBox msg={data.verifyErr ? `❌ ${data.verifyErr}` : ''} />
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.btnBack} onPress={onBack} activeOpacity={0.85}>
          <Text style={styles.btnBackText}>→ חזור</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrimarySmall, !data.verified && styles.btnDisabled]}
          onPress={onNext}
          disabled={!data.verified}
          activeOpacity={0.85}>
          <Text style={styles.btnPrimaryText}>הבא ←</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Register Step 3 — רכב ───────────────────────────────────────────────────

interface S3 { vin: string; nickname: string; }

const Step3: React.FC<{
  data: S3;
  set: (p: Partial<S3>) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
  error: string;
  success: string;
}> = ({ data, set, onSubmit, onBack, loading, error, success }) => {
  const make = data.vin.length >= 3 ? decodeVinMake(data.vin) : '';
  const year = decodeVinYear(data.vin);

  return (
    <View style={styles.tabContent}>
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>מספר VIN</Text>
        <TextInput
          style={[styles.input, styles.inputMono]}
          value={data.vin}
          onChangeText={v => set({ vin: v.toUpperCase().slice(0, 17) })}
          placeholder="1GKKNPLS0HZ000000"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="characters"
          maxLength={17}
        />
        <VinDots length={data.vin.length} />
        <Text style={styles.vinCount}>{data.vin.length}/17</Text>
      </View>
      {(make || year) ? (
        <View style={styles.vinDetect}>
          {!!make && <Text style={styles.vinDetectText}>🚗 {make}</Text>}
          {!!year && <Text style={styles.vinDetectText}>📅 {year}</Text>}
        </View>
      ) : null}
      <Field label="כינוי רכב (אופציונלי)" value={data.nickname}
        onChangeText={v => set({ nickname: v })}
        placeholder="למשל: יוקון שלי" autoCapitalize="sentences" />
      <ErrorBox msg={error} />
      <SuccessBox msg={success} />
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.btnBack} onPress={onBack} activeOpacity={0.85}>
          <Text style={styles.btnBackText}>→ חזור</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrimarySmall, (loading || data.vin.length !== 17) && styles.btnDisabled]}
          onPress={onSubmit}
          disabled={loading || data.vin.length !== 17}
          activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator color={COLORS.textPrimary} size="small" />
            : <Text style={styles.btnPrimaryText}>שלח בקשה</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Register Tab ─────────────────────────────────────────────────────────────

const STEP_LABELS = ['חשבון', 'myGMC', 'רכב'];

const RegisterTab: React.FC = () => {
  const [step, setStep] = useState(1);
  const [s1, setS1] = useState<S1>({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [s2, setS2] = useState<S2>({ gmEmail: '', gmPass: '', verified: false, verifyErr: '', verifying: false });
  const [s3, setS3] = useState<S3>({ vin: '', nickname: '' });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitSuccess('');
    setSubmitLoading(true);
    try {
      await authRegister({
        name: s1.name.trim(),
        email: s1.email.trim(),
        password: s1.password,
        phone: s1.phone.trim() || undefined,
      });
      setSubmitSuccess('הבקשה נשלחה — ידידיה יאשר את חשבונך בקרוב');
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message ?? 'שגיאה בשליחת הבקשה — נסה שוב');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <View>
      <Stepper currentStep={step} steps={STEP_LABELS} />
      {step === 1 && (
        <Step1 data={s1} set={p => setS1(prev => ({ ...prev, ...p }))} onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <Step2
          data={s2}
          set={p => setS2(prev => ({ ...prev, ...p }))}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <Step3
          data={s3}
          set={p => setS3(prev => ({ ...prev, ...p }))}
          onSubmit={handleSubmit}
          onBack={() => setStep(2)}
          loading={submitLoading}
          error={submitError}
          success={submitSuccess}
        />
      )}
    </View>
  );
};

// ─── AuthScreen ───────────────────────────────────────────────────────────────

interface Props { navigation: any; }

const AuthScreen: React.FC<Props> = ({ navigation }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.brandName}>YedidiaGMC</Text>
            <Text style={styles.brandSub}>שליטה חכמה ברכב GMC</Text>
          </View>

          <View style={styles.tabBar}>
            {(['login', 'register'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBarBtn, tab === t && styles.tabBarBtnActive]}
                onPress={() => setTab(t)}
                activeOpacity={0.85}>
                <Text style={[styles.tabBarBtnText, tab === t && styles.tabBarBtnTextActive]}>
                  {t === 'login' ? 'כניסה' : 'הרשמה'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.card}>
            {tab === 'login'
              ? <LoginTab onSuccess={() => navigation.replace('Main')} />
              : <RegisterTab />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default AuthScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  root: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 20, paddingBottom: 48 },
  brand: { alignItems: 'center', marginTop: 20, marginBottom: 28 },
  brandName: { fontSize: 32, fontWeight: '800', color: COLORS.accent, letterSpacing: 1 },
  brandSub: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16,
    padding: 4,
  },
  tabBarBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabBarBtnActive: { backgroundColor: COLORS.accent },
  tabBarBtnText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  tabBarBtnTextActive: { color: COLORS.textPrimary },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
  },
  tabContent: { gap: 12 },
  fieldGroup: { gap: 6 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', textAlign: 'right' },
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
  inputMono: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 2,
    textAlign: 'left',
  },
  vinDotsRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  vinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.cardBorder },
  vinDotFilled: { backgroundColor: COLORS.accent },
  vinCount: { color: COLORS.textMuted, fontSize: 11, textAlign: 'center', marginTop: 3 },
  vinDetect: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    padding: 10,
    justifyContent: 'center',
  },
  vinDetectText: { color: COLORS.green, fontSize: 14, fontWeight: '600' },
  btnPrimary: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimarySmall: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  btnPrimaryText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.38 },
  btnBlue: { backgroundColor: COLORS.blue, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnBlueText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  btnBack: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
  },
  btnBackText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 10 },
  errorBox: {
    backgroundColor: 'rgba(227,24,55,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(227,24,55,0.32)',
    borderRadius: 8,
    padding: 10,
  },
  errorText: { color: COLORS.accent, fontSize: 13, textAlign: 'right' },
  successBox: {
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.32)',
    borderRadius: 8,
    padding: 10,
  },
  successText: { color: COLORS.green, fontSize: 13, textAlign: 'right' },
  stepNote: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'right', lineHeight: 20 },
  noteSmall: { color: COLORS.textMuted, fontSize: 11, textAlign: 'right' },
  // Stepper
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  stepperItem: { alignItems: 'center', gap: 4 },
  stepperCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.inputBg,
  },
  stepperCircleActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
  stepperCircleDone: { borderColor: COLORS.green, backgroundColor: COLORS.green },
  stepperNum: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  stepperNumActive: { color: COLORS.textPrimary },
  stepperLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '500' },
  stepperLabelActive: { color: COLORS.accent },
  stepperLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.cardBorder,
    marginBottom: 16,
    marginHorizontal: 4,
  },
  stepperLineDone: { backgroundColor: COLORS.green },
});
