import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { renderViewerHtml } from './viewerHtml';
import pdfLibAsset from '../../assets/pdfjs/pdf.min.js.txt';
import pdfWorkerAsset from '../../assets/pdfjs/pdf.worker.min.js.txt';

let libCache: { lib: string; worker: string } | null = null;

async function readAssetText(mod: number): Promise<string> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  return new File(asset.localUri ?? asset.uri).text();
}

/** Carrega (uma vez) o código do pdf.js empacotado no app. */
async function loadPdfJs() {
  if (!libCache) {
    const [lib, worker] = await Promise.all([
      readAssetText(pdfLibAsset),
      readAssetText(pdfWorkerAsset),
    ]);
    libCache = { lib, worker };
  }
  return libCache;
}

/** Mensagens que o WebView envia de volta para o React Native. */
export type ViewerMessage =
  | { type: 'loaded'; total: number }
  | { type: 'page'; page: number; total: number }
  | { type: 'zoom'; zoom: number }
  | { type: 'error'; message: string; password?: boolean };

export async function buildViewerHtml(opts: {
  pdfUri: string;
  initialPage: number;
  dark: boolean;
}): Promise<string> {
  const [{ lib, worker }, pdfBase64] = await Promise.all([
    loadPdfJs(),
    new File(opts.pdfUri).base64(),
  ]);
  return renderViewerHtml({ lib, worker, pdfBase64, initialPage: opts.initialPage, dark: opts.dark });
}
