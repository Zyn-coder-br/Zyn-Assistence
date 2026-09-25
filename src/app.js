const APP_VERSION = "1.0.0";
const DB_NAME = "assistente-zyn-db";
const DB_VERSION = 1;

const state = {
  theme: localStorage.getItem("zyn-theme") || "light",
  activeModule: "dashboard"
};

const modules = [
  { id: "dashboard", label: "Início", icon: "⌂" },
  { id: "reminders", label: "Lembretes", icon: "🔔" },
  { id: "finance", label: "Finanças", icon: "💳" },
  { id: "gym", label: "GYM", icon: "🏋️" },
  { id: "habits", label: "Hábitos", icon: "↻" }
];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const stores = [
        ["reminders", "id"],
        ["events", "id"],
        ["financialAccounts", "id"],
        ["financialTransactions", "id"],
        ["financialGoals", "id"],
        ["workoutPlans", "id"],
        ["workoutSessions", "id"],
        ["habits", "id"],
        ["habitLogs", "id"],
        ["settings", "key"]
      ];
      stores.forEach(([name, keyPath]) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath });
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSetting(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector("#theme-toggle")?.setAttribute(
    "aria-label",
    state.theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"
  );
}

function moduleContent() {
  const contents = {
    dashboard: `
      <section class="hero-card">
        <div>
          <span class="eyebrow">ASSISTENTE ZYN</span>
          <h2>Olá, Ramon 👋</h2>
          <p>Organize seu dia em um só lugar.</p>
        </div>
        <div class="hero-orb">✦</div>
      </section>
      <section class="section-heading"><h3>Resumo de hoje</h3><span class="muted">V1.0.0</span></section>
      <div class="metric-grid">
        <article class="metric-card"><span>🔔</span><strong>0</strong><small>Lembretes pendentes</small></article>
        <article class="metric-card"><span>💳</span><strong>R$ 0,00</strong><small>Contas próximas</small></article>
        <article class="metric-card"><span>🏋️</span><strong>—</strong><small>Treino de hoje</small></article>
        <article class="metric-card"><span>↻</span><strong>0</strong><small>Hábitos concluídos</small></article>
      </div>
      <section class="empty-card"><div class="empty-icon">✦</div><h3>Seu assistente está pronto</h3><p>Comece cadastrando um lembrete, uma conta ou um hábito. Os módulos serão ativados nas próximas etapas.</p></section>
    `,
    reminders: modulePlaceholder("🔔", "Lembretes", "Cadastre tarefas, datas, eventos e lembretes recorrentes."),
    finance: modulePlaceholder("💳", "Finanças", "Organize contas fixas, cartões, receitas, despesas e metas."),
    gym: modulePlaceholder("🏋️", "GYM", "Prepare fichas, exercícios, sessões e histórico de treino."),
    habits: modulePlaceholder("↻", "Hábitos", "Crie hábitos, defina horários e acompanhe sua constância.")
  };
  return contents[state.activeModule] || contents.dashboard;
}

function modulePlaceholder(icon, title, description) {
  return `
    <section class="page-title"><span class="large-icon">${icon}</span><div><h2>${title}</h2><p>${description}</p></div></section>
    <section class="empty-card"><div class="empty-icon">${icon}</div><h3>Módulo preparado</h3><p>A estrutura deste módulo já está prevista na base. A implementação funcional será adicionada em uma próxima etapa.</p><button class="primary-btn" data-action="soon">Adicionar primeiro registro</button></section>
  `;
}

function render() {
  document.querySelector("#app").innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand"><div class="brand-mark">Z</div><div><strong>Assistente Zyn</strong><small>Seu espaço pessoal</small></div></div>
        <div class="top-actions">
          <button class="icon-btn" id="theme-toggle" title="Alternar tema">☼</button>
          <button class="icon-btn" id="update-btn" title="Verificar atualização">↻</button>
        </div>
      </header>
      <main class="main-content">${moduleContent()}</main>
      <nav class="bottom-nav" aria-label="Navegação principal">
        ${modules.map(m => `<button class="nav-item ${state.activeModule === m.id ? "active" : ""}" data-module="${m.id}"><span>${m.icon}</span><small>${m.label}</small></button>`).join("")}
      </nav>
      <div class="toast" id="toast" role="status"></div>
    </div>
  `;
  applyTheme();
  bindEvents();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2600);
}

function bindEvents() {
  document.querySelectorAll("[data-module]").forEach(button => {
    button.addEventListener("click", () => {
      state.activeModule = button.dataset.module;
      render();
    });
  });

  document.querySelector("#theme-toggle").addEventListener("click", async () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    localStorage.setItem("zyn-theme", state.theme);
    await saveSetting("theme", state.theme);
    applyTheme();
    showToast(state.theme === "dark" ? "Modo escuro ativado" : "Modo claro ativado");
  });

  document.querySelector("#update-btn").addEventListener("click", async () => {
    showToast(`Você está usando a versão ${APP_VERSION}`);
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) await registration.update();
    }
  });

  document.querySelectorAll('[data-action="soon"]').forEach(button => {
    button.addEventListener("click", () => showToast("Este cadastro será implementado na próxima etapa."));
  });
}

async function init() {
  try {
    await openDatabase();
  } catch (error) {
    console.error("Falha ao abrir banco local:", error);
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  }

  render();
}

init();
