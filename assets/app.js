(() => {
  // Blocos defensivos: função helper para executar sem quebrar se elementos faltarem
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('esf: safe error', e); } };
  const year = safe(() => document.querySelector('#year'));
  const previewStage = safe(() => document.querySelector('#preview-stage'));
  const previewButton = safe(() => document.querySelector('#preview-button'));
  const sizeLabel = safe(() => document.querySelector('#size-label'));
  const sizeDimensions = safe(() => document.querySelector('#size-dimensions'));
  const demoStatus = safe(() => document.querySelector('#demo-status'));
  const toast = safe(() => document.querySelector('#toast')) || { textContent: '', classList: { add: () => {}, remove: () => {} } };
  const menuButton = safe(() => document.querySelector('#menu-button'));
  const navPanel = safe(() => document.querySelector('#nav-panel'));
  const installButtons = safe(() => Array.from(document.querySelectorAll('.install-button'))) || [];
  const sizes = [
    { key: 'mobile', title: 'CELULAR', width: '360 px' },
    { key: 'tablet', title: 'TABLET', width: '768 px' },
    { key: 'desktop', title: 'DESKTOP', width: '1280 px' },
  ];
  let previewIndex = 0;
  let installPrompt = null;
  let toastTimer;

  safe(() => { if (year) year.textContent = new Date().getFullYear(); });

  function showToast(message) {
    safe(() => { toast.textContent = message; toast.classList.add('show'); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3200); });
  }

  // Expor função de toast para outros módulos (ex.: interaction.js)
  window.esfShowToast = showToast;

  function applyPreview(index) {
    const size = sizes[index % sizes.length];
    previewStage.dataset.size = size.key;
    sizeLabel.textContent = size.title;
    sizeDimensions.textContent = size.width;
    demoStatus.textContent = `Visualização: ${size.title.toLocaleLowerCase('pt-BR')}`;
    // informar o shader de preview sobre o novo tamanho
    try { window.ESFShaders && window.ESFShaders.setSize(index); } catch (e) { /* ignore */ }
  }

  safe(() => {
    previewButton && previewButton.addEventListener('click', () => {
      previewIndex = (previewIndex + 1) % sizes.length;
      applyPreview(previewIndex);
    });
  });

  // inicializar shaders quando a página carregar (se disponível)
  window.addEventListener('load', () => {
    try { window.ESFShaders && window.ESFShaders.initHero(); window.ESFShaders && window.ESFShaders.initPreview(); window.ESFShaders && window.ESFShaders.setSize(previewIndex); } catch (e) { /* ignore */ }
  });

  // Swipe gestures para alternar visualização em dispositivos touch
  let touchStartX = null;
  safe(() => {
    previewStage && previewStage.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    previewStage && previewStage.addEventListener('touchend', (e) => {
      if (touchStartX === null) return;
      const touchEndX = e.changedTouches[0].clientX;
      const dx = touchEndX - touchStartX;
      if (Math.abs(dx) > 50) {
        previewIndex = dx < 0 ? (previewIndex + 1) % sizes.length : (previewIndex - 1 + sizes.length) % sizes.length;
        applyPreview(previewIndex);
      }
      touchStartX = null;
    });
  });

  safe(() => {
    if (!menuButton || !navPanel) return;
    menuButton.addEventListener('click', () => {
      const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
      // quando aria-expanded === 'true' -> abrir
      if (isOpen) {
        navPanel.hidden = false;
        menuButton.setAttribute('aria-expanded', 'true');
        menuButton.setAttribute('aria-label', 'Fechar navegação');
      } else {
        navPanel.hidden = true;
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.setAttribute('aria-label', 'Abrir navegação');
      }
    });
  });

  safe(() => { navPanel && navPanel.querySelectorAll('a').forEach((link) => { link.addEventListener('click', () => { navPanel.hidden = true; menuButton && menuButton.setAttribute('aria-expanded', 'false'); menuButton && menuButton.setAttribute('aria-label', 'Abrir navegação'); }); }); });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installButtons.forEach((button) => { button.hidden = false; });
  });

  installButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      // verificar se já está instalado
      const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      if (isStandalone) {
        showToast('App já instalado.');
        installButtons.forEach((b) => { b.hidden = true; });
        return;
      }

        if (installPrompt) {
          installPrompt.prompt();
          const choice = await installPrompt.userChoice;
          showToast(choice.outcome === 'accepted' ? 'v1su4rt foi instalado.' : 'Instalação cancelada.');
        installPrompt = null;
        installButtons.forEach((b) => { b.hidden = true; });
        return;
      }

      // fallback para iOS / Safari: instruir o usuário
      showToast('Compartilhar → "Adicionar à Tela de Início"');
    });
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.info('O modo offline não foi ativado nesta hospedagem.', error);
      });
    });
  }
})();
