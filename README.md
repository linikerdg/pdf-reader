# Leitor PDF

App mobile (Android/iOS) para ler PDFs, feito com Expo + React Native.

## Funcionalidades
- Abrir PDFs do aparelho (o arquivo é copiado para o armazenamento do app)
- Biblioteca de recentes com progresso de leitura; toque longo remove
- Rolagem contínua, renderizando só as páginas próximas da tela (leve em PDFs grandes)
- Zoom (botões − / + e gesto de pinça), ir para uma página e modo escuro
- Lembra a última página lida de cada documento
- Funciona offline: o pdf.js vai embutido no app (`assets/pdfjs`)

## Rodando
```bash
npm install
npx expo start
```
Abra o app **Expo Go** no celular e escaneie o QR code.

## Estrutura
- `src/app/index.tsx`: biblioteca
- `src/app/reader/[id].tsx`: leitor (WebView + barra de ferramentas)
- `src/lib/viewerHtml.ts`: página HTML do leitor (pdf.js), sem dependências do Expo
- `src/lib/library.ts`: importação e persistência dos PDFs

## Gerar APK / build de loja
```bash
npx eas-cli@latest build -p android --profile preview
```
