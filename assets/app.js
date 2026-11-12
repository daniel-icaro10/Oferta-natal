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

  const SEG = { s1: 's1-abertura', s2: 's2-para-quem', s3: 's3-dia-hora', s4: 's4-explicacao', s5: 's5-chamada' };
  const CAPS = window.CAPTIONS || {};

  // ---------------- UTIL ----------------
  const $ = (id) => document.getElementById(id);
  const v = $('v'), panel = $('panel'), caps = $('caps'), ring = $('ring');
  const qs = new URLSearchParams(location.search);
  const isCallMode = /\/chamada\/?$/.test(location.pathname) || qs.has('chamada');
  // Ligação comprada (vem da Área Mágica): /chamada?t=TOKEN[&tipo=pedido]
  const memberT = /^[A-Za-z0-9_-]{12,40}$/.test(qs.get('t') || '') ? qs.get('t') : null;
  let CALL_SRC = null;
  const utms = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'src', 'sck']
    .forEach((k) => { if (qs.get(k)) utms[k] = qs.get(k); });

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
  window.PN_PAGINA = memberT ? 'comprada' : isCallMode ? 'chamada' : 'funil';
  filaEv.push(['Visitou', { pagina: window.PN_PAGINA, ref: document.referrer ? new URL(document.referrer).hostname : null }]);
  setTimeout(enviarEventos, 1500);

  const src = (k) => `/assets/video/${SEG[k]}.mp4`;
  const poster = (k) => `/assets/img/${SEG[k]}.jpg`;

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
  function playSeg(k, onEnd, { withCaps = true, keepPanel = false, at = null } = {}) {
    if (!keepPanel) hidePanel();
    atCue = at;
    capKey = withCaps ? k : null; capLine = -1; caps.innerHTML = '';
    v.poster = poster(k);
    v.src = blobs[k] || src(k);
    v.muted = !soundOn;
    v.onended = () => { caps.innerHTML = ''; onEnd && onEnd(); };
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
    requestAnimationFrame(() => panel.classList.add('show'));
  }
  function hidePanel() { panel.classList.remove('show'); }

  // =========================================================
  //  PARTE 1 — VSL INTERATIVA
  // =========================================================
  function boot() {
    preload('s1'); preload('s2'); preload('s3');
    $('bStart').onclick = () => {
      track('Iniciou');
      enableSound();
      audioInit(); musicaTocar();
      $('intro').classList.add('out');
      setTimeout(() => { $('intro').hidden = true; }, 460);
      // botão aparece quando ele diz "Só clicar no botão abaixo" (8s)
      playSeg('s1', () => { if (!panel.classList.contains('show')) ask1(); }, { at: [7.9, ask1] });
      setTimeout(() => preload('s4'), 2500);
    };
    $('unmute').onclick = () => { enableSound(); v.play().catch(() => {}); };
  }

  function ask1() {
    showPanel(
      '<button class="btn3d pulse" id="b1" type="button">📅 Agendar Ligação</button>',
      (p) => {
        p.querySelector('#b1').onclick = () => {
          enableSound();
          track('QuerAgendar');
          playSeg('s2', ask2);
        };
      },
    );
  }

  function ask2() {
    const opts = [['filho', '👦 Filho(s)'], ['filha', '👧 Filha(s)'], ['neto', '👦 Neto(s)'], ['neta', '👧 Neta(s)']];
    showPanel(
      `<div class="label">Para quem é a ligação?</div>
       <div class="grid">${opts.map(([id, t]) => `<button class="btn3d" data-v="${id}" type="button">${t}</button>`).join('')}</div>`,
      (p) => p.querySelectorAll('[data-v]').forEach((b) => {
        b.onclick = () => {
          b.classList.add('sel');
          state.para = b.dataset.v; store.set({ para: state.para });
          track('ParaQuem', { para: state.para });
          setTimeout(() => playSeg('s3', ask3), 250);
        };
      }),
    );
  }

  // ---- Dia e hora: atalhos + roleta estilo iPhone ----
  const Y = CONFIG.year;
  const QUICK = [
    { id: 'vespera', t: '🎄 Véspera', s: '24/12 · noite', dia: `${Y}-12-24`, hora: '20:00' },
    { id: 'natal-manha', t: '🎁 Natal', s: '25/12 · manhã', dia: `${Y}-12-25`, hora: '09:00' },
    { id: 'natal-tarde', t: '☀️ Natal', s: '25/12 · tarde', dia: `${Y}-12-25`, hora: '15:00' },
    { id: 'natal-noite', t: '🌙 Natal', s: '25/12 · noite', dia: `${Y}-12-25`, hora: '19:00' },
  ];

  function ask3() {
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

  function askCustomWhen() {
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
        p.querySelector('#bBack').onclick = ask3;
        p.querySelector('#bWhen').onclick = () => {
          const d = wd.get(), h = wh.get(), m = wm.get();
          setWhen({ tipo: 'personalizado', dia: d.v, hora: `${h.v}:${m.v}`, label: `${d.t} · ${h.v}:${m.v}` });
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

  function setWhen(q) {
    state.quando = q; store.set({ quando: q });
    track('DiaHora', { tipo: q.tipo, dia: q.dia, hora: q.hora });
    setTimeout(() => {
      // para logo depois do "Vamos simular uma ligação?" (corta o "coloca o seu telefone…") e abre o convite
      playSeg('s4', ask4, { at: [21.15, () => { v.pause(); v.onended = null; capKey = null; caps.innerHTML = ''; ask4(); }] });
      preload('s5');
    }, 250);
  }

  function maskPhone(d) {
    d = d.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  // Texto que já vai digitado no WhatsApp (começa sempre com o gatilho do ManyChat)
  function textoWhats() {
    const para = { filho: 'meu(s) filho(s)', filha: 'minha(s) filha(s)', neto: 'meu(s) neto(s)', neta: 'minha(s) neta(s)' }[state.para];
    const q = state.quando || {};
    let quando = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.dia || '')) {
      const [, m, d] = q.dia.split('-');
      quando = ` no dia ${d}/${m}${/^\d{2}:\d{2}$/.test(q.hora || '') ? ` às ${q.hora.replace(':00', 'h')}` : ''}`;
    }
    return `${CONFIG.waGatilho}${para ? ` para ${para}` : ''}${quando}.`;
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
    const quem = { filho: 'seu(s) filho(s)', filha: 'sua(s) filha(s)', neto: 'seu(s) neto(s)', neta: 'sua(s) neta(s)' }[state.para] || 'o seu anjinho';
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
    track('ChatAbriu', { para: state.para });
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

  // Depois do telefone: botão que abre o WhatsApp do ManyChat com a mensagem pronta
  function mostrarWhats() {
    const url = `https://wa.me/${CONFIG.waManychat}?text=${encodeURIComponent(textoWhats())}`;
    showPanel(
      `<div class="card">
         <h3>Agora é com o Papai Noel! 🎅</h3>
         <p>Toque abaixo e mande a mensagem. Ele te responde no WhatsApp.</p>
         <a class="btn3d green pulse" id="b4" href="${url}" target="_blank" rel="noopener">💬 Falar com o Papai Noel</a>
         <p class="tiny">A mensagem já vai escrita. É só enviar. 😉</p>
       </div>`,
      (p) => {
        p.querySelector('#b4').onclick = () => {
          metaStd('Contact', { content_name: 'whatsapp_manychat' });
          track('ChamouWhatsApp', { para: state.para });
        };
      },
    );
  }

  // Convite para a simulação (sem pedir telefone)
  function ask4() {
    if (panel.classList.contains('show') && $('b4')) return;
    showPanel(
      `<div class="card">
         <h3>Vamos simular uma ligação? 🎅</h3>
         <p>O Papai Noel vai te chamar agora para você ver como funciona.</p>
         <button class="btn3d pulse" id="b4" type="button">📞 Simular ligação agora</button>
       </div>`,
      (p) => {
        p.querySelector('#b4').onclick = () => {
          metaStd('Lead', { content_name: 'ligacao_teste' }, novoId('lead'));
          track('PediuLigacao', { para: state.para, sem_telefone: true });
          abrirChat();
        };
      },
    );
  }

  /* Versão antiga com telefone (guardada para quando o WhatsApp voltar)
  function ask4ComTelefone() {
    showPanel(
      `<div class="card">
         <h3>Vamos simular uma ligação? 🎅</h3>
         <p>Coloque seu WhatsApp para o Papai Noel falar com você.</p>
         <label class="phone"><span>+55</span><input id="ph" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 98765-4321"></label>
         <div class="err" id="perr"></div>
         <button class="btn3d pulse" id="b4" type="button">${CONFIG.waManychat ? 'Continuar ➜' : '📞 Receber a ligação agora'}</button>
         <button class="btn3d green skip-btn" id="bPular" type="button">▶️ Testar sem informar</button>
         <p class="tiny">🔒 Seu número fica protegido.</p>
       </div>`,
      (p) => {
        const ph = p.querySelector('#ph');
        ph.addEventListener('input', () => { ph.value = maskPhone(ph.value); });
        const go = () => {
          const d = ph.value.replace(/\D/g, '');
          if (!(d.length === 11 && d[2] === '9') && d.length !== 10) {
            p.querySelector('#perr').textContent = 'Confira o número com DDD 😉';
            ph.focus(); return;
          }
          state.phone = d;
          ph.blur();
          sendLead();
        };
        p.querySelector('#b4').onclick = go;
        p.querySelector('#bPular').onclick = () => {
          ph.blur();
          track('PulouTelefone', { para: state.para });
          abrirChat();   // segue a simulação sem telefone (sem evento Lead)
        };
        ph.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      },
    );
  }

  */

  async function postLead(extra = {}) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(CONFIG.apiLead, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ phone: state.phone, para: state.para, quando: state.quando, utms, sessao: SESSAO, ...extra }),
      });
      clearTimeout(t);
      const j = await r.json().catch(() => ({}));
      if (j.chave) { try { localStorage.setItem('pn_chave', j.chave); } catch {} }   // usado na página /obrigado
      return r.ok && j.ok;
    } catch { return false; }
  }

  // Sem WhatsApp: o toque em "Receber a ligação" já abre a chamada aqui (som/câmera liberados pelo toque)
  function sendLead() {
    const leadId = novoId('lead');
    metaStd('Lead', { content_name: 'ligacao_teste' }, leadId);
    track('PediuLigacao', { para: state.para });
    if (CONFIG.waManychat) mostrarWhats(); else abrirChat();
    postLead({ eventId: leadId, fbp: cookie('_fbp'), fbc: cookie('_fbc'), url: location.href });
  }

  // =========================================================
  //  PARTE 2 — VIDEOCHAMADA
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
    if (!CALL_SRC) preload('s5');
    if (fromWhatsApp) {
      $('prep').hidden = false;              // toque 1: libera o som + câmera
    } else {
      prepararVideoChamada(); bless(ring); bless(v);   // plano B: o clique já liberou
      pedirCameraAntes().then(showIncoming);
    }
  }

  // Carrega o vídeo da ligação no elemento (sem capa) para começar instantâneo ao atender
  function prepararVideoChamada() {
    v.removeAttribute('poster');
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
    const srcCall = CALL_SRC || blobs.s5 || src('s5');
    if (v.src !== srcCall) v.src = srcCall;
    v.muted = false;
    v.currentTime = 0;
    v.onended = finishCall;
    v.addEventListener('playing', () => { $('screen').classList.remove('connecting'); startTimer(); }, { once: true });
    if (!CALL_SRC) {
      // Ligação V2 — tempos da fala (s): "Combinado?" 26,76–27,30 · "câmera" 29,98 · "botões" 30,82 ·
      // "pausas" 31,48 · "salvar o vídeo" 36,52 · "Agora, só você escolher…" 38,94
      rodarRoteiro([
        [14.1, mostrarPular],                       // depois de "…se comportou bastante esse ano, é verdade?"
        [27.0, esconderPular],
        [27.2, fimDaSimulacao],
        [29.9, () => destacar('self', '📷 A câmera da criança')],
        [30.8, () => destacar('icBar', '👆 Botões de verdade')],
        [31.5, () => aviso('⏸ Pausas para a criança responder', 2600, true)],
        [36.4, abrirSalvarDemo],
      ]);
    } else {
      gravarLigacao();            // ligação comprada: grava a recordação
    }

    $('incoming').hidden = true;
    $('incall').hidden = false;
    $('callTime').textContent = 'Conectando…';

    // dentro do toque: começa já
    const p = v.play();
    if (p) p.catch(() => {
      $('screen').classList.remove('connecting');
      $('callTime').innerHTML = '<button class="back" id="bres" type="button">Toque para conectar</button>';
      $('bres').onclick = () => v.play();
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
    b.textContent = 'Entendi! Ver Agenda! 📅';
    b.onclick = () => {
      track('PulouSimulacao', { em: Math.round(v.currentTime) });
      esconderPular();
      v.currentTime = 27.15;   // um pouco antes do "Viu só…" (o "Fim da simulação" dispara em 27,2)
      v.play().catch(() => {});
    };
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
    callDone = true;
    v.onended = null;
    esconderPular();
    pararGravacao();
    $('bContinue').hidden = false;
    track('ChamadaConcluida');
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
  } else if (isCallMode) {
    $('intro').hidden = true;
    track('AbriuLinkWhatsApp');
    v.poster = poster('s5');
    openCall(true);
  } else {
    boot();
  }
})();
