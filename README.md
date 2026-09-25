# Assistente Zyn — V1.0.0

Fundação inicial de um PWA pessoal local-first.

## O que já existe

- Dashboard inicial
- Navegação entre módulos
- Tema claro/escuro
- Identidade roxa com degradê
- IndexedDB com stores preparadas
- Service Worker básico
- Manifest PWA
- Botão de verificação de atualização
- Estrutura inicial para Lembretes, Finanças, GYM e Hábitos

## Como testar pelo navegador

1. Extraia o ZIP.
2. Crie um repositório no GitHub.
3. Envie os arquivos mantendo a estrutura de pastas.
4. Ative GitHub Pages em Settings > Pages.
5. Abra o endereço publicado.

> Para o Service Worker funcionar corretamente, abra pelo GitHub Pages ou outro servidor HTTPS. Abrir diretamente o index.html pelo protocolo file:// não ativa o Service Worker.

## Próximas etapas

1. CRUD de lembretes e eventos.
2. Contas e transações financeiras.
3. Hábitos e histórico.
4. GYM.
5. Backup e restauração.
6. Sistema de notificações e validação no Android.
7. Atualização robusta com migrações do IndexedDB.

## Observação

A base PWA não garante notificações exatas em todas as situações com o navegador fechado. Esse requisito será validado e, se necessário, será planejada uma camada Android nativa.
