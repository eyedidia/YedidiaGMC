import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { vehicleHistory, CommandLog } from '../services/api';
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

// ─── Command name mapping ─────────────────────────────────────────────────────

const CMD_MAP: Record<string, { label: string; icon: string }> = {
  LOCK:          { icon: '🔒', label: 'נעל' },
  UNLOCK:        { icon: '🔓', label: 'פתח' },
  UNLOCK_DRIVER: { icon: '🚪', label: 'פתח דלת נהג' },
  START:         { icon: '🔑', label: 'הנע מנוע' },
  STOP:          { icon: '⛔', label: 'עצור מנוע' },
  TRUNK:         { icon: '📦', label: 'פתח מטען' },
  WINDOWS_VENT:  { icon: '🪟', label: 'פתח חלונות' },
  WINDOWS_CLOSE: { icon: '❎', label: 'סגור חלונות' },
  HORN:          { icon: '📯', label: 'צופר' },
  ENROLL:        { icon: '🔐', label: 'Enrollment' },
};

function cmdDisplay(command: string): { icon: string; label: string } {
  return CMD_MAP[command.toUpperCase()] ?? { icon: '⚙️', label: command };
}

// ─── Status display ───────────────────────────────────────────────────────────

function statusDisplay(status: CommandLog['status']): { icon: string; color: string } {
  switch (status) {
    case 'success': return { icon: '✅', color: COLORS.green };
    case 'failed':  return { icon: '❌', color: COLORS.accent };
    case 'pending': return { icon: '⏳', color: COLORS.orange };
    default:        return { icon: '⏰', color: COLORS.textMuted };
  }
}

// ─── Date grouping ────────────────────────────────────────────────────────────

function formatSectionHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (sameDay(date, today)) return 'היום';
  if (sameDay(date, yesterday)) return 'אתמול';
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function toDateKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ─── Grouped list item type ───────────────────────────────────────────────────

type ListItem =
  | { type: 'header'; dateKey: string; label: string; id: string }
  | { type: 'item'; log: CommandLog };

function buildList(logs: CommandLog[]): ListItem[] {
  const sorted = [...logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const items: ListItem[] = [];
  let lastKey = '';
  for (const log of sorted) {
    const key = toDateKey(log.timestamp);
    if (key !== lastKey) {
      lastKey = key;
      items.push({
        type: 'header',
        dateKey: key,
        label: formatSectionHeader(log.timestamp),
        id: `header-${key}`,
      });
    }
    items.push({ type: 'item', log });
  }
  return items;
}

// ─── Log row ──────────────────────────────────────────────────────────────────

const LogRow: React.FC<{ log: CommandLog }> = ({ log }) => {
  const { icon, label } = cmdDisplay(log.command);
  const { icon: statusIcon, color: statusColor } = statusDisplay(log.status);

  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.cmdIcon}>{icon}</Text>
      <View style={rowStyles.middle}>
        <Text style={rowStyles.cmdLabel}>{label}</Text>
        <Text style={rowStyles.time}>{formatTime(log.timestamp)}</Text>
      </View>
      <Text style={[rowStyles.statusIcon, { color: statusColor }]}>{statusIcon}</Text>
    </View>
  );
};

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 6,
  },
  cmdIcon: { fontSize: 22, marginRight: 12 },
  middle: { flex: 1 },
  cmdLabel: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  time: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, textAlign: 'right' },
  statusIcon: { fontSize: 20, marginLeft: 8 },
});

// ─── HistoryScreen ────────────────────────────────────────────────────────────

const HistoryScreen: React.FC = () => {
  const user = useStore(s => s.user);
  const vehicleId = user?.vehicles?.[0]?.id ?? '';

  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(
    async (isRefresh = false) => {
      if (!vehicleId) {
        setLoading(false);
        setError('לא נמצא רכב');
        return;
      }
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const data = await vehicleHistory(vehicleId);
        setLogs(data);
      } catch {
        setError('שגיאה בטעינת ההיסטוריה');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [vehicleId],
  );

  useEffect(() => {
    fetchHistory(false);
  }, [fetchHistory]);

  const listItems = buildList(logs);

  const total = logs.length;
  const success = logs.filter(l => l.status === 'success').length;
  const failed = logs.filter(l => l.status === 'failed').length;

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
        </View>
      );
    }
    return <LogRow log={item.log} />;
  };

  const keyExtractor = (item: ListItem): string => {
    if (item.type === 'header') return item.id;
    return item.log.id;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Stats header */}
      <View style={styles.statsBar}>
        <StatChip label="סה״כ" value={total} color={COLORS.textSecondary} />
        <StatChip label="הצלחות" value={success} color={COLORS.green} />
        <StatChip label="שגיאות" value={failed} color={COLORS.accent} />
      </View>

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchHistory(true)}
              tintColor={COLORS.accent}
              colors={[COLORS.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>אין פקודות בהיסטוריה עדיין</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

export default HistoryScreen;

// ─── StatChip ─────────────────────────────────────────────────────────────────

const StatChip: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <View style={chipStyles.chip}>
    <Text style={[chipStyles.value, { color }]}>{value}</Text>
    <Text style={chipStyles.label}>{label}</Text>
  </View>
);

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  value: { fontSize: 22, fontWeight: '800' },
  label: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  listContent: { paddingTop: 8, paddingBottom: 40 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
  },
  sectionHeaderText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: COLORS.accent, fontSize: 14, textAlign: 'center' },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
});
