const APP_VERSION = "1.5.1";
const DB_NAME = "assistente-zyn-db";
const DB_VERSION = 5;
let db;
let currentView = "home";
let theme = localStorage.getItem("zyn-theme") || "light";
let reminders = [];
let goals = [];
let earnings = [];
let gymProfile = null, gymPlans = [], gymSessions = [];
let foodProfile = null, mealPlans = [], shoppingItems = [];
let financeProfile = null, financeAccounts = [], financeTransactions = [], financeBills = [], financeGoals = [];

document.body.className = theme;
const app = document.querySelector("#app");

function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const database=request.result;
      ["reminders","events","financialAccounts","financialTransactions","financialGoals","workoutPlans","workoutSessions","habits","habitLogs","settings","goals","earnings","gymProfile","gymPlans","gymSessions","foodProfile","mealPlans","shoppingItems","financeProfile","financeAccounts","financeTransactions","financeBills","financeGoals"].forEach(store=>{
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


const DEFAULT_GYM=[
 {day:1,label:"Segunda",type:"gym",workout:"Peito + Tríceps"},
 {day:2,label:"Terça",type:"gym",workout:"Costas + Bíceps"},
 {day:3,label:"Quarta",type:"rest",workout:"Recuperação"},
 {day:4,label:"Quinta",type:"gym",workout:"Pernas"},
 {day:5,label:"Sexta",type:"gym",workout:"Ombros + Abdômen"},
 {day:6,label:"Sábado",type:"optional",workout:"Cardio / treino opcional"},
 {day:0,label:"Domingo",type:"rest",workout:"Descanso"}
];
const GYM_EX={
"Peito + Tríceps":[["Supino máquina","Peito e tríceps","3","10–12","60–90s"],["Supino inclinado máquina","Peito superior","3","10–12","60–90s"],["Crucifixo máquina","Peitoral","3","12","60s"],["Tríceps na polia","Tríceps","3","10–12","60–90s"]],
"Costas + Bíceps":[["Puxada frontal","Costas","3","10–12","60–90s"],["Remada máquina","Costas","3","10–12","60–90s"],["Pulldown","Costas","3","12","60s"],["Rosca bíceps máquina/polia","Bíceps","3","10–12","60s"]],
"Pernas":[["Leg press","Quadríceps e glúteos","3","10–12","90s"],["Cadeira extensora","Quadríceps","3","12","60–90s"],["Mesa flexora","Posterior de coxa","3","12","60–90s"],["Panturrilha máquina","Panturrilhas","3","12–15","60s"]],
"Ombros + Abdômen":[["Desenvolvimento máquina","Ombros","3","10–12","60–90s"],["Elevação lateral máquina/polia","Ombros","3","12","60s"],["Face pull/polia","Ombros posteriores","3","12–15","60s"],["Abdominal máquina","Abdômen","3","12–15","60s"]],
"Cardio / treino opcional":[["Caminhada","Cardio leve","1","20–40 min","—"],["Bicicleta ergométrica","Cardio","1","20–30 min","—"]]
};
function gymWeek(){return DEFAULT_GYM.map(d=>gymPlans.find(x=>x.day===d.day)||d)}
function gymToday(){const d=new Date().getDay();return gymWeek().find(x=>x.day===d)||DEFAULT_GYM[6]}
function gymCount(){const ds=getCurrentWeekDays();return gymSessions.filter(x=>ds.includes(x.date)).length}
function gymGoal(){return gymProfile?.goal==="mass"?"Ganhar massa":gymProfile?.goal==="maintain"?"Manter":"Perder gordura"}

function gymView(){
 const t=gymToday(), w=gymWeek(), c=gymCount();
 return `<div class="section-title"><h2>🏋️ Meu GYM</h2><button class="btn primary" id="gymProfile">⚙️ Meu perfil</button></div>
 <section class="card full gym-hero"><div class="row"><div><div class="eyebrow">TREINO DE HOJE</div><h2>${esc(t.workout)}</h2><div class="muted">${t.type==="rest"?"Recuperação":t.type==="optional"?"Sessão opcional":"Treino principal"} • Objetivo: ${gymGoal()}</div></div><span class="tag">${t.type==="rest"?"Descanso":"Hoje"}</span></div>
 <div class="actions" style="margin-top:15px">${t.type==="rest"?'<span class="muted">Hoje é recuperação. Uma caminhada leve pode ser feita se desejar.</span>':`<button class="btn primary" id="startGym">▶ Iniciar treino</button>`}<button class="btn" id="beachWalk">🌊 Caminhada/corrida</button></div></section>
 <div class="grid"><section class="card"><div class="row"><h3>📅 Minha semana</h3><button class="btn" id="editWeek">Editar</button></div><div class="stack">${w.map(d=>`<div class="list-item"><div><b>${d.label}</b><div class="muted">${esc(d.workout)}</div></div><span class="tag">${d.type==="gym"?"Treino":d.type==="optional"?"Opcional":"Descanso"}</span></div>`).join("")}</div></section>
 <section class="card"><h3>📊 Progresso</h3><div class="metric">${c}</div><div class="muted">sessões nesta semana</div><div class="progress"><div style="width:${Math.min(100,c/4*100)}%"></div></div><div class="row"><span class="muted">Objetivo</span><b>4–5 dias</b></div><div class="row" style="margin-top:10px"><span class="muted">Nível</span><b>${esc(gymProfile?.level||"Iniciante")}</b></div></section></div>`;
}
function gymWorkout(){
 const p=gymToday(), ex=GYM_EX[p.workout]||GYM_EX["Cardio / treino opcional"];
 return `<div class="section-title"><h2>${esc(p.workout)}</h2><button class="btn" id="backGym">← GYM</button></div>
 <section class="card full"><h3>Treino de hoje</h3><p class="muted">Comece com carga confortável e priorize aprender a técnica. O Zyn vai guardar seu histórico.</p></section>
 <div class="stack">${ex.map((e,i)=>`<section class="card full"><h3>${i+1}. ${esc(e[0])}</h3><div class="muted">${esc(e[1])} • ${e[2]} séries • ${e[3]} repetições • ${e[4]} descanso</div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Carga (kg)</label><input data-load="${i}" type="number" min="0" step=".5"></div><div class="field"><label>Repetições</label><input data-reps="${i}" type="number" min="0"></div></div><button class="btn" data-done="${i}" style="margin-top:10px">☑ Marcar concluído</button></section>`).join("")}
 <button class="btn primary" id="finishGym" style="width:100%">🏁 Finalizar treino</button></div>`;
}
function gymProfileForm(){
 const p=gymProfile||{}, el=modal(`<div class="row"><h2>Meu perfil GYM</h2><button class="btn" id="close">×</button></div><form id="gp" class="stack"><div class="form-grid">
 <div class="field"><label>Objetivo</label><select name="goal"><option value="cut" ${p.goal==="cut"||!p.goal?"selected":""}>Perder gordura</option><option value="mass" ${p.goal==="mass"?"selected":""}>Ganhar massa</option><option value="maintain" ${p.goal==="maintain"?"selected":""}>Manter</option></select></div>
 <div class="field"><label>Nível</label><select name="level"><option ${!p.level||p.level==="Iniciante"?"selected":""}>Iniciante</option><option ${p.level==="Intermediário"?"selected":""}>Intermediário</option><option ${p.level==="Avançado"?"selected":""}>Avançado</option></select></div>
 <div class="field"><label>Treinos/semana</label><select name="days"><option>4</option><option selected>5</option></select></div><div class="field"><label>Tempo</label><select name="duration"><option selected>Variável</option><option>30 min</option><option>45 min</option><option>60 min</option><option>90 min</option></select></div>
 <div class="field full"><label>Atividade complementar</label><input name="extra" value="${esc(p.extra||"Caminhada/corrida na praia — segunda ou terça à noite")}"></div></div>
 <button class="btn primary">Salvar perfil</button></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#gp").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);gymProfile={id:1,goal:f.get("goal"),level:f.get("level"),days:Number(f.get("days")),duration:f.get("duration"),extra:f.get("extra")};await put("gymProfile",gymProfile);if(!gymPlans.length)for(const d of DEFAULT_GYM)await put("gymPlans",d);await loadData();closeModal(el);render();toast("Perfil GYM salvo")};
}
function gymWeekForm(){
 const w=gymWeek(),el=modal(`<div class="row"><h2>Editar minha semana</h2><button class="btn" id="close">×</button></div><form id="gw" class="stack">${w.map(d=>`<div class="field"><label>${d.label}</label><select name="t${d.day}"><option value="gym">Treino</option><option value="optional">Opcional</option><option value="rest">Descanso</option></select><input name="w${d.day}" value="${esc(d.workout)}" style="margin-top:6px"></div>`).join("")}<button class="btn primary">Salvar semana</button></form>`);
 w.forEach(d=>el.querySelector(`[name="t${d.day}"]`).value=d.type);el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#gw").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);for(const d of w)await put("gymPlans",{day:d.day,label:d.label,type:f.get("t"+d.day),workout:f.get("w"+d.day)});await loadData();closeModal(el);render();toast("Semana atualizada")};
}
function beachForm(){
 const el=modal(`<div class="row"><h2>🌊 Caminhada / Corrida</h2><button class="btn" id="close">×</button></div><form id="bw" class="stack"><div class="form-grid"><div class="field"><label>Atividade</label><select name="type"><option>Caminhada na praia</option><option>Corrida na praia</option></select></div><div class="field"><label>Data</label><input name="date" type="date" value="${todayISO()}"></div><div class="field"><label>Duração (min)</label><input name="duration" type="number" min="1" value="30"></div></div><button class="btn primary">Registrar</button></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);el.querySelector("#bw").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await put("gymSessions",{date:f.get("date"),type:f.get("type"),duration:Number(f.get("duration")),workout:"Cardio"});closeModal(el);await loadData();render();toast("Atividade registrada")};
}

const FOOD_DAYS=["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"];
const FOOD_DEFAULT=[
 ["Café da manhã","Ovos + banana + aveia","Econômico"],
 ["Almoço","Arroz + feijão + frango + salada","Completo"],
 ["Lanche","Fruta + aveia ou pão + ovos","Prático"],
 ["Jantar","Arroz + feijão + proteína + legumes","Econômico"]
];
function foodView(){
 const p=foodProfile||{};
 return `<div class="section-title"><h2>🍽️ Alimentação</h2><button class="btn primary" id="foodProfile">⚙️ Meu perfil</button></div>
 <section class="card full food-hero"><div class="eyebrow">MINHA ALIMENTAÇÃO</div><h2>Comer melhor sem complicar</h2><p class="muted">3–4 refeições por dia, com foco em economia, praticidade e variedade.</p><div class="row"><span class="tag">Objetivo: perder gordura</span><span class="tag">Referência: ${money(p.budget||125)}/semana</span></div></section>
 <div class="grid"><section class="card"><h3>📋 Meu perfil</h3><div class="stack"><div class="row"><span class="muted">Refeições</span><b>${p.meals||"3–4"}</b></div><div class="row"><span class="muted">Cozinha</span><b>${p.cooking||"Sim + prático"}</b></div><div class="row"><span class="muted">Evitar</span><b>Coco</b></div></div></section>
 <section class="card"><h3>💡 Ideias</h3><div class="stack">${FOOD_DEFAULT.map(x=>`<div class="list-item"><div><b>${x[0]}</b><div class="muted">${x[1]}</div></div><span class="tag">${x[2]}</span></div>`).join("")}</div></section></div>
 <div class="section-title"><h2>📅 Semana</h2><button class="btn" id="generateMeals">Gerar semana</button></div>
 <div class="stack">${FOOD_DAYS.map(d=>`<section class="card full"><h3>${d}</h3><div class="stack">${(mealPlans.filter(x=>x.day===d).length?mealPlans.filter(x=>x.day===d):FOOD_DEFAULT.map((x,i)=>({slot:x[0],items:x[1],tag:x[2]}))).map(m=>`<div class="list-item"><div><b>${m.slot}</b><div class="muted">${m.items}</div></div><span class="tag">${m.tag}</span></div>`).join("")}</div></section>`).join("")}</div>
 <div class="section-title"><h2>🛒 Lista de compras</h2><button class="btn primary" id="newShopping">+ Item</button></div>
 <section class="card full"><div class="stack">${shoppingItems.map(x=>`<div class="list-item"><b>${esc(x.item)}</b><button class="btn" data-shop="${x.id}">${x.done?"✓ Comprado":"Marcar"}</button></div>`).join("")||'<div class="empty">Lista vazia. Gere a semana para criar uma lista inicial.</div>'}</div></section>`;
}
function foodProfileForm(){
 const p=foodProfile||{},el=modal(`<div class="row"><h2>Meu perfil alimentar</h2><button class="btn" id="close">×</button></div><form id="foodForm" class="stack"><div class="form-grid">
 <div class="field"><label>Refeições por dia</label><select name="meals"><option>3</option><option selected>3–4</option><option>4</option></select></div>
 <div class="field"><label>Orçamento semanal de referência</label><input name="budget" type="number" min="0" step="10" value="${p.budget||125}"></div>
 <div class="field"><label>Estilo</label><select name="cooking"><option selected>Sim + prático</option><option>Principalmente cozinhar</option><option>Principalmente prático</option></select></div>
 <div class="field"><label>Alimentos que gosto</label><input name="likes" value="${esc(p.likes||"")}" placeholder="Ex.: frango, ovos, arroz"></div>
 <div class="field full"><label>Alimentos que não quero</label><input name="avoid" value="${esc(p.avoid||"Coco e derivados")}"></div>
 <div class="field full"><label>Rotina</label><textarea name="routine" rows="3">${esc(p.routine||"Trabalho 7h30–16h20 e trabalho noturno em parte da semana a partir das 19h.")}</textarea></div>
 </div><p class="muted">O orçamento é uma referência e pode variar conforme compras da casa e preços locais.</p><button class="btn primary">Salvar perfil</button></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#foodForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);foodProfile={id:1,meals:f.get("meals"),budget:Number(f.get("budget")),cooking:f.get("cooking"),likes:f.get("likes"),avoid:f.get("avoid"),routine:f.get("routine")};await put("foodProfile",foodProfile);await loadData();closeModal(el);render();toast("Perfil alimentar salvo")};
}
async function generateMeals(){
 for(const day of FOOD_DAYS) for(const x of FOOD_DEFAULT) await put("mealPlans",{day,slot:x[0],items:x[1],tag:x[2]});
 for(const item of ["Arroz","Feijão","Ovos","Frango","Banana","Aveia","Verduras/legumes","Frutas","Pão","Iogurte natural"]) if(!shoppingItems.some(x=>x.item===item)) await put("shoppingItems",{item,done:false});
 await loadData();render();toast("Planejamento semanal criado");
}
function shoppingForm(){
 const el=modal(`<div class="row"><h2>Adicionar item</h2><button class="btn" id="close">×</button></div><form id="shopForm" class="stack"><div class="field"><label>Item</label><input name="item" required placeholder="Ex.: tomate"></div><button class="btn primary">Adicionar</button></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#shopForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await put("shoppingItems",{item:f.get("item"),done:false});closeModal(el);await loadData();render();toast("Item adicionado")};
}
function layout(){
 return `<div class="shell">
  <header class="topbar"><div class="brand"><div class="brand-mark">Z</div><div><div class="eyebrow">ASSISTENTE PESSOAL</div><div class="title">Assistente Zyn</div></div></div><div class="actions"><button class="icon-btn" id="themeBtn" title="Alternar tema">◐</button><button class="icon-btn" id="updateBtn" title="Ver versão">↻</button></div></header>
  <main id="content"></main>
 </div>
 <nav class="nav"><div class="nav-inner">
  <button data-view="home" class="${currentView==="home"?"active":""}">⌂<br>Início</button>
  <button data-view="reminders" class="${currentView==="reminders"?"active":""}">✓<br>Lembretes</button>
  <button data-view="goals" class="${currentView==="goals"?"active":""}">◎<br>Metas</button>
  <button data-view="gym" class="${currentView==="gym"?"active":""}">🏋️<br>GYM</button>
  <button data-view="food" class="${currentView==="food"?"active":""}">🍽️<br>Comida</button>
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


function monthKey(date=todayISO()){ return String(date).slice(0,7); }
function financeMonthLabel(key=monthKey()){ const [y,m]=key.split("-"); return new Date(Number(y),Number(m)-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"}); }
function financeMonthData(key=monthKey()){
 const tx=financeTransactions.filter(x=>String(x.date||"").slice(0,7)===key);
 const income=tx.filter(x=>x.type==="income").reduce((a,x)=>a+Number(x.amount||0),0);
 const expense=tx.filter(x=>x.type==="expense").reduce((a,x)=>a+Number(x.amount||0),0);
 const bills=financeBills.filter(x=>x.active!==false && String(x.dueDate||"").slice(0,7)===key);
 const billsTotal=bills.reduce((a,x)=>a+Number(x.amount||0),0);
 const goal=financeGoals.find(x=>x.active!==false);
 const saved=tx.filter(x=>x.type==="saving").reduce((a,x)=>a+Number(x.amount||0),0);
 return {tx,income,expense,bills,billsTotal,goal,saved,available:income-expense-billsTotal-saved};
}
function financeCategoryTotals(key=monthKey()){
 const out={};
 financeTransactions.filter(x=>x.type==="expense" && String(x.date||"").slice(0,7)===key).forEach(x=>{out[x.category||"Outros"]=(out[x.category||"Outros"]||0)+Number(x.amount||0)});
 return Object.entries(out).sort((a,b)=>b[1]-a[1]);
}
function financeView(){
 const key=financeProfile?.selectedMonth||monthKey(), d=financeMonthData(key), cats=financeCategoryTotals(key);
 const plannedIncome=Number(financeProfile?.monthlyIncome||0);
 const fixed=financeBills.filter(x=>x.active!==false).reduce((a,x)=>a+Number(x.amount||0),0);
 const limit=Math.max(0,(plannedIncome||d.income)-fixed-(financeProfile?.monthlySavingsTarget||0));
 return `<div class="section-title"><h2>💰 Finanças</h2><div class="actions"><button class="btn" id="financeProfileBtn">⚙️ Planejamento</button><button class="btn primary" id="financeAdd">+ Lançamento</button></div></div>
 <section class="hero"><div class="eyebrow" style="color:#e8e2ff">CONTROLE FINANCEIRO</div><h2>Faça o dinheiro sobrar.</h2><p>O Zyn separa o que entrou, o que já está comprometido e o que ainda pode ser gasto.</p></section>
 <section class="card full"><div class="row"><div><div class="eyebrow">MÊS</div><h3 style="text-transform:capitalize">${esc(financeMonthLabel(key))}</h3></div><input id="financeMonth" type="month" value="${key}" style="max-width:170px"></div></section>
 <div class="grid">
  <section class="card"><div class="muted">Entradas</div><div class="metric">${money(d.income)}</div><div class="muted">Registradas no mês</div></section>
  <section class="card"><div class="muted">Despesas</div><div class="metric">${money(d.expense)}</div><div class="muted">Gastos lançados</div></section>
  <section class="card"><div class="muted">Contas fixas</div><div class="metric">${money(d.billsTotal)}</div><div class="muted">${d.bills.length} conta(s) no mês</div></section>
  <section class="card"><div class="muted">Pode sobrar</div><div class="metric">${money(Math.max(0,d.available))}</div><div class="muted">${d.available>=0?"Dentro do planejamento":"Orçamento estourado"}</div></section>
 </div>
 <section class="card full"><div class="row"><h3>🎯 Plano para sobrar dinheiro</h3><span class="tag">${financeProfile?.monthlySavingsTarget?money(financeProfile.monthlySavingsTarget)+" alvo":"Defina um alvo"}</span></div>
  <div class="row"><div><div class="metric">${money(d.saved)}</div><div class="muted">guardado no mês</div></div><div style="text-align:right"><div class="metric">${money(Math.max(0,(financeProfile?.monthlySavingsTarget||0)-d.saved))}</div><div class="muted">faltam para a meta</div></div></div>
  <div class="progress"><div style="width:${financeProfile?.monthlySavingsTarget?Math.min(100,d.saved/financeProfile.monthlySavingsTarget*100):0}%"></div></div>
  <p class="muted" style="margin-top:12px">Limite sugerido de gastos variáveis: <b>${money(limit)}</b> no mês, antes dos lançamentos variáveis.</p>
 </section>
 <section class="card full"><div class="row"><h3>📌 Contas fixas</h3><button class="btn" id="financeBill">+ Conta</button></div>
  <div class="stack">${financeBills.filter(x=>x.active!==false).map(x=>`<div class="list-item"><div><b>${esc(x.name)}</b><div class="muted">Vencimento: ${fmtDate(x.dueDate)}</div></div><b>${money(x.amount)}</b></div>`).join("")||`<div class="empty">Cadastre aluguel, internet, telefone, parcelas e outras contas recorrentes.</div>`}</div>
 </section>
 <section class="card full"><div class="row"><h3>📒 Últimos lançamentos</h3><span class="tag">${d.tx.length} no mês</span></div>
  <div class="stack">${d.tx.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,12).map(x=>`<div class="list-item"><div><b>${esc(x.description)}</b><div class="muted">${esc(x.category||"Outros")} • ${fmtDate(x.date)}${x.account?" • "+esc(x.account):""}</div></div><div style="text-align:right"><b class="${x.type==="expense"?"danger-text":""}">${x.type==="expense"?"−":"+"}${money(x.amount)}</b></div></div>`).join("")||`<div class="empty">Nenhum lançamento neste mês.</div>`}</div>
 </section>
 <section class="card full"><h3>📊 Onde o dinheiro está indo</h3>
  ${cats.length?`<div class="stack">${cats.slice(0,8).map(([c,v])=>`<div><div class="row"><span>${esc(c)}</span><b>${money(v)}</b></div><div class="progress"><div style="width:${d.expense?Math.min(100,v/d.expense*100):0}%"></div></div></div>`).join("")}</div>`:`<div class="empty">Registre despesas para o Zyn mostrar os maiores pontos de consumo.</div>`}
 </section>
 </div>`;
}
function financeProfileForm(){
 const p=financeProfile||{};
 const el=modal(`<div class="row"><h2>Planejamento financeiro</h2><button class="btn" id="close">×</button></div>
 <form id="financeProfileForm" class="stack"><div class="form-grid">
 <div class="field full"><label>Renda fixa mensal (R$)</label><input name="income" type="number" min="0" step=".01" value="${p.monthlyIncome||""}" placeholder="Ex.: salário"></div>
 <div class="field"><label>Meta para guardar por mês</label><input name="saving" type="number" min="0" step=".01" value="${p.monthlySavingsTarget||0}"></div>
 <div class="field"><label>Limite pessoal de cartão</label><input name="cardLimit" type="number" min="0" step=".01" value="${p.cardLimit||0}"></div>
 <div class="field full"><label>Regra pessoal</label><input name="rule" value="${esc(p.rule||"Primeiro separar o que preciso pagar, depois decidir o que posso gastar.")}"></div>
 </div><p class="muted">A renda de Uber e Entregas continua sendo registrada pelas Metas e também pode ser lançada aqui como entrada. O objetivo é enxergar tudo em um único mês.</p>
 <button class="btn primary">Salvar planejamento</button></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#financeProfileForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);financeProfile={id:1,monthlyIncome:Number(f.get("income")||0),monthlySavingsTarget:Number(f.get("saving")||0),cardLimit:Number(f.get("cardLimit")||0),rule:f.get("rule"),selectedMonth:financeProfile?.selectedMonth||monthKey()};await put("financeProfile",financeProfile);closeModal(el);await loadData();render();toast("Planejamento salvo")};
}
function financeTransactionForm(){
 const el=modal(`<div class="row"><h2>Novo lançamento</h2><button class="btn" id="close">×</button></div>
 <form id="financeTxForm" class="stack"><div class="form-grid">
 <div class="field"><label>Tipo</label><select name="type"><option value="expense">Despesa</option><option value="income">Entrada</option><option value="saving">Guardado</option></select></div>
 <div class="field"><label>Valor (R$) *</label><input name="amount" type="number" min=".01" step=".01" required></div>
 <div class="field full"><label>Descrição *</label><input name="description" required placeholder="Ex.: supermercado"></div>
 <div class="field"><label>Data</label><input name="date" type="date" value="${todayISO()}"></div>
 <div class="field"><label>Categoria</label><select name="category"><option>Alimentação</option><option>Transporte</option><option>Moradia</option><option>Contas</option><option>Saúde</option><option>Lazer</option><option>Trabalho</option><option>Compras</option><option>Cartão</option><option>Outros</option></select></div>
 <div class="field"><label>Forma/conta</label><select name="account"><option>Dinheiro</option><option>Pix</option><option>Débito</option><option>Crédito</option><option>Conta bancária</option></select></div>
 <div class="field full"><label>Observação</label><input name="notes" placeholder="Opcional"></div>
 </div><button class="btn primary">Salvar lançamento</button></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#financeTxForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await put("financeTransactions",{type:f.get("type"),amount:Number(f.get("amount")),description:f.get("description"),date:f.get("date"),category:f.get("category"),account:f.get("account"),notes:f.get("notes"),createdAt:new Date().toISOString()});closeModal(el);await loadData();render();toast("Lançamento salvo")};
}
function financeBillForm(){
 const el=modal(`<div class="row"><h2>Nova conta fixa</h2><button class="btn" id="close">×</button></div>
 <form id="financeBillForm" class="stack"><div class="form-grid">
 <div class="field full"><label>Nome *</label><input name="name" required placeholder="Ex.: Internet"></div>
 <div class="field"><label>Valor (R$) *</label><input name="amount" type="number" min="0" step=".01" required></div>
 <div class="field"><label>Vencimento</label><input name="dueDate" type="date" value="${todayISO()}"></div>
 </div><p class="muted">Na primeira versão, cadastre a conta para o mês correspondente. Depois vamos adicionar recorrência automática.</p><button class="btn primary">Salvar conta</button></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#financeBillForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await put("financeBills",{name:f.get("name"),amount:Number(f.get("amount")),dueDate:f.get("dueDate"),active:true});closeModal(el);await loadData();render();toast("Conta cadastrada")};
}

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

async function loadData(){reminders=await all("reminders");goals=await all("goals");earnings=await all("earnings");gymProfile=(await all("gymProfile"))[0]||null;gymPlans=await all("gymPlans");gymSessions=await all("gymSessions");foodProfile=(await all("foodProfile"))[0]||null;mealPlans=await all("mealPlans");shoppingItems=await all("shoppingItems");financeProfile=(await all("financeProfile"))[0]||null;financeAccounts=await all("financeAccounts");financeTransactions=await all("financeTransactions");financeBills=await all("financeBills");financeGoals=await all("financeGoals")}
function bind(){
 document.querySelector("#themeBtn").onclick=toggleTheme;
 document.querySelector("#updateBtn").onclick=()=>toast("Assistente Zyn v"+APP_VERSION);
 document.querySelectorAll("[data-view]").forEach(btn=>btn.onclick=()=>setView(btn.dataset.view));
 const content=document.querySelector("#content");
 if(currentView==="home")content.innerHTML=homeView();
 if(currentView==="reminders")content.innerHTML=remindersView();
 if(currentView==="goals")content.innerHTML=goalsView();
 if(currentView==="gym")content.innerHTML=gymView();
 if(currentView==="gymWorkout")content.innerHTML=gymWorkout();
 if(currentView==="food")content.innerHTML=foodView();
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
 document.querySelector("#gymProfile")?.addEventListener("click",gymProfileForm);
 document.querySelector("#editWeek")?.addEventListener("click",gymWeekForm);
 document.querySelector("#startGym")?.addEventListener("click",()=>{currentView="gymWorkout";render()});
 document.querySelector("#backGym")?.addEventListener("click",()=>{currentView="gym";render()});
 document.querySelector("#beachWalk")?.addEventListener("click",beachForm);
 document.querySelector("#finishGym")?.addEventListener("click",async()=>{const p=gymToday(), ex=GYM_EX[p.workout]||[];const records=ex.map((x,i)=>({exercise:x[0],load:Number(document.querySelector(`[data-load="${i}"]`)?.value||0),reps:Number(document.querySelector(`[data-reps="${i}"]`)?.value||0)}));await put("gymSessions",{date:todayISO(),type:"Treino de academia",workout:p.workout,records});await loadData();toast("Treino salvo");currentView="gym";render()});
 document.querySelectorAll("[data-done]").forEach(b=>b.onclick=()=>{b.textContent="✓ Concluído";b.classList.add("primary")});
 document.querySelector("#financeProfileBtn")?.addEventListener("click",financeProfileForm);
 document.querySelector("#financeAdd")?.addEventListener("click",financeTransactionForm);
 document.querySelector("#financeBill")?.addEventListener("click",financeBillForm);
 document.querySelector("#financeMonth")?.addEventListener("change",async e=>{financeProfile={...(financeProfile||{id:1}),selectedMonth:e.target.value};await put("financeProfile",financeProfile);await loadData();render()});
 document.querySelector("#foodProfile")?.addEventListener("click",foodProfileForm);
 document.querySelector("#generateMeals")?.addEventListener("click",generateMeals);
 document.querySelector("#newShopping")?.addEventListener("click",shoppingForm);
 document.querySelectorAll("[data-shop]").forEach(b=>b.onclick=async()=>{const x=shoppingItems.find(x=>x.id===Number(b.dataset.shop));if(x){x.done=!x.done;await put("shoppingItems",x);await loadData();render()}});
 document.querySelectorAll("[data-reminder-done]").forEach(b=>b.onclick=async()=>{const r=reminders.find(r=>r.id===Number(b.dataset.reminderDone));if(r){r.done=!r.done;await put("reminders",r);await loadData();render()}});
}
function render(){app.innerHTML=layout();bind()}
(async()=>{await openDB();await loadData();if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});render()})();
