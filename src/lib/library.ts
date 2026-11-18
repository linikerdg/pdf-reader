import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { DevicePdf, getDisplayName } from '../../modules/pdf-scanner';

export type PdfDoc = {
  id: string;
  name: string;
  uri: string;
  size: number | null;
  addedAt: number;
  lastOpenedAt: number;
  lastPage: number;
  pageCount: number | null;
  /** true = arquivo do aparelho lido no lugar (não é cópia do app; nunca apagar). */
  external?: boolean;
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
  if (doc && !doc.external) {
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
  return importFromUri(asset.uri, asset.name, asset.size ?? null);
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const stripPdf = (name: string) => name.replace(/\.pdf$/i, '');

/**
 * Copia um PDF (file:// ou content://, ex.: recebido via "Abrir com") para o
 * armazenamento do app. A cópia é necessária porque o acesso a um content://
 * de outro app é temporário.
 */
export async function importFromUri(
  uri: string,
  name?: string | null,
  size?: number | null,
): Promise<PdfDoc> {
  const src = new File(uri);
  const realSize = size ?? safe(() => src.size) ?? null;
  const realName = stripPdf(name || getDisplayName(uri) || decodeName(uri) || 'Documento');

  const docs = await loadLibrary();
  // Evita duplicar o mesmo arquivo (mesmo nome e tamanho).
  const existing = docs.find((d) => d.name === realName && d.size === realSize);
  if (existing) return existing;

  const id = newId();
  const dest = new File(pdfDir(), `${id}.pdf`);
  await src.copy(dest);

  const now = Date.now();
  const doc: PdfDoc = {
    id,
    name: realName,
    uri: dest.uri,
    size: realSize ?? safe(() => dest.size) ?? null,
    addedAt: now,
    lastOpenedAt: now,
    lastPage: 1,
    pageCount: null,
  };
  await saveLibrary([doc, ...docs]);
  return doc;
}

/** Registra um PDF do aparelho para leitura no lugar (sem copiar). */
export async function openDevicePdf(pdf: DevicePdf): Promise<PdfDoc> {
  const docs = await loadLibrary();
  const existing = docs.find((d) => d.external && d.uri === pdf.uri);
  if (existing) return existing;

  const now = Date.now();
  const doc: PdfDoc = {
    id: newId(),
    name: stripPdf(pdf.name),
    uri: pdf.uri,
    size: pdf.size,
    addedAt: now,
    lastOpenedAt: now,
    lastPage: 1,
    pageCount: null,
    external: true,
  };
  await saveLibrary([doc, ...docs]);
  return doc;
}

function decodeName(uri: string): string | null {
  try {
    const last = decodeURIComponent(uri.split('?')[0].split('/').pop() ?? '');
    const base = last.split(':').pop() ?? '';
    return /\.pdf$/i.test(base) ? base : null;
  } catch {
    return null;
  }
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
