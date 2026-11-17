import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatSize, loadLibrary, pickAndImportPdf, PdfDoc, removeDoc } from '../lib/library';
import { colors } from '../lib/theme';

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [docs, setDocs] = useState<PdfDoc[] | null>(null);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(() => {
    loadLibrary().then(setDocs);
  }, []);

  useFocusEffect(refresh);

  const openDoc = (doc: PdfDoc) => router.push({ pathname: '/reader/[id]', params: { id: doc.id } });

  const onImport = async () => {
    setImporting(true);
    try {
      const doc = await pickAndImportPdf();
      if (doc) openDoc(doc);
      refresh();
    } catch (e) {
      Alert.alert('Não foi possível abrir o arquivo', String((e as Error)?.message ?? e));
    } finally {
      setImporting(false);
    }
  };

  const onLongPress = (doc: PdfDoc) => {
    Alert.alert(doc.name, 'Remover este PDF da biblioteca?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await removeDoc(doc.id);
          refresh();
        },
      },
    ]);
  };

  if (!docs) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={docs}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[
          styles.list,
          docs.length === 0 && styles.listEmpty,
          { paddingBottom: 110 + insets.bottom },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyTitle}>Nenhum PDF ainda</Text>
            <Text style={styles.emptyText}>Toque em “Abrir PDF” para escolher um arquivo do seu aparelho.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const progress = item.pageCount ? item.lastPage / item.pageCount : 0;
          return (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
              onPress={() => openDoc(item)}
              onLongPress={() => onLongPress(item)}
            >
              <View style={styles.thumb}>
                <Text style={styles.thumbText}>PDF</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>
                  {item.pageCount
                    ? `Página ${item.lastPage} de ${item.pageCount}`
                    : 'Não lido'}
                  {item.size ? `  ·  ${formatSize(item.size)}` : ''}
                </Text>
                {item.pageCount ? (
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: 24 + insets.bottom },
          pressed && { opacity: 0.85 },
        ]}
        onPress={onImport}
        disabled={importing}
      >
        {importing ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.fabText}>＋  Abrir PDF</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  thumb: {
    width: 44,
    height: 56,
    borderRadius: 6,
    backgroundColor: '#fdecea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  progressTrack: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: 8 },
  progressFill: { height: 3, backgroundColor: colors.primary, borderRadius: 2 },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    minWidth: 170,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
});
