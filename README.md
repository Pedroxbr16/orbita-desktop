# Orbita Desktop

Comando desktop multiplataforma para converter e editar arquivos localmente. O fluxo principal abre um menu circular sobre a área de trabalho, sem entrar em uma janela convencional.

## Recursos atuais

- Windows, macOS e Linux via Electron.
- Imagens: JPG, PNG, WebP, AVIF, GIF e TIFF processados pelo FFmpeg incluído.
- Vídeo e áudio: MP4, WebM, MOV, MKV, GIF, MP3, WAV, M4A, OGG e FLAC com FFmpeg incluído.
- Ferramentas locais: compressão, redimensionamento, recorte numérico, rotação, escala de cinza, remoção de metadados, corte temporal e extração de áudio.
- Documentos: conversão por uma instalação local do LibreOffice.
- Processamento sem upload, conta ou servidor.
- Saída automática em uma pasta `Orbita` ao lado do original, ou em uma pasta escolhida nos ajustes.

## Como usar

No terminal, passe um ou vários arquivos:

```bash
orbita ~/Imagens/foto.png
orbita ~/Vídeos/video.mp4 ~/Vídeos/outro.mov
```

No Fedora/Hyprland, pressione **Super + Shift + O** para escolher os arquivos e abrir o menu circular. No Nautilus, selecione os arquivos e use **botão direito → Scripts → Orbita**.

A janela completa continua disponível apenas como modo avançado:

```bash
orbita --workspace
```

## Desenvolvimento

Requer Node.js 22.

```bash
npm install
npm run dev
```

## Verificação

```bash
npm test
npm run check
```

## Empacotamento

```bash
npm run dist:linux
npm run dist:win
npm run dist:mac
```

O empacotamento nativo deve ser feito no sistema de destino. Para gerar os três formatos automaticamente, use uma matriz de CI com runners Windows, macOS e Linux.

O comando Linux gera um AppImage portátil. Em um runner Debian/Ubuntu com `libcrypt.so.1`, `npm run dist:deb` também gera o pacote `.deb`.

## Builds automáticos no GitHub

O workflow [`.github/workflows/build-desktop.yml`](.github/workflows/build-desktop.yml) executa testes e gera arquivos para Linux, Windows e macOS em todo push para `main`, pull request ou execução manual. Os instaladores ficam disponíveis na seção **Artifacts** da execução por 14 dias.

Para publicar uma versão com os três downloads anexados em **Releases**, crie e envie uma tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Os pacotes gerados ainda não são assinados. Para distribuição pública sem alertas do Gatekeeper/SmartScreen, configure certificados Apple e Windows como secrets do repositório e habilite a assinatura no workflow.

## Limite conhecido do gesto global

O Wayland bloqueia aplicativos comuns de interceptarem globalmente `Shift + arrastar` de outros programas. Por isso, no Linux o mesmo fluxo é oferecido pelo comando, atalho global e menu do Nautilus. Integrações equivalentes em outras plataformas podem usar:

- Windows: shell extension ou janela overlay com OLE drag-and-drop.
- macOS: Finder Sync Extension e permissões de Acessibilidade.
- Linux: integração por portal/gerenciador de arquivos, com diferenças entre Wayland e X11.

O motor de conversão e a interface permanecem compartilhados entre todas as plataformas.
