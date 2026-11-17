// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// O pdf.js é empacotado como asset de texto (assets/pdfjs/*.txt) para ser
// injetado no WebView sem depender de internet.
config.resolver.assetExts.push('txt');

module.exports = config;
