# Zyn Assistente — V2.3.0

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
