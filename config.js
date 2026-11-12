// ========================================================
// CONFIGURAÇÃO DO FUNIL DO PAPAI NOEL
// Altere os valores abaixo com os seus dados de checkout,
// WhatsApp, Meta Pixel e ofertas!
// ========================================================

window.CUSTOM_CONFIG = {
  // ID do Pixel do Facebook / Meta Ads
  pixelId: '1876174250463589',

  // Botão de dúvidas no WhatsApp ("Tenho dúvidas, Papai Noel")
  waDuvidas: 'https://wa.me/553584699814?text=' + encodeURIComponent('Olá Papai Noel, tenho algumas dúvidas.'),

  // Se usar automação do ManyChat depois da VSL (opcional)
  waManychat: '',
  waGatilho: 'Oi, Papai Noel! 🎅 Quero agendar a ligação',

  // Prazo final da contagem regressiva da oferta (horário UTC/ISO)
  fimPromo: '2026-12-01T03:00:00Z',

  // Lista dos 3 planos da oferta integrados com a Cakto Pay
  plans: [
    {
      id: 'padrao',
      nome: 'Ligação Padrão',
      dur: 'Duração de 1 minuto · não fala o nome',
      itens: [
        'Agendamento de data e hora',
        'Fica salva na Área Mágica',
        'Duração de 1 minuto',
        'Chamada interativa com câmera',
        'Não fala o nome da criança'
      ],
      de: '47,90',
      por: '19,90',
      checkout: 'https://pay.cakto.com.br/34ugxw9_1316438'
    },
    {
      id: 'nome',
      best: true,
      badge: '⭐ Mais escolhido',
      nome: 'Com o <mark>nome da criança</mark>',
      dur: 'Duração de 1 minuto',
      verde: true,
      itens: [
        'Agendamento de data e hora',
        'Fica salva na Área Mágica',
        'Duração de 1 minuto',
        'Chamada interativa com câmera',
        '<b>O Papai Noel fala o nome da criança</b>',
        '<b>Chamada interativa completa</b>'
      ],
      de: '99,90',
      por: '47,90',
      checkout: 'https://pay.cakto.com.br/37h4j78_1316453'
    },
    {
      id: 'premium',
      nome: 'Mensagem personalizada',
      dur: 'Duração de até 1:30',
      itens: [
        'Tudo do pacote com o nome',
        '<b>Mensagem personalizada pelo pai</b> (ou com a nossa ajuda)',
        'O Papai Noel fala o nome da criança',
        '<b>Duração de até 1:30</b>'
      ],
      de: '147,00',
      por: '99,90',
      checkout: 'https://pay.cakto.com.br/bw2yker_1316463'
    }
  ]
};
