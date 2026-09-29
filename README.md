# v1su4rt
Web interativa

Site responsivo em português, sem dependências externas. A demonstração alterna a prévia entre celular, tablet e desktop. Manifesto e service worker oferecem instalação e cache offline em hospedagens compatíveis.

## Abrir no Microsoft Visual Studio 2026

Abra `ESF-01.slnx` para ver os arquivos agrupados no Gerenciador de Soluções. Também é possível escolher **File → Open → Folder** e abrir esta pasta. A solução apenas organiza os arquivos do site; não exige um projeto .NET nem pacotes npm.

## Executar no computador

Abra a pasta no Visual Studio Code e inicie um servidor local. Se a extensão **Live Server** já estiver instalada, clique com o botão direito em `index.html` e escolha **Open with Live Server**. Também pode usar Python:

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000` no navegador. O navegador pode usar `localhost` como origem segura para o service worker.

## Publicar no GitHub Pages

Envie os arquivos desta pasta para um repositório. No GitHub, abra **Settings → Pages**, escolha **Deploy from a branch**, selecione a branch principal e a pasta que contém `index.html`. A publicação receberá um endereço HTTPS. Se o repositório estiver numa subpasta do domínio, os caminhos relativos deste projeto continuam funcionando.

## Publicar em outra hospedagem

Envie o conteúdo desta pasta para uma hospedagem de site estático com HTTPS. O service worker e a instalação do app exigem HTTPS fora de `localhost`. Não é necessário instalar pacotes ou compilar o projeto.

## Arquivos

- `index.html`: página principal.
- `assets/styles.css`: estilos responsivos (agora organizados em assets/).
- `assets/app.js`: navegação, prévia interativa e instalação (agora em assets/).
- `manifest.webmanifest` e `icon.svg`: metadados e ícone do app.
 - `icons/`: ícones PNG nos tamanhos usados pelo manifesto de instalação. (substitua pelos PNG finais se desejar)
- `assets/icons/`: ícones PNG gerados (192x192 e 512x512) para compatibilidade Android.
- `service-worker.js`: cache dos arquivos principais para visitas offline.
- `privacy.html`: resumo de privacidade deste exemplo.

Para publicar, coloque os arquivos juntos na raiz do repositório ou da pasta escolhida no GitHub Pages.

## Push automático (PowerShell)

Criei um script PowerShell para facilitar o push do projeto. Exemplo de uso (execute no PowerShell):

```powershell
# executa com caminho do repositório local (padrão: pasta atual)
powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1 -RepoPath "C:\Users\sole8\OneDrive\Documentos\GitHub\ESF-01" -Message "Deploy PWA + shader"

# se o repositório remoto ainda não existir, informe também a URL remota:
powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1 -RepoPath "C:\Users\sole8\OneDrive\Documentos\GitHub\ESF-01" -RemoteUrl "https://github.com/SEU_USUARIO/ESF-01.git"
```

O script faz: git add ., git commit -m <mensagem> e git push origin main. Verifique se o Git está instalado e se você tem permissão para push.

## Subir do celular — passo a passo (Android / iOS)

Escolha o método abaixo conforme sua preferência. Recomendo o método A (Web) para maior simplicidade em muitos casos.

Opção A — Usando o navegador (Chrome no Android) — mais simples
1. No celular, abra https://github.com e faça login na sua conta.
2. Toque em + (canto superior) → New repository. Defina um nome (ex.: ESF-01) e crie o repositório público ou privado.
3. Na página do repositório recém-criado, toque em Add file → Upload files.
4. Toque em Choose your files e selecione os arquivos do projeto. Para subir pastas inteiras, abra o gerenciador de arquivos do celular, selecione todos os arquivos necessários (index.html, manifest.webmanifest, service-worker.js, icon.svg, assets/ etc.). Pode ser necessário repetir o upload por pastas se o navegador não permitir seleção de pastas.
5. Depois de selecionar os arquivos, role a página e toque em Commit changes.
6. Repita até que todos os arquivos e pastas estejam no repositório (verifique a árvore de arquivos no GitHub).

Opção B — Usando Termux (Android) — recomendado se quiser controlar commits e subir pastas inteiras
1. Instale Termux na Play Store / F-Droid e abra o app.
2. Configure Git no Termux:
   - pkg install git
   - git config --global user.name "Seu Nome"
   - git config --global user.email "seu@email"
3. Clone o repositório vazio que você criou no GitHub:
   - git clone https://github.com/SEU_USUARIO/ESF-01.git
4. Copie os arquivos do gerenciador de arquivos do Android para a pasta do repo (use o app de arquivos para mover ou termos como mv cp no Termux se tiver acesso).
5. No Termux, dentro da pasta do repo:
   - git add .
   - git commit -m "Deploy PWA + shader interativo"
   - git push origin main

Opção C — Usando o app GitHub (interface limitada)
- O app oficial permite criar repositórios e ver código, mas o upload de muitos arquivos pode ser limitado. Use-o para criar o repo e depois use a Opção A para upload de arquivos via web.

Ativar GitHub Pages
1. No repositório no celular, abra Settings → Pages (ou Code and automation → Pages).
2. Em Source, escolha Branch: main e Folder: / (root). Salve.
3. Aguarde alguns minutos; a URL do site será https://SEU_USUARIO.github.io/ESF-01

Testar no celular (finalizar)
1. Abra a URL HTTPS gerada no Chrome do Android.
2. Vá em Demonstração → toque em "Ativar interações" (gesture obrigatório). Permita Microfone; permita Movimento/Orientation se solicitado.
3. Ajuste os sliders de sensibilidade (áudio / giroscópio) para calibrar a experiência.
4. Para testar instalação PWA: aguarde o navegador sugerir instalação ou use o menu do Chrome → Add to Home screen.

Resolução de problemas rápidos
- Se o microfone não funcionar: verifique permissões do site (Chrome → Site settings → Microphone).
- Se o giroscópio não responder: verifique versão do Android e permissões; alguns navegadores exigem que a permissão seja dada após um gesto do usuário.
- Se o site mostrar versão antiga: limpe cache ou vá em DevTools → Application → Service Workers e desregistre o SW (apenas em desktop) ou desinstale e reinstale a PWA.

## Testar sensores e instalação PWA

- Para testar o fluxo de instalação e o uso de microfone/giroscópio, o site deve ser servido por HTTPS ou usar `localhost`.
- No desktop, execute `python -m http.server 8000` e abra `http://localhost:8000` para testar o service worker e a instalação básica.
- Para testar microfone e giroscópio em um dispositivo móvel, publique o site em HTTPS (GitHub Pages ou outra hospedagem). Alguns sensores (DeviceOrientation) exigem permissão solicitada após um gesto do usuário.
- Na seção "Demonstração", use o botão "Ativar interações" para permitir microfone e giroscópio. Se as permissões forem negadas, o painel mostrará instruções.

Obs: Foram gerados PNGs placeholder em assets/icons/ (icon-192.png e icon-512.png). Substitua por imagens finais de alta qualidade quando desejar. Para gerar ícones a partir do icon.svg localmente pode usar ImageMagick:

```bash
magick convert icon.svg -resize 192x192 assets/icons/icon-192.png
magick convert icon.svg -resize 512x512 assets/icons/icon-512.png
```

