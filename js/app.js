/* GIRO – Etapa 1: estrutura instalável, identidade visual e funcionamento offline. */
(function () {
  'use strict';

  var GIRO = { versao: '0.1.0', etapa: 1 };

  var ETAPAS = [
    'Estrutura HTML instalável e identidade visual',
    'Questionário inicial e perfil',
    'Dashboard e navegação',
    'Treino livre e cronômetro',
    'Registro e resumo',
    'Banco de dados e histórico',
    'Estatísticas e gráficos',
    'Metas e conquistas',
    'Planos personalizados',
    'GIRO Coach local',
    'Bluetooth e sensores',
    'Inteligência artificial conectada',
    'Notificações e refinamentos',
    'Capacitor, testes e geração do APK'
  ];

  function $(id) { return document.getElementById(id); }

  /* ---------- Etapas ---------- */
  function desenharEtapas() {
    var ol = $('listaEtapas');
    ETAPAS.forEach(function (titulo, i) {
      var n = i + 1;
      var li = document.createElement('li');
      li.dataset.estado = n === GIRO.etapa ? 'atual' : 'futura';
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(n);
      var txt = document.createElement('span');
      txt.textContent = titulo;
      li.appendChild(num);
      li.appendChild(txt);
      if (n === GIRO.etapa) {
        var selo = document.createElement('span');
        selo.className = 'selo';
        selo.textContent = 'Atual';
        li.appendChild(selo);
      }
      ol.appendChild(li);
    });
  }

  /* ---------- Rede ---------- */
  function atualizarRede() {
    var chip = $('chipRede');
    var on = navigator.onLine;
    chip.dataset.estado = on ? 'online' : 'offline';
    chip.textContent = on ? 'Online' : 'Offline';
  }

  /* ---------- Instalação ---------- */
  var promptInstalacao = null;

  function instalado() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function atualizarInstalacao() {
    var el = $('estadoInstalacao');
    var btn = $('btnInstalar');
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (instalado()) {
      el.textContent = 'Instalado';
      btn.hidden = true;
      $('dicaIos').hidden = true;
      return;
    }
    el.textContent = 'No navegador';
    btn.hidden = !promptInstalacao;
    $('dicaIos').hidden = !(ios && !promptInstalacao);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    promptInstalacao = e;
    atualizarInstalacao();
  });

  window.addEventListener('appinstalled', function () {
    promptInstalacao = null;
    atualizarInstalacao();
  });

  $('btnInstalar').addEventListener('click', function () {
    if (!promptInstalacao) return;
    promptInstalacao.prompt();
    promptInstalacao.userChoice.then(function () {
      promptInstalacao = null;
      atualizarInstalacao();
    });
  });

  /* ---------- Offline (service worker) ---------- */
  function marcarOffline(estado, texto) {
    var el = $('estadoOffline');
    el.dataset.estado = estado;
    el.textContent = texto;
  }

  function verificarCache() {
    if (!('caches' in window)) { marcarOffline('indisponivel', 'Indisponível'); return; }
    caches.open('giro-v' + GIRO.versao).then(function (c) {
      return c.match('index.html');
    }).then(function (r) {
      if (r) marcarOffline('pronto', 'Pronto');
      else marcarOffline('verificando', 'Preparando…');
    }).catch(function () { marcarOffline('indisponivel', 'Indisponível'); });
  }

  function registrarSW() {
    if (!('serviceWorker' in navigator)) {
      marcarOffline('indisponivel', 'Indisponível');
      $('dicaHttps').hidden = false;
      return;
    }
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function observar(sw) {
        if (!sw) return;
        sw.addEventListener('statechange', function () {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            $('avisoAtualizacao').hidden = false;
            $('btnAtualizar').onclick = function () { sw.postMessage('PULAR_ESPERA'); };
          }
          if (sw.state === 'activated') verificarCache();
        });
      }
      if (reg.waiting && navigator.serviceWorker.controller) {
        $('avisoAtualizacao').hidden = false;
        $('btnAtualizar').onclick = function () { reg.waiting.postMessage('PULAR_ESPERA'); };
      }
      observar(reg.installing);
      reg.addEventListener('updatefound', function () { observar(reg.installing); });
      navigator.serviceWorker.ready.then(verificarCache);
    }).catch(function () {
      marcarOffline('indisponivel', 'Indisponível');
      $('dicaHttps').hidden = false;
    });

    /* Recarrega só ao ATUALIZAR uma versão já instalada. Na primeira visita o service worker
       assume o controle sem precisar recarregar a tela. */
    var recarregando = false;
    var tinhaControlador = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!tinhaControlador) { tinhaControlador = true; verificarCache(); return; }
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    });
  }

  /* ---------- Início ---------- */
  function iniciar() {
    $('versao').textContent = GIRO.versao;
    $('etapaAtual').textContent = GIRO.etapa + ' de ' + ETAPAS.length;
    desenharEtapas();
    atualizarRede();
    atualizarInstalacao();
    window.addEventListener('online', atualizarRede);
    window.addEventListener('offline', atualizarRede);
    registrarSW();

    $('app').hidden = false;
    var splash = $('splash');
    setTimeout(function () {
      splash.classList.add('saindo');
      setTimeout(function () { splash.remove(); }, 600);
    }, 1100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
