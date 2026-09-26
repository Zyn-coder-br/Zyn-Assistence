# Zyn Assistente — V1.6.0

## Zyn Cloud + Login + sincronização

Esta versão preserva o funcionamento local da V1.5.5 e adiciona a primeira camada de nuvem.

### O que entrou
- Supabase Auth com login e criação de conta por e-mail/senha.
- Sessão persistente no navegador/PWA.
- IndexedDB continua sendo o banco local/offline.
- Nova fila local para exclusões pendentes.
- Sincronização bidirecional entre IndexedDB e Supabase.
- Indicador de estado da nuvem: sincronizado, sincronizando, offline ou erro.
- Botão para sincronizar manualmente.
- Os dados locais continuam disponíveis mesmo sem internet ou sem login.
- A chave usada no navegador é a Publishable Key; nenhuma `service_role` é usada.

## Configuração obrigatória no Supabase

No SQL Editor do projeto Zyn Assistente, execute o arquivo `supabase-schema-v1.6.0.sql` que acompanha este ZIP. Ele cria a tabela central `zyn_records`, índice único e políticas RLS por usuário.

Depois publique os arquivos deste ZIP no GitHub Pages. Abra o aplicativo, toque em **Entrar para sincronizar** e crie sua conta.

### Fluxo
`Celular → IndexedDB → Zyn Cloud → PC/Outro celular`

Alterações feitas offline ficam no aparelho e são enviadas quando a conexão voltar e houver uma sessão autenticada.

## Observação
A configuração de confirmação de e-mail do Supabase pode exigir que você confirme o endereço antes do primeiro login. Isso depende da configuração de Auth do projeto.

## Base preservada
- Metas
- Lembretes
- GYM
- Alimentação
- Finanças
- PWA
- Tema claro/escuro
- Instalação pelo navegador
