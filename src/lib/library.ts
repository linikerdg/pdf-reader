import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

export type PdfDoc = {
  id: string;
  name: string;
  uri: string;
  size: number | null;
  addedAt: number;
  lastOpenedAt: number;
  lastPage: number;
  pageCount: number | null;
};

const STORAGE_KEY = 'pdfreader.library.v1';

function pdfDir(): Directory {
  const dir = new Directory(Paths.document, 'pdfs');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export async function loadLibrary(): Promise<PdfDoc[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const docs: PdfDoc[] = raw ? JSON.parse(raw) : [];
    return docs.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  } catch {
    return [];
  }
}

async function saveLibrary(docs: PdfDoc[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export async function getDoc(id: string): Promise<PdfDoc | undefined> {
  const docs = await loadLibrary();
  return docs.find((d) => d.id === id);
}

export async function updateDoc(id: string, patch: Partial<PdfDoc>): Promise<void> {
  const docs = await loadLibrary();
  const i = docs.findIndex((d) => d.id === id);
  if (i < 0) return;
  docs[i] = { ...docs[i], ...patch };
  await saveLibrary(docs);
}

export async function removeDoc(id: string): Promise<void> {
  const docs = await loadLibrary();
  const doc = docs.find((d) => d.id === id);
  if (doc) {
    try {
      const f = new File(doc.uri);
      if (f.exists) f.delete();
    } catch {
      // arquivo já não existe — só remove da lista
    }
  }
  await saveLibrary(docs.filter((d) => d.id !== id));
}

/** Abre o seletor do sistema e copia o PDF escolhido para o armazenamento do app. */
export async function pickAndImportPdf(): Promise<PdfDoc | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const docs = await loadLibrary();

  // Evita duplicar o mesmo arquivo (mesmo nome e tamanho).
  const existing = docs.find((d) => d.name === asset.name && d.size === (asset.size ?? null));
  if (existing) return existing;

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const dest = new File(pdfDir(), `${id}.pdf`);
  await new File(asset.uri).copy(dest);

  const now = Date.now();
  const doc: PdfDoc = {
    id,
    name: asset.name.replace(/\.pdf$/i, ''),
    uri: dest.uri,
    size: asset.size ?? null,
    addedAt: now,
    lastOpenedAt: now,
    lastPage: 1,
    pageCount: null,
  };
  await saveLibrary([doc, ...docs]);
  return doc;
}

export function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
