/* Área Mágica — área de membros da Ligação do Papai Noel */
(() => {
  'use strict';
  const WA_SUPORTE = '553584699814';
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');
  // O link da Área Mágica fica guardado no aparelho: /area sem token reabre o último pedido
  let t = new URLSearchParams(location.search).get('t') || '';
  try {
    if (/^[A-Za-z0-9_-]{8,50}$/.test(t)) {
      localStorage.setItem('pn_area', t);
    } else {
      t = localStorage.getItem('pn_area') || '';
      if (!t) {
        t = 'tok_demo_' + Date.now().toString(36);
        localStorage.setItem('pn_area', t);
      }
      history.replaceState(null, '', `/area?t=${encodeURIComponent(t)}`);
    }
  } catch {}
  let D = null;            // dados do pedido
  let draft = {};          // configuração em edição
  let step = 0;

  $('#ajuda').href = `https://wa.me/${WA_SUPORTE}?text=${encodeURIComponent('Oi! Preciso de ajuda com a minha Área Mágica 🎅')}`;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
  const toast = (msg) => { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 3200); };
  const PARA = { filho: ['👦', 'Filho(s)'], filha: ['👧', 'Filha(s)'], neto: ['👦', 'Neto(s)'], neta: ['👧', 'Neta(s)'] };
  const POSSE = { filho: 'seu(s) filho(s)', filha: 'sua(s) filha(s)', neto: 'seu(s) neto(s)', neta: 'sua(s) neta(s)' };
  const quem = () => draft.nome_crianca || D.config.nome_crianca || POSSE[draft.para || D.config.para] || 'seu anjinho';
  const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const fmtDia = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); return `${WD[dt.getDay()]}, ${d} de dezembro`; };
  const quando = (dia, hora) => (dia ? `${fmtDia(dia)}${hora ? ` às ${hora.replace(':00', 'h').replace(':', 'h')}` : ''}` : 'a definir');

  async function api(method, body) {
    const r = await fetch(method === 'GET' ? `/api/pedido?t=${encodeURIComponent(t)}` : '/api/pedido', {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  }

  // ---------------- INÍCIO ----------------
  async function boot() {
    if (!/^[A-Za-z0-9_-]{6,60}$/.test(t)) return telaErro();
    const { ok, status, j } = await api('GET').catch(() => ({ ok: false, status: 0 }));
    if (status === 410) return telaFim();
    if (!ok) return telaErro();
    D = j; draft = { ...D.config };
    $('#hello').textContent = D.primeiroNome ? `Ho ho ho, ${D.primeiroNome}! 🎄` : 'Ho ho ho! 🎄';
    if (D.estornado) return telaEstorno();
    if (!D.configurado) { step = 0; wizard(); } else painel();
  }

  function telaErro() {
    app.innerHTML = `<div class="card over"><div class="big-emo">🧭</div><h2>Hmm, não achei esse link</h2>
      <p class="sub">Recupere o acesso com o e-mail e o celular usados na compra.</p>
      <a class="btn3d" href="/obrigado?recuperar=1">🔑 Recuperar meu acesso</a></div>`;
  }
  function telaFim() {
    app.innerHTML = `<div class="card over"><div class="big-emo">🌙</div><h2>A magia descansou até o próximo Natal</h2>
      <p class="sub">A Área Mágica ficou disponível até 31/12. Obrigado por fazer parte do Natal da sua família! 🎅❤️</p></div>`;
  }
  function telaEstorno() {
    app.innerHTML = `<div class="card over"><div class="big-emo">📭</div><h2>Este pedido foi cancelado</h2>
      <p class="sub">Se isso foi um engano, fale com a gente aqui embaixo.</p></div>`;
  }

  // =========================================================
  //  ASSISTENTE DE CONFIGURAÇÃO
  // =========================================================
  const passos = () => [
    'quem',
    D.pacote && 'quando',
    D.pacote === 'premium' && 'mensagem',
    D.extras.includes('pedido') && 'pedido',
    'resumo',
  ].filter(Boolean);

  async function salvar(finalizar = false) {
    const { ok, status, j } = await api('POST', { t, config: draft, finalizar });
    if (ok) { D = j; draft = { ...D.config }; }
    return { ok, status, j };
  }

  function wizard() {
    const ps = passos(), p = ps[step];
    const barra = `<div class="wiz-top">${ps.map((_, i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>`;
    const nav = (txt = 'Continuar ➜') => `<div class="row mt">
      ${step > 0 ? '<button class="btn3d ghost sm" id="bVoltar" type="button">Voltar</button>' : ''}
      <button class="btn3d sm" id="bNext" type="button">${txt}</button></div><div class="err" id="err"></div>`;
    let html = '';

    if (p === 'quem') {
      const precisaNome = D.pacote === 'nome' || D.pacote === 'premium';
      html = `<h2>Pra quem é a magia? ✨</h2>
        <p class="sub">${precisaNome ? 'O Papai Noel vai chamar a criança pelo nome, então capricha!' : 'Conta pra gente quem vai receber a ligação.'}</p>
        <div class="chips">${Object.entries(PARA).map(([k, [e, n]]) => `<button class="chip ${draft.para === k ? 'sel' : ''}" data-para="${k}" type="button"><span style="font-size:24px">${e}</span>${n}</button>`).join('')}</div>
        ${precisaNome ? `<label class="lbl" for="fNome">Nome da criança</label>
          <input class="inp" id="fNome" maxlength="40" autocomplete="off" placeholder="Ex.: Ana Maria" value="${esc(draft.nome_crianca)}">
          <label class="lbl" for="fPron">Como se fala? <span style="font-weight:500;color:var(--muted)">(opcional)</span></label>
          <input class="inp" id="fPron" maxlength="60" autocomplete="off" placeholder="Ex.: Iasmim = “Ias-mím”" value="${esc(draft.pronuncia)}">
          <div class="hint">Se o nome tiver um jeitinho especial de falar, escreva aqui.</div>` : ''}
        ${nav()}`;
    }

    if (p === 'quando') {
      const Q = [['2026-12-24', '20:00', '🎄 Véspera', '24/12 · noite'], ['2026-12-25', '09:00', '🎁 Natal', '25/12 · manhã'], ['2026-12-25', '15:00', '☀️ Natal', '25/12 · tarde'], ['2026-12-25', '19:00', '🌙 Natal', '25/12 · noite']];
      const isQ = (d, h) => draft.dia === d && draft.hora === h;
      html = `<h2>Quando o Papai Noel liga? 📅</h2>
        <p class="sub">Escolha um momento em que ${esc(quem())} esteja em casa, pertinho de você.</p>
        <div class="chips">${Q.map(([d, h, a, b]) => `<button class="chip ${isQ(d, h) ? 'sel' : ''}" data-dia="${d}" data-hora="${h}" type="button">${a}<small>${b}</small></button>`).join('')}</div>
        <button class="btn3d ghost sm mt" id="bOutro" type="button">📅 Escolher outro dia e horário</button>
        <div id="roleta"></div>
        <p class="hint" id="escolha" style="text-align:center;font-size:14px;margin-top:12px">${draft.dia ? `Escolhido: <b>${quando(draft.dia, draft.hora)}</b>` : ''}</p>
        ${nav()}`;
    }

    if (p === 'mensagem') {
      const modo = draft.modo_mensagem || (draft.mensagem_pai ? 'escrever' : 'escrever');
      const a = draft.ajuda || {};
      html = `<h2>O que o Papai Noel vai dizer? 💌</h2>
        <p class="sub">A ligação tem até 1 minuto. Escreva do seu jeito ou deixe que a gente escreve com você.</p>
        <div class="tabs"><button type="button" data-modo="escrever" class="${modo === 'escrever' ? 'on' : ''}">✍️ Eu escrevo</button><button type="button" data-modo="ajuda" class="${modo === 'ajuda' ? 'on' : ''}">🤝 Quero ajuda</button></div>
        <div id="mEscrever" ${modo === 'escrever' ? '' : 'hidden'}>
          <textarea class="txt" id="fMsg" maxlength="900" placeholder="Ex.: ${esc(quem())}, eu soube que esse ano você aprendeu a andar de bicicleta sozinho e ajudou muito a mamãe…">${esc(draft.mensagem_pai)}</textarea>
          <div class="count-chars"><span id="nChars">0</span>/900 · cerca de 1 minuto falado</div>
        </div>
        <div id="mAjuda" ${modo === 'ajuda' ? '' : 'hidden'}>
          <label class="lbl">Do que ${esc(quem())} mais gosta?</label><input class="inp" data-a="gosta" maxlength="300" placeholder="Desenhos, bichinhos, esportes…" value="${esc(a.gosta)}">
          <label class="lbl">Uma conquista desse ano 🏆</label><input class="inp" data-a="conquista" maxlength="300" placeholder="Aprendeu a ler, largou a chupeta…" value="${esc(a.conquista)}">
          <label class="lbl">Qual presente pediu? 🎁</label><input class="inp" data-a="presente" maxlength="300" value="${esc(a.presente)}">
          <label class="lbl">Um recado do coração ❤️</label><input class="inp" data-a="recado" maxlength="300" placeholder="Obedecer a mamãe, escovar os dentes…" value="${esc(a.recado)}">
        </div>
        ${nav()}`;
    }

    if (p === 'pedido') {
      const DIAS = ['2026-12-12', '2026-12-15', '2026-12-18', '2026-12-20', '2026-12-22', '2026-12-23'];
      const HS = [['10:00', '☀️ Manhã'], ['15:00', '🌤️ Tarde'], ['19:00', '🌙 Noite']];
      html = `<h2>Ligação do Pedido de Presente 🎁</h2>
        <p class="sub">Antes do Natal, o Papai Noel liga pra ${esc(quem())} contar o que quer ganhar. Quando?</p>
        <label class="lbl">Dia</label>
        <div class="chips" style="grid-template-columns:repeat(3,1fr)">${DIAS.map((d) => `<button class="chip ${draft.pedido_dia === d ? 'sel' : ''}" data-pdia="${d}" type="button">${+d.slice(-2)}/12<small>${WD[new Date(2026, 11, +d.slice(-2)).getDay()].slice(0, 3)}</small></button>`).join('')}</div>
        <label class="lbl">Horário</label>
        <div class="chips" style="grid-template-columns:repeat(3,1fr)">${HS.map(([h, n]) => `<button class="chip ${draft.pedido_hora === h ? 'sel' : ''}" data-phora="${h}" type="button">${n}</button>`).join('')}</div>
        ${nav()}`;
    }

    if (p === 'resumo') {
      const L = [];
      L.push(['Para', `${PARA[draft.para]?.[1] || '—'}${draft.nome_crianca ? ` · ${esc(draft.nome_crianca)}` : ''}`]);
      if (D.pacote) L.push(['Videochamada', quando(draft.dia, draft.hora)]);
      if (D.pacote === 'premium') L.push(['Mensagem', draft.modo_mensagem === 'ajuda' ? 'A gente escreve com você 🤝' : `“${esc((draft.mensagem_pai || '').slice(0, 90))}${(draft.mensagem_pai || '').length > 90 ? '…' : ''}”`]);
      if (D.extras.includes('pedido')) L.push(['Pedido de Presente', quando(draft.pedido_dia, draft.pedido_hora)]);
      html = `<h2>Tudo certinho? 🎅</h2><p class="sub">Confira antes de mandar pro Polo Norte.</p>
        <ul class="summary">${L.map(([a, b]) => `<li><b>${a}</b>${b}</li>`).join('')}</ul>
        ${nav('Enviar pro Papai Noel ✨')}`;
    }

    app.innerHTML = `<section class="card">${barra}${html}</section>`;
    bindWizard(p);
  }

  function bindWizard(p) {
    const err = (m) => { $('#err').textContent = m; };
    const voltar = $('#bVoltar');
    if (voltar) voltar.onclick = () => { coletar(p); step--; wizard(); };

    app.querySelectorAll('[data-para]').forEach((b) => { b.onclick = () => { draft.para = b.dataset.para; app.querySelectorAll('[data-para]').forEach((x) => x.classList.toggle('sel', x === b)); }; });
    app.querySelectorAll('[data-dia]').forEach((b) => { b.onclick = () => { draft.dia = b.dataset.dia; draft.hora = b.dataset.hora; app.querySelectorAll('[data-dia]').forEach((x) => x.classList.toggle('sel', x === b)); $('#roleta').innerHTML = ''; $('#escolha').innerHTML = `Escolhido: <b>${quando(draft.dia, draft.hora)}</b>`; }; });
    app.querySelectorAll('[data-pdia]').forEach((b) => { b.onclick = () => { draft.pedido_dia = b.dataset.pdia; app.querySelectorAll('[data-pdia]').forEach((x) => x.classList.toggle('sel', x === b)); }; });
    app.querySelectorAll('[data-phora]').forEach((b) => { b.onclick = () => { draft.pedido_hora = b.dataset.phora; app.querySelectorAll('[data-phora]').forEach((x) => x.classList.toggle('sel', x === b)); }; });
    app.querySelectorAll('[data-modo]').forEach((b) => { b.onclick = () => { draft.modo_mensagem = b.dataset.modo; app.querySelectorAll('[data-modo]').forEach((x) => x.classList.toggle('on', x === b)); $('#mEscrever').hidden = b.dataset.modo !== 'escrever'; $('#mAjuda').hidden = b.dataset.modo !== 'ajuda'; }; });
    const msg = $('#fMsg'); if (msg) { const n = () => { $('#nChars').textContent = msg.value.length; }; msg.oninput = n; n(); }
    const outro = $('#bOutro'); if (outro) outro.onclick = () => roleta();

    $('#bNext').onclick = async () => {
      coletar(p);
      if (p === 'quem') {
        if (!draft.para) return err('Escolha pra quem é a ligação 😊');
        if ((D.pacote === 'nome' || D.pacote === 'premium') && !draft.nome_crianca) return err('Coloque o nome da criança');
      }
      if (p === 'quando' && (!draft.dia || !draft.hora)) return err('Escolha o dia e o horário');
      if (p === 'mensagem') {
        if ((draft.modo_mensagem || 'escrever') === 'escrever' && (draft.mensagem_pai || '').length < 20) return err('Escreva a mensagem (pelo menos uma frase)');
        if (draft.modo_mensagem === 'ajuda' && !(draft.ajuda?.gosta || draft.ajuda?.presente)) return err('Responda pelo menos do que gosta ou o presente');
      }
      if (p === 'pedido' && (!draft.pedido_dia || !draft.pedido_hora)) return err('Escolha o dia e o horário do pedido');

      const b = $('#bNext'); b.disabled = true;
      const fim = p === 'resumo';
      const r = await salvar(fim);
      b.disabled = false;
      if (!r.ok) return err(r.status === 422 ? 'Falta alguma informação. Volte e confira 🙏' : 'Não consegui salvar. Tente de novo.');
      if (fim) { toast('Recebido no Polo Norte! 🎅✨'); painel(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      step++; wizard(); window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }

  function coletar(p) {
    if (p === 'quem') {
      if ($('#fNome')) draft.nome_crianca = $('#fNome').value.trim();
      if ($('#fPron')) draft.pronuncia = $('#fPron').value.trim();
    }
    if (p === 'mensagem') {
      if ($('#fMsg')) draft.mensagem_pai = $('#fMsg').value.trim();
      draft.ajuda = { ...(draft.ajuda || {}) };
      app.querySelectorAll('[data-a]').forEach((i) => { draft.ajuda[i.dataset.a] = i.value.trim(); });
      draft.modo_mensagem = draft.modo_mensagem || 'escrever';
    }
  }

  // Roleta estilo iPhone (dia · hora : minuto)
  function roleta() {
    const days = []; for (let d = 1; d <= 25; d++) days.push({ v: `2026-12-${String(d).padStart(2, '0')}`, t: `${WD[new Date(2026, 11, d).getDay()].slice(0, 3)}, ${d} dez` });
    const hours = []; for (let h = 8; h <= 22; h++) { const s = String(h).padStart(2, '0'); hours.push({ v: s, t: s }); }
    const mins = ['00', '15', '30', '45'].map((m) => ({ v: m, t: m }));
    $('#roleta').innerHTML = `<div class="wheels mt"><div class="wheel w-day" id="wD"></div><div class="wheel w-h" id="wH"></div><div class="wsep">:</div><div class="wheel w-m" id="wM"></div><div class="wband"></div></div>
      <button class="btn3d green sm mt" id="bRol" type="button">Usar esse horário ✔</button>`;
    const di = draft.dia ? Math.max(0, days.findIndex((x) => x.v === draft.dia)) : 23;
    const hi = draft.hora ? Math.max(0, hours.findIndex((x) => x.v === draft.hora.slice(0, 2))) : 12;
    const wd = wheel($('#wD'), days, di), wh = wheel($('#wH'), hours, hi), wm = wheel($('#wM'), mins, 0);
    $('#bRol').onclick = () => {
      draft.dia = wd.get().v; draft.hora = `${wh.get().v}:${wm.get().v}`;
      app.querySelectorAll('[data-dia]').forEach((x) => x.classList.remove('sel'));
      $('#escolha').innerHTML = `Escolhido: <b>${quando(draft.dia, draft.hora)}</b>`;
      $('#roleta').innerHTML = '';
    };
  }
  function wheel(el, items, start) {
    const H = 40;
    el.innerHTML = `<div class="wpad"></div>${items.map((it) => `<div class="wi">${it.t}</div>`).join('')}<div class="wpad"></div>`;
    const els = el.querySelectorAll('.wi');
    const idx = () => Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / H)));
    const paint = () => { const c = el.scrollTop / H; els.forEach((e, i) => { const d = Math.min(Math.abs(i - c), 3); e.style.opacity = String(1 - d * 0.25); e.classList.toggle('cur', Math.round(c) === i); }); };
    el.addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true });
    els.forEach((e, i) => { e.onclick = () => el.scrollTo({ top: i * H, behavior: 'smooth' }); });
    requestAnimationFrame(() => { el.scrollTop = start * H; paint(); });
    return { get: () => items[idx()] };
  }

  // =========================================================
  //  PAINEL
  // =========================================================
  // =================== ÁREA MÁGICA: vitrine do Polo Norte ===================
  // Cada presente é uma "tela": pronta (assistir/ligar), em produção (aurora + estrelas) ou bloqueada (amostra rodando + preço).
  const LIBERA = new Date('2026-12-01T03:00:00Z');            // ligações e vídeos aparecem a partir de 1º/12
  const ITEM = {
    pedido: { nome: 'Ligação do Pedido de Presente', e: '🎁', preco: 16.9, de: 39.9 },
    gravacao: { nome: 'Gravação da Reação', e: '🎥', preco: 12.9, de: 27.9 },
    camera: { nome: 'Papai Noel na sua sala', e: '🏠', preco: 14.9, de: 49.9 },
    ensaio: { nome: 'Ensaio de Natal no Polo Norte', e: '📸', preco: 14.9, de: 29.9 },
  };
  const CAPA = { ligacao: '/assets/v2/img/v1.jpg', pedido: '/assets/v2/img/v4a.jpg', gravacao: '/assets/v2/img/v5b.jpg', camera: '/assets/area/exemplo-sala.jpg?v=2' };
  const AMOSTRA = {
    ligacao: '/assets/v2/video/v1.mp4',
    pedido: '/assets/v2/video/v4a.mp4',
    gravacao: '/assets/v2/video/v5b.mp4',
    camera: '/assets/area/exemplo-sala.mp4?v=2',
  };
  const ENSAIO_AMOSTRA = ['/assets/area/ensaio-1.jpg', '/assets/area/ensaio-2.jpg', '/assets/area/ensaio-3.jpg'];
  const tem = (k) => (k === 'gravacao' ? D.gravacao : D.extras.includes(k));
  const nomeC = () => esc(D.config.nome_crianca || quem());
  const ateLibera = () => {
    const f = LIBERA - Date.now();
    if (f <= 0) return '';
    const d = Math.floor(f / 864e5), h = Math.floor(f / 36e5) % 24;
    return d ? `${d} dia${d > 1 ? 's' : ''} e ${h}h` : `${h}h`;
  };

  // tela de mídia: estado "pronto" (vídeo/ação), "producao" (aurora) ou "bloqueado" (amostra + cadeado)
  const estrelas = () => Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${2.4 + (i % 5) * 0.6}s;--t:${(i * 0.43) % 3}s"></i>`).join('');
  function tela({ estado, video, poster, titulo, sub, extra = '' }) {
    if (estado === 'producao') {
      return `<div class="mg-tela producao"><div class="aurora"></div><div class="stars">${estrelas()}</div>
        <div class="mg-tela-in"><div class="mg-elfo">🎬</div><b>${titulo}</b><span>${sub}</span>${extra}</div></div>`;
    }
    const media = video ? `<video src="${esc(video)}" ${poster ? `poster="${esc(poster)}"` : ''} muted loop playsinline autoplay preload="metadata"></video>` : '';
    if (estado === 'bloqueado') {
      return `<div class="mg-tela bloqueado">${media}<div class="mg-vidro"></div><span class="mg-amostra">exemplo</span>
        <div class="mg-tela-in"><div class="mg-cadeado">🔒</div><b>${titulo}</b><span>${sub}</span></div></div>`;
    }
    return `<div class="mg-tela pronto">${media}<div class="mg-tela-in fim">${extra}</div></div>`;
  }
  const precoFita = (k) => `<div class="mg-fita"><span><s>${brl(ITEM[k].de)}</s> <b>${brl(ITEM[k].preco)}</b></span>
      <a class="mg-btn ouro" href="/extra?p=${encodeURIComponent(t)}&i=${k}">Desbloquear</a></div>`;

  function blocoLigacao() {
    const c = D.config, pronta = D.videochamada && (D.liberado !== false || new Date() >= LIBERA || location.search.includes('teste'));
    const quandoTxt = c.dia ? quando(c.dia, c.hora) : 'dia a definir';
    const t1 = pronta
      ? tela({ estado: 'pronto', video: AMOSTRA.ligacao, poster: CAPA.ligacao, extra: `<a class="mg-ligar" href="/chamada?t=${encodeURIComponent(t)}"><span>📞</span>Atender o Papai Noel</a>` })
      : tela({ estado: 'producao', titulo: 'O Papai Noel está gravando', sub: `a ligação ${nomeC() ? `de ${nomeC()}` : ''}`,
        extra: ateLibera() ? `<em>Fica pronta em ${ateLibera()} · 1º de dezembro</em>` : '<em>Ficando pronta…</em>' });
    return `<section class="mg-item principal">
      <header><span class="mg-ico">📞</span><div><h3>Ligação do Papai Noel</h3><p>Para <b>${nomeC()}</b> · ${quandoTxt}</p></div></header>
      ${t1}
      <div class="mg-acoes"><a class="mg-btn claro" href="/ligacao">🔁 Simular a ligação de novo</a></div>
    </section>`;
  }

  function blocoPedido() {
    if (!tem('pedido')) {
      return `<section class="mg-item"><header><span class="mg-ico">🎁</span><div><h3>Ligação do Pedido de Presente</h3>
        <p>Antes do Natal, ${nomeC()} fala com o Papai Noel e conta o presente que quer ganhar.</p></div></header>
        ${tela({ estado: 'bloqueado', video: AMOSTRA.pedido, poster: CAPA.pedido, titulo: 'Uma ligação a mais', sub: 'para o pedido do presente' })}${precoFita('pedido')}</section>`;
    }
    const c = D.config, pronta = D.pedidoVideo && new Date() >= LIBERA;
    return `<section class="mg-item"><header><span class="mg-ico">🎁</span><div><h3>Ligação do Pedido de Presente</h3>
      <p>${c.pedido_dia ? quando(c.pedido_dia, c.pedido_hora) : 'Escolha o dia em “Editar informações”'}</p></div></header>
      ${pronta ? tela({ estado: 'pronto', video: AMOSTRA.pedido, poster: CAPA.pedido, extra: `<a class="mg-ligar" href="/chamada?t=${encodeURIComponent(t)}&tipo=pedido"><span>📞</span>Atender o Papai Noel</a>` })
        : tela({ estado: 'producao', titulo: 'Preparando o pedido', sub: 'o Papai Noel já separou o caderninho', extra: ateLibera() ? `<em>Libera em ${ateLibera()} · 1º de dezembro</em>` : '' })}
    </section>`;
  }

  function blocoGravacao() {
    if (!tem('gravacao')) {
      return `<section class="mg-item"><header><span class="mg-ico">🎥</span><div><h3>Gravação da Reação</h3>
        <p>A tela é gravada durante a ligação: a carinha de ${nomeC()} vendo o Papai Noel, guardada para sempre.</p></div></header>
        ${tela({ estado: 'bloqueado', video: AMOSTRA.gravacao, poster: CAPA.gravacao, titulo: 'Guarde esse momento', sub: 'o vídeo da reação fica salvo' })}${precoFita('gravacao')}</section>`;
    }
    return `<section class="mg-item"><header><span class="mg-ico">🎥</span><div><h3>Gravação da Reação</h3>
      <p>Liberada! Na hora da ligação a tela é gravada sozinha. Permita a câmera para a reação aparecer.</p></div></header>
      ${tela({ estado: 'pronto', video: AMOSTRA.gravacao, poster: CAPA.gravacao, extra: '<span class="mg-rec">● REC na hora da ligação</span>' })}</section>`;
  }

  function blocoSala() {
    if (!tem('camera')) {
      return `<section class="mg-item"><header><span class="mg-ico">🏠</span><div><h3>Papai Noel na sua sala</h3>
        <p>Você manda a foto da sala decorada e o Papai Noel aparece nela, deixando os presentes.</p></div></header>
        ${tela({ estado: 'bloqueado', video: AMOSTRA.camera, poster: '/assets/area/exemplo-sala.jpg', titulo: 'Flagrado na sua casa', sub: 'a prova que faltava' })}${precoFita('camera')}</section>`;
    }
    let corpo;
    if (D.cameraVideo) corpo = tela({ estado: 'pronto', video: D.cameraVideo, extra: `<a class="mg-btn claro" href="${esc(D.cameraVideo)}" download>⬇️ Baixar o vídeo</a>` });
    else if (D.cameraFoto) corpo = tela({ estado: 'producao', titulo: 'Papai Noel a caminho', sub: 'recebemos a foto da sua sala', extra: `<img class="mg-mini" src="${esc(D.cameraFoto)}" alt="">` });
    else corpo = tela({ estado: 'producao', titulo: 'Falta a foto da sala', sub: 'horizontal, com a árvore aparecendo' });
    return `<section class="mg-item"><header><span class="mg-ico">🏠</span><div><h3>Papai Noel na sua sala</h3>
      <p>${D.cameraVideo ? 'Flagramos o Papai Noel! 🎉' : D.cameraFoto ? 'O vídeo aparece aqui quando ele passar por aí.' : 'Mande a foto da sala decorada, bem iluminada.'}</p></div></header>
      ${corpo}<div class="mg-acoes"><label class="mg-btn ${D.cameraFoto ? 'claro' : 'ouro'}">${D.cameraFoto ? '🔄 Trocar a foto' : '📷 Enviar a foto da sala'}<input type="file" accept="image/*" data-up="camera" hidden></label></div></section>`;
  }

  function blocoEnsaio() {
    const fotos = D.ensaioResultado.length ? D.ensaioResultado : ENSAIO_AMOSTRA;
    const carrossel = `<div class="mg-carrossel ${tem('ensaio') && D.ensaioResultado.length ? '' : 'amostra'}">${fotos.map((u, i) => `<a ${tem('ensaio') && D.ensaioResultado.length ? `href="${esc(u)}" download="ensaio-natal-${i + 1}.jpg"` : ''}><img src="${esc(u)}" alt=""></a>`).join('')}</div>`;
    if (!tem('ensaio')) {
      return `<section class="mg-item"><header><span class="mg-ico">📸</span><div><h3>Ensaio de Natal no Polo Norte</h3>
        <p>10 fotos de ${nomeC()} com o Papai Noel, prontas para imprimir. Deslize para ver exemplos.</p></div></header>
        ${carrossel}${precoFita('ensaio')}</section>`;
    }
    const n = D.ensaioFotos.length;
    return `<section class="mg-item"><header><span class="mg-ico">📸</span><div><h3>Ensaio de Natal no Polo Norte</h3>
      <p>${D.ensaioResultado.length ? 'Seu ensaio chegou! Toque em cada foto para salvar.' : n >= 3 ? 'Recebemos as fotos. Os duendes estão montando o ensaio 🧝' : 'Envie de 1 a 3 fotos do rosto, de frente e com boa luz.'}</p></div></header>
      ${D.ensaioResultado.length ? carrossel : tela({ estado: 'producao', titulo: n ? 'Ensaio em produção' : 'Faltam as fotos', sub: n ? `${n} foto(s) recebida(s)` : 'só a criança na foto' })}
      ${!D.ensaioResultado.length && n < 3 ? `<div class="mg-acoes"><label class="mg-btn ${n ? 'claro' : 'ouro'}">📷 ${n ? 'Adicionar outra foto' : 'Enviar foto da criança'}<input type="file" accept="image/*" data-up="ensaio" hidden></label></div>` : ''}</section>`;
  }

  function painel() {
    const partes = [];
    if (!D.pacote) {
      partes.push(`<section class="mg-item principal"><header><span class="mg-ico">📞</span><div><h3>Ligação do Papai Noel</h3><p>Ainda não está no seu pedido.</p></div></header>
        <div class="mg-acoes"><a class="mg-btn ouro" href="/">Quero a ligação com o nome</a></div></section>`);
      app.innerHTML = partes.join(''); return;
    }
    const nucleo = ['pedido', 'gravacao', 'camera'], faltam = nucleo.filter((k) => !tem(k));
    const ganhos = 1 + nucleo.length - faltam.length;   // a ligação conta
    partes.push(`<section class="mg-colecao"><div class="mg-col-t"><b>Sua magia de Natal</b><span>${ganhos} de 4 presentes</span></div>
      <div class="mg-col-icos">${['📞', ...nucleo.map((k) => ITEM[k].e)].map((e, i) => `<span class="${i === 0 || tem(nucleo[i - 1]) ? 'on' : ''}">${e}</span>`).join('')}</div></section>`);

    // condição do WhatsApp valendo, ou o pacote no preço normal
    const ofer = D.oferta && new Date(D.oferta.expira_em) > new Date() ? D.oferta : null;
    if (ofer) {
      partes.push(`<section class="mg-oferta"><div class="stars">${estrelas()}</div><h3>${ofer.itens.length === 3 ? 'Pacote Mágico' : 'Complete a magia'}</h3>
        <p>${ofer.itens.map((k) => `${ITEM[k]?.e || ''} ${ITEM[k]?.nome || ''}`).join('<br>')}</p>
        <div class="mg-of-preco"><s>${brl(ofer.de)}</s><b>${brl(ofer.valor)}</b></div>
        <a class="mg-btn ouro grande" href="/extra?t=${encodeURIComponent(ofer.token)}">Aproveitar até ${new Date(ofer.expira_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</a></section>`);
    } else if (faltam.length >= 2) {
      const soma = faltam.reduce((s, k) => s + ITEM[k].preco, 0), preco = faltam.length === 3 ? 39.9 : soma;
      partes.push(`<section class="mg-oferta"><div class="stars">${estrelas()}</div><h3>${faltam.length === 3 ? 'Pacote Mágico' : 'Complete a magia'}</h3>
        <p>${faltam.map((k) => `${ITEM[k].e} ${ITEM[k].nome}`).join('<br>')}</p>
        <div class="mg-of-preco">${preco < soma ? `<s>${brl(soma)}</s>` : ''}<b>${brl(preco)}</b></div>
        <a class="mg-btn ouro grande" href="/extra?p=${encodeURIComponent(t)}&i=${faltam.join(',')}">Liberar ${faltam.length === 3 ? 'os 3' : 'os 2'} agora</a></section>`);
    }

    partes.push(blocoLigacao(), blocoPedido(), blocoGravacao(), blocoSala(), blocoEnsaio());

    // outra criança: o pacote é de uma criança só
    partes.push(`<section class="mg-crianca"><div class="mg-cri-ico">👧👦</div><div><h3>Tem mais uma criança?</h3>
      <p>Cada ligação chama uma criança pelo nome. Garanta a de outra criança com desconto de quem já é da família.</p>
      <div class="mg-of-preco pequeno"><s>R$ 19,90</s><b>R$ 14,90</b></div>
      <a class="mg-btn vermelho" href="/extra?nova=${encodeURIComponent(t)}">Ligação para outra criança</a></div></section>`);
    if (D.irmaos && D.irmaos.length) {
      partes.push(`<section class="mg-irmaos"><b>Outras crianças da família</b>${D.irmaos.map((x) => `<a href="/area?t=${encodeURIComponent(x.t)}">📞 ${esc(x.nome || 'Outra criança')}</a>`).join('')}</section>`);
    }
    partes.push(`<section class="mg-indique"><span class="mg-breve">em breve</span><div class="mg-ind-ico">🎁</div><h3>Indique e ganhe</h3>
      <p>Seus amigos ganham a magia do Natal e você ganha presentes do Polo Norte. O programa de indicação abre em breve.</p></section>`);
    partes.push(`<button class="mg-btn claro largo" id="bEditar" type="button">✏️ Editar informações</button>`);
    app.innerHTML = partes.join('');
    $('#bEditar').onclick = () => { step = 0; draft = { ...D.config }; wizard(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    // vídeos de amostra: só tocam quando aparecem na tela (economiza dados)
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { const v = e.target; if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }), { threshold: 0.35 }) : null;
    app.querySelectorAll('.mg-tela video').forEach((v) => { if (io) { v.removeAttribute('autoplay'); io.observe(v); } });
    bindUploads();
  }

  // ---------------- UPLOAD (reduz a foto no celular antes de enviar) ----------------
  function reduzir(file, max = 1600) {
    return new Promise((ok, falha) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(img.src);
        ok(cv.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = falha;
      img.src = URL.createObjectURL(file);
    });
  }

  function bindUploads() {
    app.querySelectorAll('input[data-up]').forEach((inp) => {
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const lbl = inp.parentElement; const txt = lbl.firstChild.textContent;
        lbl.firstChild.textContent = '⏳ Enviando…'; lbl.style.pointerEvents = 'none';
        try {
          const imagem = await reduzir(f);
          const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t, tipo: inp.dataset.up, imagem }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.erro || 'falha');
          D.cameraFoto = j.cameraFoto; D.ensaioFotos = j.ensaioFotos;
          toast('Foto recebida! 📸✨');
          painel();
        } catch {
          toast('Não consegui enviar a foto. Tente de novo 🙏');
          lbl.firstChild.textContent = txt; lbl.style.pointerEvents = '';
        }
      };
    });
  }

  boot();
})();
