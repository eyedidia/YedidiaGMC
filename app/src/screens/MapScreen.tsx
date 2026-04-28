import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
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

// ─── Mock last-known location type ───────────────────────────────────────────

interface LastLocation {
  lat: number;
  lng: number;
  address: string;
  updatedAt: string;
}

// ─── MapScreen ────────────────────────────────────────────────────────────────

const MapScreen: React.FC = () => {
  const user = useStore(s => s.user);
  const vehicle = user?.vehicles?.[0] ?? null;

  // Mock last-known location data (stub until real map feature is available)
  const [lastLocation] = useState<LastLocation | null>({
    lat: 32.0853,
    lng: 34.7818,
    address: 'תל אביב-יפו, ישראל',
    updatedAt: new Date(Date.now() - 1000 * 60 * 38).toISOString(), // 38 min ago
  });

  function formatUpdated(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'לפני ' + String(diff) + ' שניות';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return 'לפני ' + String(mins) + ' דקות';
    const hours = Math.floor(mins / 60);
    return 'לפני ' + String(hours) + ' שעות';
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.pageTitle}>📍 מיקום הרכב</Text>
          {vehicle?.nickname && (
            <Text style={styles.vehicleLabel}>{vehicle.nickname}</Text>
          )}
        </View>

        {/* Coming soon card */}
        <View style={styles.comingSoonCard}>
          <Text style={styles.comingSoonIcon}>🗺️</Text>
          <Text style={styles.comingSoonTitle}>מפה</Text>
          <Text style={styles.comingSoonText}>
            תכונה זו תהיה זמינה בגרסה הבאה
          </Text>
        </View>

        {/* Last known location card */}
        {lastLocation && (
          <View style={styles.locationCard}>
            <View style={styles.locationCardHeader}>
              <Text style={styles.locationCardTitle}>מיקום אחרון ידוע</Text>
              <Text style={styles.locationUpdated}>
                {formatUpdated(lastLocation.updatedAt)}
              </Text>
            </View>

            {/* Placeholder map tile */}
            <View style={styles.mapPlaceholder}>
              <Text style={styles.mapPlaceholderIcon}>📍</Text>
              <Text style={styles.mapPlaceholderCoords}>
                {lastLocation.lat.toFixed(4) + ', ' + lastLocation.lng.toFixed(4)}
              </Text>
            </View>

            <View style={styles.locationRow}>
              <Text style={styles.locationIcon}>🏙️</Text>
              <Text style={styles.locationAddress}>{lastLocation.address}</Text>
            </View>

            <View style={styles.locationRow}>
              <Text style={styles.locationIcon}>🕐</Text>
              <Text style={styles.locationTime}>
                {new Date(lastLocation.updatedAt).toLocaleString('he-IL', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        )}

        {/* Info note */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {'ℹ️ מיקום בזמן אמת ייתמך בגרסה הבאה. ' +
              'כרגע מוצג המיקום האחרון שנשמר בשרת.'}
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

export default MapScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: 16, paddingBottom: 40 },

  header: { marginBottom: 20 },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'right',
  },
  vehicleLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'right',
  },

  comingSoonCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  comingSoonIcon: { fontSize: 56, marginBottom: 12 },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  comingSoonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  locationCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  locationCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  locationUpdated: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  mapPlaceholder: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 8,
  },
  mapPlaceholderIcon: { fontSize: 36 },
  mapPlaceholderCoords: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locationIcon: { fontSize: 18 },
  locationAddress: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'right',
  },
  locationTime: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'right',
  },

  infoBox: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
    padding: 12,
  },
  infoText: {
    color: COLORS.blue,
    fontSize: 12,
    textAlign: 'right',
    lineHeight: 18,
  },
});
