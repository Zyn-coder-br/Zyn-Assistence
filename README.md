# Zyn Assistente — V2.4.1

Base: V2.0.8.

## Alterações
- Nova meta: os campos de criação não vêm mais com valores pré-fixados; nome e valor semanal são preenchidos pelo usuário.
- Divisão diária agora pode ser alterada de 1 a 7 dias e a meta diária é recalculada automaticamente.
- Fonte da meta pode ser Todas as fontes, Uber, Entregas ou Outros.
- Edição de meta preserva os dados existentes e permite alterar todas essas informações.
- Importação de música local ficou mais robusta: compara tamanho + fingerprint SHA-256 e verifica os registros atuais do IndexedDB antes de salvar.
- Registros locais duplicados existentes com o mesmo fingerprint são consolidados automaticamente, preservando a faixa original e corrigindo referências de playlists.
- Versão/cache do PWA atualizados para 2.2.2 para evitar carregar o JavaScript antigo no GitHub Pages.


## V2.2.3 — Zyn Music redesign
- Player com identidade visual roxo/magenta, disco circular e progresso destacado.
- Ações rápidas de favoritos, fila e recentes.
- Lista da biblioteca com controle de favoritos.
- Mantida a arquitetura atual de armazenamento e reprodução de arquivos locais/URLs de áudio.


## V2.3.0 — Reorganização financeira pessoal
- Novo controle de dívidas com saldo, status, pagamento diário, registro de pagamentos e saldo restante.
- Importação opcional do diagnóstico informado pelo usuário (Nubank, Inter, Banco PAN, Parcela Diária e Akio), evitando importação duplicada.
- Novo registro de renda extra por dia, com faturamento, combustível consumido, reserva de manutenção e horas trabalhadas.
- Novo checklist de reorganização com missões iniciais e progresso local/nuvem.
- IndexedDB atualizado para armazenar os novos módulos e sincronizá-los pelo Zyn Cloud.


## V2.4.1 — Correção dos modais e estrutura didática
- Corrigido um erro crítico: `closeModal()` chamava a si mesma repetidamente, impedindo o fechamento de janelas.
- Fechamento de modal agora remove a janela corretamente, atualiza o bloqueio de rolagem e limpa o evento de teclado.
- A tecla Esc fecha somente a janela superior; clicar no fundo fecha a janela quando permitido.
- Estrutura de arquivos simplificada para facilitar o estudo: `index.html`, `css/styles.css` e `js/app.js`.
- Comentários didáticos adicionados ao HTML e ao início do JavaScript.

## Mapa para estudar o código
- `index.html`: configurações da página e ligações para CSS e JavaScript.
- `css/styles.css`: cores, tamanhos, cartões, botões, telas e janelas.
- `js/app.js`: regras, dados, funções, formulários e eventos dos botões.
- `manifest.webmanifest`: nome, ícones e configuração instalável da PWA.
- `sw.js`: cache e atualização da versão instalada.
- `supabase/functions/zyn-ai/index.ts`: função de IA hospedada no Supabase.

### Como localizar uma funcionalidade
1. Procure o texto que aparece no botão dentro de `js/app.js`.
2. Procure o ID do botão, por exemplo `financeDebtAdd`.
3. Encontre o `addEventListener` desse ID para ver qual função é chamada.
4. Abra a função correspondente, por exemplo `financeDebtForm`, para entender o formulário.
5. Procure a chamada `put(...)` para localizar onde o registro é salvo.

### Observação de teste
A versão foi verificada quanto à sintaxe JavaScript. Faça o teste funcional no navegador e no Android antes de substituir definitivamente a versão publicada. Faça backup dos arquivos e exporte os dados antes da atualização.
