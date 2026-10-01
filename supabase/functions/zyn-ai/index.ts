import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna";

const tools = [
  {
    type: "function",
    name: "create_reminder",
    description: "Cria um lembrete no aplicativo Zyn.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título do lembrete." },
        date: { type: "string", description: "Data no formato YYYY-MM-DD. Use a data local informada no contexto quando o usuário disser hoje/amanhã." },
        time: { type: "string", description: "Horário HH:MM. Use string vazia se não houver horário." },
        category: { type: "string", description: "Categoria curta, por exemplo Pessoal, Trabalho, Conta ou Saúde." },
        repeat: { type: "string", description: "none, daily, weekly ou monthly." },
        notes: { type: "string", description: "Observação. Use string vazia quando não houver." },
      },
      required: ["title", "date", "time", "category", "repeat", "notes"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_goal",
    description: "Cria uma meta de ganhos no aplicativo. A meta diária é calculada pelo próprio aplicativo como valor dividido pelos dias.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome da meta." },
        target: { type: "number", description: "Valor total da meta em reais." },
        days: { type: "integer", description: "Quantidade de dias da meta, entre 1 e 3650." },
        startDate: { type: "string", description: "Data de início YYYY-MM-DD." },
        source: { type: "string", description: "all, Uber, Entregas ou Outros." },
      },
      required: ["name", "target", "days", "startDate", "source"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "register_earning",
    description: "Registra um ganho no histórico do Zyn.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Valor positivo do ganho em reais." },
        date: { type: "string", description: "Data YYYY-MM-DD." },
        source: { type: "string", description: "Uber, Entregas ou Outros." },
        notes: { type: "string", description: "Observação ou string vazia." },
      },
      required: ["amount", "date", "source", "notes"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "register_finance_transaction",
    description: "Registra uma movimentação financeira no Zyn e ajusta o saldo da conta escolhida.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", description: "expense para despesa, income para entrada, saving para valor guardado." },
        amount: { type: "number", description: "Valor positivo em reais." },
        description: { type: "string", description: "Descrição da movimentação." },
        date: { type: "string", description: "Data YYYY-MM-DD." },
        category: { type: "string", description: "Alimentação, Transporte, Moradia, Contas, Saúde, Lazer, Trabalho, Compras, Cartão ou Outros." },
        account: { type: "string", description: "Nome exato da conta/cartão quando informado pelo usuário, ou Dinheiro para usar o saldo em dinheiro. String vazia se não especificado." },
        notes: { type: "string", description: "Observação ou string vazia." },
      },
      required: ["type", "amount", "description", "date", "category", "account", "notes"],
      additionalProperties: false,
    },
  },
];

function instructions(context: unknown) {
  return `Você é Zyn, o assistente pessoal integrado ao aplicativo Zyn Assistente. Responda em português do Brasil, de forma natural, curta e útil. Você não deve inventar dados. Quando o usuário pedir uma ação que uma ferramenta possa executar, use a ferramenta em vez de apenas dizer que fará. Nunca peça confirmação para uma ação simples que o usuário já pediu claramente; execute e depois confirme o resultado. Para datas relativas, use a data local do contexto. Para metas, respeite exatamente a quantidade de dias solicitada e lembre que meta diária = valor total / dias. Para ganhos, as fontes válidas são Uber, Entregas e Outros. Para finanças, use expense, income ou saving conforme o pedido. Se faltar um dado indispensável, faça uma pergunta objetiva em vez de inventar. Contexto atual do aplicativo: ${JSON.stringify(context)}`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Faça login no Zyn Cloud para usar a IA." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Sessão do Zyn Cloud inválida ou expirada." }, 401);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY ainda não foi configurada na Edge Function." }, 503);

    const body = await req.json();
    const message = String(body?.message || "").trim();
    const context = body?.context || {};
    const previousResponseId = body?.previousResponseId || null;
    const toolOutputs = Array.isArray(body?.toolOutputs) ? body.toolOutputs : null;

    const requestBody: Record<string, unknown> = {
      model: MODEL,
      instructions: instructions(context),
      tools,
      max_output_tokens: 800,
    };

    if (previousResponseId && toolOutputs?.length) {
      requestBody.previous_response_id = previousResponseId;
      requestBody.input = toolOutputs;
    } else {
      if (!message) return json({ error: "Mensagem vazia." }, 400);
      requestBody.input = message;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (!response.ok) {
      const detail = data?.error?.message || "A API de IA recusou a solicitação.";
      return json({ error: detail }, response.status >= 400 && response.status < 500 ? response.status : 502);
    }

    const calls = (data.output || [])
      .filter((item: any) => item?.type === "function_call")
      .map((item: any) => ({ callId: item.call_id, name: item.name, arguments: item.arguments }));

    if (calls.length) return json({ type: "tool_calls", responseId: data.id, calls });

    return json({ type: "final", responseId: data.id, text: data.output_text || "Concluído." });
  } catch (error) {
    console.error(error);
    return json({ error: error?.message || "Erro interno na Edge Function." }, 500);
  }
});
