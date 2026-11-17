import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { getDoc, PdfDoc, updateDoc } from '../../lib/library';
import { colors } from '../../lib/theme';
import { buildViewerHtml, ViewerMessage } from '../../lib/viewer';

const DARK_KEY = 'pdfreader.darkMode';

// As tipagens do react-native-webview usam `P = undefined`, e `Props & undefined`
// vira `never` no TS atual. Instanciar com `object` resolve.
const PdfWebView = WebView<object>;
type PdfWebViewRef = InstanceType<typeof PdfWebView>;

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const webRef = useRef<PdfWebViewRef>(null);

  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [dark, setDark] = useState(false);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoText, setGotoText] = useState('');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega o documento e monta o HTML do leitor uma única vez.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await getDoc(String(id));
        if (!d) throw new Error('Documento não encontrado na biblioteca.');
        const darkPref = (await AsyncStorage.getItem(DARK_KEY)) === '1';
        if (!alive) return;
        setDoc(d);
        setPage(d.lastPage);
        setDark(darkPref);
        updateDoc(d.id, { lastOpenedAt: Date.now() });
        const h = await buildViewerHtml({ pdfUri: d.uri, initialPage: d.lastPage, dark: darkPref });
        if (alive) setHtml(h);
      } catch (e) {
        if (alive) setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      alive = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [id]);

  const run = (js: string) => webRef.current?.injectJavaScript(`${js}; true;`);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: ViewerMessage;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'loaded':
        setReady(true);
        setTotal(msg.total);
        if (doc) updateDoc(doc.id, { pageCount: msg.total });
        break;
      case 'page':
        setPage(msg.page);
        setTotal(msg.total);
        if (doc) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          const docId = doc.id;
          const p = msg.page;
          saveTimer.current = setTimeout(() => updateDoc(docId, { lastPage: p }), 400);
        }
        break;
      case 'zoom':
        setZoom(msg.zoom);
        break;
      case 'error':
        setError(
          msg.password
            ? 'Este PDF é protegido por senha e ainda não é suportado.'
            : `Não foi possível abrir o PDF.\n${msg.message}`,
        );
        break;
    }
  };

  const changeZoom = (delta: number) => {
    const next = Math.round(Math.max(0.5, Math.min(4, zoom + delta)) * 100) / 100;
    run(`window.setZoom(${next})`);
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    run(`window.setDark(${next})`);
    AsyncStorage.setItem(DARK_KEY, next ? '1' : '0');
  };

  const submitGoto = () => {
    const n = parseInt(gotoText, 10);
    if (!Number.isNaN(n)) run(`window.goToPage(${n})`);
    setGotoOpen(false);
    setGotoText('');
  };

  const bg = dark ? '#121214' : '#e9e9ee';

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Stack.Screen options={{ title: doc?.name ?? '' }} />

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : html ? (
        <PdfWebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html }}
          onMessage={onMessage}
          style={{ flex: 1, backgroundColor: bg }}
          javaScriptEnabled
          setBuiltInZoomControls
          setDisplayZoomControls={false}
          overScrollMode="never"
          onError={(ev) => setError(ev.nativeEvent.description)}
        />
      ) : null}

      {!ready && !error ? (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: bg }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, dark && { color: '#aaa' }]}>Abrindo PDF…</Text>
        </View>
      ) : null}

      {ready && !error ? (
        <View style={[styles.toolbar, { bottom: 16 + insets.bottom }]}>
          <ToolButton label="−" onPress={() => changeZoom(-0.25)} disabled={zoom <= 0.5} />
          <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
          <ToolButton label="+" onPress={() => changeZoom(0.25)} disabled={zoom >= 4} />
          <View style={styles.divider} />
          <Pressable onPress={() => setGotoOpen(true)} hitSlop={8} style={styles.pageBtn}>
            <Text style={styles.pageText}>
              {page} / {total}
            </Text>
          </Pressable>
          <View style={styles.divider} />
          <ToolButton label={dark ? '☀' : '☾'} onPress={toggleDark} />
        </View>
      ) : null}

      <Modal visible={gotoOpen} transparent animationType="fade" onRequestClose={() => setGotoOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGotoOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ir para a página</Text>
            <TextInput
              autoFocus
              keyboardType="number-pad"
              returnKeyType="go"
              placeholder={`1 – ${total}`}
              placeholderTextColor={colors.muted}
              value={gotoText}
              onChangeText={setGotoText}
              onSubmitEditing={submitGoto}
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setGotoOpen(false)} hitSlop={8}>
                <Text style={styles.modalCancel}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={submitGoto} hitSlop={8}>
                <Text style={styles.modalOk}>Ir</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function ToolButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.6 }, props.disabled && { opacity: 0.35 }]}
    >
      <Text style={styles.toolBtnText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: colors.muted },
  errorText: { color: colors.primary, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  toolbar: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.toolbar,
    borderRadius: 24,
    paddingHorizontal: 8,
    height: 48,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  toolBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  toolBtnText: { color: colors.toolbarText, fontSize: 22 },
  zoomText: { color: colors.toolbarText, fontSize: 13, minWidth: 44, textAlign: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: '#555', marginHorizontal: 6 },
  pageBtn: { paddingHorizontal: 10, height: 40, justifyContent: 'center' },
  pageText: { color: colors.toolbarText, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    color: colors.text,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 18 },
  modalCancel: { fontSize: 15, color: colors.muted },
  modalOk: { fontSize: 15, color: colors.primary, fontWeight: '600' },
});
