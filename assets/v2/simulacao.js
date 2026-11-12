/* Ligação do Papai Noel — simulação interativa dentro do funil (motor do /piloto-whats).
   - Nome na base → a ligação daquele nome. Senão → o Papai Noel conversa com os pais (Sim/Não) e simula com outro nome.
   - Vai até o "…especial e iluminada": o Papai Noel fica na espera (loop) e aparece "Uau, que incrível!".
   - Microfone só abre nos momentos de ouvir. "Não posso falar agora" → as respostas viram botões.
   Uso (app.js): SimNoel.escolher(nome, artigo) · SimNoel.montar(screen, incall) · SimNoel.prepararVideo(v)
                 SimNoel.permissoes() · SimNoel.pronto · SimNoel.iniciar(v, { aoUau, aoFim, track }) · SimNoel.parar() */
(() => {
  const $ = (id) => document.getElementById(id);
  const V = 'f2';                                   // versão dos arquivos (cache)
  const ESPERA_MAX = 9000, ESPERA_BOTAO = 25000, SILENCIO_FIM = 700, FALA_MIN = 180, MARGEM_DB = 11;
  const PASSO = 0.24, SEG = 0.44, N = 13;           // pontos de saída do loop e duração do morph

  // respostas sugeridas (modo "não posso falar agora")
  const SUGESTOES = {
    'Você tá me ouvindo?': ['🙋 Tô ouvindo!'],
    'Responde bem alto!': ['📣 Oi, Papai Noel!'],
    'Já achou o presente?': ['🎁 Já achei!', '🙈 Ainda não'],
    'Mostra pra câmera!': ['📦 Olha ele aqui!'],
  };

  // ---------- registro (diagnóstico) ----------
  const SESSAO = 'f-' + Math.random().toString(36).slice(2, 10), T0 = performance.now(), REG = [];
  const L = (m) => { REG.push([Math.round(performance.now() - T0), String(m).slice(0, 160)]); };
  const enviarReg = () => { if (!REG.length) return; const corpo = JSON.stringify({ sessao: SESSAO, eventos: REG.splice(0) });
    try { navigator.sendBeacon('/api/piloto-log', new Blob([corpo], { type: 'application/json' })); } catch {} };
  setInterval(enviarReg, 5000); addEventListener('pagehide', enviarReg);
  // ---------- gravação da chamada (só eventos, sem câmera/microfone) → reprodução no painel ----------
  const GRAV = { id: null, t0: 0, ev: [], info: {}, envio: 0 };
  const E = (tipo, dados) => { if (!GRAV.id) return; GRAV.ev.push([Math.round(performance.now() - GRAV.t0), v ? +v.currentTime.toFixed(2) : 0, tipo, dados || null]); };
  const enviarGrav = () => {
    if (!GRAV.id || !GRAV.ev.length) return;
    const corpo = JSON.stringify({ id: GRAV.id, ...GRAV.info, arquivo: roteiro && roteiro.arquivo, modo, eventos: GRAV.ev });
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/chamada-log', new Blob([corpo], { type: 'application/json' }))) return; } catch {}
    fetch('/api/chamada-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true }).catch(() => {});
  };
  setInterval(() => { if (GRAV.id && GRAV.ev.length !== GRAV.envio) { GRAV.envio = GRAV.ev.length; enviarGrav(); } }, 5000);
  addEventListener('pagehide', enviarGrav);
  document.addEventListener('visibilitychange', () => { if (GRAV.id && estado !== 'fim') { E(document.visibilityState === 'hidden' ? 'saiu_da_tela' : 'voltou'); if (document.visibilityState === 'hidden') enviarGrav(); } });
  const modoAuto = () => { try { if (navigator.audioSession && navigator.audioSession.type !== 'auto') navigator.audioSession.type = 'auto'; } catch {} };

  // ---------- nome: busca pelo som (Apolo = Apollo, Marcus = Marcos…) ----------
  const norm = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function som(nome) {
    let x = String(nome || '').toLowerCase().trim().split(/\s+/)[0].replace(/ç/g, 's').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
    x = x.replace(/ph/g, 'f').replace(/th/g, 't').replace(/w/g, 'v').replace(/y/g, 'i').replace(/k/g, 'c')
      .replace(/lh/g, 'li').replace(/nh/g, 'ni').replace(/(ch|sh)/g, 'x').replace(/qu(?=[ei])/g, 'k').replace(/qu/g, 'cu')
      .replace(/gu(?=[ei])/g, 'g').replace(/g(?=[ei])/g, 'j').replace(/c(?=[ei])/g, 's').replace(/c/g, 'k')
      .replace(/^h/, '').replace(/h/g, '').replace(/([aeiou])z([aeiou])/g, '$1s$2').replace(/z$/, 's').replace(/ss/g, 's')
      .replace(/(.)\1+/g, '$1').replace(/us$/, 'os').replace(/u$/, 'o').replace(/e$/, 'i');
    return x;
  }

  // ---------- estado ----------
  let v = null, cb = {}, roteiro = null, modo = 'direto', estado = 'parado', espera = null, esperas = [];
  let idx = 0, fimEm = Infinity, p0 = 0, ultQuadro = 0, somEm = null, semFala = false;
  let ac = null, an = null, buf = null, mic = null, micFonte = null, captador = null, micAbrindo = null;
  let piso = -60, falaMs = 0, silMs = 0, falou = false, amostras = [], gravando = false, enviando = false;
  let urlVideo = null, progresso = 0, aoProgresso = null;
  let prontoOk; const pronto = new Promise((r) => { prontoOk = r; });

  // ---------- 1) escolhe a ligação e baixa tudo ----------
  async function baixar(url, conta) {
    const r = await fetch(url); if (!r.ok) throw new Error(r.status);
    const tot = +r.headers.get('content-length') || 0; const rd = r.body.getReader(); const partes = []; let n = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; partes.push(value); n += value.length;
      if (conta && tot) { progresso = n / tot; if (aoProgresso) aoProgresso(progresso); } }
    return URL.createObjectURL(new Blob(partes, { type: 'video/mp4' }));
  }
  let escolhido = false;
  async function escolher(nome, artigo) {
    if (escolhido) return pronto; escolhido = true;
    try {
      const [base, sim] = await Promise.all([fetch(`/assets/piloto/base/curta/base.json?v=${V}`).then((r) => r.json()), fetch(`/assets/piloto/simulacao/curta/simulacao.json?v=${V}`).then((r) => r.json())]);
      const s = nome ? som(nome) : '', igual = nome && artigo !== 'as' && base.find((b) => norm(b.nome) === norm(nome) || som(b.nome) === s);
      if (igual) { modo = 'direto'; roteiro = { arquivo: igual.curta, pausas: igual.pausasCurta, ilum: igual.fimIlum }; }
      else {
        const art = artigo === 'a' ? 'a' : 'o';
        const lista = [base.filter((b) => b.artigo === art && s && som(b.nome)[0] === s[0]), base.filter((b) => b.artigo === art), base].find((l) => l.length);
        const b = lista[Math.floor(Math.random() * lista.length)], m = sim[norm(b.nome)];
        modo = 'pre'; roteiro = { arquivo: m.arquivo, pausas: m.pausas, seg: m.seg, ilum: m.fimIlum };
      }
      L(`nome "${nome || '(várias)'}" → ${modo} ${roteiro.arquivo}`);
      const ks = new Set(roteiro.pausas.map((p) => p.loop).filter(Boolean)); ks.add(roteiro.ilum.loop);
      const camadas = [...ks].flatMap((k) => [[`espera-${k}`, `/assets/piloto/espera-${k}.mp4?v=5`], [`morph-${k}`, `/assets/piloto/morph-${k}.mp4?v=5`]]);
      camadas.push(['sim-ilum', roteiro.ilum.morph + `?v=${V}`]);
      if (modo === 'pre') camadas.push(['espera-p1', '/assets/piloto/whats/espera-p1.mp4?v=5'], ['espera-p3', '/assets/piloto/whats/espera-p3.mp4?v=5'],
        ['morph-p1-c2', '/assets/piloto/whats/morph-p1-c2.mp4?v=5'], ['morph-p1-c3', '/assets/piloto/whats/morph-p1-c3.mp4?v=5'],
        ['morph-p3-c2', '/assets/piloto/whats/morph-p3-c2.mp4?v=5'], ['morph-p3-c4', '/assets/piloto/whats/morph-p3-c4.mp4?v=5']);
      const [u, ...us] = await Promise.all([baixar(roteiro.arquivo + `?v=${V}`, true).catch(() => roteiro.arquivo + `?v=${V}`), ...camadas.map(([, url]) => baixar(url).catch(() => url))]);
      urlVideo = u; camadas.forEach(([id], i) => { camadaUrl[id] = us[i]; });
      if (montado) aplicarCamadas();
    } catch (e) { L('erro ao preparar: ' + e.message); }
    prontoOk(); return pronto;
  }
  const camadaUrl = {};

  // ---------- 2) camadas na tela do funil ----------
  let montado = false, el = {};
  function montar(screen, incall) {
    if (montado) return; montado = true;
    const st = document.createElement('style');
    st.textContent = `.sim-cam{position:absolute;inset:0;pointer-events:none}
.sim-cam video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0}
.sim-cam .espera{transition:opacity .45s ease}.sim-cam video.on{opacity:1}
#simOuv{position:absolute;left:50%;bottom:calc(var(--simBase,120px) + 50px);transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:9px 16px 9px 10px;border-radius:999px;background:rgba(11,20,26,.62);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-size:14px;font-weight:600;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap;z-index:6}
#simOuv.on{opacity:1}
#simOuv .mic{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.16);display:grid;place-items:center;position:relative;font-size:15px}
#simOuv .mic::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid #25d366;transform:scale(var(--n,1));opacity:var(--o,0);transition:transform .08s,opacity .08s}
#simOuv.falando .mic{background:#25d366}
#simPerg{position:absolute;left:20px;right:20px;bottom:calc(var(--simBase,120px) + 116px);text-align:center;pointer-events:none;opacity:0;transform:translateY(10px);transition:opacity .3s,transform .3s;z-index:6}
#simPerg.on{opacity:1;transform:none}
#simPerg b{display:inline-block;padding:12px 22px;border-radius:999px;background:linear-gradient(180deg,#fff2b0 0%,#ffcf3f 45%,#f0a800 100%);color:#7a0a14;font-size:19px;font-weight:800;box-shadow:0 6px 0 #9a6a00,0 12px 22px rgba(0,0,0,.45)}
#simPerg small{display:block;margin-top:12px;font-size:13px;opacity:.9;text-shadow:0 1px 4px rgba(0,0,0,.7)}
#simResp{position:absolute;left:16px;right:16px;bottom:calc(var(--simBase,120px) + 50px);display:flex;gap:10px;justify-content:center;flex-wrap:wrap;z-index:7;opacity:0;transform:translateY(12px);transition:opacity .25s,transform .25s;pointer-events:none}
#simResp.on{opacity:1;transform:none;pointer-events:auto}
#simResp button{flex:0 1 auto;min-width:130px;padding:14px 18px;border:0;border-radius:999px;background:#fff;color:#7a0a14;font:800 16px Poppins,sans-serif;box-shadow:0 5px 0 #c9b8b8,0 10px 20px rgba(0,0,0,.35)}
#simResp button:active{transform:translateY(3px);box-shadow:0 2px 0 #c9b8b8}
#simCalar{position:absolute;left:50%;transform:translateX(-50%);bottom:var(--simBase,120px);white-space:nowrap;transition:opacity .25s;display:flex;align-items:center;gap:8px;padding:8px 13px 8px 9px;border:1.5px solid rgba(255,255,255,.35);border-radius:999px;background:rgba(11,20,26,.55);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;font:600 13px Poppins,sans-serif;z-index:8}
#simCalar i{width:18px;height:18px;border-radius:6px;border:2px solid rgba(255,255,255,.8);display:grid;place-items:center;font-style:normal;font-size:12px;line-height:1}
#simCalar.on{background:rgba(255,207,63,.95);border-color:#ffcf3f;color:#5a0710}#simCalar.on i{border-color:#5a0710;background:#5a0710;color:#ffcf3f}
#simCalar.esconde{opacity:0;pointer-events:none}
#simUau{position:absolute;left:50%;bottom:var(--simBase,120px);transform:translateX(-50%);white-space:nowrap;z-index:9}`;
    document.head.appendChild(st);
    const cam = document.createElement('div'); cam.className = 'sim-cam'; cam.id = 'simCamadas';
    const v0 = screen.querySelector('#v'); v0.insertAdjacentElement('afterend', cam);
    const ids = ['espera-p1', 'espera-p3', 'espera-3', 'espera-4', 'espera-5', 'espera-6', 'espera-7', 'sim-ilum', 'morph-p1-c2', 'morph-p1-c3', 'morph-p3-c2', 'morph-p3-c4', 'morph-3', 'morph-4', 'morph-5', 'morph-6', 'morph-7'];
    ids.forEach((id) => { const m = document.createElement('video'); m.id = id; m.className = /^espera/.test(id) ? 'espera' : 'morph'; m.muted = true; m.playsInline = true; m.setAttribute('playsinline', ''); m.preload = 'auto'; if (/^espera/.test(id)) m.loop = true; cam.appendChild(m); });
    incall.insertAdjacentHTML('beforeend', `<div id="simPerg"><b>Responda: Sim ou Não</b><small>fale em voz alta 🎙️</small></div>
      <div id="simOuv"><div class="mic">🎙️</div><span id="simOuvTxt">Papai Noel está ouvindo…</span></div>
      <div id="simResp"></div>
      <button id="simCalar" type="button" aria-pressed="false"><i></i>Não posso falar agora</button>`);
    el = { perg: $('simPerg'), ouv: $('simOuv'), ouvTxt: $('simOuvTxt'), resp: $('simResp'), calar: $('simCalar'), incall };
    el.calar.onclick = () => calar(!semFala, true);
    if (urlVideo) aplicarCamadas();
  }
  function aplicarCamadas() { Object.entries(camadaUrl).forEach(([id, u]) => { const m = $(id); if (m && m.src !== u) { m.src = u; m.load(); } }); }
  function prepararVideo(vid) { v = vid; if (urlVideo && v.src !== urlVideo) { v.removeAttribute('poster'); v.src = urlVideo; v.load(); } }

  // "Não posso falar agora": as respostas viram botões
  function calar(on, peloBotao) {
    semFala = on; el.calar.classList.toggle('on', on); el.calar.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.calar.querySelector('i').textContent = on ? '✓' : '';
    if (peloBotao && cb.track) cb.track('NaoPossoFalar', { on });
    if (peloBotao) E('nao_posso_falar', { on });
    L(`não posso falar: ${on}`);
    if (estado === 'ouvindo' || estado === 'pergunta') {             // trocou no meio de uma espera
      if (on) { micFechar(); el.ouv.classList.remove('on', 'falando'); mostrarBotoes(); }
      else { esconderBotoes(); el.ouv.classList.add('on'); zerarOuvido(); micAbrir().then(() => { amostras = []; gravando = estado === 'pergunta'; }); }
      if (estado === 'pergunta') el.perg.classList.toggle('on', on);
    }
  }

  // ---------- 3) permissões (num toque) ----------
  async function permissoes() {
    modoAuto();
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); an = ac.createAnalyser(); an.fftSize = 1024; buf = new Float32Array(an.fftSize); } catch {}
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !ac) { calar(true); return false; }
    try {
      let so;
      try { so = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e1) {
        if (e1.name !== 'InvalidStateError') throw e1;
        try { navigator.audioSession.type = 'play-and-record'; } catch {}
        so = await navigator.mediaDevices.getUserMedia({ audio: true });
        try { navigator.audioSession.type = 'auto'; } catch {}
      }
      so.getTracks().forEach((t) => t.stop()); L('microfone liberado'); return true;
    } catch (e) { L(`sem microfone: ${e.name}`); if (montado) calar(true); else semFala = true; if (cb.track) cb.track('MicNegado', { erro: e.name }); return false; }
  }

  // ---------- 4) atender (dentro do toque) ----------
  function iniciar(vid, callbacks) {
    v = vid; cb = callbacks || {};
    modoAuto();                                      // o funil põe o som em "playback" ao atender: assim o iPhone recusa o microfone
    try { ac && ac.resume(); } catch {}
    calar(semFala); el.incall.classList.add('sim-ativa'); el.calar.classList.remove('esconde');
    const bless = (m) => { try { const p = m.play(); m.pause(); if (p) p.catch(() => {}); } catch {} };
    document.querySelectorAll('.sim-cam video').forEach((m) => { if (m.src) { m.muted = true; bless(m); } });
    if (urlVideo && v.src !== urlVideo) v.src = urlVideo;
    v.loop = false; v.muted = false; v.onended = null;
    requestAnimationFrame(posicionar); addEventListener('resize', posicionar);
    esperas = modo === 'pre' ? [{ id: 'q1', para: roteiro.seg.q1 - 0.02, loop: 'p1' }, { id: 'q2', para: roteiro.seg.q2 - 0.02, loop: 'p3' }] : [];
    fimEm = modo === 'pre' ? roteiro.seg.c3[0] : Infinity;
    idx = 0; v.currentTime = 0; estado = 'tocando'; ilumFeito = false;
    GRAV.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; GRAV.t0 = performance.now(); GRAV.ev = [];
    GRAV.info = { sessao: cb.sessao || null, lig: cb.lig || null, nome: cb.nome || null, artigo: cb.artigo || null, origem: cb.origem || null };
    E('inicio', { modo, botoes: semFala });
    ['waiting', 'stalled'].forEach((x) => v.addEventListener(x, () => { if (estado === 'tocando') E('carregando'); }));
    const p = v.play(); L(`atendeu (${modo}, ${semFala ? 'botões' : 'voz'})`);
    requestAnimationFrame(passo);
    return p;
  }

  // ---------- laço ----------
  let ilumFeito = false;
  function passo(ts) {
    if (estado === 'fim' || estado === 'uau') return;
    const dt = ultQuadro ? ts - ultQuadro : 16; ultQuadro = ts;
    const t = v.currentTime, db = nivel();
    if (estado === 'tocando') {
      conferirSom(t);
      const q = esperas.find((e) => !e.feito && t >= e.para && t < e.para + 0.5);
      if (q) { q.feito = true; perguntar(q); }
      const pa = roteiro.pausas[idx];
      if (pa && t >= pa.volta + 0.5) idx++;
      else if (pa && t >= pa.para - 0.03 && t < pa.volta) entrarEspera(pa);
      if (!ilumFeito && t >= roteiro.ilum.para - 0.02 && t < roteiro.ilum.para + 1 && (modo === 'direto' || t > roteiro.seg.glitch[0])) return uau();
      if (t >= fimEm - 0.04) return terminar();
    } else if (estado === 'ouvindo') {
      const passou = performance.now() - p0;
      if (semFala) { if (passou >= ESPERA_BOTAO) sairEspera('sem resposta'); }
      else {
        const limiar = ouvir(db, dt); el.ouv.classList.toggle('falando', db > limiar);
        if ((falou && silMs >= SILENCIO_FIM) || passou >= ESPERA_MAX) sairEspera(falou ? 'respondeu' : 'sem resposta');
      }
    } else if (estado === 'pergunta') {
      const passou = performance.now() - p0;
      if (semFala) { if (passou >= ESPERA_BOTAO) responder('sim', '(sem resposta)'); }
      else {
        const limiar = ouvir(db, dt); el.ouv.classList.toggle('falando', db > limiar);
        if (!enviando && falou && silMs >= 600) transcrever();
        else if (!enviando && !falou && passou >= 10000) responder('sim', '(sem resposta)');
      }
    }
    if (v.ended && estado === 'tocando') return terminar();
    requestAnimationFrame(passo);
  }

  // volta a tocar depois de ouvir (sem som até a fala recomeçar)
  function voltarATocar(falaEm) {
    somEm = falaEm != null && falaEm > v.currentTime + 0.05 ? falaEm : null;
    v.muted = somEm != null; estado = 'tocando'; v.play().catch(() => {}); E('retomou');
  }
  function conferirSom(t) {
    if (somEm != null && t >= somEm - 0.04) { somEm = null; v.muted = false; if (v.paused && estado === 'tocando') v.play().catch(() => {}); }
  }

  // ---------- botões de resposta ----------
  function posicionar() {
    const bar = document.getElementById('icBar'); if (!bar || !el.incall) return;
    const r = bar.getBoundingClientRect(), pr = el.incall.getBoundingClientRect();
    if (r.height) el.incall.style.setProperty('--simBase', Math.round(pr.bottom - r.top + 14) + 'px');
  }
  function mostrarBotoes() {
    posicionar();
    const ops = estado === 'pergunta' ? [['sim', '✅ Sim'], ['nao', '❌ Não']] : (SUGESTOES[espera && espera.p] || ['👍 Pronto!']).map((t) => ['ok', t]);
    el.resp.innerHTML = ops.map(([k, t]) => `<button type="button" data-r="${k}">${t}</button>`).join('');
    el.resp.querySelectorAll('button').forEach((b) => { b.onclick = () => {
      const r = b.dataset.r; esconderBotoes(); if (cb.track) cb.track('RespostaBotao', { p: espera && (espera.p || espera.id), r: b.textContent });
      if (estado === 'pergunta') responder(r, b.textContent); else if (estado === 'ouvindo') sairEspera('botão: ' + b.textContent);
    }; });
    el.resp.classList.add('on');
  }
  function esconderBotoes() { el.resp.classList.remove('on'); }

  // ---------- esperas da ligação ----------
  function entrarEspera(pa) {
    v.pause(); estado = 'ouvindo'; espera = pa; zerarOuvido(); L(`pausa: ${pa.p} em ${v.currentTime.toFixed(2)}`); E('pausa', { p: pa.p, botoes: semFala });
    mostrarLoop(pa.loop); posicionar();
    if (semFala) mostrarBotoes();
    else { micAbrir(); el.ouvTxt.textContent = 'Papai Noel está ouvindo…'; el.ouv.classList.add('on'); }
  }
  function sairEspera(como) {
    if (estado !== 'ouvindo') return;
    L(`resposta (${como}): ${espera.p}`);
    E('resposta', { p: espera.p, como: /^botão/.test(como) ? 'botao' : como === 'respondeu' ? 'voz' : 'sem', botao: /^botão: /.test(como) ? como.slice(7) : null,
      falaMs: Math.round(falaMs), esperaMs: Math.round(performance.now() - p0), tom: tomMediano() });
    el.ouv.classList.remove('on', 'falando'); esconderBotoes(); micFechar(); idx++; estado = 'saindo';
    const t0s = performance.now();
    sairDoLoop(espera.loop, espera.loop && `morph-${espera.loop}`).then(() => {
      const falta = Math.max(0, 350 - (performance.now() - t0s));
      const pa = roteiro.pausas[idx - 1]; setTimeout(() => voltarATocar(pa ? pa.volta - 0.05 : null), falta);
    });
  }

  // ---------- Sim / Não (conversa com os pais) ----------
  function perguntar(q) {
    v.pause(); estado = 'pergunta'; espera = q; zerarOuvido(); enviando = false; L(`pergunta ${q.id} em ${v.currentTime.toFixed(2)}`);
    E('pergunta', { q: q.id, botoes: semFala });
    mostrarLoop(q.loop); posicionar();
    el.perg.querySelector('small').textContent = 'toque na resposta 👇';
    el.perg.classList.toggle('on', semFala);           // "Responda: Sim ou Não" só quando não pode falar
    if (semFala) mostrarBotoes();
    else { el.ouvTxt.textContent = 'Papai Noel está ouvindo…'; el.ouv.classList.add('on'); micAbrir().then(() => { amostras = []; gravando = true; }); }
  }
  async function transcrever() {
    enviando = true; gravando = false; el.ouvTxt.textContent = 'Papai Noel está pensando…';
    let texto = '';
    try {
      const r = await fetch('/api/sim-nao?tipo=audio/wav', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: wav(amostras, ac.sampleRate), signal: AbortSignal.timeout(6000) });
      texto = (await r.json()).texto || '';
    } catch {}
    responder(classificar(texto) || 'sim', texto);
  }
  function classificar(t) {
    const x = ' ' + norm(t).replace(/[^a-z ]/g, ' ') + ' ';
    if (/ (nao|nem|nunca|negativo) /.test(x)) return 'nao';
    if (/ (sim|pode|claro|quero|bora|vamos|vamo|ok|okay|beleza|uhum|aham|ta|certo|isso|com certeza|pode ser) /.test(x)) return 'sim';
    return null;
  }
  function responder(r, ouvi) {
    if (estado !== 'pergunta') return;
    const q = espera; L(`${q.id}: ${r} (${ouvi})`); if (cb.track) cb.track('SimNao', { q: q.id, r });
    E('simnao', { q: q.id, r, ouvi: String(ouvi || '').slice(0, 120), esperaMs: Math.round(performance.now() - p0), tom: tomMediano() });
    el.perg.classList.remove('on'); el.ouv.classList.remove('on', 'falando'); esconderBotoes(); micFechar(); estado = 'saindo';
    const g = roteiro.seg;
    const ir = (morph, alvo) => sairDoLoop(q.loop, morph, () => {
      v.currentTime = alvo; idx = roteiro.pausas.findIndex((p) => p.fala > alvo); if (idx < 0) idx = roteiro.pausas.length;
    }).then(() => new Promise((ok) => setTimeout(ok, 150))).then(() => voltarATocar(null));
    // "sim" na 1ª e "não" na 2ª: o morph volta ao MESMO quadro da pausa e o vídeo segue dali, contínuo
    if (q.id === 'q1') { if (r === 'sim') return ir('morph-p1-c2', g.q1); fimEm = g.c4[1]; return ir('morph-p1-c3', g.c3[0] + 0.02); }
    if (r === 'sim') { esperas.find((e) => e.id === 'q2').feito = true; fimEm = g.c3[0]; return ir('morph-p3-c2', g.q1); }
    fimEm = g.c4[1]; return ir('morph-p3-c4', g.q2);
  }

  // ---------- "…especial e iluminada" → espera + Uau ----------
  function uau() {
    ilumFeito = true; estado = 'uau'; v.pause(); L(`iluminada em ${v.currentTime.toFixed(2)}`); E('uau'); enviarGrav();
    el.calar.classList.add('esconde'); esconderBotoes(); el.resp.classList.remove('on');
    const mv = $('sim-ilum'), k = roteiro.ilum.loop;
    const loopDepois = () => { mostrarLoop(k); setTimeout(() => mv.classList.remove('on'), 120); };
    if (mv && mv.src) { mv.classList.add('on'); trecho(mv, 0, 15 / 25 + 0.04).then(loopDepois); } else mostrarLoop(k);
    if (cb.aoUau) cb.aoUau();
  }

  // ---------- camadas ----------
  function mostrarLoop(k) {
    const es = k && $('espera-' + k); if (!es || !es.src) return;
    es.loop = true; es.currentTime = 0;
    es.play().then(() => { const mostra = () => es.classList.add('on'); es.requestVideoFrameCallback ? es.requestVideoFrameCallback(mostra) : mostra(); }).catch(() => {});
  }
  function sairDoLoop(k, morphId, antes) {
    return new Promise((ok) => {
      const es = k && $('espera-' + k), mv = morphId && $(morphId);
      const pronto = () => { if (antes) antes(); const fim = () => { if (es) { es.classList.remove('on'); es.pause(); } if (mv) mv.classList.remove('on'); ok(); };
        if (antes) v.addEventListener('seeked', () => requestAnimationFrame(fim), { once: true }); else fim(); };
      if (!es || !es.classList.contains('on') || !mv || !mv.src) return pronto();
      let j = Math.ceil((es.currentTime + 0.02) / PASSO); if (j >= N) j = 0;
      mv.currentTime = j * SEG + 0.001; mv.pause();
      let ant = es.currentTime;
      const vigiar = () => {
        const ct = es.currentTime, chegou = j === 0 ? ct < ant : ct >= j * PASSO - 0.01; ant = ct;
        if (!chegou) return requestAnimationFrame(vigiar);
        es.pause(); mv.classList.add('on'); es.classList.remove('on');
        trecho(mv, j * SEG, (j + 1) * SEG).then(pronto);
      };
      requestAnimationFrame(vigiar);
    });
  }
  function trecho(mv, ini, fim) {
    return new Promise((ok) => {
      let feito = false; const acabar = () => { if (feito) return; feito = true; mv.pause(); ok(); };
      const ult = fim - 1.2 / 25;
      if (mv.requestVideoFrameCallback) { const f = (_, meta) => { if (feito) return; if (meta.mediaTime >= ult) return acabar(); mv.requestVideoFrameCallback(f); }; mv.requestVideoFrameCallback(f); }
      const rodar = () => { if (feito) return; if (mv.currentTime >= ult || mv.ended) return acabar(); requestAnimationFrame(rodar); };
      mv.currentTime = ini + 0.001; mv.play().then(() => requestAnimationFrame(rodar)).catch(acabar);
      setTimeout(acabar, (fim - ini) * 1000 + 900);
    });
  }

  // ---------- microfone: só para ouvir ----------
  function micAbrir() {
    if (semFala || !ac) return Promise.resolve();
    if (mic) return Promise.resolve();
    if (micAbrindo) return micAbrindo;
    const pedir = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    modoAuto();
    micAbrindo = pedir()
      .catch((e1) => {
        L('microfone 1ª tentativa: ' + e1.name);
        if (e1.name !== 'InvalidStateError') throw e1;
        try { navigator.audioSession.type = 'play-and-record'; } catch {}
        return new Promise((ok) => setTimeout(ok, 120)).then(pedir).finally(() => { try { navigator.audioSession.type = 'auto'; } catch {} });
      })
      .then((m) => {
        if (semFala || estado === 'fim') { m.getTracks().forEach((t) => t.stop()); return; }
        mic = m; micFonte = ac.createMediaStreamSource(m); micFonte.connect(an);
        if (!captador) { captador = ac.createScriptProcessor(4096, 1, 1); captador.onaudioprocess = (e) => { if (gravando) amostras.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
          const nulo = ac.createGain(); nulo.gain.value = 0; captador.connect(nulo); nulo.connect(ac.destination); }
        micFonte.connect(captador);
      }).catch((e) => { L('microfone falhou: ' + e.name); calar(true); }).finally(() => { micAbrindo = null; });
    return micAbrindo;
  }
  function micFechar() {
    gravando = false;
    if (micAbrindo) { micAbrindo.then(micFechar); return; }
    if (micFonte) { try { micFonte.disconnect(); } catch {} micFonte = null; }
    if (mic) { mic.getTracks().forEach((t) => t.stop()); mic = null; }
  }
  function nivel() {
    if (!mic || !an) return -120;
    an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9);
  }
  let tons = [], tq = 0;
  function medirTom() {
    if (!mic || !an || ++tq % 3) return;                       // a cada 3 quadros
    const sr = ac.sampleRate, n = buf.length, min = Math.floor(sr / 520), max = Math.min(n - 1, Math.floor(sr / 70));
    let e0 = 0; for (let i = 0; i < n; i++) e0 += buf[i] * buf[i];
    if (e0 < 1e-4) return;
    let melhor = 0, lag = 0;
    for (let l = min; l <= max; l++) { let s2 = 0; for (let i = 0; i + l < n; i++) s2 += buf[i] * buf[i + l]; const r = s2 / e0; if (r > melhor) { melhor = r; lag = l; } }
    if (melhor > 0.55 && lag) tons.push(sr / lag);
  }
  const tomMediano = () => { if (tons.length < 4) return null; const o = tons.slice().sort((a, b) => a - b); return Math.round(o[o.length >> 1]); };
  function zerarOuvido() { p0 = performance.now(); falaMs = 0; silMs = 0; falou = false; tons = []; }
  function ouvir(db, dt) {
    const limiar = Math.max(piso + MARGEM_DB, -52), carencia = performance.now() - p0 < 200 || !mic;
    if (!carencia && db > limiar) { falaMs += dt; silMs = 0; if (falaMs >= FALA_MIN) falou = true; medirTom(); }
    else { silMs += dt; if (!falou && mic) { falaMs = Math.max(0, falaMs - dt); piso = piso * 0.97 + db * 0.03; } }
    const nv = Math.max(0, Math.min(1, (db - limiar + 12) / 24)), m = el.ouv && el.ouv.querySelector('.mic');
    if (m) { m.style.setProperty('--n', 1 + nv * 0.5); m.style.setProperty('--o', nv); }
    return limiar;
  }
  function wav(partes, de) {
    const total = partes.reduce((n, p) => n + p.length, 0), x = new Float32Array(total); let o = 0;
    partes.forEach((p) => { x.set(p, o); o += p.length; });
    const passo = de / 16000, n = Math.floor(total / passo), b = new DataView(new ArrayBuffer(44 + n * 2));
    const t = (i, s) => [...s].forEach((c, k) => b.setUint8(i + k, c.charCodeAt(0)));
    t(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); t(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, 16000, true); b.setUint32(28, 32000, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); t(36, 'data'); b.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, x[Math.floor(i * passo)])); b.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([b], { type: 'audio/wav' });
  }

  // ---------- fim ----------
  function terminar() {
    if (estado === 'fim') return; E('fim'); parar(); L('fim (despedida)'); if (cb.aoFim) cb.aoFim();
  }
  function parar() {
    if (estado === 'fim') return;
    if (estado !== 'uau') E('desligou', { estado });
    else E('uau_clique');
    enviarGrav();
    estado = 'fim';
    try { v && v.pause(); document.querySelectorAll('.sim-cam video').forEach((e) => { e.pause(); e.classList.remove('on'); }); } catch {}
    micFechar(); if (el.perg) { el.perg.classList.remove('on'); el.ouv.classList.remove('on'); esconderBotoes(); el.calar.classList.add('esconde'); }
    if (el.incall) el.incall.classList.remove('sim-ativa');
    setTimeout(enviarReg, 50);
  }

  window.SimNoel = {
    escolher, montar, prepararVideo, permissoes, iniciar, parar, pronto,
    get ok() { return !!(roteiro && urlVideo); },
    get escolhido() { return escolhido; }, get modo() { return modo; }, get estado() { return estado; },
    set aoProgresso(f) { aoProgresso = f; if (f && progresso) f(progresso); },
  };
})();
