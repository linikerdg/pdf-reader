import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DevicePdf,
  hasStorageAccess,
  isDeviceScanAvailable,
  listDevicePdfs,
  requestStorageAccess,
} from '../../modules/pdf-scanner';
import {
  formatSize,
  loadLibrary,
  openDevicePdf,
  pickAndImportPdf,
  PdfDoc,
  removeDoc,
} from '../lib/library';
import { colors } from '../lib/theme';

type Row = { kind: 'doc'; doc: PdfDoc } | { kind: 'device'; pdf: DevicePdf };
type Section = { key: 'recent' | 'device'; title: string; data: Row[] };

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [docs, setDocs] = useState<PdfDoc[] | null>(null);
  const [devicePdfs, setDevicePdfs] = useState<DevicePdf[]>([]);
  const [hasAccess, setHasAccess] = useState(() => hasStorageAccess());
  const [scanning, setScanning] = useState(() => hasStorageAccess());
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const refreshLibrary = useCallback(() => {
    loadLibrary().then(setDocs);
  }, []);

  const loadDevicePdfs = useCallback(() => {
    listDevicePdfs()
      .then(setDevicePdfs)
      .catch((e) => console.warn('Falha ao listar PDFs', e))
      .finally(() => setScanning(false));
  }, []);

  // Chamado por eventos (voltar ao app, puxar para atualizar).
  const rescanDevice = useCallback(() => {
    const access = hasStorageAccess();
    setHasAccess(access);
    if (!access) return;
    setScanning(true);
    loadDevicePdfs();
  }, [loadDevicePdfs]);

  useFocusEffect(refreshLibrary);

  // Varre o aparelho ao abrir e sempre que o app volta ao primeiro plano
  // (inclusive depois que o usuário concede o acesso nas configurações).
  useEffect(() => {
    if (hasStorageAccess()) loadDevicePdfs();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') rescanDevice();
    });
    return () => sub.remove();
  }, [loadDevicePdfs, rescanDevice]);

  const openDoc = (doc: PdfDoc) => router.push({ pathname: '/reader/[id]', params: { id: doc.id } });

  const run = async (fn: () => Promise<PdfDoc | null>) => {
    setBusy(true);
    try {
      const doc = await fn();
      if (doc) openDoc(doc);
      refreshLibrary();
    } catch (e) {
      Alert.alert('Não foi possível abrir o arquivo', String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onLongPressDoc = (doc: PdfDoc) => {
    Alert.alert(
      doc.name,
      doc.external
        ? 'Tirar dos recentes? O arquivo continua no aparelho.'
        : 'Remover este PDF do app? A cópia salva no app será apagada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: doc.external ? 'Tirar' : 'Remover',
          style: 'destructive',
          onPress: async () => {
            await removeDoc(doc.id);
            refreshLibrary();
          },
        },
      ],
    );
  };

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    const match = (name: string) => !q || name.toLocaleLowerCase('pt-BR').includes(q);
    const lib = docs ?? [];
    const inLibrary = new Set(lib.map((d) => d.uri));
    const out: Section[] = [];
    const recent = lib.filter((d) => match(d.name)).map((doc): Row => ({ kind: 'doc', doc }));
    if (recent.length) out.push({ key: 'recent', title: 'Recentes', data: recent });
    if (hasAccess) {
      const device = devicePdfs
        .filter((p) => !inLibrary.has(p.uri) && match(p.name))
        .map((pdf): Row => ({ kind: 'device', pdf }));
      out.push({ key: 'device', title: 'No aparelho', data: device });
    }
    return out;
  }, [docs, devicePdfs, hasAccess, query]);

  if (!docs) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const nothingAtAll = sections.every((s) => s.data.length === 0);

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(r) => (r.kind === 'doc' ? `d:${r.doc.id}` : `f:${r.pdf.path}`)}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={scanning && devicePdfs.length > 0}
            onRefresh={() => {
              refreshLibrary();
              rescanDevice();
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar PDFs"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            {isDeviceScanAvailable && !hasAccess ? (
              <View style={styles.permCard}>
                <Text style={styles.permTitle}>Ver todos os PDFs do celular</Text>
                <Text style={styles.permText}>
                  Para listar os PDFs de Downloads, WhatsApp e outras pastas, o Android pede que você
                  libere o “acesso a todos os arquivos” para o Leitor PDF.
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.permButton, pressed && { opacity: 0.85 }]}
                  onPress={requestStorageAccess}
                >
                  <Text style={styles.permButtonText}>Permitir acesso</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.key === 'device' ? (
              scanning && devicePdfs.length === 0 ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.sectionCount}>{section.data.length}</Text>
              )
            ) : null}
          </View>
        )}
        renderSectionFooter={({ section }) =>
          section.key === 'device' && section.data.length === 0 && !scanning ? (
            <Text style={styles.sectionEmpty}>
              {query ? 'Nenhum PDF encontrado com esse nome.' : 'Nenhum outro PDF encontrado no aparelho.'}
            </Text>
          ) : undefined
        }
        ListEmptyComponent={
          nothingAtAll && !scanning ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{query ? 'Nada encontrado' : 'Nenhum PDF ainda'}</Text>
              <Text style={styles.emptyText}>
                {query
                  ? 'Tente outro nome.'
                  : 'Toque em “Abrir PDF” para escolher um arquivo, ou abra um PDF de outro app com o Leitor PDF.'}
              </Text>
            </View>
          ) : undefined
        }
        renderItem={({ item }) =>
          item.kind === 'doc' ? (
            <DocRow doc={item.doc} onPress={() => openDoc(item.doc)} onLongPress={() => onLongPressDoc(item.doc)} />
          ) : (
            <DeviceRow pdf={item.pdf} onPress={() => run(() => openDevicePdf(item.pdf))} />
          )
        }
      />

      <Pressable
        style={({ pressed }) => [styles.fab, { bottom: 24 + insets.bottom }, pressed && { opacity: 0.85 }]}
        onPress={() => run(pickAndImportPdf)}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.fabText}>＋  Abrir PDF</Text>
        )}
      </Pressable>
    </View>
  );
}

function Thumb({ dim }: { dim?: boolean }) {
  return (
    <View style={[styles.thumb, dim && styles.thumbDim]}>
      <View style={styles.thumbFold} />
      <Text style={[styles.thumbText, dim && { color: colors.muted }]}>PDF</Text>
    </View>
  );
}

function DocRow(props: { doc: PdfDoc; onPress: () => void; onLongPress: () => void }) {
  const { doc } = props;
  const progress = doc.pageCount ? doc.lastPage / doc.pageCount : 0;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
    >
      <Thumb />
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={2}>
          {doc.name}
        </Text>
        <Text style={styles.meta}>
          {doc.pageCount ? `Página ${doc.lastPage} de ${doc.pageCount}` : 'Não lido'}
          {doc.size ? `  ·  ${formatSize(doc.size)}` : ''}
        </Text>
        {doc.pageCount ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function DeviceRow(props: { pdf: DevicePdf; onPress: () => void }) {
  const { pdf } = props;
  const date = pdf.modifiedAt ? new Date(pdf.modifiedAt).toLocaleDateString('pt-BR') : '';
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} onPress={props.onPress}>
      <Thumb dim />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {pdf.name.replace(/\.pdf$/i, '')}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[pdf.folder, formatSize(pdf.size), date].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginBottom: 4,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  searchIcon: { fontSize: 20, color: colors.muted, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  permCard: {
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
  },
  permTitle: { color: colors.primaryText, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  permText: { color: '#CFE3E2', fontSize: 13, lineHeight: 19, marginBottom: 14 },
  permButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  permButtonText: { color: colors.primaryDark, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionCount: { fontSize: 13, color: colors.muted },
  sectionEmpty: { paddingHorizontal: 20, paddingVertical: 8, color: colors.muted, fontSize: 14 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  thumb: {
    width: 40,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    overflow: 'hidden',
  },
  thumbDim: { backgroundColor: '#EAF0EF' },
  thumbFold: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    backgroundColor: colors.accent,
    borderBottomLeftRadius: 4,
  },
  thumbText: { color: colors.primary, fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowTitle: { fontSize: 15, color: colors.text },
  meta: { fontSize: 12.5, color: colors.muted, marginTop: 3 },
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
