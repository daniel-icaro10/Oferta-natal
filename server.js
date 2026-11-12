const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Determine writable data dir (on Vercel serverless, /tmp is writable)
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const dataDir = isVercel ? '/tmp' : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
}

const leadsFile = path.join(dataDir, 'leads.json');
const ordersFile = path.join(dataDir, 'orders.json');

// In-memory cache to guarantee fast access and persist across serverless warm requests
const memoryLeads = [];
const memoryOrders = {};

// Preload bundled initial orders/leads if available
try {
  const seedOrders = path.join(__dirname, 'data', 'orders.json');
  if (fs.existsSync(seedOrders)) {
    Object.assign(memoryOrders, JSON.parse(fs.readFileSync(seedOrders, 'utf8')));
  }
} catch {}

function readJson(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return fallback;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}

function getOrders() {
  const onDisk = readJson(ordersFile, {});
  return Object.assign({}, memoryOrders, onDisk);
}

function saveOrder(order) {
  memoryOrders[order.t] = order;
  if (order.id) memoryOrders[order.id] = order;
  const all = getOrders();
  all[order.t] = order;
  if (order.id) all[order.id] = order;
  writeJson(ordersFile, all);
}

function getLeads() {
  const onDisk = readJson(leadsFile, []);
  return [...memoryLeads, ...onDisk];
}

function saveLead(lead) {
  memoryLeads.push(lead);
  const all = getLeads();
  all.push(lead);
  writeJson(leadsFile, all);
}

// Helper to create a new default order
function createDefaultOrder(t, overrides = {}) {
  const token = t || 'tok_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
  return {
    id: 'ped_' + Date.now().toString(36),
    t: token,
    email: overrides.email || 'cliente@exemplo.com',
    telefone: overrides.telefone || '11999998888',
    primeiroNome: overrides.primeiroNome || 'Papai/Mamãe',
    pacote: overrides.pacote || 'nome', // 'padrao', 'nome', 'premium'
    extras: overrides.extras || ['gravacao'],
    configurado: overrides.configurado !== undefined ? overrides.configurado : false,
    liberado: true,
    videochamada: '/assets/v2/video/ligacao3.mp4',
    pedidoVideo: '/assets/v2/video/v3.mp4',
    cameraVideo: '/assets/area/exemplo-sala.mp4',
    cameraFoto: null,
    config: {
      para: overrides.para || 'filho',
      nome_crianca: overrides.nome_crianca || '',
      pronuncia: overrides.pronuncia || '',
      dia: overrides.dia || '2026-12-24',
      hora: overrides.hora || '20:00',
      modo_mensagem: overrides.modo_mensagem || 'escrever',
      mensagem_pai: overrides.mensagem_pai || '',
      ajuda: overrides.ajuda || {}
    },
    createdAt: new Date().toISOString()
  };
}

// Serve config.js
app.get('/config.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'config.js'));
});

// Serve static assets if requested through Express
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Static pages routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/chamada', (req, res) => res.sendFile(path.join(__dirname, 'chamada.html')));
app.get('/piloto-whats', (req, res) => res.sendFile(path.join(__dirname, 'piloto-whats.html')));
app.get('/obrigado', (req, res) => res.sendFile(path.join(__dirname, 'obrigado.html')));
app.get('/area', (req, res) => res.sendFile(path.join(__dirname, 'area.html')));

// ==========================================
// PAINEL DE ADMINISTRAÇÃO (/admin)
// ==========================================
app.get('/admin', (req, res) => {
  const leads = getLeads();
  const orders = getOrders();
  const orderList = Object.values(orders).filter((o, idx, arr) => arr.findIndex(x => x.t === o.t) === idx);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Painel do Papai Noel 🎅 | Gestão de Pedidos e Entregáveis</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --red: #c8102e; --green: #1f9d55; --bg: #f8f9fa; --card: #fff; --text: #212529; }
    body { font-family: 'Poppins', sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 24px; }
    .container { max-width: 1100px; margin: 0 auto; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e9ecef; }
    h1 { margin: 0; font-size: 26px; color: var(--red); display: flex; align-items: center; gap: 8px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: var(--card); border-radius: 12px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .stat-card span { font-size: 13px; color: #6c757d; font-weight: 500; }
    .stat-card b { display: block; font-size: 28px; margin-top: 6px; }
    .actions { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
    .btn { padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .btn-red { background: var(--red); color: #fff; }
    .btn-green { background: var(--green); color: #fff; }
    .btn-outline { background: #fff; color: var(--text); border: 1px solid #ced4da; }
    .card { background: var(--card); border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-bottom: 24px; }
    h2 { font-size: 18px; margin: 0 0 16px; border-bottom: 1px solid #e9ecef; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #dee2e6; }
    th { background: #f8f9fa; color: #495057; font-weight: 600; }
    .badge { padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .badge-ok { background: #d4edda; color: #155724; }
    .badge-pend { background: #fff3cd; color: #856404; }
    .badge-plan { background: #cce5ff; color: #004085; }
    .token-link { color: var(--red); font-weight: 600; text-decoration: none; }
    .token-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎅 Painel do Papai Noel · Gestão</h1>
      <div style="font-size:14px;color:#6c757d">Status: Online</div>
    </header>

    <div class="stats">
      <div class="stat-card">
        <span>Leads Capturados</span>
        <b>${leads.length}</b>
      </div>
      <div class="stat-card">
        <span>Pedidos Cadastrados</span>
        <b>${orderList.length}</b>
      </div>
      <div class="stat-card">
        <span>Chamadas Agendadas</span>
        <b>${orderList.filter(o => o.configurado).length}</b>
      </div>
    </div>

    <div class="actions">
      <form action="/api/admin/criar-pedido-teste" method="POST" style="display:inline">
        <button class="btn btn-red" type="submit">➕ Criar Novo Pedido de Teste (Com Nome)</button>
      </form>
      <a class="btn btn-green" href="/area" target="_blank">✨ Abrir Área Mágica</a>
      <a class="btn btn-outline" href="/" target="_blank">🌐 Ver Funil Principal</a>
    </div>

    <div class="card">
      <h2>🎁 Pedidos & Agendamentos dos Clientes</h2>
      ${orderList.length === 0 ? '<p style="color:#6c757d">Nenhum pedido ainda. Clique no botão acima para criar um pedido de teste.</p>' : `
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Criança / Para</th>
              <th>Plano</th>
              <th>Data/Hora Agendada</th>
              <th>Status</th>
              <th>Ações do Entregável</th>
            </tr>
          </thead>
          <tbody>
            ${orderList.map(o => `
            <tr>
              <td><code>${o.id || o.t.slice(0, 10)}</code></td>
              <td><b>${o.config.nome_crianca || '(Ainda não preencheu)'}</b><br><small style="color:#6c757d">${o.config.para || 'filho'}</small></td>
              <td><span class="badge badge-plan">${o.pacote}</span></td>
              <td>${o.config.dia ? o.config.dia + ' às ' + o.config.hora : 'A definir'}</td>
              <td>${o.configurado ? '<span class="badge badge-ok">Configurado</span>' : '<span class="badge badge-pend">Pendente Wizard</span>'}</td>
              <td>
                <a class="token-link" href="/area?t=${encodeURIComponent(o.t)}" target="_blank">Abrir Área Mágica ↗</a> | 
                <a class="token-link" href="/chamada?t=${encodeURIComponent(o.t)}" target="_blank" style="color:var(--green)">Testar Chamada 📞</a> |
                <a class="token-link" href="/certificado?t=${encodeURIComponent(o.t)}" target="_blank" style="color:#6f42c1">Certificado 📜</a>
              </td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <div class="card">
      <h2>📋 Leads Pré-Checkout Capturados</h2>
      ${leads.length === 0 ? '<p style="color:#6c757d">Nenhum lead capturado ainda. Acesse o funil principal e inicie a simulação para ver os leads aqui.</p>' : `
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Nome Informado</th>
              <th>WhatsApp</th>
              <th>Plano Escolhido</th>
              <th>Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            ${leads.slice(-15).reverse().map(l => `
            <tr>
              <td><b>${l.nome || '-'}</b></td>
              <td><a href="https://wa.me/${(l.tel || '').replace(/\\D/g, '')}" target="_blank">${l.tel || '-'}</a></td>
              <td>${l.plano || '-'}</td>
              <td><small>${new Date(l.timestamp).toLocaleString('pt-BR')}</small></td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
  </div>
</body>
</html>`;
  res.send(html);
});

// Ação de criar pedido de teste no Admin
app.post('/api/admin/criar-pedido-teste', (req, res) => {
  const order = createDefaultOrder(null, {
    primeiroNome: 'André',
    nome_crianca: 'Lucas',
    pacote: 'nome',
    configurado: false
  });
  saveOrder(order);
  console.log(`[TEST ORDER CREATED]: Token ${order.t}`);
  res.redirect(`/area?t=${encodeURIComponent(order.t)}`);
});

// ==========================================
// CERTIFICADO DE BOM COMPORTAMENTO (/certificado)
// ==========================================
app.get('/certificado', (req, res) => {
  const { t } = req.query;
  const orders = getOrders();
  const order = orders[t] || Object.values(orders)[0] || { config: { nome_crianca: 'Anjinho de Natal' } };
  const nome = order.config?.nome_crianca || 'Anjinho de Natal';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Certificado Oficial do Polo Norte 🎅 | ${nome}</title>
  <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Mountains+of+Christmas:wght@700&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; background: #2c0909; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: 'Poppins', sans-serif; color: #fff; padding: 20px; box-sizing: border-box; }
    .cert { position: relative; width: 100%; max-width: 800px; aspect-ratio: 1.414; background: #fffdf5 url('/assets/v2/img/certificado-bg.jpg') center/cover no-repeat; border: 12px solid #b80d22; box-shadow: 0 15px 40px rgba(0,0,0,0.6); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #3a1a12; padding: 30px; box-sizing: border-box; }
    .cert-sub { font-family: 'Poppins', sans-serif; font-size: 16px; text-transform: uppercase; letter-spacing: 3px; color: #b80d22; font-weight: 700; margin: 0 0 6px; }
    h1 { font-family: 'Mountains of Christmas', cursive; font-size: 46px; margin: 0 0 16px; color: #1f9d55; text-shadow: 1px 1px 0 rgba(0,0,0,0.1); }
    .msg { font-size: 16px; max-width: 600px; line-height: 1.6; margin: 0 0 20px; color: #5a3a30; }
    .kid-name { font-family: 'Dancing Script', cursive; font-size: 52px; color: #b80d22; margin: 6px 0; border-bottom: 2px dashed #b80d22; padding: 0 20px; display: inline-block; }
    .seal { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; max-width: 620px; margin-top: 20px; }
    .sig { font-family: 'Dancing Script', cursive; font-size: 26px; border-top: 1px solid #8a6a60; padding-top: 4px; color: #3a1a12; }
    .badge-gold { background: #ffd54a; color: #7d0716; padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: 14px; border: 2px solid #b80d22; }
    .btn-print { margin-top: 24px; background: #1f9d55; color: #fff; border: none; padding: 12px 28px; border-radius: 999px; font-weight: 700; font-size: 16px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,0.3); transition: transform 0.2s; }
    .btn-print:hover { transform: scale(1.05); }
    @media print {
      body { background: transparent; padding: 0; }
      .btn-print { display: none; }
      .cert { border: 8px solid #b80d22; box-shadow: none; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="cert" id="cert">
    <div class="cert-sub">Tribunal Mágico do Polo Norte</div>
    <h1>Certificado de Bom Comportamento</h1>
    <div class="msg">Este certificado oficial confirma que o bom velhinho revisou a lista das crianças bem-comportadas e teve a honra de incluir com muito orgulho:</div>
    <div class="kid-name">${nome}</div>
    <div class="msg">Por demonstrar bondade, alegria, ajudar a família e espalhar sorrisos ao longo de todo o ano de 2026.</div>
    <div class="seal">
      <div>
        <div class="sig">Papai Noel 🎅</div>
        <small style="color:#8a6a60">Polo Norte</small>
      </div>
      <div class="badge-gold">⭐ APROVADO ⭐</div>
      <div>
        <div class="sig">Duende Chefe 🧝</div>
        <small style="color:#8a6a60">Fábrica de Brinquedos</small>
      </div>
    </div>
  </div>
  <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar em PDF</button>
</body>
</html>`;
  res.send(html);
});

// ==========================================
// WEBHOOK DE PAGAMENTO (/api/webhook)
// ==========================================
app.post('/api/webhook', (req, res) => {
  const payload = req.body || {};
  console.log('[WEBHOOK RECEBIDO]:', JSON.stringify(payload).slice(0, 300));

  const email = payload.Customer?.email || payload.email || payload.data?.customer?.email || 'cliente@exemplo.com';
  const nome = payload.Customer?.full_name || payload.name || payload.data?.customer?.name || 'Cliente Especial';
  const telefone = payload.Customer?.mobile || payload.phone || payload.data?.customer?.phone || '11999998888';
  const pacote = (payload.Product?.product_name || payload.product_name || '').toLowerCase().includes('nome') ? 'nome' : 'padrao';

  const order = createDefaultOrder(null, {
    email,
    telefone,
    primeiroNome: nome.split(' ')[0],
    pacote,
    configurado: false
  });
  saveOrder(order);

  console.log(`[VENDA CONFIRMADA]: Cliente ${nome} (${email}) liberado com token: ${order.t}`);
  
  res.json({
    ok: true,
    t: order.t,
    magicLink: `/area?t=${order.t}`
  });
});

// ==========================================
// API DO FUNIL E DA ÁREA MÁGICA
// ==========================================

// 1. Lead capture
app.post('/api/lead', (req, res) => {
  const { nome, tel, plano, ref } = req.body || {};
  console.log('[LEAD RECEBIDO]:', { nome, tel, plano, ref });
  saveLead({ nome, tel, plano, ref, timestamp: new Date().toISOString() });
  res.json({ ok: true });
});

// 2. Tracking events
app.post('/api/track', (req, res) => res.json({ ok: true }));

// 3. Audio synthesis for child's name
app.post('/api/fala-nome', (req, res) => {
  const { nome, artigo } = req.body || {};
  console.log(`[FALA-NOME]: Gerando áudio para ${artigo || 'o'} ${nome}...`);

  const postData = JSON.stringify({ nome, artigo });
  const options = {
    hostname: 'ligacao-papai-noel.vercel.app',
    port: 443,
    path: '/api/fala-nome',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Mozilla/5.0'
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    let body = '';
    proxyRes.on('data', chunk => body += chunk);
    proxyRes.on('end', () => {
      try {
        const json = JSON.parse(body);
        res.status(proxyRes.statusCode).json(json);
      } catch {
        res.status(500).json({ erro: 'Falha ao sintetizar nome' });
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error('Fala-nome error:', err.message);
    res.status(500).json({ erro: err.message });
  });

  proxyReq.write(postData);
  proxyReq.end();
});

// 4. Checkout / Pix generation
app.post('/api/checkout', (req, res) => {
  const corpo = req.body || {};
  const id = 'pix_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  console.log('[CHECKOUT PIX GERADO]:', id);

  const order = createDefaultOrder(null, {
    pacote: corpo.plano || 'nome',
    primeiroNome: corpo.nome || 'Papai/Mamãe'
  });
  saveOrder(order);
  saveOrder({ id, t: order.t, status: 'pendente', createdAt: Date.now() });

  res.json({
    id,
    chave: id,
    pixCopiaECola: "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426614174000520400005303986540547.905802BR5913PAPAI NOEL6008SAO PAULO62070503***6304ABCD",
    qrcodeBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    expiraEm: 900
  });
});

// 5. Checkout polling (Pix auto-approval for demo after 8 seconds)
app.get('/api/checkout', (req, res) => {
  const { id } = req.query;
  const orders = getOrders();
  const order = orders[id];

  if (!order) return res.status(404).json({ erro: 'Não encontrado' });

  const elapsed = (Date.now() - (order.createdAt || 0)) / 1000;
  const pago = elapsed > 8;

  if (pago && order.status !== 'pago') {
    order.status = 'pago';
    saveOrder(order);
  }

  res.json({ id, pago, t: order.t });
});

// 6. Access recovery for Thank You page (/obrigado)
app.post('/api/acesso', (req, res) => {
  const { chave, email, tel4 } = req.body || {};
  const orders = getOrders();

  let matched = null;
  if (chave && orders[chave]) matched = orders[chave];
  else {
    matched = Object.values(orders).find(o => 
      (email && o.email?.toLowerCase() === email.toLowerCase()) ||
      (tel4 && o.telefone?.endsWith(tel4))
    );
  }

  if (!matched) {
    matched = createDefaultOrder(null, { email: email || 'cliente@exemplo.com' });
    saveOrder(matched);
  }

  res.json({
    t: matched.t,
    compra: {
      id: matched.id || 'compra_' + Date.now(),
      valor: 47.90,
      itens: [matched.pacote || 'nome']
    }
  });
});

// 7. Member Area: GET order details
app.get('/api/pedido', (req, res) => {
  const { t } = req.query;
  const orders = getOrders();

  let order = orders[t];
  if (!order) {
    order = createDefaultOrder(t);
    saveOrder(order);
  }

  res.json(order);
});

// 8. Member Area: POST save order draft or finalize wizard
app.post('/api/pedido', (req, res) => {
  const { t, config, finalizar } = req.body || {};
  const orders = getOrders();

  let order = orders[t] || createDefaultOrder(t);
  
  if (config) {
    order.config = { ...order.config, ...config };
  }

  if (finalizar) {
    order.configurado = true;
    order.liberado = true;
    order.videochamada = '/assets/v2/video/ligacao3.mp4';
    order.pedidoVideo = '/assets/v2/video/v3.mp4';
    console.log(`[PEDIDO FINALIZADO]: Criança "${order.config.nome_crianca}" agendada para ${order.config.dia} às ${order.config.hora}!`);
  }

  saveOrder(order);
  res.json(order);
});

// 9. Upload photos
app.post('/api/upload', (req, res) => {
  const { t, tipo, imagem } = req.body || {};
  const orders = getOrders();
  if (orders[t]) {
    if (tipo === 'sala') orders[t].cameraFoto = imagem;
    saveOrder(orders[t]);
  }
  res.json({ ok: true, url: imagem || '/assets/img/avatar.jpg' });
});

// 10. Voice recognition stub
app.post('/api/sim-nao', (req, res) => res.json({ resposta: 'sim' }));
app.post('/api/chamada-log', (req, res) => res.json({ ok: true }));
app.post('/api/piloto-log', (req, res) => res.json({ ok: true }));
app.get('/api/wa-ligacao', (req, res) => res.json({ ok: true, nome: 'Miguel', artigo: 'o' }));

// Fallback to index.html for unknown routes (only when called as express web server)
app.use((req, res) => res.sendFile(path.join(__dirname, 'index.html')));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🎅 SISTEMA COMPLETO DO PAPAI NOEL ATIVO!`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
