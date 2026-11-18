import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type DevicePdf = {
  path: string;
  uri: string;
  name: string;
  size: number;
  modifiedAt: number;
  folder: string;
};

type PdfScannerNative = {
  hasStorageAccess(): boolean;
  requestStorageAccess(): void;
  listPdfs(): Promise<DevicePdf[]>;
  getDisplayName(uri: string): string | null;
};

// Opcional: no Expo Go e no iOS o módulo não existe, e o app segue funcionando
// só com a biblioteca de PDFs importados.
const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<PdfScannerNative>('PdfScanner') : null;

export const isDeviceScanAvailable = native != null;

export function hasStorageAccess(): boolean {
  return native?.hasStorageAccess() ?? false;
}

export function requestStorageAccess(): void {
  native?.requestStorageAccess();
}

export async function listDevicePdfs(): Promise<DevicePdf[]> {
  return native ? native.listPdfs() : [];
}

export function getDisplayName(uri: string): string | null {
  try {
    return native?.getDisplayName(uri) ?? null;
  } catch {
    return null;
  }
}
