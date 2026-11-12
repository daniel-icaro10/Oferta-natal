/* =========================================================
   VLS Interativa — Ligação do Papai Noel
   Parte 1 (/)        : VSL com legenda + perguntas → ligação de teste na hora
   Parte 2 (/chamada) : preparo (toque 1, libera som) → chamada recebida
                        (toque 2, atender) → ligação + fechamento dentro
                        da chamada → Continuar → ofertas
   Plano B            : se a mensagem não chegar, a chamada acontece aqui.
   ========================================================= */
(() => {
  'use strict';

  // ---------------- CONFIGURAÇÃO ----------------
  // Preço de novembro (agendamento antecipado) até 01/12/2026 00:00 de Brasília
  const FIM_PROMO = window.CUSTOM_CONFIG && window.CUSTOM_CONFIG.fimPromo ? Date.parse(window.CUSTOM_CONFIG.fimPromo) : Date.parse('2026-12-01T03:00:00Z');
  const promoAtiva = () => Date.now() < FIM_PROMO;

  const DEFAULT_CONFIG = {
    apiLead: '/api/lead',
    // WhatsApp do ManyChat: depois da VSL o lead chama aqui e o fluxo do ManyChat vende.
    // O telefone é pedido antes (remarketing + casar a compra na Meta). Vazio = ligação de teste abre na hora.
    waManychat: '',
    waGatilho: 'Oi, Papai Noel! 🎅 Quero agendar a ligação',
    // "Tenho dúvidas, Papai Noel" na tela da oferta → link do ManyChat (x1), sem API.
    // Aceita o link completo gerado no ManyChat (ex.: https://wa.me/55...?text=PALAVRA) — o texto dele é mantido,
    // é o que dispara o gatilho. Se o link não tiver texto, vai a mensagem com o nome da criança. Vazio = não aparece.
    waDuvidas: 'https://wa.me/553584699814?text=' + encodeURIComponent('Olá Papai Noel, tenho algumas dúvidas.'),   // ManyChat · gatilho exato
    cameraTimeoutMs: 8000,      // se ignorar o pedido da câmera, a chamada segue
    year: 2026,
    plans: [
      {
        id: 'padrao', nome: 'Ligação Padrão', dur: 'Duração de 1 minuto · não fala o nome',
        itens: ['Agendamento de data e hora', 'Fica salva na Área Mágica', 'Duração de 1 minuto', 'Chamada interativa com câmera', 'Não fala o nome da criança'],
        de: '47,90', por: '19,90',
        checkout: 'https://web.singlr.com.br/pagar/RVpHb1ExdjZFQTREdXI1QUpDOEJKc3ZxOjIyOQ==',
      },
      {
        id: 'nome', best: true, badge: '⭐ Mais escolhido',
        nome: 'Com o <mark>nome da criança</mark>', dur: 'Duração de 1 minuto', verde: true,
        itens: ['Agendamento de data e hora', 'Fica salva na Área Mágica', 'Duração de 1 minuto', 'Chamada interativa com câmera', '<b>O Papai Noel fala o nome da criança</b>', '<b>Chamada interativa completa</b>'],
        de: '99,90', por: '47,90',
        checkout: 'https://web.singlr.com.br/pagar/a0UwZ09xd1hzNG1mU0hpN21TbmtTcWNKOjIzMA==',
      },
      {
        id: 'premium', nome: 'Mensagem personalizada', dur: 'Duração de até 1:30',
        itens: ['Tudo do pacote com o nome', '<b>Mensagem personalizada pelo pai</b> (ou com a nossa ajuda)', 'O Papai Noel fala o nome da criança', '<b>Duração de até 1:30</b>'],
        de: '147,00', por: '99,90',
        checkout: 'https://web.singlr.com.br/pagar/MzVPeTNtYmZLRFpoMlA0QVg5VjVtbTVZOjIzMQ==',
      },
    ],
  };
  const CONFIG = (window.CUSTOM_CONFIG && window.CUSTOM_CONFIG.plans) ? Object.assign({}, DEFAULT_CONFIG, window.CUSTOM_CONFIG) : DEFAULT_CONFIG;

  const SEG = { v1: 'v1', vm: 'vm', v2: 'v2', v3: 'v3', v4: 'v4', v4a: 'v4a', v4b: 'v4b', v4c: 'v4c', v5: 'v5b', v6: 'v6', v7: 'v7d', s5: 'ligacao3' };
  const CAPS = window.CAPTIONS || {};

  // ---------------- UTIL ----------------
  const $ = (id) => document.getElementById(id);
  const v = $('v'), panel = $('panel'), caps = $('caps'), ring = $('ring');
  const qs = new URLSearchParams(location.search);
  const isCallMode = /\/chamada\/?$/.test(location.pathname) || qs.has('chamada');
  // Canal WhatsApp: a pessoa chega pelo link do ManyChat direto na ligação (sem a VSL). ?w= traz o telefone, se houver.
  const modoWhats = /\/ligacao\/?$/.test(location.pathname) || qs.has('whats');
  // Parte 2 do robô do WhatsApp (teste A/B "Quero receber a ligação"): /ligacao?c=TOKEN&s=SESSAO
  const viaRobo = modoWhats && /^[A-Za-z0-9_-]{12,40}$/.test(qs.get('c') || '');
  const TEL_URL = (() => { let d = String(qs.get('w') || '').replace(/\D/g, ''); if (d.length >= 12 && d.startsWith('55')) d = d.slice(2); return (d.length === 11 && d[2] === '9') || d.length === 10 ? d : null; })();
  // Ligação comprada (vem da Área Mágica): /chamada?t=TOKEN[&tipo=pedido]
  const memberT = /^[A-Za-z0-9_-]{12,40}$/.test(qs.get('t') || '') ? qs.get('t') : null;
  let CALL_SRC = null, PODE_GRAVAR = true;
  const utms = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'src', 'sck']
    .forEach((k) => { if (qs.get(k)) utms[k] = qs.get(k); });
  // Indique e ganhe: o código viaja nas UTMs porque são elas que a Singlr devolve na compra
  const REF = (() => {
    const c = /^[a-z0-9]{8}$/.test(qs.get('ref') || '') ? qs.get('ref') : null;
    try {
      if (c) localStorage.setItem('pn_ref', c);
      return c || localStorage.getItem('pn_ref');
    } catch { return c; }
  })();
  if (modoWhats && !viaRobo) utms.utm_medium = 'ligacao_whats';
  if (viaRobo) utms.sck = 'wa_robo';   // separa as vendas deste canal no painel
  if (REF) Object.assign(utms, { utm_source: 'indicacao', utm_medium: 'indique_ganhe', utm_campaign: 'indicacao', utm_content: REF });

  const store = {
    get() { try { return JSON.parse(localStorage.getItem('pn_lead') || '{}'); } catch { return {}; } },
    set(o) { try { localStorage.setItem('pn_lead', JSON.stringify({ ...store.get(), ...o })); } catch {} },
  };
  const state = { para: qs.get('p') || store.get().para || null, quando: store.get().quando || null, phone: null };
  let soundOn = false;

  const cookie = (n) => (document.cookie.match(new RegExp(`(?:^|; )${n}=([^;]*)`)) || [])[1] || null;
  const novoId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  // eventos padrão da Meta (com eventID para deduplicar com o servidor)
  function metaStd(name, data = {}, eventID) {
    try { if (window.fbq) window.fbq('track', name, data, eventID ? { eventID } : undefined); } catch {}
  }

  // ---- Rastreio do funil (painel /painel) — anônimo, em lote ----
  const SESSAO = (() => {
    try {
      const s0 = qs.get('s');                     // veio do robô do WhatsApp: continua a mesma sessão do funil
      if (/^[A-Za-z0-9_-]{8,40}$/.test(s0 || '')) { localStorage.setItem('pn_sessao', JSON.stringify({ id: s0, t: Date.now() })); return s0; }
      const j = JSON.parse(localStorage.getItem('pn_sessao') || 'null');
      if (j && Date.now() - j.t < 6 * 3600e3) { j.t = Date.now(); localStorage.setItem('pn_sessao', JSON.stringify(j)); return j.id; }
      const id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
      localStorage.setItem('pn_sessao', JSON.stringify({ id, t: Date.now() }));
      return id;
    } catch { return `s${Date.now()}${Math.floor(Math.random() * 1e6)}`; }
  })();
  const filaEv = [];
  function enviarEventos() {
    if (!filaEv.length) return;
    const corpo = JSON.stringify({ s: SESSAO, p: window.PN_PAGINA || 'funil', u: utms, ev: filaEv.splice(0, 40) });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([corpo], { type: 'text/plain' }))) return;
    } catch {}
    fetch('/api/track', { method: 'POST', body: corpo, keepalive: true }).catch(() => {});
  }
  setInterval(enviarEventos, 3000);
  addEventListener('pagehide', enviarEventos);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviarEventos(); });

  function track(name, data = {}) {
    try { if (window.fbq) window.fbq('trackCustom', name, data); } catch {}
    (window.dataLayer = window.dataLayer || []).push({ event: name, ...data });
    filaEv.push([name, data && Object.keys(data).length ? data : null]);
  }
  window.PN_PAGINA = modoWhats && !viaRobo ? 'whats' : 'v2';
  filaEv.push(['Visitou', { pagina: window.PN_PAGINA, ref: document.referrer ? new URL(document.referrer).hostname : null }]);
  setTimeout(enviarEventos, 1500);

  const src = (k) => `/assets/v2/video/${SEG[k]}.mp4`;
  const poster = (k) => `/assets/v2/img/${SEG[k]}.jpg`;

  // Pré-carrega o trecho inteiro em memória → troca instantânea
  const blobs = {}, loading = {};
  function preload(k) {
    if (blobs[k] || loading[k]) return loading[k];
    loading[k] = fetch(src(k)).then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => (blobs[k] = URL.createObjectURL(b))).catch(() => null);
    return loading[k];
  }

  // ---------------- ÁUDIO: música de Natal de fundo + bip (Web Audio) ----------------
  let actx = null, musGain = null, musBuf = null, musSrc = null, musQuer = false;
  const MUS_VOL = 0.18;                       // bem baixinho, por baixo da voz
  function audioInit() {                      // chamar dentro de um toque do usuário
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';  // iPhone: toca mesmo no silencioso
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        actx = new AC(); musGain = actx.createGain(); musGain.gain.value = 0; musGain.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume();
      if (!musBuf && !audioInit.carregando) {
        audioInit.carregando = true;
        fetch('/assets/audio/musica-natal.mp3').then((r) => r.arrayBuffer())
          .then((b) => new Promise((ok, no) => actx.decodeAudioData(b, ok, no)))
          .then((buf) => { musBuf = buf; if (musQuer) musicaTocar(); }).catch(() => {});
      }
    } catch {}
  }
  function rampa(alvo, seg) {
    const t = actx.currentTime; musGain.gain.cancelScheduledValues(t);
    musGain.gain.setValueAtTime(musGain.gain.value, t); musGain.gain.linearRampToValueAtTime(alvo, t + seg);
  }
  function musicaTocar() {
    musQuer = true;
    if (!actx || !musBuf) return;
    if (!musSrc) { musSrc = actx.createBufferSource(); musSrc.buffer = musBuf; musSrc.loop = true; musSrc.connect(musGain); musSrc.start(); }
    rampa(MUS_VOL, 1.5);
  }
  function musicaParar() { musQuer = false; if (actx && musGain) rampa(0, 0.6); }
  function bip() {
    if (!actx) return;
    const t0 = actx.currentTime;
    [0, 0.24].forEach((d) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(0.32, t0 + d + 0.01);
      g.gain.setValueAtTime(0.32, t0 + d + 0.13); g.gain.linearRampToValueAtTime(0, t0 + d + 0.17);
      o.connect(g); g.connect(actx.destination); o.start(t0 + d); o.stop(t0 + d + 0.2);
    });
  }
  // saiu da aba (foi pro WhatsApp, etc.) → silencia; voltou → retoma
  document.addEventListener('visibilitychange', () => {
    if (!actx) return;
    if (document.hidden) actx.suspend(); else actx.resume();
  });

  // ---------------- LEGENDA ----------------
  let capKey = null, capLine = -1, rafId = 0;
  function capsLoop() {
    cancelAnimationFrame(rafId);
    const tick = () => {
      renderCaps(v.currentTime);
      if (!v.paused && !v.ended) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function renderCaps(t) {
    const lines = capKey && CAPS[capKey];
    if (!lines) { caps.innerHTML = ''; capLine = -1; return; }
    const i = lines.findIndex((l) => t >= l.a - 0.05 && t < l.b);
    if (i !== capLine) {
      capLine = i;
      caps.innerHTML = i < 0 ? '' : `<span class="ln">${lines[i].w.map((w) => `<span class="w">${w[2]}</span>`).join(' ')}</span>`;
    }
    if (i >= 0) {
      const ws = caps.querySelectorAll('.w');
      lines[i].w.forEach((w, j) => ws[j] && ws[j].classList.toggle('on', t >= w[0] - 0.03 && t < w[1] + 0.08));
    }
  }
  v.addEventListener('play', capsLoop);
  v.addEventListener('seeked', () => renderCaps(v.currentTime));

  // ---------------- PLAYER ----------------
  let atCue = null;   // [segundo, função] → dispara uma vez durante o trecho
  v.addEventListener('timeupdate', () => {
    if (atCue && v.currentTime >= atCue[0]) { const f = atCue[1]; atCue = null; f(); }
  });
  let segTok = 0;
  function playSeg(k, onEnd, { withCaps = true, keepPanel = false, at = null, cedo = false } = {}) {
    const tok = ++segTok;
    if (!keepPanel) hidePanel();
    atCue = at;
    capKey = withCaps ? k : null; capLine = -1; caps.innerHTML = '';
    v.poster = poster(k);
    v.src = blobs[k] || src(k);
    v.muted = !soundOn;
    // Botões: surgem 1,8 s antes do fim da fala (o Papai Noel termina a pergunta com os botões já na tela).
    // cedo:true → 1 s depois que o trecho começa (não usado hoje; voltou ao final em 08/11 a pedido).
    let feito = false;
    const fim = () => { if (feito || tok !== segTok) return; feito = true; onEnd && onEnd(); };
    const L = CAPS[k];
    if (onEnd && !at) {
      if (cedo) setTimeout(fim, 1000);
      else if (L && L.length) { const ult = L[L.length - 1]; atCue = [Math.max(0.5, ult.w[ult.w.length - 1][1] - 1.8), fim]; }
    }
    v.onended = () => { caps.innerHTML = ''; capKey = null; fim(); };
    const p = v.play();
    if (p) p.catch(() => { $('unmute').hidden = false; });
    track('Trecho', { trecho: SEG[k] });
  }

  function enableSound() {
    soundOn = true;
    v.muted = false;
    $('unmute').hidden = true;
  }

  // ---------------- PAINEL ----------------
  function showPanel(html, bind) {
    panel.innerHTML = html;
    bind && bind(panel);
    requestAnimationFrame(() => {
      panel.classList.add('show');
      // a legenda continua, logo acima dos botões
      // posição sem a animação de entrada (offsetTop ignora o deslize)
      if (caps.offsetParent === panel.offsetParent && panel.offsetParent) caps.style.bottom = `${Math.round(panel.offsetParent.clientHeight - panel.offsetTop + 16)}px`;
    });
  }
  function hidePanel() { panel.classList.remove('show'); caps.style.bottom = ''; }

  // =========================================================
  //  PARTE 1 — VSL INTERATIVA
  // =========================================================
  function boot() {
    preload('v1'); preload('vm');
    $('bStart').onclick = () => {
      track('Iniciou');
      enableSound();
      audioInit(); musicaTocar();
      carregarReserva();
      $('intro').classList.add('out');
      setTimeout(() => { $('intro').hidden = true; }, 460);
      playSeg('v1', perguntaSurpresa);
      setTimeout(() => preload('v2'), 2500);
    };
    $('unmute').onclick = () => { enableSound(); v.play().catch(() => {}); };
  }

  const botoes = (ops) => `<div class="v2-ops">${ops.map(([id, t]) => `<button class="btn3d sm" data-v="${id}" type="button">${t}</button>`).join('')}</div>`;
  const aoEscolher = (p, fn) => p.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { enableSound(); fn(b.dataset.v); }; });

  // ---------- Canal WhatsApp: nome da criança → ligação na hora ----------
  function bootRobo() {
    track('AbriuLinkRobo', { c: qs.get('c') });
    state.leadId = novoId('lead');
    try { const k = 'pn_lead_' + qs.get('c'); if (!localStorage.getItem(k)) { localStorage.setItem(k, '1'); metaStd('Lead', { content_name: 'ligacao_robo' }, state.leadId); } } catch {}
    // sem a foto do Papai Noel: fundo escuro e o certificado no centro; depois aparece "Entrar na chamada"
    $('intro').hidden = true; v.removeAttribute('poster'); $('screen').style.background = '#0b0614';
    new Image().src = '/assets/v2/img/certificado-bg.jpg';
    fetch(`/api/wa-ligacao?c=${encodeURIComponent(qs.get('c'))}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => {
      state.artigo = d.artigo || 'o';
      state.nome = d.nome || (state.artigo === 'as' ? 'crianças' : '');
      if (d.conquista && d.conquista.frase) state.conquista = d.conquista;
      if (d.utms) Object.keys(d.utms).forEach((k) => { if (!utms[k]) utms[k] = d.utms[k]; });
      if (window.SimNoel) SimNoel.escolher(state.artigo === 'as' ? null : state.nome || null, state.artigo);   // já começa a baixar a ligação
      const quem = state.artigo === 'as' ? 'as crianças' : d.nome ? `${G('o', 'a', 'as')} ${esc(d.nome)}` : G('o seu pequeno', 'a sua pequena', 'as crianças');
      const m = document.createElement('div');
      m.className = 'cert-wrap robo';
      m.innerHTML = `<div class="crt-luz"></div>
        <div class="crt-palco">${htmlCertificado()}</div>
        <p class="crt-dica">✨ Este é o certificado que ${G('ele', 'ela', 'eles')} vai receber junto com a ligação<br>
          <span style="opacity:.85">🤫 É uma demonstração só para você: deixe ${quem} longe para não estragar a surpresa</span></p>
        <button class="btn3d green pulse cert-ir" type="button">📞 Entrar na chamada</button>`;
      document.body.appendChild(m);
      requestAnimationFrame(() => {
        m.classList.add('show');
        setTimeout(() => brilhos(m), 350);
        setTimeout(() => m.classList.add('selo'), 2300);
      });
      track('ViuCertificado', { conquista: state.conquista?.id, via: 'robo' });
      m.querySelector('.cert-ir').onclick = () => {
        track('EntrouChamadaRobo'); track('PediuLigacao');
        enableSound(); audioInit();
        m.classList.remove('show'); setTimeout(() => m.remove(), 350);
        openCall(false);
      };
    });
  }

  function bootWhats() {
    if (viaRobo) return bootRobo();
    track('AbriuLigacaoWhats');
    carregarReserva();
    const box = document.querySelector('.intro-box');
    const passo1 = () => {
      box.innerHTML = `<div class="intro-pre">Ligação do</div><h1>Papai Noel</h1><div class="intro-line"></div>
        <p>O Papai Noel vai fazer uma videochamada agora! 🎅<br>Quem vai atender?</p>
        <div class="v2-ops w-ops">${[['o', '👦 Menino'], ['a', '👧 Menina'], ['as', '👧👦 Várias crianças']].map(([id, t]) => `<button class="btn3d sm" data-t="${id}" type="button">${t}</button>`).join('')}</div>
        <div class="intro-sound">🔊 Ligue o som do celular</div>`;
      box.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { audioInit(); track('Tipo', { r: b.dataset.t }); passo2(b.dataset.t); }; });
    };
    const passo2 = (art) => {
      state.artigo = art;
      const plural = art === 'as';
      box.innerHTML = `<div class="intro-pre">Ligação do</div><h1>Papai Noel</h1><div class="intro-line"></div>
        ${plural ? '<p>Chame a criançada para perto! 🎄</p>' : `<p>Qual o nome ${art === 'a' ? 'dela' : 'dele'}? O Papai Noel vai chamar pelo nome! ✨</p>
        <label class="phone w-nome"><input id="nomeW" type="text" autocomplete="off" autocapitalize="words" maxlength="30" placeholder="${art === 'a' ? 'Ex.: Maria Eduarda' : 'Ex.: Miguel'}"></label>
        <div class="err" id="werr"></div>`}
        <button class="btn3d green pulse intro-btn" id="bLigar" type="button">📞 Receber a ligação</button>
        <button class="back w-voltar" id="bVoltarW" type="button">voltar</button>`;
      box.querySelector('#bVoltarW').onclick = passo1;
      const inp = box.querySelector('#nomeW');
      const ligar = () => {
        if (!plural) {
          const nome = inp.value.trim().replace(/\s+/g, ' ');
          const erro = !/^[\p{L}][\p{L}' -]{1,29}$/u.test(nome) ? 'Digite só o nome 😉' : nome.split(' ').length > 2 ? 'Use no máximo dois nomes 😉' : PROIBIDAS.test(nome) ? 'Digite o nome de verdade 😉' : '';
          if (erro) { box.querySelector('#werr').textContent = erro; inp.focus(); return; }
          inp.blur();
          state.nome = nome.split(' ').map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ');
          track('Nome', { nome: state.nome, artigo: art });
        } else {
          state.nome = 'crianças';
          track('Nome', { nome: 'Várias crianças', artigo: 'as' });
        }
        if (window.SimNoel) SimNoel.escolher(plural ? null : state.nome, art);
        state.leadId = novoId('lead'); metaStd('Lead', { content_name: 'ligacao_whats' }, state.leadId);
        track('PediuLigacao');
        enableSound(); audioInit();
        $('intro').classList.add('out');
        setTimeout(() => { $('intro').hidden = true; }, 460);
        openCall(false);
      };
      box.querySelector('#bLigar').onclick = ligar;
      if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ligar(); });
    };
    passo1();
  }

  function perguntaSurpresa() {
    showPanel(botoes([['sim', 'Sim! Estou preparando uma surpresa!'], ['especial', 'Quero fazer deste Natal algo especial!']]), (p) => aoEscolher(p, (r) => {
      track('Surpresa', { r }); preload('v3'); playSeg('vm', perguntaMagia);
    }));
  }

  function perguntaMagia() {
    showPanel(botoes([['muito', 'Sim! Acredita muito!'], ['ama', 'Sim, e ama o Papai Noel!'], ['desconfia', 'Está começando a desconfiar... 🤭']]), (p) => aoEscolher(p, (r) => {
      track('Magia', { r }); preload('v4a');
      playSeg('v2', querExperimentar);
    }));
  }

  function querExperimentar() {
    track('ABLigacao', { lig: LIG_VAR });
    if (LIG_VAR === 'whats') {
      // versão B: o botão leva direto ao WhatsApp do robô (o código liga a conversa a este visitante)
      const cod = SESSAO.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
      const url = `https://wa.me/${WA_ROBO}?text=${encodeURIComponent(`Papai Noel, quero receber a ligação! 🎅 #${cod}`)}`;
      const icWa = '<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" style="vertical-align:-6px;margin-right:8px;fill:#fff"><path d="M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.3.6 4.54 1.74 6.5L3 29l6.68-1.75A12.95 12.95 0 0 0 16.04 29C23.2 29 29 23.18 29 16S23.2 3 16.04 3zm0 23.76c-2.03 0-4.01-.55-5.74-1.58l-.41-.24-3.96 1.04 1.06-3.86-.27-.4A10.73 10.73 0 0 1 5.3 16c0-5.92 4.82-10.74 10.75-10.74S26.78 10.08 26.78 16s-4.82 10.76-10.74 10.76zm5.9-8.05c-.32-.16-1.91-.94-2.2-1.05-.3-.11-.51-.16-.73.16-.21.32-.83 1.05-1.02 1.27-.19.21-.38.24-.7.08-.32-.16-1.36-.5-2.59-1.6-.96-.85-1.6-1.9-1.8-2.22-.19-.32-.02-.5.14-.66.15-.14.32-.38.48-.57.16-.19.21-.32.32-.54.11-.21.05-.4-.03-.56-.08-.16-.73-1.75-1-2.4-.26-.63-.53-.54-.73-.55h-.62c-.21 0-.56.08-.86.4-.3.32-1.13 1.1-1.13 2.69s1.16 3.12 1.32 3.33c.16.21 2.28 3.48 5.52 4.88.77.33 1.37.53 1.84.68.77.25 1.48.21 2.03.13.62-.09 1.91-.78 2.18-1.53.27-.75.27-1.4.19-1.53-.08-.13-.29-.21-.62-.37z"/></svg>';
      showPanel(`<a class="btn3d green pulse" id="b1" href="${url}">${icWa}Quero receber a ligação</a>`, (p) => {
        p.querySelector('#b1').onclick = () => { track('QuerLigacao', { lig: 'whats' }); track('FoiProWhats', { cod }); enviarEventos(); };
      });
      return;
    }
    showPanel('<button class="btn3d pulse" id="b1" type="button">📞 Quero receber a ligação</button>', (p) => {
      p.querySelector('#b1').onclick = () => { enableSound(); track('QuerLigacao'); preload('v5'); playSeg('v3', askTipo); };
    });
  }

  const PROIBIDAS = /\b(porra|caralho|merda|bosta|puta|viado|buceta|cu|pau|rola|foda|fdp|vagabund\w*|arrombad\w*|desgra[cç]\w*|bolsonaro|lula)\b/i;
  // Primeiro o tipo de ligação, depois o nome (várias crianças usa a fala pronta, sem nome)
  function askTipo() {
    showPanel(`<div class="label">Quem vai atender a ligação?</div>${botoes([['o', '👦 Menino'], ['a', '👧 Menina'], ['as', '👧👦 Várias crianças']])}`, (p) => aoEscolher(p, (r) => {
      track('Tipo', { r });
      if (r !== 'as') { askNome(r); return; }
      state.artigo = 'as'; state.nome = 'crianças';
      track('Nome', { nome: 'Várias crianças', artigo: 'as' }); track('PediuLigacao');
      state.leadId = novoId('lead'); metaStd('Lead', { content_name: 'ligacao_teste' }, state.leadId);
      falas = plural;
      playSeg('v4a', askCelebra);
    }));
  }

  function askNome(art) {
    showPanel(`<div class="card"><h3>Como devo chamar nosso convidado especial? 🎅</h3><p>Pode ser o seu nome ou o do pequeno. Até dois nomes.</p>
      <label class="phone"><input id="nomeC" type="text" autocomplete="off" autocapitalize="words" maxlength="30" placeholder="Ex.: Maria Eduarda"></label>
      <div class="err" id="perr"></div>
      <button class="btn3d pulse" id="bNome" type="button">Continuar ➜</button></div>`, (p) => {
      const inp = p.querySelector('#nomeC');
      const ir = () => {
        const nome = inp.value.trim().replace(/\s+/g, ' ');
        const partes = nome.split(' ');
        if (!/^[\p{L}][\p{L}' -]{1,29}$/u.test(nome)) { p.querySelector('#perr').textContent = 'Digite só o nome 😉'; inp.focus(); return; }
        if (partes.length > 2) { p.querySelector('#perr').textContent = 'Use no máximo dois nomes 😉'; inp.focus(); return; }
        if (PROIBIDAS.test(nome)) { p.querySelector('#perr').textContent = 'Digite o nome de verdade 😉'; inp.focus(); return; }
        inp.blur();
        state.nome = nome.split(' ').map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ');
        state.artigo = art;
        track('Nome', { nome: state.nome, artigo: art }); track('PediuLigacao');
        state.leadId = novoId('lead'); metaStd('Lead', { content_name: 'ligacao_teste' }, state.leadId);
        if (window.SimNoel) SimNoel.escolher(state.nome, art); else prepararFala(state.nome, art);
        playSeg('v4a', askCelebra);
      };
      p.querySelector('#bNome').onclick = ir;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
    });
  }

  // ---------- Certificado de bom menino / boa menina ----------
  const G = (o, a, as) => ({ o, a, as }[state.artigo] ?? o);
  function askCelebra() {
    preload('v4b');
    new Image().src = '/assets/v2/img/certificado-bg.jpg';   // já carrega o fundo do certificado
    const ele = G('ele', 'ela', 'eles');
    showPanel(botoes([['sempre', `🎉 Sempre celebro com ${ele}!`], ['mais', '💛 Preciso celebrar mais'], ['nao', '🙈 Não tenho esse costume']]), (p) => aoEscolher(p, (r) => {
      track('Celebra', { r }); preload('v4c'); playSeg('v4b', askConquista);
    }));
  }

  // [id, ícone, rótulo, frase do certificado]
  const CONQUISTAS = () => [
    ['aluno', '📚', G('Foi ótimo aluno', 'Foi ótima aluna', 'Foram ótimos alunos'), G('por ter sido um ótimo aluno', 'por ter sido uma ótima aluna', 'por terem sido ótimos alunos')],
    ['ler', '✏️', G('Aprendeu a ler', 'Aprendeu a ler', 'Aprenderam a ler'), G('por ter aprendido a ler', 'por ter aprendido a ler', 'por terem aprendido a ler')],
    ['fralda', '🧷', G('Desfraldou', 'Desfraldou', 'Desfraldaram'), G('por ter dado tchau às fraldas', 'por ter dado tchau às fraldas', 'por terem dado tchau às fraldas')],
    ['bico', '🍼', G('Largou bico ou mamadeira', 'Largou bico ou mamadeira', 'Largaram bico ou mamadeira'), G('por ter dado tchau ao bico e à mamadeira', 'por ter dado tchau ao bico e à mamadeira', 'por terem dado tchau ao bico e à mamadeira')],
    ['comportou', '😇', G('Se comportou bem', 'Se comportou bem', 'Se comportaram bem'), 'pelo ótimo comportamento durante todo o ano'],
    ['abencoado', '🙏', G('Abençoado por Deus', 'Abençoada por Deus', 'Abençoados por Deus'), G('por ser abençoado por Deus e encher o Natal de alegria', 'por ser abençoada por Deus e encher o Natal de alegria', 'por serem abençoados por Deus e encherem o Natal de alegria')],
  ];
  function askConquista() {
    const lista = CONQUISTAS();
    showPanel(`<div class="cq-box">
        <div class="cq-grid">${lista.map(([id, ic, t]) => `<button class="cq" data-c="${id}" type="button"><span class="cq-ic">${ic}</span><span class="cq-t">${t}</span></button>`).join('')}</div>
        <button class="cq-digitar" id="cqDig" type="button">✍️ Quero digitar</button>
        <div class="cq-campo" id="cqCampo" hidden>
          <input id="cqTxt" type="text" maxlength="60" autocomplete="off" placeholder="Ex.: aprendeu a andar de bicicleta">
          <button class="btn3d green sm" id="cqOk" type="button">Pronto ✓</button>
          <div class="err" id="cqErr"></div>
        </div>
      </div>`, (p) => {
      const escolher = (id, frase, rotulo) => {
        enableSound();
        state.conquista = { id, frase, rotulo };
        track('Conquista', { id, texto: id === 'outra' ? rotulo : undefined });
        playSeg('v4c', mostrarCertificado, { cedo: false });
      };
      p.querySelectorAll('[data-c]').forEach((b) => {
        b.onclick = () => { const c = lista.find((x) => x[0] === b.dataset.c); b.classList.add('on'); escolher(c[0], c[3], c[2]); };
      });
      const campo = p.querySelector('#cqCampo'), inp = p.querySelector('#cqTxt');
      p.querySelector('#cqDig').onclick = (e) => { e.currentTarget.hidden = true; campo.hidden = false; inp.focus(); };
      const ok = () => {
        const t = inp.value.trim().replace(/\s+/g, ' ');
        if (t.length < 3) { p.querySelector('#cqErr').textContent = 'Conta um pouquinho mais 😉'; inp.focus(); return; }
        if (PROIBIDAS.test(t)) { p.querySelector('#cqErr').textContent = 'Escreva uma conquista de verdade 😉'; inp.focus(); return; }
        inp.blur();
        escolher('outra', `pela conquista: “${t.charAt(0).toLowerCase()}${t.slice(1)}”`, t);
      };
      p.querySelector('#cqOk').onclick = ok;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    });
  }

  // Certificado (A4 deitado): fundo ilustrado + texto. Entrada mágica: brilho, estrelas, giro,
  // o nome sendo escrito e o carimbo do Papai Noel.
  function htmlCertificado() {
    const c = state.conquista || { frase: 'pelo ótimo comportamento durante todo o ano' };
    const nome = state.artigo === 'as' ? 'As crianças da casa' : (state.nome || G('Nosso pequeno', 'Nossa pequena', 'As crianças'));
    const titulo = G('Bom Menino', 'Boa Menina', 'Bons Meninos');
    const foi = G('foi um bom menino', 'foi uma boa menina', 'foram bons meninos e meninas');
    return `<div class="crt">
        <img class="crt-bg" src="/assets/v2/img/certificado-bg.jpg" alt="">
        <div class="crt-txt">
          <div class="crt-of">Certificado oficial do Papai Noel</div>
          <div class="crt-tit">Certificado de ${titulo}</div>
          <div class="crt-ln">Com muito carinho, o Papai Noel reconhece que</div>
          <div class="crt-nome"><span>${esc(nome)}</span></div>
          <div class="crt-ln crt-fr">${foi} em ${new Date().getFullYear()}, ${esc(c.frase)}.</div>
          <div class="crt-pe">
            <div class="crt-ass"><small>Assinado:</small><span>Papai Noel</span></div>
            <svg class="crt-selo" viewBox="0 0 120 120" aria-hidden="true">
              <defs><path id="crtArco" d="M60,60 m-41,0 a41,41 0 1,1 82,0 a41,41 0 1,1 -82,0"/></defs>
              <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="4"/>
              <circle cx="60" cy="60" r="30" fill="none" stroke="currentColor" stroke-width="2.5"/>
              <text font-size="12.5" font-weight="800" letter-spacing="2.2" fill="currentColor"><textPath href="#crtArco">APROVADO · PAPAI NOEL · POLO NORTE ·</textPath></text>
              <text x="60" y="70" text-anchor="middle" font-size="28">🎅</text>
            </svg>
            <div class="crt-data"><small>Data:</small><span>Natal ${new Date().getFullYear()}</span></div>
          </div>
        </div>
      </div>`;
  }

  function somMagico() {
    if (!actx) return;
    const t0 = actx.currentTime;
    [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const t = t0 + i * 0.09;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 1);
    });
  }

  function brilhos(alvo, n = 70) {
    const cv = document.createElement('canvas');
    cv.className = 'crt-fx';
    alvo.appendChild(cv);
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const cor = ['#ffd54a', '#fff3b0', '#ffffff', '#ff6b6b', '#7be495'];
    const ps = Array.from({ length: n }, () => {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 7;
      return { x: W / 2, y: H / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, r: 1.5 + Math.random() * 3.5, c: cor[(Math.random() * cor.length) | 0], vida: 1, rot: Math.random() * 6 };
    });
    const estrela = (px, py, r, rot) => {
      x.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r * 1.6, aa = rot + (i * Math.PI) / 5; x.lineTo(px + Math.cos(aa) * rr, py + Math.sin(aa) * rr); }
      x.closePath(); x.fill();
    };
    let fim = performance.now() + 2600;
    (function quadro() {
      x.clearRect(0, 0, W, H);
      ps.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.vx *= 0.985; p.vida -= 0.008; p.rot += 0.08;
        x.globalAlpha = Math.max(0, p.vida); x.fillStyle = p.c; estrela(p.x, p.y, p.r, p.rot);
      });
      if (performance.now() < fim) requestAnimationFrame(quadro); else cv.remove();
    })();
  }

  function mostrarCertificado() {
    hidePanel();
    const m = document.createElement('div');
    m.className = 'cert-wrap';
    m.innerHTML = `<div class="crt-luz"></div>
      <div class="crt-palco">${htmlCertificado()}</div>
      <p class="crt-dica">✨ Este é o certificado que você vai receber em PDF para imprimir</p>
      <button class="btn3d green pulse cert-ir" type="button">Continuar ➜</button>`;
    document.body.appendChild(m);
    requestAnimationFrame(() => {
      m.classList.add('show');
      somMagico();
      setTimeout(() => brilhos(m), 350);
      setTimeout(() => { m.classList.add('selo'); bip(); }, 2300);
    });
    track('ViuCertificado', { conquista: state.conquista?.id });
    m.querySelector('.cert-ir').onclick = () => {
      enableSound();
      m.classList.remove('show'); setTimeout(() => m.remove(), 350);
      playSeg('v5', botaoVamos);
    };
  }

  function askPresente() {
    showPanel(botoes([['ja', 'Já escolhi!'], ['nao', 'Ainda não']]), (p) => aoEscolher(p, (r) => {
      track('Presente', { r }); playSeg('v5', botaoVamos);
    }));
  }

  // Teste A/B da ligação: A = ligação aqui na página · B = "Quero receber a ligação" no WhatsApp (robô)
  // Fica salvo no aparelho. Para ver uma versão: ?lig=pagina ou ?lig=whats
  const AB_LIGACAO_ATIVO = true;         // 50/50 desde 12/11 (false = todo mundo na A; ?lig= força)
  const WA_ROBO = '553599845117';
  const LIG_VAR = (() => {
    const f = qs.get('lig'); let x = f === 'pagina' || f === 'whats' ? f : null;
    try { x = x || localStorage.getItem('pn_lig'); } catch {}
    if (x !== 'pagina' && x !== 'whats') x = AB_LIGACAO_ATIVO && Math.random() < 0.5 ? 'whats' : 'pagina';
    if (!AB_LIGACAO_ATIVO && f !== 'whats') x = 'pagina';
    try { if (AB_LIGACAO_ATIVO || f) localStorage.setItem('pn_lig', x); } catch {}
    return x;
  })();
  function botaoVamos() {
    showPanel('<button class="btn3d green pulse" id="b1" type="button">🎅 Vamos, Papai Noel!</button>', (p) => {
      p.querySelector('#b1').onclick = () => { enableSound(); audioInit(); track('Vamos'); openCall(false); };
    });
  }


  // =========================================================
  //  CHAT DO PAPAI NOEL — substitui a mensagem do WhatsApp enquanto o número está fora
  //  (estilo de mensageiro, com a nossa marca; o link abre a videochamada aqui mesmo)
  // =========================================================
  function popMsg() {
    if (!actx) return;
    try {
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(990, t + 0.08);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.01); g.gain.linearRampToValueAtTime(0, t + 0.14);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.16);
    } catch {}
  }

  const IC = {
    voltar: '<svg viewBox="0 0 24 24"><path d="M12 4l1.4 1.4L7.8 11H20v2H7.8l5.6 5.6L12 20l-8-8z"/></svg>',
    video: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/></svg>',
    fone: '<svg viewBox="0 0 24 24"><path d="M20 15.5c-1.2 0-2.4-.2-3.6-.6a1 1 0 0 0-1 .25l-2.2 2.2a15 15 0 0 1-6.6-6.6l2.2-2.2a1 1 0 0 0 .25-1A11.4 11.4 0 0 1 8.5 4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1 17 17 0 0 0 17 17 1 1 0 0 0 1-1v-3.5a1 1 0 0 0-1-1z"/></svg>',
    emoji: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-3.5-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 17.5c2.3 0 4.3-1.5 5-3.5H7c.7 2 2.7 3.5 5 3.5z"/></svg>',
    clipe: '<svg viewBox="0 0 24 24"><path d="M16.5 6.5v10.5a4.5 4.5 0 0 1-9 0V5.5a3 3 0 0 1 6 0V16a1.5 1.5 0 0 1-3 0V6.5H9V16a3 3 0 0 0 6 0V5.5a4.5 4.5 0 0 0-9 0V17a6 6 0 0 0 12 0V6.5z"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8-3h-3.2L15 4H9L7.2 6H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm-8 13a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3zm5.3-3a5.3 5.3 0 0 1-10.6 0H5a7 7 0 0 0 6 6.9V22h2v-3.1a7 7 0 0 0 6-6.9z"/></svg>',
    responder: '<svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7z"/></svg>',
  };

  function abrirChat() {
    hidePanel();
    try { v.pause(); } catch {}
    caps.innerHTML = '';
    preload('s5');
    const hr = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const quem = `${state.artigo} ${state.nome}`;
    const el = document.createElement('div');
    el.className = 'chat';
    el.innerHTML = `
      <header class="chat-top"><span class="vt">${IC.voltar}</span><img src="/assets/img/avatar.jpg" alt="">
        <div class="nm"><b>Papai Noel 🎅</b><small id="chSt">online</small></div>
        <div class="ic">${IC.video}${IC.fone}</div></header>
      <div class="chat-body" id="chBody"><div class="chat-day">Hoje</div></div>
      <div class="chat-bar"><div class="inp">${IC.emoji}<span>Mensagem</span>${IC.clipe}${IC.camera}</div><div class="mic">${IC.mic}</div></div>`;
    document.body.appendChild(el);
    const body = el.querySelector('#chBody'), st = el.querySelector('#chSt');
    let ultimo = null;
    const rolar = () => { body.scrollTop = body.scrollHeight; };
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const add = (lado, html, extra = '') => {
      const b = document.createElement('div');
      b.className = `bub ${lado} ${extra} ${ultimo !== lado ? 'tail' : ''}`;
      b.innerHTML = html; body.appendChild(b); ultimo = lado; rolar(); return b;
    };
    async function fala(html, ms = 1300, extra = '') {
      st.textContent = 'digitando...';
      const t = document.createElement('div'); t.className = 'bub in typing'; t.innerHTML = '<i></i><i></i><i></i>';
      body.appendChild(t); rolar();
      await espera(ms);
      t.remove(); st.textContent = 'online';
      popMsg();
      return add('in', html, extra);
    }
    const txt = (html) => `${html}<span class="hr">${hr()}</span>`;
    function atender() {
      track('ChatAtendeu');
      el.remove();
      openCall(false);   // o toque libera som e câmera
    }
    track('ChatAbriu');
    (async () => {
      await espera(500);
      await fala(txt('Ho ho ho… olha eu aqui! 🎅'));
      const m2 = await fala(`<div class="tx">Está disponível? O Papai Noel tem uma mensagem especial para você. ✨<span class="hr">${hr()}</span></div>
        <button class="wbtn pulse-txt" type="button">${IC.responder}Estou sim! 🙋</button>`, 1600, 'iv');
      const bSim = m2.querySelector('.wbtn');
      await new Promise((ok) => { bSim.onclick = () => { audioInit(); ok(); }; });
      bSim.disabled = true; bSim.classList.remove('pulse-txt');
      add('out', txt('Estou sim! 🙋'));
      await espera(500);
      await fala(txt(`Que alegria! Fiquei sabendo que você quer uma ligação para ${quem}. 🎄`), 1500);
      const m4 = await fala(`<img src="/assets/img/avatar.jpg" alt="">
        <div class="tx"><b>Papai Noel está te chamando 🎅</b><br>Toque no botão abaixo pra gente fazer um teste agora 👇
          <span class="ft">Ligação do Papai Noel</span><span class="hr">${hr()}</span></div>
        <button class="wbtn pulse-txt" type="button">${IC.link}Atender videochamada</button>`, 1800, 'iv');
      m4.querySelector('.wbtn').onclick = atender;
      m4.querySelector('img').onclick = atender;
    })();
  }


  // ---------- Falas com o nome: geradas enquanto o Papai Noel conversa, tocadas no vídeo da ligação ----------
  let falas = null, reserva = null, plural = null, fontes = [], falaTocando = false, emChamada = false;
  const b64Audio = async (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return actx.decodeAudioData(u.buffer); };
  const decodificar = async (j) => [{ ...j.mika, buf: await b64Audio(j.mika.audio) }, { ...j.noel, buf: await b64Audio(j.noel.audio) }];
  async function carregarReserva() {
    try { reserva = await decodificar(await (await fetch('/assets/v2/audio/reserva.json')).json()); } catch {}
    try { plural = await decodificar(await (await fetch('/assets/v2/audio/plural.json')).json()); } catch {}
  }
  async function prepararFala(nome, artigo) {
    const t0 = Date.now();
    try {
      const r = await fetch('/api/fala-nome', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome, artigo }) });
      if (!r.ok) throw new Error(r.status);
      falas = await decodificar(await r.json());
      track('NomePronto', { ms: Date.now() - t0 });
    } catch (e) { track('NomeFalhou'); console.warn('fala', e); }
  }
  function pararFala() { fontes.forEach((s) => { try { s.stop(); } catch {} }); fontes = []; falaTocando = false; }
  function tocarFala() {
    const lista = falas || (state.artigo === 'as' && plural) || reserva;
    if (!lista || falaTocando) return;
    falaTocando = true;
    const agora = actx.currentTime, vt = v.currentTime;
    for (const f of lista) {
      const atraso = f.em - vt;
      if (atraso + f.dur / f.rate < 0) continue;
      const s = actx.createBufferSource(); s.buffer = f.buf; s.playbackRate.value = f.rate; s.connect(actx.destination);
      const pulo = Math.max(0, -atraso) * f.rate;
      s.start(agora + Math.max(0, atraso), f.de + pulo, f.dur - pulo);
      fontes.push(s);
    }
    window.__v2 = { nome: !!falas, em: lista.map((f) => f.em) };
  }
  v.addEventListener('timeupdate', () => { if (emChamada && !falaTocando && v.currentTime >= 4.5 && v.currentTime < 10.06 && !v.paused) tocarFala(); });
  ['waiting', 'pause', 'seeking'].forEach((e) => v.addEventListener(e, () => { if (emChamada) pararFala(); }));

  // Depois da ligação
  function depoisDaLigacao() {
    capKey = null; musicaTocar();
    // os botões aparecem logo no começo da fala (antes, a pessoa esperava 14 s e saía)
    playSeg('v6', askAgendar);
  }
  // Depois da ligação: UMA tela só com o dia da ligação + o WhatsApp (antes eram 3 telas)
  let agendaEscolha = null, agendaTel = '';
  function askAgendar() {
    const q = agendaEscolha;
    const precisaTel = !TEL_URL;
    showPanel(`<div class="card ag-card">
        <h3>Quando o Papai Noel deve ligar? 📅</h3>
        <div class="grid ag-grid">${QUICK.map((x) => `<button class="btn3d sm ${q && q.tipo === x.id ? 'sel' : ''}" data-q="${x.id}" type="button"><span class="col">${x.t}<small>${x.s}</small></span></button>`).join('')}</div>
        <button class="ag-outro ${q && q.tipo === 'personalizado' ? 'sel' : ''}" id="bCustom" type="button">${q && q.tipo === 'personalizado' ? `✔ ${esc(q.label)} · trocar` : '📅 Escolher outro dia e horário'}</button>
        ${precisaTel ? `<p class="ag-tel-tit">Para qual WhatsApp mando o link da ligação? 📲</p>
        <label class="phone"><span>+55</span><input id="ph" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 98765-4321" value="${esc(agendaTel)}"></label>` : ''}
        <div class="err" id="perr"></div>
        <button class="btn3d green pulse" id="bW" type="button">Agendar ligação ➜</button>
        ${precisaTel ? '<p class="tiny">🔒 Seu número fica protegido.</p>' : ''}
      </div>`, (p) => {
      const ph = p.querySelector('#ph');
      if (ph) ph.addEventListener('input', () => { ph.value = maskPhone(ph.value); agendaTel = ph.value; });
      const marcar = (sel) => {
        p.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('sel', b === sel));
        p.querySelector('#bCustom').classList.remove('sel');
        p.querySelector('#bCustom').textContent = '📅 Escolher outro dia e horário';
      };
      p.querySelectorAll('[data-q]').forEach((b) => {
        b.onclick = () => {
          enableSound();
          const x = QUICK.find((y) => y.id === b.dataset.q);
          agendaEscolha = { tipo: x.id, dia: x.dia, hora: x.hora, label: `${x.t.replace(/^\S+\s/, '')} · ${x.s}` };
          marcar(b); p.querySelector('#perr').textContent = '';
          if (ph && !ph.value) ph.focus();
        };
      });
      p.querySelector('#bCustom').onclick = () => askCustomWhen((x) => { agendaEscolha = x; askAgendar(); });
      const ir = () => {
        if (!agendaEscolha) { p.querySelector('#perr').textContent = 'Escolha quando o Papai Noel deve ligar 😉'; return; }
        let d = TEL_URL || '';
        if (ph) {
          d = ph.value.replace(/\D/g, '');
          if (!(d.length === 11 && d[2] === '9') && d.length !== 10) { p.querySelector('#perr').textContent = 'Confira o WhatsApp com DDD 😉'; ph.focus(); return; }
          ph.blur();
        }
        track('Agendar', { r: 'tela_unica' });
        state.quando = agendaEscolha;
        track('DiaHora', { tipo: agendaEscolha.tipo, dia: agendaEscolha.dia, hora: agendaEscolha.hora });
        enviarLead(d);
      };
      p.querySelector('#bW').onclick = ir;
      if (ph) ph.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
    });
  }

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Depois da ligação: dia, WhatsApp, duendes conferindo a agenda e a oferta ----------
  const Y = 2026;
  const QUICK = [
    { id: 'vespera', t: '🎄 Véspera', s: '24/12 · noite', dia: `${Y}-12-24`, hora: '20:00' },
    { id: 'natal-manha', t: '🎁 Natal', s: '25/12 · manhã', dia: `${Y}-12-25`, hora: '09:00' },
    { id: 'natal-tarde', t: '☀️ Natal', s: '25/12 · tarde', dia: `${Y}-12-25`, hora: '15:00' },
    { id: 'natal-noite', t: '🌙 Natal', s: '25/12 · noite', dia: `${Y}-12-25`, hora: '19:00' },
  ];

  function askDia() {
    showPanel(
      `<div class="label">Quando o Papai Noel deve ligar?</div>
       <div class="grid">${QUICK.map((q) => `<button class="btn3d sm" data-q="${q.id}" type="button"><span class="col">${q.t}<small>${q.s}</small></span></button>`).join('')}</div>
       <button class="btn3d sm mt" id="bCustom" type="button">📅 Escolher outro dia e horário</button>`,
      (p) => {
        p.querySelectorAll('[data-q]').forEach((b) => {
          b.onclick = () => {
            b.classList.add('sel');
            const q = QUICK.find((x) => x.id === b.dataset.q);
            setWhen({ tipo: q.id, dia: q.dia, hora: q.hora, label: `${q.t.replace(/^\S+\s/, '')} · ${q.s}` });
          };
        });
        p.querySelector('#bCustom').onclick = askCustomWhen;
      },
    );
  }

  function askCustomWhen(aoEscolher) {
    const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const days = [];
    for (let d = 1; d <= 25; d++) {
      const dt = new Date(Y, 11, d);
      days.push({ v: `${Y}-12-${String(d).padStart(2, '0')}`, t: `${WD[dt.getDay()]}, ${d} dez` });
    }
    const hours = []; for (let h = 8; h <= 22; h++) hours.push({ v: String(h).padStart(2, '0'), t: String(h).padStart(2, '0') });
    const mins = ['00', '15', '30', '45'].map((m) => ({ v: m, t: m }));

    showPanel(
      `<div class="card">
         <h3>Escolha o dia e o horário 🎅</h3>
         <div class="wheels">
           <div class="wheel w-day" id="wDay"></div>
           <div class="wheel w-h" id="wH"></div>
           <div class="wsep">:</div>
           <div class="wheel w-m" id="wM"></div>
           <div class="wband"></div>
         </div>
         <button class="btn3d mt" id="bWhen" type="button">Confirmar ✔</button>
         <button class="back" id="bBack" type="button">voltar</button>
       </div>`,
      (p) => {
        const wd = wheel(p.querySelector('#wDay'), days, 23);
        const wh = wheel(p.querySelector('#wH'), hours, 12);
        const wm = wheel(p.querySelector('#wM'), mins, 0);
        p.querySelector('#bBack').onclick = aoEscolher ? () => askAgendar() : askDia;
        p.querySelector('#bWhen').onclick = () => {
          const d = wd.get(), h = wh.get(), m = wm.get();
          const x = { tipo: 'personalizado', dia: d.v, hora: `${h.v}:${m.v}`, label: `${d.t} · ${h.v}:${m.v}` };
          if (aoEscolher) aoEscolher(x); else setWhen(x);
        };
      },
    );
  }

  // Roleta com scroll-snap (igual ao seletor do iPhone)
  function wheel(el, items, startIdx) {
    const H = 40;
    el.innerHTML = `<div class="wpad"></div>${items.map((it) => `<div class="wi">${it.t}</div>`).join('')}<div class="wpad"></div>`;
    const els = el.querySelectorAll('.wi');
    const idx = () => Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / H)));
    const paint = () => {
      const c = el.scrollTop / H;
      els.forEach((e, i) => {
        const d = Math.min(Math.abs(i - c), 3);
        e.style.opacity = String(1 - d * 0.28);
        e.style.transform = `rotateX(${(i - c) * -18}deg) scale(${1 - d * 0.06})`;
        e.classList.toggle('cur', Math.round(c) === i);
      });
    };
    el.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true });
    els.forEach((e, i) => { e.onclick = () => el.scrollTo({ top: i * H, behavior: 'smooth' }); });
    requestAnimationFrame(() => { el.scrollTop = startIdx * H; paint(); });
    return { get: () => items[idx()] };
  }

  function maskPhone(d) {
    d = d.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function setWhen(q) {
    state.quando = q;
    track('DiaHora', { tipo: q.tipo, dia: q.dia, hora: q.hora });
    askWhats();
  }

  function askWhats() {
    if (TEL_URL) { enviarLead(TEL_URL); return; }   // veio do WhatsApp com o número
    showPanel(`<div class="card"><h3>Para qual WhatsApp vamos enviar os lembretes? 📲</h3>
      <p>No dia, o Papai Noel manda o link da ligação por lá.</p>
      <label class="phone"><span>+55</span><input id="ph" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 98765-4321"></label>
      <div class="err" id="perr"></div>
      <button class="btn3d pulse" id="bW" type="button">Continuar ➜</button>
      <p class="tiny">🔒 Seu número fica protegido.</p></div>`, (p) => {
      const ph = p.querySelector('#ph');
      ph.addEventListener('input', () => { ph.value = maskPhone(ph.value); });
      const ir = () => {
        const d = ph.value.replace(/\D/g, '');
        if (!(d.length === 11 && d[2] === '9') && d.length !== 10) { p.querySelector('#perr').textContent = 'Confira o número com DDD 😉'; ph.focus(); return; }
        ph.blur(); enviarLead(d);
      };
      p.querySelector('#bW').onclick = ir;
      ph.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
    });
  }

  function enviarLead(d) {
        state.phone = d;
        track('WhatsApp');
        // guarda o lead (remarketing e pré-preenchimento da Área Mágica); mesmo event_id do Lead do navegador → a Meta deduplica
        fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ phone: d, para: { o: 'filho', a: 'filha' }[state.artigo] || null, quando: state.quando, utms, sessao: SESSAO,
            eventId: state.leadId, fbp: cookie('_fbp'), fbc: cookie('_fbc'), url: location.href,
            certificado: { nome: state.nome, artigo: state.artigo, conquista: state.conquista?.rotulo, frase: state.conquista?.frase } }) }).catch(() => {});
        checarAgenda();
  }

  function checarAgenda() {
    hidePanel();
    preCarregarCheckout();
    const o = document.createElement('div');
    o.className = 'agenda-ck';
    o.innerHTML = `<div class="ack-box"><div class="ack-ico">🧝</div><h3>Duendes checando a agenda do Papai Noel…</h3>
      <p id="ackTxt">Procurando ${esc(state.quando?.label || 'o seu horário')}</p><div class="ack-bar"><i></i></div></div>`;
    document.body.appendChild(o);
    requestAnimationFrame(() => o.classList.add('show'));
    const passos = ['Abrindo a agenda do Polo Norte…', `Conferindo ${state.quando?.label || 'o horário'}…`, 'Reservando um lugarzinho…'];
    passos.forEach((t, i) => setTimeout(() => { const e = o.querySelector('#ackTxt'); if (e) e.textContent = t; }, 700 + i * 850));
    setTimeout(() => {
      o.querySelector('.ack-box').innerHTML = `<div class="ack-ok">🎉</div><h3>Oba! Ainda temos vagas!</h3><p>${esc(state.quando?.label || '')}</p>`;
      o.classList.add('ok'); bip();
      track('AgendaOk');
      setTimeout(() => { o.classList.remove('show'); setTimeout(() => o.remove(), 350); playSeg('v7', abrirOferta, { cedo: false }); }, 1700);
    }, 3400);
  }
  // ---------- Checkout da Singlr: pré-carregamento ----------
  const URL_CHECKOUT = () => `https://web.singlr.com.br/pagar/a0UwZ09xd1hzNG1mU0hpN21TbmtTcWNKOjI1NQ==?${new URLSearchParams(utms)}`;
  // Chrome/Android: baixa a página do checkout antes do clique (Speculation Rules). Os outros navegadores ignoram.
  let checkoutPre = false;
  // DESLIGADO em 08/11: depois que entrou, celulares Android (navegador do Instagram/Facebook) passaram
  // a recarregar a página antes da oferta. Fica só o preconnect do index.html.
  function preCarregarCheckout() {
    return;
    // eslint-disable-next-line no-unreachable
    if (checkoutPre) return; checkoutPre = true;
    try {
      if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
        const sr = document.createElement('script'); sr.type = 'speculationrules';
        sr.textContent = JSON.stringify({ prefetch: [{ source: 'list', urls: [URL_CHECKOUT()], eagerness: 'immediate' }] });
        document.head.appendChild(sr);
      }
    } catch {}
  }

  // Teste A/B do checkout: metade gera o Pix aqui no funil, metade vai para o checkout da Singlr.
  // Fica salvo no aparelho. Para ver uma versão: ?ck=pix ou ?ck=singlr
  const CK_VAR = (() => {
    const f = new URLSearchParams(location.search).get('ck');
    let x = f === 'pix' || f === 'singlr' ? f : null;
    try { x = x || localStorage.getItem('pn_ck'); } catch {}
    if (x !== 'pix' && x !== 'singlr') x = Math.random() < 0.5 ? 'pix' : 'singlr';
    try { localStorage.setItem('pn_ck', x); } catch {}
    return x;
  })();

  // Pagamento na página (V2): dados (WhatsApp já vem do funil) + extras opcionais + Pix
  // mesmos extras e preços do checkout da Singlr (09/11)
  const EXTRAS_V2 = [
    { id: 'gravacao', e: '🎥', nome: 'Gravar a reação da criança', por: 12.9 },
    { id: 'camera', e: '📹', nome: 'Vídeo do Papai Noel na sua sala', por: 14.9 },
    { id: 'pedido', e: '🎁', nome: 'Ligação para pedir o presente', por: 16.9 },
  ];
  function pagamentoV2(m) {
    const BASE = 19.9;
    let salvo = {};
    try { salvo = JSON.parse(localStorage.getItem('pn_comprador') || '{}'); } catch {}
    const tel = state.phone || salvo.tel || '';
    const box = m.querySelector('.bump-sheet');
    box.classList.remove('of'); box.scrollTop = 0;
    box.innerHTML = `
      <button class="bump-x" type="button" aria-label="Fechar">✕</button>
      <div class="bump-kicker">Último passo 🎄</div>
      <h3>Finalize o agendamento</h3>
      <div class="pg-resumo"><div><b>Ligação + Certificado</b><small id="pgExt">Com o nome da criança</small></div><b id="pgTot">${brl(BASE)}</b></div>
      <label class="pg-campo"><span>Seu nome completo</span><input id="pgNome" autocomplete="name" placeholder="Seu nome e sobrenome" value="${esc(salvo.nome || '')}"></label>
      <label class="pg-campo"><span>Seu e-mail <small>(o acesso chega por ele)</small></span><input id="pgEmail" type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com" value="${esc(salvo.email || '')}"></label>
      <label class="pg-campo"><span>WhatsApp</span><input id="pgTel" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 98765-4321" value="${tel ? maskPhone(tel) : ''}"></label>
      <div class="pg-ext-tit">🎁 Aproveite e leve junto <small>(opcional)</small></div>
      <div class="pg-exts">${EXTRAS_V2.map((x) => `<label class="pg-ext"><input type="checkbox" value="${x.id}"><span class="pg-ck"></span><span>${x.e} ${x.nome}</span><b>+ ${brl(x.por)}</b></label>`).join('')}</div>
      <div class="pg-formas">
        <button class="pg-forma on" data-f="pix" type="button"><b>⚡ Pix</b><small>Aprovação na hora</small></button>
        <button class="pg-forma" data-f="cartao" type="button"><b>💳 Cartão</b><small>Em até 12x</small></button>
      </div>
      <div class="pg-erro" id="pgErro"></div>
      <button class="btn3d green pulse" id="pgIr" type="button">⚡ Gerar Pix · ${brl(BASE)}</button>
      <p class="pg-seg">🔒 Pagamento seguro processado pela Singlr. Seus dados ficam protegidos.</p>`;
    const $b = (q) => box.querySelector(q);
    const telI = $b('#pgTel');
    telI.addEventListener('input', () => { telI.value = maskPhone(telI.value); });
    let forma = 'pix';
    const escolhidos = () => [...box.querySelectorAll('.pg-ext input:checked')].map((i) => i.value);
    const total = () => {
      const ks = escolhidos(), soma = ks.reduce((t, k) => t + EXTRAS_V2.find((x) => x.id === k).por, 0);
      const combo = ks.length === 3 || (ks.length === 2 && soma > COMBO_PRECO);
      return { ks: combo ? ['gravacao', 'camera', 'pedido'] : ks, combo, valor: Math.round((BASE + (combo ? COMBO_PRECO : soma)) * 100) / 100 };
    };
    const pinta = () => {
      const t = total();
      $b('#pgTot').textContent = brl(t.valor);
      $b('#pgExt').textContent = t.ks.length ? `+ ${t.combo ? 'Combo com os 3 extras' : t.ks.map((k) => EXTRAS_V2.find((x) => x.id === k).nome).join(' + ')}` : 'Com o nome da criança';
      if (t.combo) box.querySelectorAll('.pg-ext input').forEach((i) => { i.checked = true; });
      $b('#pgIr').textContent = forma === 'pix' ? `⚡ Gerar Pix · ${brl(t.valor)}` : '💳 Pagar com cartão';
    };
    box.querySelectorAll('.pg-ext input').forEach((i) => { i.onchange = pinta; });
    box.querySelectorAll('.pg-forma').forEach((f) => {
      f.onclick = () => {
        forma = f.dataset.f;
        box.querySelectorAll('.pg-forma').forEach((x) => x.classList.toggle('on', x === f));
        box.querySelectorAll('.pg-campo').forEach((c) => { c.hidden = forma !== 'pix'; });
        pinta();
      };
    });
    $b('.bump-x').onclick = () => { m.classList.remove('show'); setTimeout(() => m.remove(), 300); };

    $b('#pgIr').onclick = async () => {
      const erro = $b('#pgErro'); erro.textContent = '';
      const t = total();
      if (forma === 'cartao') { track('PagarCartao', { plano: 'nome', ck: 'pix' }); location.href = URL_CHECKOUT(); return; }
      const nome = $b('#pgNome').value.trim().replace(/\s+/g, ' ');
      const email = $b('#pgEmail').value.trim().toLowerCase();
      const d = telI.value.replace(/\D/g, '');
      if (nome.length < 3 || !nome.includes(' ')) { erro.textContent = 'Coloque seu nome e sobrenome.'; $b('#pgNome').focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) { erro.textContent = 'Confira o seu e-mail: o acesso chega por ele.'; $b('#pgEmail').focus(); return; }
      if (!(d.length === 11 && d[2] === '9') && d.length !== 10) { erro.textContent = 'Confira o WhatsApp com DDD.'; telI.focus(); return; }
      try { localStorage.setItem('pn_comprador', JSON.stringify({ nome, email, tel: d })); } catch {}
      const bt = $b('#pgIr'); bt.disabled = true; bt.innerHTML = '<span class="of-load"></span> Gerando o Pix…';
      const ids = ['nome', ...t.ks];
      const corpo = { pacote: 'nome', oferta: 'v2', extras: t.ks, nome, email, telefone: d, sessao: SESSAO, utms,
        para: { o: 'filho', a: 'filha' }[state.artigo] || null, quando: state.quando, fbp: cookie('_fbp'), fbc: cookie('_fbc'), url: location.href,
        certificado: { nome: state.nome, artigo: state.artigo, conquista: state.conquista?.rotulo, frase: state.conquista?.frase } };
      const gerar = async () => {
        const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.codigo) throw new Error(j.msg || 'Não conseguimos gerar o Pix agora. Tente de novo ou pague com cartão.');
        return j;
      };
      try {
        const j = await gerar();
        track('GerouPix', { plano: 'nome', extras: t.ks.join('+') || 'base', valor: j.valor, ck: 'pix' });
        metaStd('AddPaymentInfo', { content_ids: ids, value: j.valor, currency: 'BRL', payment_type: 'pix' });
        telaPix(m, j, ids, gerar);
      } catch (e) {
        erro.textContent = e.message;
        bt.disabled = false; pinta();
      }
    };
  }

  // mensagem já escrita com o nome da criança e o dia escolhido (o atendimento já entra sabendo o contexto)
  function linkDuvidas() {
    const quem = state.artigo === 'as' ? 'das crianças' : state.nome ? `${G('do', 'da', 'das')} ${state.nome}` : 'do meu pequeno';
    const dia = state.quando?.label ? ` (${state.quando.label})` : '';
    const txt = `Oi, Papai Noel! 🎅 Tenho uma dúvida antes de agendar a ligação ${quem}${dia}.`;
    const l = String(CONFIG.waDuvidas).trim();
    if (/^https?:\/\//.test(l)) {
      const u = new URL(l);
      if (/(^|\.)wa\.me$|whatsapp\.com$/.test(u.hostname) && !u.searchParams.get('text')) u.searchParams.set('text', txt);
      return u.toString();
    }
    return `https://wa.me/${l.replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`;
  }

  function abrirOferta() {
    if (CK_VAR === 'singlr') preCarregarCheckout();
    track('ViuOferta', { ck: CK_VAR });
    metaStd('ViewContent', { content_name: 'oferta', content_category: 'ligacao_papai_noel' });
    const m = document.createElement('div');
    m.className = 'bump-wrap';
    m.innerHTML = `<div class="bump-sheet of" role="dialog" aria-label="Oferta">
      <div class="of-bf">🖤 OFERTA BLACK FRIDAY</div>
      <h3>Ligação + Certificado 🎅</h3>
      ${state.quando ? `<div class="of-dia">📅 ${esc(state.quando.label)}</div>` : ''}
      <ul class="of-it">
        <li><b>O Papai Noel chama a criança pelo nome</b></li>
        <li><b>${esc(G('Certificado de Bom Menino', 'Certificado de Boa Menina', 'Certificado de Bons Meninos'))} em PDF</b>, pronto para imprimir</li>
        <li>Videochamada interativa com câmera</li>
        <li>Agendamento no dia e horário que você escolher</li>
        <li>Duração de 1 minuto</li>
        <li>Ligação salva na Área Mágica</li>
      </ul>
      <div class="of-cta"><div class="of-preco"><s>R$ 47,90</s><b>R$ 19,90</b><small>Preço de Black Friday, só até 30 de novembro</small></div>
      <button class="btn3d green pulse" id="ofIr" type="button">QUERO AGENDAR</button></div>
      ${CONFIG.waDuvidas ? `<a class="of-duvida" id="ofDuvida" href="${linkDuvidas()}" target="_blank" rel="noopener">💬 Tenho dúvidas, Papai Noel</a>` : ''}
      <p class="of-obs">Após o pagamento, iremos solicitar as demais informações para criar a ligação.</p>
    </div>`;
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add('show'));
    const du = m.querySelector('#ofDuvida');
    if (du) du.onclick = () => { track('TemDuvida', { ck: CK_VAR }); metaStd('Contact', { content_name: 'duvida_oferta' }); };
    m.querySelector('#ofIr').onclick = () => {
      if (CK_VAR === 'pix') {   // teste A/B: Pix aqui mesmo
        track('EscolheuPlano', { plano: 'nome', ck: 'pix' });
        metaStd('InitiateCheckout', { content_name: 'nome', content_ids: ['nome'], num_items: 1, value: 19.9, currency: 'BRL' }, novoId('ic'));
        pagamentoV2(m);
        return;
      }
      track('EscolheuPlano', { plano: 'nome', ck: 'singlr' });
      metaStd('InitiateCheckout', { content_name: 'nome', content_ids: ['nome'], num_items: 1, value: 19.9, currency: 'BRL' }, novoId('ic'));
      // resposta imediata na tela enquanto o checkout abre (o Pixel tem 120 ms para sair)
      const b = m.querySelector('#ofIr'); b.disabled = true; b.innerHTML = '<span class="of-load"></span> Abrindo o pagamento seguro…';
      addEventListener('pageshow', () => { b.disabled = false; b.textContent = 'QUERO AGENDAR'; }, { once: true });   // voltou do checkout
      setTimeout(() => { location.href = URL_CHECKOUT(); }, 120);
    };
  }

  // =========================================================
  let stream = null, facing = 'user', timerId = null, t0 = 0, callDone = false;
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Toca/pausa dentro do toque do usuário → o navegador libera som depois
  function bless(media) { try { const p = media.play(); media.pause(); if (p) p.catch(() => {}); } catch {} }

  function openCall(fromWhatsApp) {
    musicaParar();
    $('screen').classList.add('connecting');   // nada de quadro do vídeo até ele rodar
    hidePanel();
    caps.innerHTML = ''; capKey = null;
    $('unmute').hidden = true;
    $('call').hidden = false;
    $('incall').hidden = true; $('incoming').hidden = true;
    if (usaSim()) {
      SimNoel.montar($('screen'), $('incall'));
      if (!SimNoel.escolhido) SimNoel.escolher(state.artigo === 'as' ? null : state.nome, state.artigo);
    } else if (!CALL_SRC) preload('s5');
    if (fromWhatsApp) {
      $('prep').hidden = false;              // toque 1: libera o som + câmera
    } else {
      prepararVideoChamada(); bless(ring); bless(v);   // plano B: o clique já liberou
      if (usaSim()) SimNoel.permissoes().then(pedirCameraAntes).then(aguardarSim).then(showIncoming);
      else pedirCameraAntes().then(showIncoming);
    }
  }

  // Carrega o vídeo da ligação no elemento (sem capa) para começar instantâneo ao atender
  function prepararVideoChamada() {
    v.removeAttribute('poster');
    if (usaSim()) { SimNoel.prepararVideo(v); return; }
    v.preload = 'auto';
    v.src = CALL_SRC || blobs.s5 || src('s5');
    v.load();
  }

  // Pede a câmera antes de tocar → ao atender, a ligação começa na hora
  const cameraPronta = { feito: false };
  function pedirCameraAntes() {
    if (cameraPronta.feito) return Promise.resolve();
    cameraPronta.feito = true;
    return Promise.race([openCamera(), new Promise((r) => setTimeout(r, CONFIG.cameraTimeoutMs))]);
  }

  $('bReady').onclick = async () => {
    track('ProntoParaChamada');
    soundOn = true;
    prepararVideoChamada(); bless(ring); bless(v);
    $('bReady').disabled = true;
    await pedirCameraAntes();                // o navegador pergunta da câmera aqui
    $('bReady').textContent = '📞 Chamando o Papai Noel…';
    setTimeout(() => { showIncoming(); $('prep').hidden = true; }, 700);
  };

  // ---------- Simulação interativa (no lugar da ligação de demonstração antiga) ----------
  let simFalhou = false;
  function usaSim() { return !CALL_SRC && !!window.SimNoel && !simFalhou; }
  function aguardarSim() {
    const acoes = document.querySelector('#incoming .inc-actions');
    $('incoming').hidden = false; acoes.style.visibility = 'hidden';
    $('incSub').textContent = 'Chamando o Papai Noel…';
    SimNoel.aoProgresso = (x) => { $('incSub').textContent = `Conectando ao Polo Norte… ${Math.round(x * 100)}%`; };
    return SimNoel.pronto.then(() => {
      acoes.style.visibility = '';
      if (SimNoel.ok) SimNoel.prepararVideo(v);
      else { simFalhou = true; track('SimulacaoFalhou'); prepararVideoChamada(); }
    });
  }
  function mostrarUau() {
    if (callDone || $('bPularSim')) return;
    const b = document.createElement('button');
    b.id = 'bPularSim'; b.type = 'button'; b.className = 'btn3d green pulse ic-continue';
    b.textContent = '✨ Uau, que incrível!';
    b.style.bottom = 'var(--simBase, calc(118px + var(--sb)))';
    b.onclick = () => { track('UauIncrivel'); finishCall(); };
    $('incall').appendChild(b);
    track('ChegouIluminada');
  }
  function atenderSim() {
    $('incoming').hidden = true;
    $('incall').hidden = false;
    $('callTime').textContent = 'Conectando…';
    v.addEventListener('playing', () => { $('screen').classList.remove('connecting'); startTimer(); }, { once: true });
    const p = SimNoel.iniciar(v, { track, aoUau: mostrarUau, aoFim: finishCall, sessao: SESSAO, lig: viaRobo ? 'whats' : modoWhats ? 'link' : LIG_VAR,
      nome: state.nome || null, artigo: state.artigo || null, origem: viaRobo ? 'robo' : modoWhats ? 'link_ligacao' : 'funil' });
    if (p) p.catch(() => {
      $('screen').classList.remove('connecting');
      $('callTime').innerHTML = '<button class="back" id="bres" type="button">Toque para conectar</button>';
      $('bres').onclick = () => v.play().catch(() => {});
    });
    if (!stream && !cameraPronta.feito) pedirCameraAntes();
  }

  function showIncoming() {
    $('incoming').hidden = false;
    $('incSub').textContent = 'Chamada de vídeo recebida…';
    ring.currentTime = 0;
    ring.play().catch(() => {});
    try { navigator.vibrate && navigator.vibrate([600, 400, 600, 400, 600, 400, 600]); } catch {}
    track('ChamadaRecebida', { origem: isCallMode ? 'whatsapp' : 'plano_b' });
  }

  $('decline').onclick = () => {
    $('incSub').textContent = 'O Papai Noel quer muito falar com você 🎅 Toque em Atender!';
  };

  $('accept').onclick = () => {
    track('Atendeu');
    audioInit();
    soundOn = true;
    ring.pause();
    try { navigator.vibrate && navigator.vibrate(0); } catch {}
    capKey = null;
    // sem imagem de capa: até o vídeo rodar, aparece o "Conectando…"
    v.removeAttribute('poster');
    $('screen').classList.add('connecting');
    if (usaSim()) return atenderSim();
    const srcCall = CALL_SRC || blobs.s5 || src('s5');
    if (v.src !== srcCall) v.src = srcCall;
    v.muted = false;
    v.currentTime = 0;
    v.onended = finishCall;
    v.addEventListener('playing', () => { $('screen').classList.remove('connecting'); startTimer(); }, { once: true });
    if (!CALL_SRC) {
      emChamada = true;
      // "Já entendi!" depois da primeira pergunta do Papai Noel ("Você já pensou no seu presente?")
      rodarRoteiro([[30.75, mostrarPular]]);
    } else {
      if (PODE_GRAVAR) gravarLigacao();   // ligação comprada: grava a recordação (extra Gravação da Reação)
    }

    $('incoming').hidden = true;
    $('incall').hidden = false;
    $('callTime').textContent = 'Conectando…';

    // dentro do toque: começa já
    const p = v.play();
    if (p) p.catch(() => {
      $('screen').classList.remove('connecting');
      $('callTime').innerHTML = '<button class="back" id="bres" type="button">Toque para conectar</button>';
      // se o vídeo em memória falhar, tenta direto do servidor
      $('bres').onclick = () => {
        if (v.error || v.readyState === 0) { v.src = src('s5'); v.load(); }
        v.play().catch(() => { v.src = src('s5'); v.load(); v.play().catch(() => {}); });
      };
    });
    if (!stream && !cameraPronta.feito) pedirCameraAntes();   // se ainda não pediu, pede sem travar a chamada
  };

  async function openCamera() {
    const self = $('self');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: memberT ? { echoCancellation: false, noiseSuppression: false } : false,
      });
      const sv = $('selfV');
      sv.srcObject = stream;
      sv.play().catch(() => {});
      self.classList.add('on');
      self.classList.toggle('back', facing !== 'user');
      $('bCam').classList.remove('off');
      track('CameraLiberada');
    } catch (e) {
      self.classList.remove('on');
      $('bCam').classList.add('off');
      track('CameraNegada', { erro: e && e.name });
    }
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function startTimer() {
    t0 = Date.now();
    $('callTime').textContent = '00:00';
    clearInterval(timerId);
    timerId = setInterval(() => { $('callTime').textContent = fmt((Date.now() - t0) / 1000); }, 500);
  }

  function rodarRoteiro(cues) {
    const fila = cues.slice().sort((a, b) => a[0] - b[0]);
    const vigia = () => {
      while (fila.length && v.currentTime >= fila[0][0]) { const [, fn] = fila.shift(); try { fn(); } catch {} }
      if (!fila.length) v.removeEventListener('timeupdate', vigia);
    };
    v.addEventListener('timeupdate', vigia);
  }

  function aviso(txt, ms = 3200, alto = false) {
    const c = document.createElement('div'); c.className = `sim-fim${alto ? ' alto' : ''}`; c.textContent = txt;
    $('incall').appendChild(c);
    setTimeout(() => c.classList.add('sai'), ms); setTimeout(() => c.remove(), ms + 500);
  }

  function destacar(id, rotulo) {
    const el = $(id); if (!el) return;
    el.classList.add('hl');
    const tag = document.createElement('div'); tag.className = `hl-tag hl-${id}`; tag.textContent = rotulo;
    $('incall').appendChild(tag);
    setTimeout(() => { el.classList.remove('hl'); tag.classList.add('sai'); }, 2300);
    setTimeout(() => tag.remove(), 2800);
  }

  // Na demonstração: só mostra como fica a janelinha (não grava)
  function abrirSalvarDemo() {
    const m = document.createElement('div'); m.className = 'save-pop';
    m.innerHTML = `<div class="save-ico">🎬</div>
      <div class="save-txt"><b>Salvar recordação</b><small>Com a reação do seu pequeno</small></div>
      <button class="save-btn" type="button">💾 Salvar vídeo</button>`;
    m.querySelector('.save-btn').onclick = () => { m.querySelector('small').textContent = 'Na ligação de verdade, o vídeo fica no seu celular ✨'; };
    $('incall').appendChild(m);
    track('ViuSalvarVideo');
    setTimeout(() => m.classList.add('sai'), 4200); setTimeout(() => m.remove(), 4700);
  }

  // ---------- Gravação da ligação comprada (Papai Noel + câmera da criança + áudio) ----------
  let gravador = null, pedacos = [], gravacaoBlob = null, desenhoId = 0;
  function gravarLigacao() {
    try {
      const cv = document.createElement('canvas');
      if (!window.MediaRecorder || !cv.captureStream) return;
      cv.width = 720; cv.height = 1280;
      const ctx = cv.getContext('2d');
      const sv = $('selfV');
      const desenha = () => {
        // Papai Noel em tela cheia (cover)
        const vw = v.videoWidth || 720, vh = v.videoHeight || 1280, k = Math.max(720 / vw, 1280 / vh);
        ctx.drawImage(v, (720 - vw * k) / 2, (1280 - vh * k) / 2, vw * k, vh * k);
        // janelinha da criança (espelhada, cantos arredondados)
        if (stream && sv.videoWidth) {
          const w = 210, h = 280, x = 720 - w - 24, y = 120, r = 22;
          ctx.save(); ctx.beginPath();
          ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
          ctx.clip();
          const kw = Math.max(w / sv.videoWidth, h / sv.videoHeight), dw = sv.videoWidth * kw, dh = sv.videoHeight * kw;
          ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(sv, (w - dw) / 2, (h - dh) / 2, dw, dh);
          ctx.restore();
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeRect(x, y, w, h);
        }
        // marca
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, 720, 86);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 34px Poppins, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Papai Noel 🎅', 360, 56);
        desenhoId = requestAnimationFrame(desenha);
      };
      desenha();
      const saida = cv.captureStream(30);
      // áudio: Papai Noel (vídeo) + microfone da criança
      audioInit();
      if (actx) {
        const destino = actx.createMediaStreamDestination();
        const fonteV = actx.createMediaElementSource(v);
        fonteV.connect(actx.destination); fonteV.connect(destino);
        if (stream && stream.getAudioTracks().length) actx.createMediaStreamSource(stream).connect(destino);
        destino.stream.getAudioTracks().forEach((t) => saida.addTrack(t));
      }
      const tipos = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const mimeType = tipos.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
      gravador = new MediaRecorder(saida, mimeType ? { mimeType, videoBitsPerSecond: 2500000 } : undefined);
      pedacos = [];
      gravador.ondataavailable = (e) => { if (e.data && e.data.size) pedacos.push(e.data); };
      gravador.onstop = () => {
        cancelAnimationFrame(desenhoId);
        gravacaoBlob = new Blob(pedacos, { type: gravador.mimeType || 'video/mp4' });
        mostrarSalvar();
      };
      gravador.start(1000);
      track('GravacaoIniciada', { tipo: gravador.mimeType });
    } catch (e) { console.warn('gravacao', e); gravador = null; }
  }

  function pararGravacao() { if (gravador && gravador.state !== 'inactive') gravador.stop(); }

  function mostrarSalvar() {
    if (!gravacaoBlob || !gravacaoBlob.size) return;
    const ext = /mp4/.test(gravacaoBlob.type) ? 'mp4' : 'webm';
    const nome = `ligacao-papai-noel.${ext}`;
    let b = $('bSalvar');
    if (!b) {
      b = document.createElement('button'); b.id = 'bSalvar'; b.type = 'button'; b.className = 'btn3d green ic-save';
      b.textContent = '💾 Salvar vídeo da ligação';
      $('incall').appendChild(b);
    }
    b.onclick = async () => {
      track('SalvouVideo');
      const arquivo = new File([gravacaoBlob], nome, { type: gravacaoBlob.type });
      try {
        if (navigator.canShare && navigator.canShare({ files: [arquivo] })) { await navigator.share({ files: [arquivo], title: 'Ligação do Papai Noel 🎅' }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(gravacaoBlob); a.download = nome;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    };
  }

  // Botão para pular a parte da conversa com a criança → vai direto para o "Viu só como é realista?"
  function mostrarPular() {
    if (callDone || $('bPularSim')) return;
    const b = document.createElement('button');
    b.id = 'bPularSim'; b.type = 'button'; b.className = 'btn3d green ic-continue';
    b.textContent = `Uau! Agendar para ${state.artigo} ${state.nome}`;
    b.onclick = () => { track('JaEntendi', { em: Math.round(v.currentTime) }); finishCall(); };
    $('incall').appendChild(b);
  }
  function esconderPular() { const b = $('bPularSim'); if (b) b.remove(); }

  function fimDaSimulacao() {
    bip();
    const f = document.createElement('div'); f.className = 'flash'; $('screen').appendChild(f);
    setTimeout(() => f.remove(), 900);
    const c = document.createElement('div'); c.className = 'sim-fim'; c.textContent = '✨ Fim da simulação';
    $('incall').appendChild(c);
    setTimeout(() => c.classList.add('sai'), 2300); setTimeout(() => c.remove(), 2800);
    track('FimDaSimulacao');
  }

  // Fim da fala: a chamada continua na tela (câmera, botões, tempo) até o Continuar
  function finishCall() {
    if (callDone) return;
    callDone = true; emChamada = false;
    v.onended = null;
    esconderPular(); pararFala();
    if (window.SimNoel) SimNoel.parar();
    clearInterval(timerId);
    stopCamera();
    v.pause();
    $('self').classList.remove('on');
    $('call').hidden = true;
    $('screen').classList.remove('connecting');
    track('ChamadaConcluida');
    depoisDaLigacao();
  }

  $('bContinue').onclick = () => {
    track('Continuar');
    if (memberT) { stopCamera(); location.href = `/area?t=${encodeURIComponent(memberT)}`; return; }
    audioInit(); musicaTocar();
    clearInterval(timerId);
    const dur = t0 ? fmt((Date.now() - t0) / 1000) : '00:00';
    stopCamera();
    $('self').classList.remove('on');
    v.pause();
    $('callTime').textContent = `Chamada encerrada · ${dur}`;
    $('bContinue').hidden = true;
    $('icBar').hidden = true;
    revealOffers();
    setTimeout(() => $('offers').scrollIntoView({ behavior: 'smooth' }), 120);
  };

  // Desligar no meio: encerra a fala e já mostra o Continuar
  $('bEnd').onclick = () => {
    if (callDone) return;
    v.pause();
    finishCall();
  };
  $('bMic').onclick = (e) => e.currentTarget.classList.toggle('off');
  $('bCam').onclick = async (e) => {
    const b = e.currentTarget;
    if (stream) {
      const tr = stream.getVideoTracks()[0];
      tr.enabled = !tr.enabled;
      b.classList.toggle('off', !tr.enabled);
      $('self').classList.toggle('on', tr.enabled);
    } else {
      await openCamera();
    }
  };
  $('bFlip').onclick = async () => {
    facing = facing === 'user' ? 'environment' : 'user';
    await openCamera();
  };

  // Janelinha da câmera arrastável (encaixa no canto mais próximo)
  (() => {
    const el = $('self'); let sx, sy, ox, oy, drag = false;
    el.addEventListener('pointerdown', (e) => {
      drag = true; el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect(), pr = $('screen').getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left - pr.left; oy = r.top - pr.top;
      el.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      el.style.left = `${ox + e.clientX - sx}px`; el.style.top = `${oy + e.clientY - sy}px`; el.style.right = 'auto';
    });
    el.addEventListener('pointerup', () => {
      drag = false;
      const pr = $('screen').getBoundingClientRect(), r = el.getBoundingClientRect();
      const left = (r.left + r.width / 2 - pr.left) < pr.width / 2;
      const top = (r.top + r.height / 2 - pr.top) < pr.height / 2;
      el.style.transition = 'left .25s, top .25s';
      el.style.left = left ? '12px' : `${pr.width - r.width - 12}px`;
      el.style.top = top ? 'calc(84px + env(safe-area-inset-top))' : `${pr.height - r.height - 190}px`;
    });
  })();

  // =========================================================
  //  OFERTAS
  // =========================================================
  // ---------- Order bumps: cada combinação é uma oferta da Singlr ----------
  // link = /pagar/base64("<ref do produto>:<id da oferta>")
  const OFERTAS = {
    padrao: { ref: 'EZGoQ1v6EA4Dur5AJC8BJsvq', base: 229, pedido: 236, camera: 237, ensaio: 238, 'pedido+ensaio': 239, combo: 240 },
    nome: { ref: 'kE0gOqwXs4mfSHi7mSnkSqcJ', base: 230, pedido: 241, camera: 242, ensaio: 243, 'pedido+ensaio': 244, combo: 245 },
    premium: { ref: '35Oy3mbfKDZh2P4AX9V5mm5Y', base: 231, pedido: 246, camera: 247, ensaio: 248, 'pedido+ensaio': 249, combo: 250 },
  };
  const BUMPS = [
    { id: 'pedido', e: '🎁', nome: 'Pedido de Presente', desc: 'Antes do Natal, o Papai Noel liga pra criança contar o presente que quer ganhar.', de: 39.9, por: 19.9 },
    { id: 'camera', e: '📹', nome: 'Câmera de Segurança do Papai Noel', desc: 'Vídeo do Papai Noel deixando os presentes na <b>sua sala</b>, flagrado pela câmera!', de: 49.9, por: 27.9 },
    { id: 'ensaio', e: '📸', nome: 'Ensaio de Natal no Polo Norte', desc: '10 fotos da criança com o Papai Noel, prontas pra imprimir.', de: 29.9, por: 14.9 },
  ];
  const COMBO_PRECO = 39.9;
  const brl = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const precoNum = (s) => Number(String(s).replace(',', '.'));

  // escolhas → chave da oferta (2 extras que passam do combo viram o combo)
  function chaveOferta(sel) {
    const ks = BUMPS.map((b) => b.id).filter((k) => sel.has(k));
    if (!ks.length) return 'base';
    if (ks.length === 3) return 'combo';
    const soma = ks.reduce((t, k) => t + BUMPS.find((b) => b.id === k).por, 0);
    if (ks.length === 2 && soma > COMBO_PRECO) return 'combo';
    return ks.join('+');
  }
  function linkOferta(plano, chave) {
    const o = OFERTAS[plano];
    const q = state.quando || {};
    const extra = new URLSearchParams({ ...utms, para: state.para || '', dia: q.dia || '', hora: q.hora || '' });
    return `https://web.singlr.com.br/pagar/${btoa(`${o.ref}:${o[chave === 'base' ? 'base' : chave]}`)}?${extra}`;
  }

  function abrirBumps(plano) {
    const pl = CONFIG.plans.find((x) => x.id === plano);
    const sel = new Set();
    const sheet = document.createElement('div');
    sheet.className = 'bump-wrap';
    sheet.innerHTML = `<div class="bump-sheet" role="dialog" aria-label="Turbine a magia">
        <button class="bump-x" type="button" aria-label="Fechar">✕</button>
        <div class="bump-kicker">Oferta só agora ⏳</div>
        <h3>Turbine a magia do Natal 🎄</h3>
        <div class="bump-list">${BUMPS.map((b) => `
          <label class="bump" data-b="${b.id}">
            <input type="checkbox" value="${b.id}">
            <span class="bump-ck"></span>
            <span class="bump-e">${b.e}</span>
            <span class="bump-t"><b>${b.nome}</b><small>${b.desc}</small>
              <span class="bump-p"><s>${brl(b.de)}</s> <b>+ ${brl(b.por)}</b></span></span>
          </label>`).join('')}</div>
        <button class="bump-combo" type="button">✨ Quero os 3 por <b>${brl(COMBO_PRECO)}</b> <s>${brl(62.7)}</s></button>
        <div class="bump-msg" id="bumpMsg"></div>
        <div class="bump-total"><span>${pl.nome}</span><b id="bumpTotal"></b></div>
        <button class="btn3d pulse" id="bumpGo" type="button">Ir para o pagamento ➜</button>
        <button class="bump-no" type="button">Não, obrigado. Quero só a ligação</button>
      </div>`;
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('show'));
    track('AbriuBumps', { plano });

    const base = precoNum(pl.por);
    const todos = BUMPS.map((b) => b.id);
    const pinta = () => {
      const chave = chaveOferta(sel);
      const efetivo = chave === 'combo' ? new Set(todos) : sel;
      sheet.querySelectorAll('.bump').forEach((l) => {
        const k = l.dataset.b, on = efetivo.has(k), brinde = on && !sel.has(k);
        l.classList.toggle('on', on);
        l.classList.toggle('gift', brinde);
        l.querySelector('input').checked = on;
      });
      const extra = chave === 'base' ? 0 : chave === 'combo' ? COMBO_PRECO : [...sel].reduce((t, k) => t + BUMPS.find((b) => b.id === k).por, 0);
      sheet.querySelector('#bumpTotal').textContent = brl(base + extra);
      sheet.querySelector('.bump-combo').hidden = chave === 'combo';
      sheet.querySelector('#bumpMsg').innerHTML = chave === 'combo' && sel.size === 2 ? `🎉 Com esses 2, o 3º vem <b>de brinde</b>: os 3 por ${brl(COMBO_PRECO)}!` : chave === 'combo' ? '✨ Combo Mágico ativado!' : '';
      return { chave, total: base + extra };
    };
    pinta();

    sheet.querySelectorAll('.bump').forEach((l) => {
      l.querySelector('input').onchange = (ev) => {
        const k = l.dataset.b;
        if (l.classList.contains('gift')) { ev.target.checked = true; return; } // brinde não sai
        if (sel.has(k)) sel.delete(k); else sel.add(k);
        pinta();
      };
    });
    sheet.querySelector('.bump-combo').onclick = () => { todos.forEach((k) => sel.add(k)); pinta(); };
    const fechar = () => { sheet.classList.remove('show'); setTimeout(() => sheet.remove(), 300); };
    sheet.querySelector('.bump-x').onclick = fechar;
    sheet.onclick = (ev) => { if (ev.target === sheet) fechar(); };
    const ir = (semExtras) => {
      if (semExtras) sel.clear();
      const { chave, total } = pinta();
      const ids = [plano, ...(chave === 'base' ? [] : chave === 'combo' ? ['pedido', 'camera', 'ensaio'] : chave.split('+'))];
      track('IrPagamento', { plano, extras: chave, preco: VARIANTE });
      telaPagamento(sheet, plano, chave, ids, total);
    };
    sheet.querySelector('#bumpGo').onclick = () => ir(false);
    sheet.querySelector('.bump-no').onclick = () => ir(true);
  }

  // ---------- Pagamento: dados + Pix na própria página (cartão continua no checkout da Singlr) ----------
  const NOME_EXTRA = { pedido: 'Pedido de Presente', camera: 'Câmera de Segurança', ensaio: 'Ensaio de Natal' };
  function telaPagamento(sheet, plano, chave, ids, total) {
    const pl = CONFIG.plans.find((x) => x.id === plano);
    const extras = ids.slice(1);
    let salvo = {};
    try { salvo = JSON.parse(localStorage.getItem('pn_comprador') || '{}'); } catch {}
    const box = sheet.querySelector('.bump-sheet');
    box.scrollTop = 0;
    box.innerHTML = `
      <button class="bump-x" type="button" aria-label="Fechar">✕</button>
      <div class="bump-kicker">Último passo 🎄</div>
      <h3>Finalize o agendamento</h3>
      <div class="pg-resumo"><div><b>${pl.nome.replace(/<[^>]+>/g, '')}</b>${extras.length ? `<small>+ ${extras.map((k) => NOME_EXTRA[k]).join(' + ')}</small>` : ''}</div><b>${brl(total)}</b></div>
      <label class="pg-campo"><span>Nome completo</span><input id="pgNome" autocomplete="name" placeholder="Seu nome e sobrenome" value="${(salvo.nome || '').replace(/"/g, '&quot;')}"></label>
      <label class="pg-campo"><span>E-mail</span><input id="pgEmail" type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com" value="${(salvo.email || '').replace(/"/g, '&quot;')}"></label>
      <label class="pg-campo"><span>WhatsApp</span><input id="pgTel" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 98765-4321" value="${salvo.tel ? maskPhone(salvo.tel) : ''}"></label>
      <div class="pg-formas">
        <button class="pg-forma on" data-f="pix" type="button"><b>⚡ Pix</b><small>Aprovação na hora</small></button>
        <button class="pg-forma" data-f="cartao" type="button"><b>💳 Cartão</b><small>Em até 12x</small></button>
      </div>
      <div class="pg-erro" id="pgErro"></div>
      <button class="btn3d green pulse" id="pgIr" type="button">⚡ Gerar Pix</button>
      <p class="pg-seg">🔒 Pagamento seguro processado pela Singlr. Seus dados ficam protegidos.</p>`;
    let forma = 'pix';
    const $b = (q) => box.querySelector(q);
    const tel = $b('#pgTel');
    tel.addEventListener('input', () => { tel.value = maskPhone(tel.value); });
    box.querySelectorAll('.pg-forma').forEach((f) => {
      f.onclick = () => {
        forma = f.dataset.f;
        box.querySelectorAll('.pg-forma').forEach((x) => x.classList.toggle('on', x === f));
        $b('#pgIr').textContent = forma === 'pix' ? '⚡ Gerar Pix' : '💳 Pagar com cartão';
        box.querySelectorAll('.pg-campo').forEach((c) => { c.hidden = forma !== 'pix'; });
      };
    });
    $b('.bump-x').onclick = () => { sheet.classList.remove('show'); setTimeout(() => sheet.remove(), 300); };
    metaStd('InitiateCheckout', { content_name: plano, content_ids: ids, num_items: ids.length, value: Number(total.toFixed(2)), currency: 'BRL' }, novoId('ic'));

    $b('#pgIr').onclick = async () => {
      const erro = $b('#pgErro');
      erro.textContent = '';
      if (forma === 'cartao') {
        track('PagarCartao', { plano, extras: chave, preco: VARIANTE });
        location.href = linkOferta(plano, chave);
        return;
      }
      const nome = $b('#pgNome').value.trim().replace(/\s+/g, ' ');
      const email = $b('#pgEmail').value.trim().toLowerCase();
      const d = tel.value.replace(/\D/g, '');
      if (nome.length < 3 || !nome.includes(' ')) { erro.textContent = 'Coloque seu nome e sobrenome.'; $b('#pgNome').focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) { erro.textContent = 'Confira o seu e-mail.'; $b('#pgEmail').focus(); return; }
      if (!(d.length === 11 && d[2] === '9') && d.length !== 10) { erro.textContent = 'Confira o WhatsApp com DDD.'; tel.focus(); return; }
      try { localStorage.setItem('pn_comprador', JSON.stringify({ nome, email, tel: d })); } catch {}
      const bt = $b('#pgIr');
      bt.disabled = true; bt.textContent = 'Gerando o Pix…';
      const corpo = { pacote: plano, extras, nome, email, telefone: d, sessao: SESSAO, variante: VARIANTE, utms,
        para: state.para, quando: state.quando, fbp: cookie('_fbp'), fbc: cookie('_fbc'), url: location.href };
      const gerar = async () => {
        const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.codigo) throw new Error(j.msg || 'Não conseguimos gerar o Pix agora. Tente de novo ou pague com cartão.');
        return j;
      };
      try {
        const j = await gerar();
        track('GerouPix', { plano, extras: chave, valor: j.valor, preco: VARIANTE });
        metaStd('AddPaymentInfo', { content_ids: ids, value: j.valor, currency: 'BRL', payment_type: 'pix' });
        telaPix(sheet, j, ids, gerar);
      } catch (e) {
        erro.textContent = e.message;
        bt.disabled = false; bt.textContent = '⚡ Gerar Pix';
      }
    };
  }

  function telaPix(sheet, cob, ids, gerar) {
    const box = sheet.querySelector('.bump-sheet');
    box.scrollTop = 0;
    box.innerHTML = `
      <button class="bump-x" type="button" aria-label="Fechar">✕</button>
      <div class="bump-kicker">Pix gerado ✅</div>
      <h3>Pague ${brl(cob.valor)} para confirmar</h3>
      <ol class="pix-passos"><li>Toque em <b>Copiar código Pix</b></li><li>Abra o app do seu banco e escolha <b>Pix Copia e Cola</b></li><li>Cole o código e confirme. Pronto! ✨</li></ol>
      <button class="btn3d green" id="pixCopiar" type="button">📋 Copiar código Pix</button>
      <div class="pix-cod" id="pixCod"></div>
      <div class="pix-qr">${cob.qr}<small>Ou escaneie o QR Code em outro celular</small></div>
      <div class="pix-st" id="pixSt"><i></i>Aguardando o pagamento…</div>
      <p class="pg-seg">A confirmação aparece aqui sozinha assim que o Pix cair. Não feche esta tela.</p>`;
    box.querySelector('#pixCod').textContent = cob.codigo;
    const st = box.querySelector('#pixSt');
    const copiar = box.querySelector('#pixCopiar');
    copiar.onclick = async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(cob.codigo); ok = true; } catch {}
      if (!ok) {
        const r = document.createRange(); r.selectNodeContents(box.querySelector('#pixCod'));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        try { ok = document.execCommand('copy'); } catch {}
      }
      copiar.textContent = ok ? '✅ Código copiado!' : 'Segure o código abaixo para copiar';
      track('CopiouPix');
      setTimeout(() => { copiar.textContent = '📋 Copiar código Pix'; }, 3000);
    };
    let vivo = true, t0 = Date.now(), pagoEm = 0, avisouVencido = false;
    box.querySelector('.bump-x').onclick = () => {
      if (!confirm('Já pagou? Se fechar agora, a confirmação chega no seu e-mail. Fechar mesmo assim?')) return;
      vivo = false; sheet.classList.remove('show'); setTimeout(() => sheet.remove(), 300);
    };
    const consulta = async () => {
      if (!vivo) return;
      try {
        const r = await fetch(`/api/checkout?id=${encodeURIComponent(cob.id)}`, { cache: 'no-store' });
        const j = await r.json();
        if (j.pago) {
          if (!pagoEm) {
            pagoEm = Date.now();
            st.className = 'pix-st ok'; st.innerHTML = '🎉 Pagamento confirmado! Preparando a sua Área Mágica…';
            track('PagouPix');
            metaStd('Purchase', { value: cob.valor, currency: 'BRL', content_ids: ids, content_type: 'product', num_items: ids.length }, `compra-${cob.transacao}`);
          }
          if (j.t) {
            try { localStorage.setItem('pn_area', j.t); } catch {}
            location.href = `/area?t=${encodeURIComponent(j.t)}`;
            return;
          }
          if (Date.now() - pagoEm > 120000) { location.href = '/obrigado?recuperar=1'; return; }
        }
      } catch {}
      // o código do Pix vence (~30 min): oferece um novo, mas continua conferindo o atual
      if (!pagoEm && !avisouVencido && Date.now() - t0 > 25 * 60 * 1000) {
        avisouVencido = true;
        st.className = 'pix-st venc';
        st.innerHTML = '⏰ Este código pode ter vencido. <button type="button" id="pixNovo">Gerar novo Pix</button>';
        st.querySelector('#pixNovo').onclick = async (ev) => {
          ev.target.disabled = true; ev.target.textContent = 'Gerando…';
          try { const j = await gerar(); vivo = false; track('GerouPix', { novo: true, valor: j.valor }); telaPix(sheet, j, ids, gerar); }
          catch (e) { ev.target.disabled = false; ev.target.textContent = 'Tentar de novo'; }
        };
      }
      if (!vivo) return;
      if (Date.now() - t0 < 60 * 60 * 1000) setTimeout(consulta, pagoEm ? 3000 : 4000);
      else st.innerHTML = 'Já pagou? Toque em "Recuperar meu acesso" na página de obrigado com o seu e-mail.';
    };
    setTimeout(consulta, 5000);
  }

  // Depois de 01/12 o preço normal vira o preço de venda (sem risco)
  if (!promoAtiva()) CONFIG.plans.forEach((pl) => { if (pl.de) { pl.por = pl.de; pl.de = null; } });

  function cronometroPromo() {
    const bar = $('promoBar');
    if (!promoAtiva()) { bar.hidden = true; return; }
    bar.hidden = false;
    const dois = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const f = FIM_PROMO - Date.now();
      if (f <= 0) { bar.hidden = true; location.reload(); return; }
      $('cdD').textContent = dois(Math.floor(f / 864e5));
      $('cdH').textContent = dois(Math.floor(f / 36e5) % 24);
      $('cdM').textContent = dois(Math.floor(f / 6e4) % 60);
      $('cdS').textContent = dois(Math.floor(f / 1e3) % 60);
    };
    tick(); setInterval(tick, 1000);
  }

  // Teste A/B de preço: metade vê "10x de…", metade vê só o valor à vista (como era antes).
  // A variante fica salva no aparelho. Para ver uma específica: ?preco=10x ou ?preco=avista
  const VARIANTE = (() => {
    const forc = new URLSearchParams(location.search).get('preco');
    let x = forc === '10x' || forc === 'avista' ? forc : null;
    try { x = x || localStorage.getItem('pn_preco'); } catch {}
    if (x !== '10x' && x !== 'avista') x = Math.random() < 0.5 ? '10x' : 'avista';
    try { localStorage.setItem('pn_preco', x); } catch {}
    return x;
  })();
  const PARCELAS = VARIANTE === '10x' ? 10 : 1;
  const parcela = (v) => (Math.floor((precoNum(v) / PARCELAS) * 100) / 100).toFixed(2).replace('.', ',');

  // Pix na própria página: desligado em 05/11 (voltamos ao checkout da Singlr). true = religa extras + Pix aqui.
  const PIX_NA_PAGINA = false;

  function revealOffers() {
    const sec = $('offers');
    if (!sec.hidden) return;
    cronometroPromo();
    $('plans').innerHTML = CONFIG.plans.map((pl) => `
      <article class="plan ${pl.best ? 'best' : ''}">
        ${pl.badge ? `<div class="badge">${pl.badge}</div>` : ''}
        <h4>${pl.nome}</h4>
        <div class="dur">${pl.dur}</div>
        <ul>${pl.itens.map((i) => `<li>${i}</li>`).join('')}</ul>
        ${PARCELAS > 1
          ? `<div class="price parc">${pl.de ? `<s>de R$ ${pl.de}</s>` : ''}<span class="px">${PARCELAS}x de</span><b>R$ ${parcela(pl.por)}</b><small>ou R$ ${pl.por} à vista</small></div>`
          : `<div class="price">${pl.de ? `<s>R$ ${pl.de}</s>` : ''}<b>R$ ${pl.por}</b></div>`}
        <button class="btn3d ${pl.verde ? 'green' : ''} ${pl.best ? 'pulse' : ''}" data-plan="${pl.id}" type="button">Quero esse 🎅</button>
        <p class="plan-obs">Após o pagamento, iremos solicitar as demais informações para criar as chamadas.</p>
      </article>`).join('');
    // Order bumps agora ficam no checkout da Singlr → vai direto pro pacote.
    // (abrirBumps() continua no código caso queira voltar a usar a tela do funil)
    $('plans').querySelectorAll('[data-plan]').forEach((b) => {
      b.onclick = () => {
        const plano = b.dataset.plan, pl = CONFIG.plans.find((x) => x.id === plano);
        metaStd('InitiateCheckout', { content_name: plano, content_ids: [plano], num_items: 1, value: precoNum(pl.por), currency: 'BRL' }, novoId('ic'));
        track('EscolheuPlano', { plano, preco: VARIANTE });
        if (PIX_NA_PAGINA) abrirBumps(plano);
        else setTimeout(() => { location.href = linkOferta(plano, 'base'); }, 120);   // dá tempo do rastreio sair
      };
    });
    sec.hidden = false;
    metaStd('ViewContent', { content_name: 'pacotes', content_category: 'ligacao_papai_noel' });
    track('ViuOfertas', { preco: VARIANTE });
  }

  // =========================================================
  //  INÍCIO
  // =========================================================
  if (isCallMode && memberT) {
    $('intro').hidden = true;
    const voltar = () => { location.href = `/area?t=${encodeURIComponent(memberT)}`; };
    fetch(`/api/pedido?t=${encodeURIComponent(memberT)}`).then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const srcV = qs.get('tipo') === 'pedido' ? d.pedidoVideo : d.videochamada;
        if (!srcV) return voltar();
        CALL_SRC = srcV;
        PODE_GRAVAR = d.gravacao !== false;
        v.crossOrigin = 'anonymous';      // necessário para gravar o áudio do vídeo
        v.poster = '';
        const nome = d.config && d.config.nome_crianca;
        if (nome) $('prep').querySelector('h2').textContent = `O Papai Noel vai ligar para ${nome}! 🎅`;
        $('bContinue').textContent = 'Voltar à Área Mágica ✨';
        const li = [...$('prep').querySelectorAll('li')].find((x) => /câmera/i.test(x.textContent));
        if (li) li.innerHTML = '<span>🎥</span>Permita câmera e microfone: vamos gravar a recordação';
        track('AbriuLigacaoComprada', { tipo: qs.get('tipo') || 'ligacao' });
        openCall(true);
      })
      .catch(voltar);
  } else if (modoWhats) {
    bootWhats();
  } else if (isCallMode) {
    $('intro').hidden = true;
    track('AbriuLinkWhatsApp');
    v.poster = poster('s5');
    openCall(true);
  } else {
    boot();
  }
})();
