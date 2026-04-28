import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { PermissionsAndroid } from 'react-native';
import { generateKeyPair, generateKeyId, storePrivateKey } from '../services/gmCrypto';
import { authBleEnroll } from '../services/api';
import { useStore } from '../store';

const COLORS = {
  background: '#0A0E1A',
  card: '#111827',
  accent: '#E31837',
  text: '#F0F4F8',
  subtext: '#9CA3AF',
  input: '#1F2937',
  border: '#374151',
  success: '#10B981',
  warning: '#F59E0B',
};

type EnrollStep = 'form' | 'permissions' | 'generating' | 'enrolling' | 'done' | 'error';

export default function EnrollmentScreen(): React.JSX.Element {
  const [vin, setVin] = useState('');
  const [nickname, setNickname] = useState('');
  const [step, setStep] = useState<EnrollStep>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [enrollmentId, setEnrollmentId] = useState('');

  const user = useStore(s => s.user);
  const setUser = useStore(s => s.setUser);

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
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return result === 'granted';
      }
    } catch {
      return false;
    }
  };

  const handleEnroll = async () => {
    const cleanVin = vin.trim().toUpperCase();
    if (cleanVin.length !== 17) {
      Alert.alert('שגיאה', 'מספר VIN חייב להיות 17 תווים');
      return;
    }

    setStep('permissions');
    const hasPermissions = await requestBlePermissions();
    if (!hasPermissions) {
      setErrorMsg('הרשאות Bluetooth נדחו. נא לאשר בהגדרות.');
      setStep('error');
      return;
    }

    setStep('generating');
    try {
      const keyPair = await generateKeyPair();
      const keyId = await generateKeyId();

      await storePrivateKey(cleanVin, keyPair);

      setStep('enrolling');

      const result = await authBleEnroll({
        vin: cleanVin,
        publicKeyHex: keyPair.publicKeyHex,
        keyId,
        vehicleNickname: nickname.trim() || undefined,
      });

      setEnrollmentId(result.enrollmentId);

      // Update local user to mark vehicle as enrolled
      if (user) {
        const updatedEnrolled = [
          ...(user.enrolledVehicles ?? []),
          cleanVin,
        ];
        setUser({ ...user, enrolledVehicles: updatedEnrolled });
      }

      setStep('done');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? String(err) ?? 'ההרשמה נכשלה';
      setErrorMsg(msg);
      setStep('error');
    }
  };

  const handleReset = () => {
    setStep('form');
    setErrorMsg('');
    setEnrollmentId('');
  };

  // ─── Render steps ──────────────────────────────────────────────────────────

  if (step === 'generating' || step === 'enrolling' || step === 'permissions') {
    const label =
      step === 'permissions'
        ? 'מבקש הרשאות...'
        : step === 'generating'
        ? 'מייצר מפתחות...'
        : 'מרשם רכב...';
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>{label}</Text>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.successIcon}>✅</Text>
        <Text style={styles.successTitle}>הרכב נרשם בהצלחה!</Text>
        <Text style={styles.successSub}>מזהה הרשמה: {enrollmentId}</Text>
        <Text style={styles.successNote}>
          כעת ניתן לחבר את הרכב דרך מסך שליטה BLE.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleReset}>
          <Text style={styles.buttonText}>רשום רכב נוסף</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'error') {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.errorTitle}>ההרשמה נכשלה</Text>
        <Text style={styles.errorMsg}>{errorMsg}</Text>
        <TouchableOpacity style={styles.button} onPress={handleReset}>
          <Text style={styles.buttonText}>נסה שוב</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Default: form
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>רשום רכב GM</Text>
      <Text style={styles.subtitle}>
        הרשמה תיצור מפתח דיגיטלי מאובטח עבור הרכב שלך.
      </Text>

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>מספר VIN (17 תווים)</Text>
        <TextInput
          style={styles.input}
          placeholder="לדוגמה: 1G1ZB5ST0JF123456"
          placeholderTextColor={COLORS.subtext}
          value={vin}
          onChangeText={t => setVin(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={17}
          textAlign="right"
        />

        <Text style={styles.fieldLabel}>כינוי לרכב (אופציונלי)</Text>
        <TextInput
          style={styles.input}
          placeholder="לדוגמה: הסיבוע שלי"
          placeholderTextColor={COLORS.subtext}
          value={nickname}
          onChangeText={setNickname}
          textAlign="right"
        />

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            ⚠️ יש לוודא שיש לך הרשאות Bluetooth ומיקום לפני ביצוע ההרשמה.
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleEnroll}>
          <Text style={styles.buttonText}>רשום רכב</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    padding: 20,
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.subtext,
    marginBottom: 20,
    textAlign: 'right',
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fieldLabel: {
    color: COLORS.subtext,
    fontSize: 13,
    marginBottom: 6,
    textAlign: 'right',
  },
  input: {
    backgroundColor: COLORS.input,
    borderRadius: 10,
    padding: 14,
    color: COLORS.text,
    marginBottom: 16,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoBox: {
    backgroundColor: '#1C1F0F',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  infoText: {
    color: COLORS.warning,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
  },
  button: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  loadingText: {
    color: COLORS.subtext,
    fontSize: 16,
    marginTop: 16,
  },
  successIcon: { fontSize: 64, marginBottom: 12 },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  successSub: {
    color: COLORS.success,
    fontSize: 14,
    marginBottom: 8,
  },
  successNote: {
    color: COLORS.subtext,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  errorIcon: { fontSize: 64, marginBottom: 12 },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMsg: {
    color: COLORS.accent,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
});
