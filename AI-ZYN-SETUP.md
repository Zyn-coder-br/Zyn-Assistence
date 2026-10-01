# Zyn IA — configuração da V2.2.0

A V2.2.0 adiciona a primeira camada real de IA do Zyn. O PWA conversa com uma Edge Function do Supabase; a chave da OpenAI fica somente no backend.

## 1. Não coloque a chave da OpenAI no GitHub

A chave deve ser configurada como segredo no projeto Supabase. A OpenAI recomenda não colocar chaves em navegador, aplicativo móvel ou repositório público.

## 2. Edge Function

O código está em:

`supabase/functions/zyn-ai/index.ts`

Publique essa função no mesmo projeto Supabase usado pelo Zyn.

## 3. Segredos necessários

Configure na Edge Function:

- `OPENAI_API_KEY` = sua chave da OpenAI
- `OPENAI_MODEL` = `gpt-5.6-luna` (opcional; se não definir, esse é o padrão)

As variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` são usadas para validar a sessão do usuário.

## 4. Login

A IA exige que o usuário esteja conectado ao **Zyn Cloud**. Isso evita deixar a função de IA pública para qualquer pessoa que descubra a URL.

## 5. Endpoint

Por padrão, o aplicativo usa:

`https://SEU-PROJETO.supabase.co/functions/v1/zyn-ai`

A tela Zyn > engrenagem permite alterar o endpoint sem editar o código.

## 6. Ações da V2.2.0

O Zyn pode chamar estas ferramentas:

- `create_reminder`
- `create_goal`
- `register_earning`
- `register_finance_transaction`

O aplicativo executa a ação localmente e devolve o resultado para o modelo para que ele responda ao usuário.

## 7. Teste inicial

Depois de publicar a função e configurar `OPENAI_API_KEY`:

1. Abra o Zyn.
2. Entre no Zyn Cloud.
3. Abra o painel Zyn.
4. Envie: `Crie uma meta de R$ 1.000 em 30 dias`.
5. Verifique Planejar > Metas.
6. Teste: `Registra R$ 70 de entregas hoje`.
7. Verifique o histórico.
8. Teste: `Me lembra amanhã às 8 horas de pagar a internet`.
9. Verifique Planejar > Lembretes.

Nunca envie sua `OPENAI_API_KEY` para o chat, GitHub ou campo do aplicativo.
