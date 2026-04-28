import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  SafeAreaView,
  ScrollView,
} from 'react-native';
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

// ─── Contact helpers ──────────────────────────────────────────────────────────

const PHONE = '+972501234567'; // placeholder — replace before production
const WA_NUMBER = '972501234567'; // WhatsApp number without +
const EMAIL = 'yedidia@yedidiagmc.com';

function openPhone() {
  Linking.openURL(`tel:${PHONE}`).catch(() => {});
}

function openWhatsApp() {
  Linking.openURL(`https://wa.me/${WA_NUMBER}`).catch(() => {});
}

function openEmail() {
  Linking.openURL(`mailto:${EMAIL}`).catch(() => {});
}

// ─── LicenseExpiredScreen ─────────────────────────────────────────────────────

const LicenseExpiredScreen: React.FC = () => {
  const user = useStore(s => s.user);
  const logout = useStore(s => s.logout);

  const expiryFormatted = user?.licenseExpiresAt
    ? new Date(user.licenseExpiresAt).toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        {/* Icon */}
        <View style={styles.iconWrapper}>
          <Text style={styles.icon}>⛔</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>הרישיון שלך פג תוקף</Text>

        {/* Expiry date */}
        {expiryFormatted ? (
          <Text style={styles.expiryLine}>
            תוקף עד:{' '}
            <Text style={styles.expiryDate}>{expiryFormatted}</Text>
          </Text>
        ) : null}

        {/* Body */}
        <Text style={styles.body}>
          לחידוש הרישיון, פנה לידידיה:
        </Text>

        {/* Contact buttons */}
        <View style={styles.contactSection}>
          <TouchableOpacity style={styles.contactBtn} onPress={openPhone} activeOpacity={0.85}>
            <Text style={styles.contactBtnIcon}>📞</Text>
            <Text style={styles.contactBtnText}>חייג לידידיה</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.contactBtn, styles.contactBtnWa]}
            onPress={openWhatsApp}
            activeOpacity={0.85}>
            <Text style={styles.contactBtnIcon}>💬</Text>
            <Text style={styles.contactBtnText}>שלח WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.contactBtn, styles.contactBtnEmail]}
            onPress={openEmail}
            activeOpacity={0.85}>
            <Text style={styles.contactBtnIcon}>✉️</Text>
            <Text style={styles.contactBtnText}>שלח מייל</Text>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default LicenseExpiredScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    paddingBottom: 48,
  },
  iconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(227,24,55,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  icon: { fontSize: 44 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  expiryLine: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  expiryDate: {
    color: COLORS.orange,
    fontWeight: '700',
  },
  body: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 24,
  },
  contactSection: {
    width: '100%',
    gap: 12,
    marginBottom: 36,
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  contactBtnWa: {
    backgroundColor: '#25D366',
    shadowColor: '#25D366',
  },
  contactBtnEmail: {
    backgroundColor: COLORS.blue,
    shadowColor: COLORS.blue,
  },
  contactBtnIcon: { fontSize: 20 },
  contactBtnText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  logoutBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  logoutText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
