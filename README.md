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

## Baixar o APK
Os APKs ficam na página [Releases](https://github.com/linikerdg/pdf-reader/releases).
O workflow `.github/workflows/android-release.yml` compila e publica um release
sempre que uma tag `v*` é enviada:
```bash
git tag v1.0.1
git push origin v1.0.1
```
Antes de cada versão nova, aumente `version` e `android.versionCode` no `app.json`.

> O APK é assinado com a chave de debug, que muda a cada build. Para atualizar
> o app pode ser preciso desinstalar a versão anterior.

## pdf.js
`assets/pdfjs/*.txt` são cópias de `build/pdf.min.js` e `build/pdf.worker.min.js`
do pacote `pdfjs-dist@3.11.174`.
