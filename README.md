# 🎅 Sistema Completo: Funil e Entregáveis da Ligação do Papai Noel

Este projeto é a implementação completa, autônoma e funcional do funil e do ecossistema de entrega da oferta **Ligação do Papai Noel**, incluindo páginas de venda, área de membros, sistema de videochamada interativa, gerador de certificados, webhook de checkout e painel administrativo.

---

## 🎯 O que é o Entregável?

O entregável vendido no funil é uma **experiência web imersiva de videochamada personalizada do Papai Noel para a criança**, acessada diretamente no celular dos pais no dia e horário escolhidos:

1. **A Chamada Interativa com Câmera Frontal (`/chamada`):**
   - O celular toca como uma chamada real de WhatsApp/FaceTime (áudio de toque e botões de atender/recusar).
   - Ao atender, a **câmera frontal do celular é ligada** (mostrando o rostinho da criança no topo da tela).
   - O Papai Noel aparece em tela cheia conversando diretamente com ela, chamando-a pelo nome (áudio sintetizado com IA) e fazendo perguntas interativas.
2. **A Área Mágica (`/area`):**
   - Área de membros onde os pais configuram o nome da criança, pronúncia, dia e hora que o Papai Noel deve ligar, além de mensagens especiais sobre o comportamento e conquistas do ano.
3. **Certificado Oficial de Bom Comportamento (`/certificado`):**
   - Certificado oficial do Polo Norte com o nome da criança, aprovado pelo Papai Noel e pronto para impressão ou salvar em PDF.
4. **Adicionais e Upsells:**
   - Gravação da reação da criança na tela.
   - Foto da sala com o Papai Noel deixando os presentes.
   - Chamada antecipada para anotação de pedidos de presente.

---

## 📁 Estrutura de Rotas e Páginas

| Rota | Descrição |
| :--- | :--- |
| **`/`** | **Página de Vendas / VSL Interativa**: Simulação de chamada, captura de lead e oferta dos 3 planos com cronômetro. |
| **`/area`** | **Área Mágica (Área de Membros)**: Formulário wizard para personalizar a ligação + painel de acompanhamento e upsells. |
| **`/chamada`** | **A Videochamada**: Player interativo com câmera frontal, ringtone e fala personalizada. |
| **`/obrigado`** | **Página de Obrigado**: Confirmação pós-compra, rastreio Meta Pixel `Purchase` e liberação instantânea de acesso. |
| **`/certificado`** | **Certificado de Bom Comportamento**: Documento personalizável para imprimir em alta resolução. |
| **`/admin`** | **Painel de Gestão**: Lista de leads capturados, pedidos dos clientes, status e gerador de pedidos de teste. |
| **`config.js`** | **Configuração Rápida**: Edição de Pixel da Meta, WhatsApp, links de checkout e ofertas. |
| **`server.js`** | **Servidor e APIs**: Backend Express com persistência em JSON, webhook de vendas e proxy de voz. |

---

## 🚀 Como Rodar e Testar

### 1. Iniciar o servidor
```bash
npm start
```
O servidor iniciará em `http://localhost:3000`.

### 2. Rotas para Testar Imediatamente
- 🎅 **Funil Principal:** [http://localhost:3000/](http://localhost:3000/)
- 👑 **Painel do Administrador:** [http://localhost:3000/admin](http://localhost:3000/admin) *(crie pedidos de teste em 1 clique)*
- ✨ **Área Mágica:** [http://localhost:3000/area](http://localhost:3000/area) *(preencha os dados da criança e agende)*
- 📞 **Chamada do Papai Noel:** [http://localhost:3000/chamada](http://localhost:3000/chamada) *(veja a simulação com câmera)*
- 📜 **Certificado Oficial:** [http://localhost:3000/certificado](http://localhost:3000/certificado) *(pronto para imprimir)*
- 🎉 **Página de Obrigado:** [http://localhost:3000/obrigado](http://localhost:3000/obrigado)

---

## 🔗 Integração com Plataformas de Pagamento (Webhooks)

O endpoint **`POST http://seusite.com/api/webhook`** está pronto para receber notificações de compra aprovada de qualquer plataforma:
- **Kiwify**
- **PerfectPay**
- **Hotmart**
- **Kirvano**
- **Mercado Pago / Stripe**

Ao receber o pagamento, o sistema automaticamente:
1. Registra o pedido no banco de dados local (`data/orders.json`).
2. Gera o token exclusivo daquele cliente (`t`).
3. Retorna o link mágico da Área Mágica (`/area?t=TOKEN`) pronto para ser enviado por e-mail ou WhatsApp.

---

## ⚙️ Configuração Personalizada

Edite o arquivo [`config.js`](./config.js) para alterar:
- Seu **Meta Pixel ID** (Facebook Ads).
- Seu **número de WhatsApp** para dúvidas.
- As **URLs de checkout** de cada um dos 3 planos.
- A **data final do desconto** no cronômetro da oferta.
