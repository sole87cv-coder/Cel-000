# v1su4rt — Testes manuais

Documento de verificação manual para funcionalidades PWA, Service Worker e sensores (microfone e giroscópio).

## 1. Preparação

- Objetivo: abrir o site localmente e preparar ferramentas de depuração.
- Como abrir localmente: no terminal, dentro da pasta do projeto, rode:

  python -m http.server 8000

  Em seguida abra: http://localhost:8000

- Publicação em HTTPS: GitHub Pages (ex.: https://sole87cv-coder.github.io/ESF-01). Confirme a URL após o deploy.

- Abrir DevTools:
  - Desktop Chrome: F12 ou Ctrl+Shift+I
  - Android: conectar via cabo e acessar chrome://inspect → Remote Target

- Locais úteis no DevTools:
  - Console: erros e avisos
  - Application → Manifest: verificar manifesto e ícones
  - Application → Service Workers: ver estado do SW e ativação

## 2. Testes no Desktop (Chrome)

### 2.1 Carregamento básico

- Objetivo: verificar que a página carrega sem erros e que o shader do hero anima.
- Pré-requisitos: servidor local ou versão publicada em HTTPS.
- Passos:
  1. Abra a URL do site no Chrome.
  2. Abra DevTools → Console.
  3. Observe o canvas do hero (parte visual principal).
- Resultado esperado:
  - Sem 404 no Console; sem erros vermelhos.
  - Shader do hero animando (gradiente em movimento).
- Como corrigir se falhar:
  - Verificar caminhos em index.html (assets/styles.css, assets/app.js, assets/shaders.js).
  - Conferir service-worker cache para 404s; revisar CACHE_NAME.

### 2.2 Manifest

- Objetivo: confirmar manifesto válido e ícones.
- Passos:
  1. DevTools → Application → Manifest.
  2. Verificar campos: name, short_name, start_url, display, theme_color.
  3. Verificar presença dos ícones 192 e 512.
- Resultado esperado:
   - name e short_name corretos; icons com 192x192 e 512x512 listados; theme_color #0a0c10; display = standalone.
- Como corrigir se falhar:
  - Ajustar manifest.webmanifest; garantir que arquivos em ./icons/ existam e caminhos estejam corretos.

### 2.3 Service Worker

- Objetivo: verificar instalação do SW e funcionamento offline.
- Passos:
  1. DevTools → Application → Service Workers.
  2. Confirmar status "activated and is running".
  3. Marcar "Offline" na aba Network e recarregar a página.
- Resultado esperado:
  - A página carrega mesmo offline e recursos vêm do cache.
- Como corrigir se falhar:
  - Conferir APP_FILES em service-worker.js e garantir que todos os caminhos existem.
  - Incrementar CACHE_NAME (ex.: 'esf-01-v3'), forçar reload e reabrir a página.

### 2.4 Instalação PWA

- Objetivo: verificar prompt de instalação e comportamento standalone.
- Passos:
  1. Em Chrome, clicar no ícone de instalação ou usar o menu do navegador.
  2. Abrir o app instalado e observar se abre em janela standalone.
- Resultado esperado:
  - App instalado e aberto sem barra de endereços; aparece em chrome://apps.
- Como corrigir se falhar:
  - Verificar start_url, display e icons no manifest e confirmar HTTPS.

## 3. Testes no Android (Chrome)

### 3.1 Instalação PWA

- Objetivo: confirmar instalação no Android.
- Pré-requisitos: site servido em HTTPS (ou localhost durante testes).
- Passos:
  1. Abrir a URL no Chrome do Android.
  2. Menu → "Instalar app" ou "Adicionar à tela inicial".
- Resultado esperado:
  - Ícone aparece na tela inicial; o app abre em modo standalone.
- Como corrigir se falhar:
  - Limpar dados do site, reinstalar e verificar manifest e icons.

### 3.2 Offline no celular

- Objetivo: validar que o SW serve conteúdo em modo offline.
- Passos:
  1. Abrir a página com rede disponível.
  2. Ativar modo avião e abrir o app (ou reabrir a URL pelo navegador offline).
- Resultado esperado:
  - Página carrega do cache.
- Como corrigir se falhar:
  - Conferir SW via chrome://inspect, verificar APP_FILES e CACHE_NAME.

### 3.3 Microfone

- Objetivo: validar reatividade dos shaders ao som.
- Pré-requisitos: página em HTTPS (ou app instalado via PWA), microfone disponível.
- Passos:
  1. Rolar até o botão "Ativar interações".
  2. Tocar no botão e permitir acesso ao microfone quando solicitado.
  3. Falar ou reproduzir som perto do microfone.
- Resultado esperado:
  - Ondas no canvas de interação crescem conforme o nível do som (rms).
  - Graves (bass) aumentam a amplitude / alteram cor do hero.
  - Agudos (treble) geram pontos brilhantes (sparkles).
- Como corrigir se falhar:
  - Verificar permissões do site (Configurações do Chrome → Site settings → Microphone).
  - Confirmar que AudioContext foi criado após interação do usuário (clique).
  - Conferir Console por erros.

### 3.4 Giroscópio

- Objetivo: validar reação ao movimento do dispositivo.
- Passos:
  1. Com interações ativas, incline o celular e observe.
- Resultado esperado:
  - Centro das ondas desloca-se conforme inclinação; hero reage levemente.
- Como corrigir se falhar:
  - Verificar permissões de Motion & Orientation no dispositivo e se DeviceOrientationEvent existe.
  - Em iOS é necessário chamar DeviceOrientationEvent.requestPermission em um gesto do usuário.

### 3.5 Sliders

- Objetivo: confirmar que sliders ajustam sensibilidade em tempo real.
- Passos:
  1. Ajustar #audio-sens e #orient-sens.
  2. Observar valores em #audio-sens-value e #orient-sens-value e o efeito nos shaders.
- Resultado esperado:
  - Valores atualizam; sensibilidade muda imediatamente.
- Como corrigir se falhar:
  - Verificar IDs no index.html e se os handlers dos inputs estão presentes no console.

## 4. Testes no iOS (Safari)

### 4.1 Instalação PWA

- Objetivo: validar instalação manual no iOS.
- Passos:
  1. Abrir o site no Safari.
  2. Menu Compartilhar → "Adicionar à Tela de Início".
- Resultado esperado:
  - Ícone aparece na tela inicial e abre em modo standalone.
- Observação: iOS não suporta beforeinstallprompt; o site deve instruir o usuário a usar o menu de compartilhamento.

### 4.2 Microfone no iOS

- Objetivo: validar que o microfone funciona no Safari.
- Passos:
  1. Tocar em "Ativar interações" e permitir o uso do microfone.
- Resultado esperado:
  - Mesma reatividade do Android.
- Como corrigir se falhar:
  - Verificar que a página está servida via HTTPS.
  - Confirmar que a criação do AudioContext ocorre dentro do handler de clique.

### 4.3 Giroscópio no iOS

- Objetivo: confirmar permissão e reatividade.
- Passos:
  1. Ao tocar em "Ativar interações", aceitar a permissão de movimento (se solicitada).
  2. Inclinar dispositivo e observar resposta.
- Resultado esperado:
  - Inclinação modifica as interações visuais.
- Como corrigir se falhar:
  - Garantir que DeviceOrientationEvent.requestPermission é chamado no clique e que o usuário aceitou.

## 5. Teste de regressão (após cada mudança)

- Subir CACHE_NAME em service-worker.js quando alterar assets.
- Recarregar com hard reload (Ctrl+Shift+R) no desktop e reinstalar PWA no celular se necessário.
- Conferir `git status` antes de commitar.

## 6. Problemas comuns e soluções rápidas

- "Site mostra versão antiga": limpar cache, desregistrar SW em DevTools → Application → Service Workers e recarregar.
- "Manifest não instala": checar start_url, icons e HTTPS.
- "Microfone não abre": conferir permissões, contexto seguro (HTTPS) e criar AudioContext dentro do clique.
- "Giroscópio não responde": permissões não concedidas ou navegador sem suporte.

## 7. Checklist rápido (marcar a cada release)

- [ ] Desktop carrega sem erro
- [ ] Manifest válido no DevTools
- [ ] Service Worker ativo
- [ ] Offline funciona no desktop
- [ ] Android instala PWA
- [ ] Android offline funciona
- [ ] Android microfone funciona
- [ ] Android giroscópio funciona
- [ ] iOS instala PWA
- [ ] iOS microfone funciona
- [ ] iOS giroscópio funciona
- [ ] Sliders afetam em tempo real
- [ ] Respeita prefers-reduced-motion
- [ ] privacy.html carrega CSS
- [ ] Push feito, branch up to date

---
Após salvar este arquivo como TESTES.md, execute os comandos abaixo, um por vez, e cole as saídas aqui:

1) git status
2) git add .\TESTES.md
3) git status
4) git commit -m "Adicionar TESTES.md com validacao manual de PWA, SW e sensores"
5) git pull --rebase origin main
6) git push origin main

Se qualquer comando falhar, pare e cole a saída exata do terminal; eu instruirei a correção.
