# Zyn Assistente — V1.9.7

## Base
V1.9.7 foi construída diretamente sobre a V1.9.6 testada pelo Ramon.

## Objetivo desta versão
1. Adaptar a iconografia do player de Música aos ícones de referência enviados pelo Ramon.
2. Corrigir a navegação funcional de Semana, Metas e Lembretes no painel Planejar.
3. Iniciar a etapa Bem-estar/GYM com um painel GYM funcional e navegável.

## Música — alterações
- Aleatório: novo SVG de shuffle.
- Anterior: novo SVG com seta para esquerda e barra.
- Próxima: novo SVG com seta para direita e barra.
- Reproduzir: novo SVG circular com play.
- Pausar: novo SVG com duas barras.
- Importar pasta: novo SVG de pasta.
- Ícones aplicados no player principal e mini-player.
- Botões de reprodução da biblioteca também usam o novo play.
- Não houve alteração na lógica de reprodução local, fila, IndexedDB ou Media Session.

## Planejar — correções
- Tabs Hoje / Semana / Metas / Lembretes agora têm listeners funcionais.
- Novo lembrete pelo botão rápido e pelos botões da tela.
- Semana mostra os lembretes por dia.
- Metas permite criar/editar/registrar ganhos/excluir usando as funções já existentes.
- Lembretes podem ser abertos para edição.
- Lembretes podem ser concluídos/reabertos diretamente pela lista.
- Repetição do lembrete preservada ao editar.

## Bem-estar / GYM
- Cabeçalho do Bem-estar recebeu ícone SVG profissional.
- Card GYM usa halteres/SVG em vez de símbolo genérico.
- GYM passou a ter abas funcionais:
  - Minha semana
  - Exercícios
  - Progresso
  - Histórico
- Minha semana permite editar cada dia e iniciar treino.
- Exercícios apresenta a biblioteca de exercícios por treino.
- Progresso calcula sessões, repetições, volume e maior carga da semana.
- Histórico lista as sessões registradas.
- Perfil GYM, edição de treino, semana, caminhada/corrida e registro de sessão foram preservados.
- Dieta e Hábitos permanecem para a próxima etapa.

## Preservado
- Finanças V1.9.5/V1.9.6.
- Música local e IndexedDB.
- Playlists, fila e mini-player.
- Supabase/sincronização.
- Sistema de modais Zyn.
- Navegação inferior.
- PWA/Service Worker.

## Testes realizados
- `node --check src/app.js` — OK.
- Servidor HTTP local + `curl` para `index.html` — HTTP 200.
- Conferência de referências de versão — V1.9.7.
- ZIP será validado com `unzip -t`.

## Próximo passo após aprovação
Continuar Bem-estar com Dieta e Hábitos e depois avançar para Investimentos completo. Notificações nativas/APK ficam para a etapa posterior de integração Android.
