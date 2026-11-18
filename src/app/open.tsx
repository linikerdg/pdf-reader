import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { importFromUri } from '../lib/library';
import { colors } from '../lib/theme';

/** Recebe um PDF vindo de outro app ("Abrir com") e abre no leitor. */
export default function OpenExternalScreen() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) {
      router.replace('/');
      return;
    }
    let alive = true;
    importFromUri(String(uri))
      .then((doc) => {
        if (!alive) return;
        // Volta para a biblioteca e empilha o leitor por cima, para o "voltar"
        // cair na lista em vez de fechar o app.
        router.replace('/');
        router.push({ pathname: '/reader/[id]', params: { id: doc.id } });
      })
      .catch((e) => alive && setError(String((e as Error)?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [uri]);

  return (
    <View style={styles.center}>
      {error ? (
        <>
          <Text style={styles.title}>Não foi possível abrir este PDF</Text>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.button} onPress={() => router.replace('/')}>
            <Text style={styles.buttonText}>Ir para a biblioteca</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loading}>Abrindo PDF…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.background },
  loading: { marginTop: 12, color: colors.muted },
  title: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: 8, textAlign: 'center' },
  error: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22 },
  buttonText: { color: colors.primaryText, fontWeight: '600' },
});
