const APP_VERSION = "1.2.0";
const DB_NAME = "assistente-zyn-db";
const DB_VERSION = 2;
let db;
let currentView = "home";
let theme = localStorage.getItem("zyn-theme") || "light";
let reminders = [];
let goals = [];
let earnings = [];

document.body.className = theme;
const app = document.querySelector("#app");

function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const database=request.result;
      ["reminders","events","financialAccounts","financialTransactions","financialGoals","workoutPlans","workoutSessions","habits","habitLogs","settings","goals","earnings"].forEach(store=>{
        if(!database.objectStoreNames.contains(store)) database.createObjectStore(store,{keyPath:"id",autoIncrement:true});
      });
    };
    request.onsuccess=()=>{db=request.result;resolve(db)};
    request.onerror=()=>reject(request.error);
  });
}
function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}
function all(name){return new Promise((resolve,reject)=>{const r=store(name).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
function put(name,data){return new Promise((resolve,reject)=>{const r=store(name,"readwrite").put(data);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function remove(name,id){return new Promise((resolve,reject)=>{const r=store(name,"readwrite").delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
function money(value){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value)||0)}
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function todayISO(){return new Date().toISOString().slice(0,10)}
function fmtDate(value){if(!value)return "Sem data";return new Date(value+"T12:00:00").toLocaleDateString("pt-BR")}
function weekStart(date=new Date()){const d=new Date(date);const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);d.setHours(0,0,0,0);return d}
function dateKey(date){return date.toISOString().slice(0,10)}
function getCurrentWeekDays(){const start=weekStart();return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return dateKey(d)})}
function weekEarnings(goal){const days=getCurrentWeekDays();return earnings.filter(e=>days.includes(e.date)&&(!goal.source||goal.source==="all"||goal.source===e.source)).reduce((sum,e)=>sum+Number(e.amount||0),0)}
function goalProgress(goal){const amount=weekEarnings(goal);return Math.min(100,goal.target?amount/goal.target*100:0)}
function dayAmount(goal,date=todayISO()){return earnings.filter(e=>e.date===date&&(!goal.source||goal.source==="all"||goal.source===e.source)).reduce((sum,e)=>sum+Number(e.amount||0),0)}
function activeGoal(){return goals.find(g=>g.active!==false)||goals[0]}
function toast(message){const el=document.createElement("div");el.textContent=message;Object.assign(el.style,{position:"fixed",bottom:"82px",left:"50%",transform:"translateX(-50%)",background:"var(--text)",color:"var(--surface)",padding:"12px 17px",borderRadius:"12px",zIndex:40,boxShadow:"0 8px 30px #0003"});document.body.appendChild(el);setTimeout(()=>el.remove(),2500)}
function setView(view){currentView=view;render()}
function toggleTheme(){theme=theme==="light"?"dark":"light";localStorage.setItem("zyn-theme",theme);document.body.className=theme;render()}
function modal(content){const wrapper=document.createElement("div");wrapper.className="modal-backdrop";wrapper.innerHTML=`<div class="modal">${content}</div>`;document.body.appendChild(wrapper);return wrapper}
function closeModal(el){el?.remove()}

function layout(){
 return `<div class="shell">
  <header class="topbar"><div class="brand"><div class="brand-mark">Z</div><div><div class="eyebrow">ASSISTENTE PESSOAL</div><div class="title">Assistente Zyn</div></div></div><div class="actions"><button class="icon-btn" id="themeBtn" title="Alternar tema">◐</button><button class="icon-btn" id="updateBtn" title="Ver versão">↻</button></div></header>
  <main id="content"></main>
 </div>
 <nav class="nav"><div class="nav-inner">
  <button data-view="home" class="${currentView==="home"?"active":""}">⌂<br>Início</button>
  <button data-view="reminders" class="${currentView==="reminders"?"active":""}">✓<br>Lembretes</button>
  <button data-view="goals" class="${currentView==="goals"?"active":""}">◎<br>Metas</button>
  <button data-view="finance" class="${currentView==="finance"?"active":""}">R$<br>Finanças</button>
  <button data-view="habits" class="${currentView==="habits"?"active":""}">✦<br>Hábitos</button>
 </div></nav>`;
}

function homeView(){
 const goal=activeGoal();
 const amount=goal?weekEarnings(goal):0;
 const progress=goal?goalProgress(goal):0;
 const today=goal?dayAmount(goal):0;
 const pending=reminders.filter(r=>!r.done).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(0,4);
 return `<section class="hero"><div class="eyebrow" style="color:#e8e2ff">SEU DIA EM FOCO</div><h2>Olá, Ramon 👋</h2><p>Organize suas tarefas, acompanhe suas metas e mantenha o controle da sua rotina.</p></section>
 <div class="grid">
  <section class="card full"><div class="row"><h3>🎯 ${goal?esc(goal.name):"Sua próxima meta"}</h3><span class="tag">${goal?"Semanal":"Comece agora"}</span></div>
   ${goal?`<div class="row"><div><div class="metric">${money(amount)}</div><div class="muted">de ${money(goal.target)} conquistados</div></div><div style="text-align:right"><div class="metric">${progress.toFixed(1)}%</div><div class="muted">progresso semanal</div></div></div><div class="progress"><div style="width:${progress}%"></div></div><div class="row"><span class="muted">Meta diária: ${money(goal.dailyTarget)}</span><span class="muted">Hoje: ${money(today)}</span></div><div class="row" style="margin-top:14px"><button class="btn primary" id="quickEarning">+ Registrar ganho</button><button class="btn" id="openGoals">Ver metas</button></div>`:`<div class="empty">Você ainda não criou uma meta. Crie uma meta semanal para começar.</div><button class="btn primary" id="createGoal" style="margin-top:12px">+ Criar primeira meta</button>`}
  </section>
  <section class="card"><div class="row"><h3>🔔 Lembretes</h3><span class="tag">${reminders.filter(r=>!r.done).length} pendentes</span></div>${pending.length?`<div class="stack">${pending.map(r=>`<div class="list-item"><div><b>${esc(r.title)}</b><div class="muted">${fmtDate(r.date)}${r.time?" • "+esc(r.time):""}</div></div><span class="tag warning">Pendente</span></div>`).join("")}</div>`:`<div class="empty">Nenhum lembrete pendente.</div>`}<button class="btn" id="homeReminders" style="margin-top:12px">Abrir lembretes</button></section>
  <section class="card"><h3>📊 Resumo rápido</h3><div class="stack"><div class="row"><span class="muted">Ganhos nesta semana</span><b>${money(earnings.filter(e=>getCurrentWeekDays().includes(e.date)).reduce((s,e)=>s+Number(e.amount||0),0))}</b></div><div class="row"><span class="muted">Metas cadastradas</span><b>${goals.length}</b></div><div class="row"><span class="muted">Lembretes concluídos</span><b>${reminders.filter(r=>r.done).length}</b></div></div></section>
 </div>`;
}

function remindersView(){
 return `<div class="section-title"><h2>Lembretes</h2><button class="btn primary" id="newReminder">+ Novo</button></div><div class="stack">${reminders.sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(r=>`<div class="list-item ${r.done?"done":""}"><div><b>${esc(r.title)}</b><div class="muted">${esc(r.category||"Geral")} • ${fmtDate(r.date)}${r.time?" • "+esc(r.time):""}</div>${r.notes?`<div class="muted">${esc(r.notes)}</div>`:""}</div><div class="actions"><button class="btn" data-reminder-done="${r.id}">${r.done?"↩":"✓"}</button><button class="btn" data-reminder-edit="${r.id}">✎</button><button class="btn danger" data-reminder-delete="${r.id}">×</button></div></div>`).join("")||`<div class="empty">Você ainda não cadastrou lembretes.</div>`}</div>`;
}

function goalsView(){
 return `<div class="section-title"><h2>Metas</h2><button class="btn primary" id="newGoal">+ Nova meta</button></div>
 <div class="stack">${goals.map(g=>{const amount=weekEarnings(g);const p=goalProgress(g);return `<section class="card full"><div class="row"><h3>🎯 ${esc(g.name)}</h3><span class="tag">${g.active===false?"Inativa":"Ativa"}</span></div><div class="row"><div><div class="metric">${money(amount)}</div><div class="muted">de ${money(g.target)} na semana</div></div><div style="text-align:right"><div class="metric">${p.toFixed(1)}%</div><div class="muted">concluído</div></div></div><div class="progress"><div style="width:${p}%"></div></div><div class="row"><span class="muted">Diária: ${money(g.dailyTarget)}</span><span class="muted">Hoje: ${money(dayAmount(g))}</span></div><div class="daily-grid">${getCurrentWeekDays().map((d,i)=>{const val=dayAmount(g,d);const hit=val>=g.dailyTarget;return `<div class="day-box ${hit?"hit":""} ${d===todayISO()?"today":""}"><b>${["S","T","Q","Q","S","S","D"][i]}</b><br>${money(val).replace("R$","").trim()}${hit?" ✓":""}</div>`}).join("")}</div><div class="actions" style="margin-top:15px"><button class="btn primary" data-goal-earning="${g.id}">+ Registrar ganho</button><button class="btn" data-goal-edit="${g.id}">Editar</button><button class="btn danger" data-goal-delete="${g.id}">Excluir</button></div></section>`}).join("")||`<div class="empty">Nenhuma meta cadastrada. Crie sua primeira meta semanal.</div>`}</div>`;
}

function financeView(){return `<div class="section-title"><h2>Finanças</h2></div><div class="card full"><h3>Resumo</h3><p class="muted">O módulo financeiro completo será conectado às receitas e despesas em uma próxima etapa. Os registros de ganhos das metas já ficam armazenados localmente.</p><div class="metric">${money(earnings.reduce((s,e)=>s+Number(e.amount||0),0))}</div><div class="muted">Total de ganhos registrados</div></div>`}
function habitsView(){return `<div class="section-title"><h2>Hábitos e GYM</h2></div><div class="card full"><div class="empty">Módulo preparado para a próxima etapa. A estrutura local já reserva espaço para hábitos e treinos.</div></div>`}

function reminderForm(existing={}){
 const el=modal(`<div class="row"><h2>${existing.id?"Editar":"Novo"} lembrete</h2><button class="btn" id="closeModal">×</button></div><form id="reminderForm" class="stack"><div class="form-grid"><div class="field full"><label>Título *</label><input name="title" required value="${esc(existing.title||"")}" placeholder="Ex.: Pagar internet"></div><div class="field"><label>Categoria</label><select name="category"><option ${existing.category==="Conta"?"selected":""}>Conta</option><option ${existing.category==="Trabalho"?"selected":""}>Trabalho</option><option ${existing.category==="Saúde"?"selected":""}>Saúde</option><option ${existing.category==="Pessoal"?"selected":""}>Pessoal</option><option ${!existing.category||existing.category==="Geral"?"selected":""}>Geral</option></select></div><div class="field"><label>Data *</label><input type="date" name="date" required value="${existing.date||todayISO()}"></div><div class="field"><label>Horário</label><input type="time" name="time" value="${existing.time||""}"></div><div class="field"><label>Repetição</label><select name="repeat"><option value="none">Não repetir</option><option value="daily">Diário</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select></div><div class="field full"><label>Observação</label><textarea name="notes" rows="3" placeholder="Detalhes opcionais">${esc(existing.notes||"")}</textarea></div></div><button class="btn primary" type="submit">Salvar lembrete</button></form>`);
 el.querySelector("#closeModal").onclick=()=>closeModal(el);
 el.querySelector("#reminderForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const data={...(existing.id?existing:{}),title:f.get("title"),category:f.get("category"),date:f.get("date"),time:f.get("time"),repeat:f.get("repeat"),notes:f.get("notes"),done:existing.done||false};await put("reminders",data);closeModal(el);await loadData();render();toast("Lembrete salvo")};
}

function goalForm(existing={}){
 const el=modal(`<div class="row"><h2>${existing.id?"Editar":"Nova"} meta</h2><button class="btn" id="closeModal">×</button></div><form id="goalForm" class="stack"><div class="form-grid"><div class="field full"><label>Nome da meta *</label><input name="name" required value="${esc(existing.name||"Meta Uber e Entregas")}"></div><div class="field"><label>Valor semanal (R$) *</label><input name="target" type="number" min="1" step=".01" required value="${existing.target||700}"></div><div class="field"><label>Divisão diária</label><input name="days" type="number" min="1" max="7" value="7" readonly></div><div class="field"><label>Fonte de renda</label><select name="source"><option value="all" ${existing.source==="all"||!existing.source?"selected":""}>Uber + Entregas</option><option value="Uber" ${existing.source==="Uber"?"selected":""}>Uber</option><option value="Entregas" ${existing.source==="Entregas"?"selected":""}>Entregas</option></select></div><div class="field"><label>Meta diária calculada</label><input name="dailyTarget" readonly value="${Number(existing.dailyTarget||existing.target/7||100).toFixed(2)}"></div></div><p class="muted">A meta será dividida automaticamente por 7 dias. Você poderá registrar ganhos parciais e acompanhar cada dia da semana.</p><button class="btn primary" type="submit">Salvar meta</button></form>`);
 el.querySelector("#closeModal").onclick=()=>closeModal(el);
 const targetInput=el.querySelector('[name="target"]');const dailyInput=el.querySelector('[name="dailyTarget"]');
 targetInput.addEventListener("input",()=>dailyInput.value=(Number(targetInput.value||0)/7).toFixed(2));
 el.querySelector("#goalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const target=Number(f.get("target"));const data={...(existing.id?existing:{}),name:f.get("name"),target,dailyTarget:target/7,source:f.get("source"),active:true,updatedAt:new Date().toISOString()};await put("goals",data);closeModal(el);await loadData();render();toast("Meta salva")};
}

function earningForm(goalId){
 const goal=goals.find(g=>g.id===Number(goalId))||activeGoal();
 const el=modal(`<div class="row"><h2>Registrar ganho</h2><button class="btn" id="closeModal">×</button></div><form id="earningForm" class="stack"><div class="form-grid"><div class="field"><label>Valor (R$) *</label><input name="amount" type="number" min=".01" step=".01" required placeholder="100"></div><div class="field"><label>Data *</label><input name="date" type="date" required value="${todayISO()}"></div><div class="field"><label>Origem</label><select name="source"><option>Uber</option><option>Entregas</option></select></div><div class="field"><label>Observação</label><input name="notes" placeholder="Ex.: turno da noite"></div></div><p class="muted">Meta diária atual: ${goal?money(goal.dailyTarget):"—"}</p><button class="btn primary" type="submit">Registrar ganho</button></form>`);
 el.querySelector("#closeModal").onclick=()=>closeModal(el);
 el.querySelector("#earningForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await put("earnings",{amount:Number(f.get("amount")),date:f.get("date"),source:f.get("source"),notes:f.get("notes"),goalId:goal?.id||null,createdAt:new Date().toISOString()});closeModal(el);await loadData();render();toast("Ganho registrado")};
}

async function loadData(){reminders=await all("reminders");goals=await all("goals");earnings=await all("earnings")}
function bind(){
 document.querySelector("#themeBtn").onclick=toggleTheme;
 document.querySelector("#updateBtn").onclick=()=>toast("Assistente Zyn v"+APP_VERSION);
 document.querySelectorAll("[data-view]").forEach(btn=>btn.onclick=()=>setView(btn.dataset.view));
 const content=document.querySelector("#content");
 if(currentView==="home")content.innerHTML=homeView();
 if(currentView==="reminders")content.innerHTML=remindersView();
 if(currentView==="goals")content.innerHTML=goalsView();
 if(currentView==="finance")content.innerHTML=financeView();
 if(currentView==="habits")content.innerHTML=habitsView();
 document.querySelector("#newReminder")?.addEventListener("click",()=>reminderForm());
 document.querySelector("#newGoal")?.addEventListener("click",()=>goalForm());
 document.querySelector("#createGoal")?.addEventListener("click",()=>goalForm({target:700,dailyTarget:100,name:"Meta Uber e Entregas",source:"all"}));
 document.querySelector("#quickEarning")?.addEventListener("click",()=>earningForm(activeGoal()?.id));
 document.querySelector("#openGoals")?.addEventListener("click",()=>setView("goals"));
 document.querySelector("#homeReminders")?.addEventListener("click",()=>setView("reminders"));
 document.querySelectorAll("[data-goal-earning]").forEach(b=>b.onclick=()=>earningForm(b.dataset.goalEarning));
 document.querySelectorAll("[data-goal-edit]").forEach(b=>b.onclick=()=>goalForm(goals.find(g=>g.id===Number(b.dataset.goalEdit))));
 document.querySelectorAll("[data-goal-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Excluir esta meta?")){await remove("goals",Number(b.dataset.goalDelete));await loadData();render();toast("Meta excluída")}}); 
 document.querySelectorAll("[data-reminder-edit]").forEach(b=>b.onclick=()=>reminderForm(reminders.find(r=>r.id===Number(b.dataset.reminderEdit))));
 document.querySelectorAll("[data-reminder-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Excluir este lembrete?")){await remove("reminders",Number(b.dataset.reminderDelete));await loadData();render();toast("Lembrete excluído")}}); 
 document.querySelectorAll("[data-reminder-done]").forEach(b=>b.onclick=async()=>{const r=reminders.find(r=>r.id===Number(b.dataset.reminderDone));if(r){r.done=!r.done;await put("reminders",r);await loadData();render()}});
}
function render(){app.innerHTML=layout();bind()}
(async()=>{await openDB();await loadData();if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});render()})();
