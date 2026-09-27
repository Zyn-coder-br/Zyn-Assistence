# Zyn Assistente — V1.7.0

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


## V1.6.2 — Correção definitiva da chave Supabase + pacote limpo (base desta versão)
- SDK Supabase JS fixado em 2.117.2.
- Corrigida a Publishable Key do projeto Zyn Assistente.
- Cache do Service Worker atualizado para V1.6.2 (base histórica).
- Pacote interno reconstruído a partir do código real do GitHub.
- Pasta interna do pacote padronizada para V1.6.2 (base histórica).


## V1.7.0 — Zyn Music
- Player de áudio online com fila, playlists e controles básicos.
- Media Session API para integração com controles de mídia do Android quando suportado.
- Adição por URL direta de áudio.
- Busca de artista/banda com prévias disponíveis via iTunes Search API.
- Biblioteca e playlists persistidas no IndexedDB e incluídas na sincronização existente.
- Importante: prévias de busca podem ser trechos curtos; músicas completas dependem de uma fonte/serviço que forneça uma URL de áudio autorizada.


## V1.7.5 — Zyn Music persistente
- Corrigido o player para não ser destruído ao trocar de painel.
- Áudio direto continua em reprodução ao navegar entre áreas.
- Player YouTube oficial permanece montado em um dock persistente.
- Navegação inferior reorganizada em 5 itens sem scroll horizontal; áreas extras ficam em “Mais”.
- Resultados de busca deixam claro que a prévia é de 30s e oferecem busca da versão completa no YouTube.
- Links do YouTube continuam podendo ser adicionados à biblioteca/playlist e reproduzidos pelo player oficial.
- Mantido login e restante do aplicativo.

Observação: a busca de catálogo usada pelo Zyn fornece apenas prévias. Para reprodução completa pelo YouTube, use o botão YouTube para localizar a versão completa e depois adicione o link do vídeo em “+ Link”.


## V1.8.0 — Layout profissional + Investimentos
- Padronização visual do módulo de investimentos no mesmo sistema de painéis do Zyn.
- Carteira de investimentos com Ações, FIIs, ETFs, Renda fixa, Cripto e Outros.
- Cadastro/edição/exclusão de ativos com ticker, nome, tipo, quantidade, preço médio, preço atual, proventos e instituição.
- Cálculo local de capital aplicado, valor atual, resultado, percentual e distribuição por tipo.
- Acesso aos investimentos dentro de Finanças, sem criar um sexto item na navegação inferior.
- A navegação inferior permanece: Início, Planejar, Bem-estar, Finanças e Mais.
- Player/dock de música continua acima da barra de navegação.
- Novo object store IndexedDB `investmentAssets`, incluído na sincronização do Zyn Cloud.

## V1.8.1 — Nova interface profissional
- Nova linguagem visual aplicada aos módulos principais, seguindo as telas de referência aprovadas.
- Painéis, cards, botões, listas, métricas e abas padronizados em roxo, branco e fundo escuro.
- GYM redesenhado com semana, treino do dia, progresso e histórico visual.
- Dieta redesenhada com resumo diário, refeições e lista de compras.
- Finanças redesenhadas com visão do mês, saldo, contas fixas, movimentações, categorias e acesso à carteira.
- Investimentos redesenhados com patrimônio, indicadores, carteira, distribuição e ações rápidas.
- Música redesenhada com player, playlists, busca e biblioteca.
- Início e Planejar receberam o mesmo sistema visual.
- Mantida a navegação inferior exatamente com: **Início | Planejar | Bem-estar | Finanças | Mais**.
- O player de música continua acima da barra inferior.
- Investimentos continua dentro de Finanças, sem criar sexto botão.
- Banco local/IndexedDB, Supabase Cloud, GYM, Dieta, Finanças, Investimentos e Zyn Music preservados.
- Cache do Service Worker atualizado para V1.8.1.


## V1.8.2 — correção de inicialização
Restauradas as funções centrais de IndexedDB, utilitários e funções de apoio que foram omitidas durante a fusão da interface da V1.8.1.

## V1.8.3 — Interfaces e funcionalidades seguintes
- Finanças: interfaces separadas para Visão Geral, Cartões, Gastos e Metas.
- Cartões e metas financeiras com cadastro, edição e exclusão local.
- GYM: o botão + de cada dia abre o editor do treino e permite editar exercícios.
- Planejar: meta ativa pode ser editada diretamente na tela principal.
- Música: biblioteca local aceita arquivos de áudio completos do aparelho, sem depender das prévias do iTunes.
- Mais: removido da barra inferior e transformado em botão flutuante no canto inferior direito; o painel fecha ao clicar novamente ou fora dele.
- Cabeçalho global passa a mostrar apenas “Zyn”.
- Barra inferior passa a ter quatro itens: Início, Planejar, Bem-estar e Finanças.


## V1.8.4 — correções funcionais
- Finanças: interfaces funcionais para Cartões, Gastos e Metas; gastos permitem editar/excluir lançamentos.
- GYM: botão "Editar treino" no treino do dia e edição dos dias/exercícios da semana com adicionar/remover exercício.
- Música: biblioteca focada em arquivos completos do aparelho; suporte a seleção múltipla e importação de pasta. Prévias antigas do iTunes não são exibidas como biblioteca.
- Mais: permanece como botão flutuante fora da barra inferior e fecha ao tocar fora.
- Planejar: metas podem ser criadas e editadas.
- Cabeçalho: identidade reduzida para "Zyn".
- Service Worker atualizado para v1.8.4.


## V1.8.5
Correção do player de músicas locais: arquivos importados do dispositivo agora são reproduzidos via Blob URL, usando o Blob armazenado no IndexedDB, mesmo sem URL HTTP.


## V1.9.0 — Music playback stability
- Queue follows the current library/favorites/recent tab or selected playlist.
- Natural playback advances through the full queue and stops at the end instead of looping the first track.
- Removed render-on-track-change to prevent list scroll resets and UI lag.
- Reuses one audio element and revokes old Blob URLs to reduce memory pressure.
- Media Session metadata/playback state stays active while paused; no app toast is generated for pause/play state.
