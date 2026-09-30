# Zyn Assistente V2.1.0

V2.1.0 inicia a integração da IA Zyn com backend seguro, chat por texto, entrada por voz e ações locais (lembrete, ganho e meta). Também transforma metas em períodos configuráveis: valor total ÷ quantidade de dias.

## IA
A chave da OpenAI não deve ser colocada no PWA. Use a pasta `server/` para executar o backend e configure a URL dele no painel Zyn.

# Zyn Assistente — V2.0.9

Base: V2.0.8.

## Alterações
- Nova meta: os campos de criação não vêm mais com valores pré-fixados; nome e valor semanal são preenchidos pelo usuário.
- Divisão diária agora pode ser alterada de 1 a 7 dias e a meta diária é recalculada automaticamente.
- Fonte da meta pode ser Todas as fontes, Uber, Entregas ou Outros.
- Edição de meta preserva os dados existentes e permite alterar todas essas informações.
- Importação de música local ficou mais robusta: compara tamanho + fingerprint SHA-256 e verifica os registros atuais do IndexedDB antes de salvar.
- Registros locais duplicados existentes com o mesmo fingerprint são consolidados automaticamente, preservando a faixa original e corrigindo referências de playlists.
- Versão/cache do PWA atualizados para 2.0.9 para evitar carregar o JavaScript antigo no GitHub Pages.
