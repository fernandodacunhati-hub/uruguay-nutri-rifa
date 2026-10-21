# Uruguay Nutri — Rifa de creatina

Next.js + Supabase + Mercado Pago Checkout Pro, preparado para deploy no Netlify.

## Importante antes de publicar

Este projeto é um ponto de partida técnico. Não habilite vendas nem anuncie o sorteio até confirmar a autorização legal aplicável no Uruguai. Também faça teste completo em ambiente de teste antes de usar credenciais de produção.

## 1. Criar o banco no Supabase

1. Crie um projeto Supabase.
2. Abra SQL Editor.
3. Execute o conteúdo de `supabase/schema.sql`.
4. Em Project Settings > API, copie Project URL, anon key e service_role key.
5. Em Database > Replication / Publications, confirme que `raffle_numbers` está na publicação `supabase_realtime`. O SQL tenta adicioná-la; se já estiver adicionada, ignore o aviso de duplicação.

A chave `service_role` nunca deve ser usada no navegador nem prefixada com `NEXT_PUBLIC_`.

## 2. Configurar o Mercado Pago

1. Configure a credencial de vendedor para o Uruguai.
2. No painel de notificações/webhooks do Mercado Pago, configure a URL:
   `https://SEU-DOMINIO/api/webhooks/mercadopago`
3. Habilite notificações de pagamentos e copie o segredo de assinatura do webhook para `MERCADOPAGO_WEBHOOK_SECRET`.
4. Use a URL pública final em `NEXT_PUBLIC_SITE_URL`.
5. A API cria uma preferência por pedido, com valor de $20 UYU por número.

O webhook verifica assinatura, consulta o pagamento diretamente à API do Mercado Pago e confirma que o valor/moeda correspondem ao pedido. Teste com pagamentos de teste primeiro.

## 3. Rodar localmente

```bash
npm install
cp .env.example .env.local
# Preencha todas as variáveis em .env.local
npm run dev
```

Abra `http://localhost:3000`. Para testar checkout/webhook local, use um túnel HTTPS confiável e configure a URL do webhook.

## 4. Publicar no Netlify

1. Envie a pasta para um repositório GitHub.
2. No Netlify, escolha Add new site > Import an existing project.
3. Selecione o repositório.
4. Build command: `npm run build`.
5. Adicione todas as variáveis de `.env.example` em Site configuration > Environment variables.
6. Faça deploy e atualize `NEXT_PUBLIC_SITE_URL` com a URL pública final.
7. Configure a URL de webhook do Mercado Pago com o domínio definitivo e faça novo deploy.

## 5. Painel administrativo

Acesse `/admin` e informe `ADMIN_PASSWORD`, configurado nas variáveis de ambiente do Netlify. Use uma senha longa e exclusiva. Esta versão é uma base mínima; para produção com maior tráfego, substitua a senha compartilhada por autenticação administrativa com Supabase Auth/MFA e restrições adicionais.

## 6. Regras implementadas

- Verde: disponível.
- Amarelo: reservado por até 15 minutos.
- Vermelho: pagamento confirmado pelo webhook.
- Reservas concorrentes protegidas por transação PostgreSQL.
- O navegador nunca confirma pagamentos; só o webhook do servidor.
- O painel lê pedidos por endpoint protegido; dados pessoais não ficam públicos.
- A grade atualiza por Supabase Realtime e polling de segurança.

## Limitações e verificações de produção

- A expiração da reserva é verificada ao tentar reservar números. Esta versão não tem cron job para liberar automaticamente os números expirados na tela; pode-se adicionar uma função agendada Supabase/pg_cron.
- Se o pagamento for aprovado depois da expiração e outro pedido já tiver tomado os números, a confirmação falha e precisa de um fluxo de reembolso/atendimento. Configure política operacional para esses casos antes de produção.
- Webhooks de `merchant_order` não são processados nesta versão; use notificações de tipo `payment`.
- Teste o formato exato de assinatura que sua conta do Mercado Pago envia, inclusive `data.id` e headers, antes de produção.
- Configure política de privacidade, consentimento de contato e prazo de retenção de dados pessoais.
- Confirme autorização e regras aplicáveis à rifa antes de receber pagamentos.
