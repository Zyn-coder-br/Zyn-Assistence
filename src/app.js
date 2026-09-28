import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";

const APP_VERSION = "2.0.2";
const SUPABASE_URL = "https://gjijbavsknxmzwilojnp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_g9_bCMdiuHGjU1ksuby0aQ_XGSRI7vo";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
window.ZynCloudDiagnostic = { version: "2.0.2", sdk: "2.117.2", url: SUPABASE_URL, keyType: SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") ? "publishable" : "unknown" };
let authSession = null;
let syncBusy = false;
let syncTimer = null;
let cloudStatus = "offline";
let cloudMessage = "Entre na sua conta para sincronizar";
const DB_NAME = "assistente-zyn-db";
const DB_VERSION = 12;
let db;
let currentView = "home";
let financeTab = "overview";
let planningTab = "today";
let gymTab = "week";
let moreMenuOpen = false;
let theme = localStorage.getItem("zyn-theme") || "dark";
let reminders = [];
let goals = [];
let earnings = [];
let gymProfile = null, gymPlans = [], gymSessions = [];
let foodProfile = null, mealPlans = [], shoppingItems = [];
let financeProfile = null, financeAccounts = [], financeTransactions = [], financeBills = [], financeGoals = [];
let investmentAssets = [];
let deferredInstallPrompt = null;
let musicTracks = [], musicPlaylists = [], musicSettings = null;
let musicAudio = null, musicCurrentTrackId = null, musicQueue = [], musicQueueIndex = -1, musicSearchBusy = false;
let musicObjectUrl = null;
let musicLoadingToken = 0;
let musicTab = "library";
let musicPreviewTrack = null;
let musicSelectedIds = new Set();
let youtubePlayer = null;
const app = document.querySelector("#app");
let appUnlocked = true;
function markAppUnlocked(){appUnlocked=true;localStorage.setItem("zyn-app-unlocked","true");}
function lockApp(){appUnlocked=true;localStorage.setItem("zyn-app-unlocked","true");}

function getYouTubeId(input){ return ""; }
function isYouTubeTrack(track){ return false; }
function cleanupYouTubePlayer(){ youtubePlayer=null; }
function ensureMusicAudio(){
  if(musicAudio) return musicAudio;
  musicAudio = document.createElement("audio");
  musicAudio.preload = "auto";
  musicAudio.playsInline = true;
  musicAudio.setAttribute("aria-hidden","true");
  musicAudio.setAttribute("x-webkit-airplay","allow");
  Object.assign(musicAudio.style,{position:"fixed",width:"1px",height:"1px",opacity:"0",pointerEvents:"none",left:"-10px",bottom:"-10px"});
  document.body.appendChild(musicAudio);
  musicAudio.addEventListener("timeupdate",()=>{
    const t=document.querySelector("#musicProgress");
    const current=document.querySelector("#musicCurrentTime");
    const duration=document.querySelector("#musicDuration");
    if(t && Number.isFinite(musicAudio.duration) && musicAudio.duration>0) t.value=String((musicAudio.currentTime/musicAudio.duration)*100);
    if(current) current.textContent=musicTime(musicAudio.currentTime);
    if(duration) duration.textContent=musicTime(musicAudio.duration);
  });
  musicAudio.addEventListener("play",()=>{updateMusicUI();syncMusicDock();updateMediaSession();});
  musicAudio.addEventListener("pause",()=>{updateMusicUI();syncMusicDock();updateMediaSession();});
  musicAudio.addEventListener("ended",()=>{
    if(musicPreviewTrack){musicPreviewTrack=null;musicAudio.removeAttribute("src");updateMusicUI();return;}
    playNextMusic(1,{fromEnded:true});
  });
  musicAudio.addEventListener("error",()=>{
    const token=musicLoadingToken;
    if(token!==musicLoadingToken)return;
    toast("Atenção: Não foi possível reproduzir esta música");
    setTimeout(()=>{if(token===musicLoadingToken) playNextMusic(1,{fromEnded:true});},120);
  });
  return musicAudio;
}
function musicTime(seconds){if(!Number.isFinite(seconds)||seconds<0)return "0:00";const m=Math.floor(seconds/60),s=Math.floor(seconds%60);return `${m}:${String(s).padStart(2,"0")}`;}
function currentMusicTrack(){return musicTracks.find(t=>String(t.id)===String(musicCurrentTrackId))||null;}
function musicQueueTracks(){return musicQueue.map(id=>musicTracks.find(t=>String(t.id)===String(id))).filter(Boolean);}
function updateMediaSession(){
  if(!("mediaSession" in navigator)) return;
  const track=musicPreviewTrack||currentMusicTrack();
  if(!track){navigator.mediaSession.metadata=null;return;}
  try{navigator.mediaSession.metadata=new MediaMetadata({title:track.title||"Música",artist:track.artist||"Artista desconhecido",album:track.album||"Zyn Music",artwork:track.cover?[{src:track.cover,sizes:"512x512",type:"image/jpeg"}]:[]});}catch(e){}
  try{navigator.mediaSession.playbackState=musicAudio?.paused?"paused":"playing";}catch(e){}
}
function setupMediaSession(){
  if(!("mediaSession" in navigator)) return;
  const actions={play:()=>musicAudio?.play(),pause:()=>musicAudio?.pause(),previoustrack:()=>playNextMusic(-1),nexttrack:()=>playNextMusic(1),seekbackward:()=>{if(musicAudio)musicAudio.currentTime=Math.max(0,musicAudio.currentTime-10)},seekforward:()=>{if(musicAudio)musicAudio.currentTime=Math.min(musicAudio.duration||0,musicAudio.currentTime+10)},seekto:(d)=>{if(Number.isFinite(d.seekTime)&&musicAudio)musicAudio.currentTime=d.seekTime}};
  for(const [name,fn] of Object.entries(actions)){try{navigator.mediaSession.setActionHandler(name,fn)}catch(e){}}
}
function musicContextTrackIds(){
  const ordered = musicTab==='favorites'
    ? musicTracks.filter(t=>t.favorite)
    : musicTab==='recent'
      ? musicTracks.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))
      : musicTracks.slice().reverse();
  return ordered.map(t=>t.id);
}
function releaseMusicObjectUrl(){
  if(musicObjectUrl){try{URL.revokeObjectURL(musicObjectUrl)}catch(e){} musicObjectUrl=null;}
}
async function playMusicTrack(track,queueIds=null,index=null){
  if(!track){toast("Adicione uma música primeiro");return;}
  ensureMusicAudio();
  const token=++musicLoadingToken;
  let audioSource="";
  try{
    if(track.fileData){
      const bytes = track.fileData instanceof ArrayBuffer ? track.fileData : (track.fileData?.buffer || track.fileData);
      const blob = new Blob([bytes], {type:track.mimeType||"audio/mpeg"});
      releaseMusicObjectUrl();
      audioSource = URL.createObjectURL(blob);
      musicObjectUrl = audioSource;
    }else if(track.fileBlob){
      const blob = track.fileBlob instanceof Blob ? track.fileBlob : new Blob([track.fileBlob], {type:track.mimeType||"audio/mpeg"});
      releaseMusicObjectUrl();
      audioSource = URL.createObjectURL(blob);
      musicObjectUrl = audioSource;
    }else if(track.source!=="youtube" && track.url){
      releaseMusicObjectUrl();
      audioSource = track.url;
    }
  }catch(error){ console.warn("[Zyn Music] Falha ao preparar áudio",error); audioSource=""; }
  if(!audioSource){toast("Atenção: O arquivo desta música não está disponível no aparelho");return;}
  cleanupYouTubePlayer();
  musicPreviewTrack=null;
  if(Array.isArray(queueIds)&&queueIds.length){
    musicQueue=[...queueIds];
    musicQueueIndex=Math.max(0,index??musicQueue.findIndex(id=>String(id)===String(track.id)));
  }else if(!musicQueue.length || !musicQueue.some(id=>String(id)===String(track.id))){
    musicQueue=musicContextTrackIds();
    if(!musicQueue.length) musicQueue=[track.id];
    musicQueueIndex=Math.max(0,musicQueue.findIndex(id=>String(id)===String(track.id)));
  }else{
    const found=musicQueue.findIndex(id=>String(id)===String(track.id));
    if(found>=0) musicQueueIndex=found;
  }
  musicCurrentTrackId=track.id;
  musicAudio.pause();
  musicAudio.src=audioSource;
  musicAudio.load();
  updateMediaSession();
  try{await musicAudio.play();}
  catch(error){toast("Reproduzir: Toque no play para iniciar a música");}
  if(token!==musicLoadingToken)return;
  musicSettings={...(musicSettings||{id:1}),currentTrackId:track.id,queue:musicQueue,queueIndex:musicQueueIndex};
  await put("musicSettings",musicSettings);
  updateMusicUI();
  syncMusicDock();
}
async function playNextMusic(direction=1,options={}){
  const ids=musicQueue.length?musicQueue:musicContextTrackIds();
  if(!ids.length)return;
  let idx=musicQueue.length?musicQueueIndex:ids.findIndex(id=>String(id)===String(musicCurrentTrackId));
  if(idx<0)idx=0;
  const next=idx+direction;
  // When a list finishes naturally, stop instead of looping the first song forever.
  if(options.fromEnded && direction>0 && next>=ids.length){
    musicQueue=ids;
    musicQueueIndex=ids.length-1;
    musicAudio.pause();
    updateMusicUI();
    updateMediaSession();
    musicSettings={...(musicSettings||{id:1}),currentTrackId:musicCurrentTrackId,queue:musicQueue,queueIndex:musicQueueIndex};
    await put("musicSettings",musicSettings);
    return;
  }
  idx=next;
  if(idx>=ids.length)idx=0;
  if(idx<0)idx=ids.length-1;
  const track=musicTracks.find(t=>String(t.id)===String(ids[idx]));
  if(!track)return;
  musicQueue=ids;musicQueueIndex=idx;
  await playMusicTrack(track,ids,idx);
}
async function toggleMusicPlay(){
  ensureMusicAudio();
  const track=currentMusicTrack()||musicTracks[0];
  if(!musicAudio.src){
    if(track){
      const ids=musicQueue.length?musicQueue:musicContextTrackIds();
      const index=Math.max(0,ids.findIndex(id=>String(id)===String(track.id)));
      return playMusicTrack(track,ids.length?ids:[track.id],index);
    }
    toast("Adicione uma música primeiro");return;
  }
  if(musicAudio.paused){try{await musicAudio.play()}catch(e){toast("Toque no play novamente para iniciar");}}else musicAudio.pause();
  updateMusicUI();updateMediaSession();syncMusicDock();
}
async function addMusicTrack(track,playlistId=null){
  const rawUrl=String(track.url||"").trim();
  if(/(^|\.)youtube\.com($|\.)|youtu\.be/i.test(rawUrl)){toast("Links do YouTube não são aceitos. Importe o arquivo de áudio completo.");return;}
  const source=track.fileData?"local":(track.fileBlob?"local":(track.source||"direct"));
  const payload={title:track.title||"Música",artist:track.artist||"Artista desconhecido",album:track.album||"",cover:track.cover||"",url:source==="local"?"":rawUrl,youtubeId:"",source,duration:track.duration||0,createdAt:new Date().toISOString()};
  if(track.fileData){payload.fileData=track.fileData;payload.localOnly=true;payload.mimeType=track.mimeType||"audio/mpeg";payload.fileName=track.fileName||track.title||"música";}
  else if(track.fileBlob){
    try{payload.fileData=await track.fileBlob.arrayBuffer();payload.localOnly=true;payload.mimeType=track.fileBlob.type||"audio/mpeg";payload.fileName=track.fileName||track.title||"música";}
    catch(e){toast("Não foi possível guardar este arquivo de áudio");return;}
  }
  if(!payload.url && !payload.fileData){toast("Selecione um arquivo de áudio completo ou informe um link direto de áudio");return;}
  await put("musicTracks",payload);
  await loadData();
  const added=musicTracks.slice().sort((a,b)=>Number(b.id)-Number(a.id))[0];
  if(playlistId){const pl=musicPlaylists.find(p=>String(p.id)===String(playlistId));if(pl){pl.trackIds=[...(pl.trackIds||[]),added.id];await put("musicPlaylists",pl);await loadData();}}
  toast("Música: Música adicionada");
}
function musicPlaylistForm(existing={}){const el=modal(`<div class="custom-modal-head"><div><span class="eyebrow">MÚSICA</span><h2>${existing.id?"Editar":"Nova"} playlist</h2><p>Organize suas músicas do jeito que preferir.</p></div><button class="icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="playlistForm" class="stack"><div class="field"><label>Nome da playlist *</label><input name="name" required value="${esc(existing.name||"")}" placeholder="Ex.: Treino, Relax, Foco"></div><button class="btn primary">Salvar playlist</button></form>`);el.querySelector("#close").onclick=()=>closeModal(el);el.querySelector("#playlistForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await createMusicPlaylist(String(f.get("name")||"").trim());closeModal(el)};}
async function createMusicPlaylist(name){const clean=String(name||"").trim();if(!clean)return;await put("musicPlaylists",{name:clean,trackIds:[],createdAt:new Date().toISOString()});await loadData();render();toast("Playlist: Playlist criada");}
function updateMusicUI(){const track=currentMusicTrack(), title=document.querySelector("#musicNowTitle"),artist=document.querySelector("#musicNowArtist"),cover=document.querySelector("#musicNowCover"),play=document.querySelector("#musicPlayBtn");if(title)title.textContent=track?.title||"Nenhuma música selecionada";if(artist)artist.textContent=track?.artist||"Escolha uma música da sua biblioteca";if(cover){if(cover.tagName==="IMG"){cover.src=track?.cover||"";cover.style.display=track?.cover?"block":"none";}}if(play){const playing=!!(musicAudio&&!musicAudio.paused);play.innerHTML=uiIcon(playing?"pause":"playCircle");play.setAttribute("aria-label",playing?"Pausar":"Reproduzir");play.title=playing?"Pausar":"Reproduzir";}const status=document.querySelector("#musicStatus");if(status)status.textContent=track?.source==="local"?"Biblioteca local":(musicAudio&&!musicAudio.paused?"Reproduzindo":"Pausado");}
function musicView(){
 const playlists=musicPlaylists, track=currentMusicTrack();
 const cover=track?.cover?`<img id="musicNowCover" src="${esc(track.cover)}" alt="Capa"/>`:`<div class="music-cover-placeholder" id="musicNowCover">${uiIcon("music")}</div>`;
 const selectedCount=musicSelectedIds.size;
 const tabs=[['library','Biblioteca'],['playlists','Playlists'],['favorites','Favoritos'],['recent','Recentes']];
 const visibleTracks = musicTab==='favorites' ? musicTracks.filter(t=>t.favorite) : musicTab==='recent' ? musicTracks.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)) : musicTracks.slice().reverse();
 const librarySection=`<section class="panel-card music-library-card"><div class="panel-heading music-library-heading"><div><h3>Música: Minha biblioteca</h3><span>${musicTracks.length} faixa(s) completas neste aparelho</span></div><div class="music-bulk-actions"><button class="btn" id="musicSelectAll">${selectedCount===musicTracks.length&&musicTracks.length?"☑ Desmarcar tudo":"☐ Selecionar tudo"}</button><button class="btn danger" id="musicDeleteSelected" ${selectedCount?"":"disabled"}>${uiIcon("trash")} Excluir selecionadas${selectedCount?` (${selectedCount})`:""}</button><button class="btn primary" id="musicAddFileTop">${uiIcon("plus")} Música</button></div></div><div class="modern-list music-scroll-list">${visibleTracks.map(t=>`<div class="modern-list-row music-track-row"><label class="music-check"><input type="checkbox" data-music-select="${t.id}" ${musicSelectedIds.has(String(t.id))?"checked":""}></label><div class="row-icon">${uiIcon("music")}</div><div class="row-main"><b title="${esc(t.title||t.fileName||t.originalName||t.name||`Música ${t.id||""}`)}">${esc(t.title||t.fileName||t.originalName||t.name||`Música ${t.id||""}`)}</b><span>${esc(t.artist||"Minha biblioteca")} • ${t.source==="local"?"Biblioteca completa":"Áudio completo"}</span></div><div class="actions"><button class="btn music-row-play" data-music-play="${t.id}" aria-label="Reproduzir" title="Reproduzir">${uiIcon("playCircle")}</button></div></div>`).join("")||'<div class="empty">Nenhuma música encontrada nesta aba.</div>'}</div></section>`;
 const playlistSection=`<section class="panel-card music-playlists-card"><div class="panel-heading"><div><h3>Playlist: Minhas playlists</h3><span>${playlists.length} playlist(s)</span></div><button class="btn primary" id="musicPlaylistNew">${uiIcon("plus")} Nova playlist</button></div><div class="modern-list music-scroll-list">${playlists.map(p=>`<button class="modern-list-row music-playlist" data-music-playlist="${p.id}"><div class="row-icon">${uiIcon("music")}</div><div class="row-main"><b>${esc(p.name)}</b><span>${(p.trackIds||[]).length} música(s)</span></div><span class="row-arrow">›</span></button>`).join("")||'<div class="empty">Crie sua primeira playlist.</div>'}</div></section>`;
 const secondary=musicTab==='library'||musicTab==='favorites'||musicTab==='recent'?librarySection:playlistSection;
 const playing=!!musicAudio&&!musicAudio.paused;
 return `<div class="module-page"><div class="module-head"><div class="module-icon">${uiIcon("music")}</div><div class="module-head-copy"><h1>Música</h1><p>Sua biblioteca pessoal de músicas completas</p></div><button class="icon-btn" aria-label="Favoritos">${uiIcon("heart")}</button></div><div class="module-tabs music-tabs">${tabs.map(([id,label])=>`<button class="${musicTab===id?'active':''}" data-music-tab="${id}">${label}</button>`).join("")}</div><section class="panel-card now-playing"><div class="now-playing-main">${cover}<div class="music-meta"><span class="eyebrow">TOCANDO AGORA</span><h2 id="musicNowTitle">${esc(track?.title||"Nenhuma música")}</h2><p id="musicNowArtist">${esc(track?.artist||"Adicione uma música da sua biblioteca")}</p><span class="soft-tag" id="musicStatus">${track?.source==="local"?"Biblioteca local":(playing?"Reproduzindo":"Pausado")}</span></div></div><input id="musicProgress" class="music-progress" type="range" min="0" max="100" value="0" step="0.1"/><div class="music-controls"><button class="music-control music-side" id="musicPrev" aria-label="Anterior" title="Anterior">${uiIcon("previous")}</button><button class="music-control music-play" id="musicPlayBtn" aria-label="${playing?'Pausar':'Reproduzir'}" title="${playing?'Pausar':'Reproduzir'}">${uiIcon(playing?"pause":"playCircle")}</button><button class="music-control music-side" id="musicNext" aria-label="Próxima" title="Próxima">${uiIcon("next")}</button></div><div class="music-extra"><button class="btn" id="musicShuffle">${uiIcon("shuffle")} Aleatório</button><button class="btn primary" id="musicAddFile">${uiIcon("plus")} Adicionar músicas</button><button class="btn" id="musicAddFolder">${uiIcon("folder")} Importar pasta</button><input id="musicFileInput" type="file" accept="audio/*" multiple hidden><input id="musicFolderInput" type="file" accept="audio/*" webkitdirectory directory multiple hidden></div></section>${secondary}</div>`;
}
async function addLocalMusicFiles(files){const list=[...files].filter(f=>f&&(f.type||"").startsWith("audio/"));if(!list.length)return toast("Escolha um arquivo de áudio");for(const file of list){const cleanName=(file.name||"Música").replace(/\.[^/.]+$/,"").trim()||"Música";await addMusicTrack({fileBlob:file,fileName:file.name,title:cleanName,artist:"Minha biblioteca",album:"Biblioteca do Zyn",mimeType:file.type},null);}await loadData();render();toast(`Música: ${list.length} música(s) adicionada(s) à biblioteca`);}

/* V1.8.1 HOTFIX — restored core IndexedDB/helpers accidentally omitted during UI merge. */
function activeGoal(){return goals.find(g=>g.active!==false)||goals[0]}

function all(name){return new Promise((resolve,reject)=>{const r=store(name).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}

function assistantView(){return `<div class="section-title"><div><span class="eyebrow">CENTRO DO ZYN</span><h2>Zyn Assistente</h2><div class="muted">Seu assistente pessoal para conectar organização, bem-estar, finanças e música.</div></div></div><section class="assistant-hero card full"><div class="assistant-orb">${uiIcon("assistant")}</div><div><span class="eyebrow">ASSISTENTE PESSOAL</span><h2>O que você quer organizar hoje?</h2><p class="muted">Esta área será o centro inteligente do Zyn. Por enquanto, use os painéis abaixo para acessar cada parte da sua rotina.</p></div></section><div class="assistant-actions"><button class="home-panel-card" data-home-view="planning"><span class="panel-icon">${uiIcon("plan")}</span><div class="panel-copy"><h3>Planejamento</h3><p>Lembretes e metas.</p></div></button><button class="home-panel-card" data-home-view="wellness"><span class="panel-icon">${uiIcon("well")}</span><div class="panel-copy"><h3>Bem-estar</h3><p>GYM, Dietas e Hábitos.</p></div></button><button class="home-panel-card" data-home-view="finance"><span class="panel-icon">${uiIcon("finance")}</span><div class="panel-copy"><h3>Finanças</h3><p>Seu controle financeiro.</p></div></button><button class="home-panel-card" data-home-view="music"><span class="panel-icon">${uiIcon("music")}</span><div class="panel-copy"><h3>Zyn Music</h3><p>Seu player pessoal.</p></div></button></div>`}

function authGateView(){
  const email = currentUser()?.email || "";
  return `<div class="auth-gate">
    <section class="auth-card">
      <div class="auth-brand"><div class="auth-logo">Z</div><div><div class="eyebrow">ASSISTENTE PESSOAL</div><h1>Assistente Zyn</h1></div></div>
      <div class="auth-welcome"><div class="eyebrow">ZYN CLOUD</div><h2>Bem-vindo de volta</h2><p class="muted">Entre para acessar suas metas, finanças, GYM, alimentação, lembretes e o novo Zyn Music.</p></div>
      <form id="loginGateForm" class="stack">
        <div class="field"><label>E-mail</label><input name="email" type="email" required autocomplete="email" value="${esc(email)}" placeholder="seu@email.com"></div>
        <div class="field"><label>Senha</label><input name="password" type="password" minlength="6" required autocomplete="current-password" placeholder="Mínimo de 6 caracteres"></div>
        <button class="btn primary auth-submit" type="submit">Entrar no Zyn</button>
        <button class="btn auth-signup" type="button" id="loginCreateAccount">Criar conta</button>
      </form>
      <p class="auth-note">${uiIcon("lock")} A sessão de acesso permanece enquanto o aplicativo estiver aberto ou em segundo plano. Ao fechar o aplicativo, o Zyn pede login novamente.</p>
      <div id="loginGateStatus" class="auth-status" aria-live="polite"></div>
    </section>
  </div>`;
}

function awaitableHabitsCount(){return 0}

function bindAuthGate(){
  const form=document.querySelector("#loginGateForm");
  const status=document.querySelector("#loginGateStatus");
  form?.addEventListener("submit",async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const email=String(f.get("email")||"").trim();
    const password=String(f.get("password")||"");
    const button=e.submitter;
    if(button){button.disabled=true;button.textContent="Entrando…";}
    if(status)status.textContent="Conectando ao Zyn Cloud…";
    try{
      const {data,error}=await supabase.auth.signInWithPassword({email,password});
      if(error)throw error;
      authSession=data.session||null;
      if(!authSession)throw new Error("Não foi possível iniciar a sessão.");
      markAppUnlocked();
      setCloudStatus("syncing","Conectado — sincronizando…");
      await loadData();
      await syncAll("login");
      render();
      toast("Nuvem: Login realizado");
    }catch(err){
      if(status)status.textContent="Erro: "+(err?.message||"Não foi possível entrar.");
      if(button){button.disabled=false;button.textContent="Entrar no Zyn";}
    }
  });
  document.querySelector("#loginCreateAccount")?.addEventListener("click",async()=>{
    const email=String(document.querySelector('#loginGateForm input[name="email"]')?.value||"").trim();
    const password=String(document.querySelector('#loginGateForm input[name="password"]')?.value||"");
    if(!email||password.length<6){if(status)status.textContent="Informe e-mail e uma senha de pelo menos 6 caracteres para criar a conta.";return;}
    const btn=document.querySelector("#loginCreateAccount");if(btn){btn.disabled=true;btn.textContent="Criando…";}
    try{
      const {data,error}=await supabase.auth.signUp({email,password});
      if(error)throw error;
      authSession=data.session||null;
      if(authSession){markAppUnlocked();await loadData();await syncAll("signup");render();toast("Nuvem: Conta criada");}
      else if(status)status.textContent="Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.";
    }catch(err){
      if(status)status.textContent="Erro: "+(err?.message||"Não foi possível criar a conta.");
    }finally{if(btn){btn.disabled=false;btn.textContent="Criar conta";}}
  });
}

let activeModalCount=0;
function closeModal(el){if(!el)return;el.remove();activeModalCount=Math.max(0,activeModalCount-1);document.body.classList.toggle("zyn-modal-open",activeModalCount>0)}

function dateKey(date){return date.toISOString().slice(0,10)}

function dayAmount(goal,date=todayISO()){return earnings.filter(e=>e.date===date&&(!goal.source||goal.source==="all"||goal.source===e.source)).reduce((sum,e)=>sum+Number(e.amount||0),0)}

function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function financeMonthLabel(key=monthKey()){ const [y,m]=key.split("-"); return new Date(Number(y),Number(m)-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"}); }

function fmtDate(value){if(!value)return "Sem data";return new Date(value+"T12:00:00").toLocaleDateString("pt-BR")}

function getCurrentWeekDays(){const start=weekStart();return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return dateKey(d)})}

function goalProgress(goal){const amount=weekEarnings(goal);return Math.min(100,goal.target?amount/goal.target*100:0)}

function goalsView(){
 return `<div class="section-title"><h2>Metas</h2><button class="btn primary" id="newGoal">${uiIcon("goal")} Nova meta</button></div>
 <div class="stack">${goals.map(g=>{const amount=weekEarnings(g);const p=goalProgress(g);return `<section class="card full"><div class="row"><h3>${uiIcon("goal")} ${esc(g.name)}</h3><span class="tag">${g.active===false?"Inativa":"Ativa"}</span></div><div class="row"><div><div class="metric">${money(amount)}</div><div class="muted">de ${money(g.target)} na semana</div></div><div style="text-align:right"><div class="metric">${p.toFixed(1)}%</div><div class="muted">concluído</div></div></div><div class="progress"><div style="width:${p}%"></div></div><div class="row"><span class="muted">Diária: ${money(g.dailyTarget)}</span><span class="muted">Hoje: ${money(dayAmount(g))}</span></div><div class="daily-grid">${getCurrentWeekDays().map((d,i)=>{const val=dayAmount(g,d);const hit=val>=g.dailyTarget;return `<div class="day-box ${hit?"hit":""} ${d===todayISO()?"today":""}"><b>${["S","T","Q","Q","S","S","D"][i]}</b><br>${money(val).replace("R$","").trim()}${hit?" ✓":""}</div>`}).join("")}</div><div class="actions" style="margin-top:15px"><button class="btn primary" data-goal-earning="${g.id}">${uiIcon("money")} Registrar ganho</button><button class="btn" data-goal-edit="${g.id}">${uiIcon("edit")} Editar</button><button class="btn danger" data-goal-delete="${g.id}">${uiIcon("trash")} Excluir</button></div></section>`}).join("")||`<div class="empty">Nenhuma meta cadastrada. Crie sua primeira meta semanal.</div>`}</div>`;
}

function modal(content,options={}){
 const wrapper=document.createElement("div");wrapper.className="modal-backdrop zyn-modal";wrapper.dataset.zynModal="true";
 wrapper.innerHTML=`<div class="modal" role="dialog" aria-modal="true">${content}</div>`;
 document.body.appendChild(wrapper);activeModalCount++;document.body.classList.add("zyn-modal-open");
 const panel=wrapper.querySelector(".modal");
 wrapper.addEventListener("click",e=>{if(e.target===wrapper && options.closeOnBackdrop!==false)closeModal(wrapper)});
 const onKey=e=>{if(e.key==="Escape" && options.closeOnEscape!==false){closeModal(wrapper);document.removeEventListener("keydown",onKey)}};
 document.addEventListener("keydown",onKey);
 wrapper.addEventListener("remove",()=>document.removeEventListener("keydown",onKey),{once:true});
 requestAnimationFrame(()=>panel?.querySelector("input,select,textarea,button")?.focus());
 return wrapper
}
function confirmZyn(message,title="Confirmar ação"){return new Promise(resolve=>{const el=modal(`<div class="custom-modal-head"><div><span class="eyebrow">ZYN</span><h2>${esc(title)}</h2><p>${esc(message)}</p></div><button class="icon-btn" id="confirmClose" aria-label="Fechar">${uiIcon("close")}</button></div><div class="actions modal-confirm-actions"><button class="btn" id="confirmNo">Cancelar</button><button class="btn danger" id="confirmYes">Confirmar</button></div>`);const finish=v=>{closeModal(el);resolve(v)};el.querySelector("#confirmClose").onclick=()=>finish(false);el.querySelector("#confirmNo").onclick=()=>finish(false);el.querySelector("#confirmYes").onclick=()=>finish(true);});}

function money(value){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value)||0)}

function monthKey(date=todayISO()){ return String(date).slice(0,7); }

function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const database=request.result;
      ["reminders","events","financialAccounts","financialTransactions","financialGoals","workoutPlans","workoutSessions","habits","habitLogs","settings","goals","earnings","gymProfile","gymPlans","gymSessions","foodProfile","mealPlans","shoppingItems","financeProfile","financeAccounts","financeTransactions","financeBills","financeGoals","investmentAssets","musicTracks","musicPlaylists","musicSettings","syncQueue","syncMeta"].forEach(store=>{
        if(!database.objectStoreNames.contains(store)) database.createObjectStore(store,{keyPath:"id",autoIncrement:true});
      });
    };
    request.onsuccess=()=>{db=request.result;resolve(db)};
    request.onerror=()=>reject(request.error);
  });
}

function put(name,data,options={}){return new Promise((resolve,reject)=>{
  const payload={...(data||{})};
  if(options.touch!==false && name!=="syncQueue" && name!=="syncMeta") payload.updatedAt=new Date().toISOString();
  const r=store(name,"readwrite").put(payload);
  r.onsuccess=()=>{if(options.touch!==false && typeof scheduleSync==="function")scheduleSync();resolve(r.result)};r.onerror=()=>reject(r.error)
})}

function remindersView(){
 return `<div class="section-title"><h2>Lembretes</h2><button class="btn primary" id="newReminder">${uiIcon("calendar")} Novo</button></div><div class="stack">${reminders.sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map(r=>`<div class="list-item ${r.done?"done":""}"><div><b>${esc(r.title)}</b><div class="muted">${esc(r.category||"Geral")} • ${fmtDate(r.date)}${r.time?" • "+esc(r.time):""}</div>${r.notes?`<div class="muted">${esc(r.notes)}</div>`:""}</div><div class="actions"><button class="btn" data-reminder-done="${r.id}">${r.done?uiIcon("undo"):uiIcon("check")}</button><button class="btn" data-reminder-edit="${r.id}">${uiIcon("edit")}</button><button class="btn danger" data-reminder-delete="${r.id}">${uiIcon("trash")}</button></div></div>`).join("")||`<div class="empty">Você ainda não cadastrou lembretes.</div>`}</div>`;
}

function remove(name,id){return new Promise(async(resolve,reject)=>{
  const stamp=new Date().toISOString();
  const r=store(name,"readwrite").delete(id);
  r.onsuccess=async()=>{
    try{ if(name!=="syncQueue" && name!=="syncMeta") await put("syncQueue",{storeName:name,recordId:String(id),updatedAt:stamp,deleted:true},{touch:false}); if(typeof scheduleSync==="function") scheduleSync(); resolve(); }
    catch(e){reject(e)}
  };
  r.onerror=()=>reject(r.error)
})}

function setView(view){currentView=view;render()}

function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}

function toast(message){const el=document.createElement("div");el.textContent=message;Object.assign(el.style,{position:"fixed",bottom:"82px",left:"50%",transform:"translateX(-50%)",background:"var(--text)",color:"var(--surface)",padding:"12px 17px",borderRadius:"12px",zIndex:40,boxShadow:"0 8px 30px #0003"});document.body.appendChild(el);setTimeout(()=>el.remove(),2500)}

function todayISO(){return new Date().toISOString().slice(0,10)}

function toggleTheme(){theme=theme==="light"?"dark":"light";localStorage.setItem("zyn-theme",theme);document.body.className=theme;render()}

function uiIcon(name){const paths={
 home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5h5v5"/>',
 plan:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M7 10h10"/><path d="m8 14 1.5 1.5L12 13"/><path d="M14 14h2"/><path d="m8 17 1.5 1.5L12 16"/><path d="M14 17h2"/>',
 well:'<path d="M8 5v5M16 5v5M5 8h6M13 8h6M7 13c0 3 2 5 5 5s5-2 5-5"/>',
 gym:'<path d="M6 8v8M9 6v12M15 6v12M18 8v8"/><path d="M3 10h6M15 10h6M3 14h6M15 14h6"/>',
 finance:'<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 9h14a3 3 0 0 1 0 6H4"/><circle cx="17" cy="12" r="1.3"/>',
 investment:'<path d="M4 17V7"/><path d="M4 17h16"/><path d="m7 14 3-3 3 2 5-6"/><path d="M15 7h3v3"/>',
 music:'<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="3"/><circle cx="16.5" cy="16" r="3"/>',
 food:'<path d="M6 3v8M9 3v8M12 3v8"/><path d="M6 11c0 2 1 3 3 3h0V21"/><path d="M17 3v18"/><path d="M17 3c3 1 4 4 3 7-.5 1.5-1.5 2.5-3 2.5"/>',
 assistant:'<path d="M7 8h10a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H9l-4 3v-7a4 4 0 0 1-2-3v-1a4 4 0 0 1 4-4Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 moreFunctions:'<path d="M5 7h8M5 17h5M17 7h2M14 17h5"/><circle cx="16" cy="7" r="2"/><circle cx="11" cy="17" r="2"/>',
 calendar:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m8 14 1.5 1.5L12 13"/><path d="M14 14h2"/>',
 settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M4 12H2m20 0h-2M12 4V2m0 20v-2M6.3 6.3 4.9 4.9m14.2 14.2-1.4-1.4M17.7 6.3l1.4-1.4M4.9 19.1l1.4-1.4"/>',
 edit:'<path d="m4 16-.8 4.8L8 20l11-11-4-4z"/><path d="m13.5 6.5 4 4"/>',
 previous:'<path d="m14 6-6 6 6 6"/><path d="M18 6v12"/>',
 next:'<path d="m10 6 6 6-6 6"/><path d="M6 6v12"/>',
 playCircle:'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z" fill="currentColor" stroke="none"/>',
 pause:'<circle cx="12" cy="12" r="9"/><path d="M10 8v8M14 8v8"/>',
 shuffle:'<path d="M4 7h3c4 0 6 10 10 10h3"/><path d="m17 14 3 3-3 3"/><path d="M4 17h3c1.2 0 2.2-.6 3-1.5"/><path d="M14 8.5C15 7.5 16 7 17 7h3"/><path d="m17 4 3 3-3 3"/>',
 folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9h18"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 minus:'<path d="M5 12h14"/>',
 trash:'<path d="M4 7h16"/><path d="M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/>',
 heart:'<path d="M20.8 8.6c0 5.2-8.8 10.1-8.8 10.1S3.2 13.8 3.2 8.6A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z"/>',
 card:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M7 15h4"/>',
 money:'<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.7-1.5-1.5 0-2.6.8-2.6 2s1.1 1.8 2.8 2.1c1.7.3 2.7.9 2.7 2.1s-1.1 2-2.8 2c-1.3 0-2.4-.5-3-1.5"/><path d="M12 6.8v10.4"/>',
 receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
 cart:'<path d="M3 4h2l2 11h10l3-8H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
 chart:'<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3-4 3 2 5-6"/>',
 goal:'<path d="M12 21a9 9 0 1 0-9-9"/><path d="M12 17a5 5 0 1 0-5-5"/><circle cx="12" cy="12" r="1.5"/>',
 flag:'<path d="M5 21V4"/><path d="M5 5c4-3 7 3 14 0v8c-7 3-10-3-14 0"/>',
 pin:'<path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/>',
 activity:'<path d="M3 12h4l2-7 4 14 2-7h6"/>',
 coffee:'<path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 10h2a3 3 0 0 1 0 6h-2M8 4c0 1 1 1 1 2M12 4c0 1 1 1 1 2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14.8-4L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4L21 15"/><path d="M21 20v-5h-5"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 undo:'<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/>',
 back:'<path d="m15 6-6 6 6 6"/>',
 forward:'<path d="m9 6 6 6-6 6"/>',
 dots:'<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'
};return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.dots}</svg>`}

function weekEarnings(goal){const days=getCurrentWeekDays();return earnings.filter(e=>days.includes(e.date)&&(!goal.source||goal.source==="all"||goal.source===e.source)).reduce((sum,e)=>sum+Number(e.amount||0),0)}

function weekStart(date=new Date()){const d=new Date(date);const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);d.setHours(0,0,0,0);return d}

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
function gymExercises(plan){return Array.isArray(plan?.exercises)&&plan.exercises.length?plan.exercises:(GYM_EX[plan?.workout]||GYM_EX["Cardio / treino opcional"])}
function gymDayForm(day){
 const plan=gymWeek().find(x=>x.day===Number(day))||DEFAULT_GYM.find(x=>x.day===Number(day));
 const exercises=gymExercises(plan);
 const el=modal(`<div class="row"><div><span class="eyebrow">GYM</span><h2>Editar ${esc(plan.label)}</h2><div class="muted">Monte o treino deste dia</div></div><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="gymDayForm" class="stack"><div class="form-grid"><div class="field"><label>Tipo</label><select name="type"><option value="gym">Treino</option><option value="optional">Opcional</option><option value="rest">Descanso</option></select></div><div class="field"><label>Nome do treino</label><input name="workout" required value="${esc(plan.workout)}"></div></div><div class="panel-card gym-editor-card"><div class="panel-heading"><div><h3>Exercícios</h3><span>Adicione, edite ou remova exercícios deste treino.</span></div><button type="button" class="btn" id="gymAddExercise">${uiIcon("plus")} Exercício</button></div><div id="gymExercisesEditor" class="stack"></div></div><button class="btn primary" type="submit">Salvar treino</button></form>`);
 const box=el.querySelector('#gymExercisesEditor');
 const addRow=(e={})=>{const row=document.createElement('div');row.className='gym-edit-row';row.innerHTML=`<div class="row"><b>Exercício</b><button type="button" class="btn danger" data-remove-ex>×</button></div><div class="form-grid"><div class="field"><label>Nome</label><input data-ex="name" placeholder="Ex.: Supino" value="${esc(e[0]||'')}"></div><div class="field"><label>Grupo muscular</label><input data-ex="group" placeholder="Ex.: Peito" value="${esc(e[1]||'')}"></div><div class="field"><label>Séries</label><input data-ex="sets" placeholder="3" value="${esc(e[2]||'3')}"></div><div class="field"><label>Repetições</label><input data-ex="reps" placeholder="10–12" value="${esc(e[3]||'10–12')}"></div><div class="field"><label>Descanso</label><input data-ex="rest" placeholder="60–90s" value="${esc(e[4]||'60–90s')}"></div></div>`;box.appendChild(row);};
 exercises.forEach(addRow);
 if(!exercises.length) addRow();
 el.querySelector('[name="type"]').value=plan.type;
 el.querySelector('#close').onclick=()=>closeModal(el);
 el.querySelector('#gymAddExercise').onclick=()=>addRow();
 el.addEventListener('click',e=>{const btn=e.target.closest('[data-remove-ex]');if(btn){btn.closest('.gym-edit-row')?.remove();}});
 el.querySelector('#gymDayForm').onsubmit=async e=>{e.preventDefault();const rows=[...box.querySelectorAll('.gym-edit-row')];const custom=rows.map(r=>[r.querySelector('[data-ex="name"]')?.value.trim()||'',r.querySelector('[data-ex="group"]')?.value.trim()||'',r.querySelector('[data-ex="sets"]')?.value.trim()||'3',r.querySelector('[data-ex="reps"]')?.value.trim()||'10–12',r.querySelector('[data-ex="rest"]')?.value.trim()||'60–90s']).filter(x=>x[0]);await put('gymPlans',{...(plan.id?plan:{}),day:plan.day,label:plan.label,type:e.target.type.value,workout:e.target.workout.value.trim(),exercises:custom});await loadData();closeModal(el);render();toast('Treino atualizado com sucesso');};
}

function gymExercisesView(){
 const groups=Object.entries(GYM_EX);
 return `<div class="gym-tab-content"><div class="section-title"><div><span class="eyebrow">BIBLIOTECA</span><h2>Exercícios</h2></div><button class="btn" id="editTodayGym">${uiIcon("edit")} Editar treino de hoje</button></div><div class="gym-exercise-grid">${groups.map(([name,items])=>`<section class="panel-card"><div class="panel-heading"><div><h3>${esc(name)}</h3><span>${items.length} exercícios</span></div><span class="soft-tag">${uiIcon("gym")}</span></div><div class="modern-list">${items.map((e,i)=>`<div class="modern-list-row"><div class="row-icon">${uiIcon("gym")}</div><div class="row-main"><b>${i+1}. ${esc(e[0])}</b><span>${esc(e[1])} • ${e[2]} séries • ${e[3]} repetições</span></div><span class="soft-tag">${esc(e[4])}</span></div>`).join("")}</div></section>`).join("")}</div></div>`;
}
function gymProgressView(){
 const sessions=gymSessions.filter(x=>getCurrentWeekDays().includes(x.date));
 const records=sessions.flatMap(s=>Array.isArray(s.records)?s.records:[]);
 const totalReps=records.reduce((n,r)=>n+Number(r.reps||0),0), totalLoad=records.reduce((n,r)=>n+(Number(r.load||0)*Number(r.reps||0)),0), best=records.reduce((m,r)=>Math.max(m,Number(r.load||0)),0), pct=Math.min(100,sessions.length/5*100);
 return `<div class="gym-tab-content"><div class="section-title"><div><span class="eyebrow">ACOMPANHAMENTO</span><h2>Meu progresso</h2></div><span class="soft-tag">Esta semana</span></div><div class="stat-grid four"><section class="stat-card"><span>Sessões</span><b>${sessions.length}</b><small>treinos registrados</small></section><section class="stat-card"><span>Repetições</span><b>${totalReps}</b><small>registradas</small></section><section class="stat-card"><span>Volume</span><b>${totalLoad.toFixed(0)} kg</b><small>carga × repetições</small></section><section class="stat-card"><span>Maior carga</span><b>${best.toFixed(1)} kg</b><small>nesta semana</small></section></div><section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("chart")} Consistência</h3><span>Meta de 4–5 dias por semana</span></div><span class="soft-tag">${pct.toFixed(0)}%</span></div><div class="progress"><div style="width:${pct}%"></div></div><p class="muted">${sessions.length?`Você já registrou ${sessions.length} sessão(ões) nesta semana.`:"Ainda não há sessões registradas nesta semana."}</p></section></div>`;
}
function gymHistoryView(){
 const rows=gymSessions.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,20);
 return `<div class="gym-tab-content"><div class="section-title"><div><span class="eyebrow">REGISTROS</span><h2>Histórico</h2></div><span class="soft-tag">${gymSessions.length} registro(s)</span></div><section class="panel-card"><div class="modern-list">${rows.map(s=>`<div class="modern-list-row"><div class="row-icon">${uiIcon(s.type==="Treino de academia"?"gym":"activity")}</div><div class="row-main"><b>${esc(s.workout||s.type||"Atividade")}</b><span>${fmtDate(s.date)}${s.duration?` • ${s.duration} min`:""}${Array.isArray(s.records)?` • ${s.records.length} exercícios`:""}</span></div><span class="soft-tag">Concluído</span></div>`).join("")||'<div class="empty">Nenhum treino registrado ainda.</div>'}</div></section></div>`;
}
function gymView(){
 const t=gymToday(), w=gymWeek(), c=gymCount();
 const tabs=[['week','Minha semana','calendar'],['exercises','Exercícios','gym'],['progress','Progresso','chart'],['history','Histórico','receipt']];
 const body=gymTab==='exercises'?gymExercisesView():gymTab==='progress'?gymProgressView():gymTab==='history'?gymHistoryView():`<div class="gym-tab-content"><div class="week-strip">${w.map((d,i)=>`<button class="week-day ${d.day===new Date().getDay()?'active':''}" data-gym-edit="${d.day}"><b>${d.label.slice(0,3)}</b><span>${i+1}</span></button>`).join('')}</div><section class="feature-card gym-feature"><div class="feature-top"><div><span class="eyebrow">TREINO DE HOJE</span><h2>${esc(t.workout)}</h2><p>${t.type==='rest'?'Recuperação':'Sessão principal'} • Objetivo: ${gymGoal()}</p></div><span class="soft-tag">Hoje</span></div><div class="feature-actions">${t.type==='rest'?'<span class="muted">Dia de recuperação. Uma caminhada leve é opcional.</span>':`<button class="btn primary" id="startGym">${uiIcon("playCircle")} Iniciar treino</button>`}<button class="btn" id="editTodayGym">${uiIcon("edit")} Editar treino</button><button class="btn" id="beachWalk">${uiIcon("activity")} Caminhada/corrida</button></div></section><section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("calendar")} Minha semana</h3><span>Toque em um dia para editar o treino.</span></div><button class="btn" id="editWeek">Editar semana</button></div><div class="modern-list">${w.map(d=>`<div class="modern-list-row gym-day-row"><button class="row-icon gym-edit-plus" type="button" data-gym-edit="${d.day}">${d.type==='rest'?uiIcon('check'):uiIcon('plus')}</button><div class="row-main"><b>${d.label}</b><span>${esc(d.workout)}</span></div><button class="soft-tag gym-edit-tag" type="button" data-gym-edit="${d.day}">${d.type==='gym'?'Editar':d.type==='optional'?'Opcional':'Descanso'}</button></div>`).join('')}</div></section><div class="stat-grid three"><section class="stat-card"><span>Treinos</span><b>${c}</b><small>esta semana</small></section><section class="stat-card"><span>Meta</span><b>4–5</b><small>dias por semana</small></section><section class="stat-card"><span>Nível</span><b>${esc(gymProfile?.level||'Iniciante')}</b><small>objetivo: ${esc(gymGoal())}</small></section></div></div>`;
 return `<div class="module-page"><div class="module-head"><div class="module-icon">${uiIcon("gym")}</div><div class="module-head-copy"><span class="eyebrow">MOVIMENTO</span><h1>GYM</h1><p>Sua rotina de treinos organizada</p></div><button class="icon-btn module-profile" id="gymProfile" aria-label="Configurações do GYM">${uiIcon("settings")}</button></div><div class="module-tabs gym-tabs">${tabs.map(([id,label,icon])=>`<button class="${gymTab===id?'active':''}" data-gym-tab="${id}">${uiIcon(icon)}${label}</button>`).join('')}</div>${body}</div>`;
}

function gymWorkout(){
 const p=gymToday(), ex=gymExercises(p);
 return `<div class="section-title"><h2>${esc(p.workout)}</h2><button class="btn" id="backGym">${uiIcon("back")} GYM</button></div>
 <section class="card full"><h3>Treino de hoje</h3><p class="muted">Comece com carga confortável e priorize aprender a técnica. O Zyn vai guardar seu histórico.</p></section>
 <div class="stack">${ex.map((e,i)=>`<section class="card full"><h3>${i+1}. ${esc(e[0])}</h3><div class="muted">${esc(e[1])} • ${e[2]} séries • ${e[3]} repetições • ${e[4]} descanso</div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Carga (kg)</label><input data-load="${i}" type="number" min="0" step=".5"></div><div class="field"><label>Repetições</label><input data-reps="${i}" type="number" min="0"></div></div><button class="btn" data-done="${i}" style="margin-top:10px">${uiIcon("check")} Marcar concluído</button></section>`).join("")}
 <button class="btn primary" id="finishGym" style="width:100%">${uiIcon("flag")} Finalizar treino</button></div>`;
}
function gymProfileForm(){
 const p=gymProfile||{}, el=modal(`<div class="row"><h2>Meu perfil GYM</h2><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="gp" class="stack"><div class="form-grid">
 <div class="field"><label>Objetivo</label><select name="goal"><option value="cut" ${p.goal==="cut"||!p.goal?"selected":""}>Perder gordura</option><option value="mass" ${p.goal==="mass"?"selected":""}>Ganhar massa</option><option value="maintain" ${p.goal==="maintain"?"selected":""}>Manter</option></select></div>
 <div class="field"><label>Nível</label><select name="level"><option ${!p.level||p.level==="Iniciante"?"selected":""}>Iniciante</option><option ${p.level==="Intermediário"?"selected":""}>Intermediário</option><option ${p.level==="Avançado"?"selected":""}>Avançado</option></select></div>
 <div class="field"><label>Treinos/semana</label><select name="days"><option>4</option><option selected>5</option></select></div><div class="field"><label>Tempo</label><select name="duration"><option selected>Variável</option><option>30 min</option><option>45 min</option><option>60 min</option><option>90 min</option></select></div>
 <div class="field full"><label>Atividade complementar</label><input name="extra" value="${esc(p.extra||"Caminhada/corrida na praia — segunda ou terça à noite")}"></div></div>
 <button class="btn primary">Salvar perfil</button></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#gp").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);gymProfile={id:1,goal:f.get("goal"),level:f.get("level"),days:Number(f.get("days")),duration:f.get("duration"),extra:f.get("extra")};await put("gymProfile",gymProfile);if(!gymPlans.length)for(const d of DEFAULT_GYM)await put("gymPlans",d);await loadData();closeModal(el);render();toast("Perfil GYM salvo")};
}
function gymWeekForm(){
 const w=gymWeek(),el=modal(`<div class="row"><h2>Editar minha semana</h2><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="gw" class="stack">${w.map(d=>`<div class="field"><label>${d.label}</label><select name="t${d.day}"><option value="gym">Treino</option><option value="optional">Opcional</option><option value="rest">Descanso</option></select><input name="w${d.day}" value="${esc(d.workout)}" style="margin-top:6px"></div>`).join("")}<button class="btn primary">Salvar semana</button></form>`);
 w.forEach(d=>el.querySelector(`[name="t${d.day}"]`).value=d.type);el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#gw").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);for(const d of w)await put("gymPlans",{day:d.day,label:d.label,type:f.get("t"+d.day),workout:f.get("w"+d.day)});await loadData();closeModal(el);render();toast("Semana atualizada")};
}
function beachForm(){
 const el=modal(`<div class="row"><h2>${uiIcon("activity")} Caminhada / Corrida</h2><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="bw" class="stack"><div class="form-grid"><div class="field"><label>Atividade</label><select name="type"><option>Caminhada na praia</option><option>Corrida na praia</option></select></div><div class="field"><label>Data</label><input name="date" type="date" value="${todayISO()}"></div><div class="field"><label>Duração (min)</label><input name="duration" type="number" min="1" value="30"></div></div><button class="btn primary">Registrar</button></form>`);
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
 const dayMeals=mealPlans.filter(x=>x.day===FOOD_DAYS[(new Date().getDay()+6)%7]);
 const meals=dayMeals.length?dayMeals:FOOD_DEFAULT.map(x=>({slot:x[0],items:x[1],tag:x[2]}));
 return `<div class="module-page">
  <div class="module-head"><div class="module-icon">${uiIcon("food")}</div><div class="module-head-copy"><h1>Dieta</h1><p>Sua alimentação de forma simples e organizada</p></div><button class="btn primary" id="foodProfile">⚙ Meu perfil</button></div>
  <div class="module-tabs"><button class="active">Hoje</button><button>Planejamento</button><button>Alimentos</button><button>Progresso</button></div>
  <div class="week-strip compact">${FOOD_DAYS.map((d,i)=>`<div class="week-day ${(i+1)%7===new Date().getDay()?"active":""}"><b>${d.slice(0,3)}</b><span>${25+i}</span></div>`).join("")}</div>
  <section class="feature-card food-feature"><span class="eyebrow">MINHA ALIMENTAÇÃO</span><h2>Comer melhor sem complicar</h2><p>3–4 refeições por dia, com foco em economia, praticidade e variedade.</p><div class="tag-row"><span class="soft-tag">Objetivo: perder gordura</span><span class="soft-tag">Referência: ${money(p.budget||125)}/semana</span></div></section>
  <section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("chart")} Resumo do dia</h3><span>Seu plano alimentar</span></div><span class="soft-tag">${meals.length} refeições</span></div><div class="stat-grid four"><div class="mini-stat"><b>1.450</b><span>kcal estimadas</span></div><div class="mini-stat"><b>65%</b><span>meta diária</span></div><div class="mini-stat"><b>1,5 L</b><span>água</span></div><div class="mini-stat"><b>${meals.length}</b><span>refeições</span></div></div></section>
  <section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("food")} Minhas refeições</h3><span>Hoje</span></div><button class="btn primary" id="generateMeals">+ Planejar semana</button></div><div class="modern-list meal-list">${meals.map((m,i)=>`<div class="modern-list-row"><div class="row-icon meal-icon">${[uiIcon("coffee"),uiIcon("food"),uiIcon("food"),uiIcon("food")][i%4]}</div><div class="row-main"><b>${esc(m.slot)}</b><span>${esc(m.items)}</span></div><span class="soft-tag">${esc(m.tag)}</span></div>`).join("")}</div></section>
  <section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("cart")} Lista de compras</h3><span>${shoppingItems.filter(x=>!x.done).length} itens pendentes</span></div><button class="btn" id="newShopping">+ Item</button></div><div class="modern-list">${shoppingItems.map(x=>`<div class="modern-list-row"><div class="row-main"><b>${esc(x.item)}</b><span>${x.done?"Comprado":"Pendente"}</span></div><button class="btn ${x.done?"primary":""}" data-shop="${x.id}">${x.done?"✓":"Marcar"}</button></div>`).join("")||'<div class="empty">Gere a semana para criar sua lista de compras.</div>'}</div></section>
 </div>`;
}
function foodProfileForm(){
 const p=foodProfile||{},el=modal(`<div class="row"><h2>Meu perfil alimentar</h2><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="foodForm" class="stack"><div class="form-grid">
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
 const el=modal(`<div class="row"><h2>Adicionar item</h2><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="shopForm" class="stack"><div class="field"><label>Item</label><input name="item" required placeholder="Ex.: tomate"></div><button class="btn primary">Adicionar</button></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#shopForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await put("shoppingItems",{item:f.get("item"),done:false});closeModal(el);await loadData();render();toast("Item adicionado")};
}
function syncMusicDock(){
 const dock=document.querySelector("#musicDock");
 if(!dock)return;
 const track=currentMusicTrack();
 const isPlaying=!!track && !!musicAudio && !musicAudio.paused && !musicAudio.ended;
 // O mini-player só aparece enquanto uma música estiver efetivamente tocando
 // e nunca sobre a tela completa de Música.
 const active=isPlaying && currentView!=="music";
 dock.classList.toggle("active",active);
 dock.classList.toggle("expanded",false);
 dock.setAttribute("aria-hidden",String(!active));
 const title=dock.querySelector("#dockTitle");
 const artist=dock.querySelector("#dockArtist");
 const play=dock.querySelector("#dockPlay");
 const cover=dock.querySelector("#dockCover");
 if(title)title.textContent=track?.title||"Nenhuma música";
 if(artist)artist.textContent=track?.artist||"Zyn Music";
 if(cover){cover.textContent=track?.cover?"":"♪";cover.style.backgroundImage=track?.cover?`url("${String(track.cover).replace(/"/g,"%22")}")`:"";}
 if(play){const playing=!!musicAudio&&!musicAudio.paused;play.textContent=playing?"Pause":"Reproduzir";}
 updateMusicUI();
}
function moreMenu(){const el=document.querySelector("#morePopover");if(!el)return;moreMenuOpen=!moreMenuOpen;el.classList.toggle("open",moreMenuOpen);el.setAttribute("aria-hidden",String(!moreMenuOpen));}
function closeMoreMenu(){const el=document.querySelector("#morePopover");if(el){el.classList.remove("open");el.setAttribute("aria-hidden","true")}moreMenuOpen=false;}


function layout(){return `<div class="shell"><header class="topbar"><div class="brand"><div class="brand-mark">Z</div><div><div class="title">Zyn</div></div></div><div class="actions"><button class="cloud-status offline" id="cloudStatus" title="Status da nuvem"><span></span>Entrar para sincronizar</button><button class="icon-btn install-btn" id="installBtn" title="Instalar Zyn" aria-label="Instalar Zyn" hidden>${uiIcon("download")}</button><button class="icon-btn" id="themeBtn" title="Alternar tema" aria-label="Alternar tema">${uiIcon("sun")}</button><button class="icon-btn" id="updateBtn" title="Atualizar aplicativo" aria-label="Atualizar aplicativo">${uiIcon("refresh")}</button></div></header><main id="content"></main></div><div id="musicDock" class="music-dock"><div class="music-dock-main"><div id="dockCover" class="music-dock-cover">${uiIcon("music")}</div><div class="music-dock-meta"><b id="dockTitle">Nenhuma música</b><span id="dockArtist">Zyn Music</span></div><button class="music-dock-btn" id="dockPrev" aria-label="Anterior" title="Anterior">${uiIcon("previous")}</button><button class="music-dock-btn dock-play" id="dockPlay" aria-label="Reproduzir" title="Reproduzir">${uiIcon("playCircle")}</button><button class="music-dock-btn" id="dockNext" aria-label="Próxima" title="Próxima">${uiIcon("next")}</button><button class="music-dock-open" id="dockOpen" aria-label="Abrir música" title="Abrir música">${uiIcon("music")}</button></div></div><nav class="nav"><div class="nav-inner"><button data-view="home" class="${currentView==="home"?"active":""}">${uiIcon("home")}<span>Início</span></button><button data-view="planning" class="${["planning","reminders","goals"].includes(currentView)?"active":""}">${uiIcon("plan")}<span>Planejar</span></button><button data-view="wellness" class="${["wellness","gym","gymWorkout","food","habits"].includes(currentView)?"active":""}">${uiIcon("well")}<span>Bem-estar</span></button><button data-view="finance" class="${["finance","investments"].includes(currentView)?"active":""}">${uiIcon("finance")}<span>Finanças</span></button><button data-view="assistant" class="${currentView==="assistant"?"active":""}">${uiIcon("assistant")}<span>Zyn</span></button></div></nav>`;}

function homeView(){
 const goal=activeGoal(), amount=goal?weekEarnings(goal):0, progress=goal?goalProgress(goal):0, today=goal?dayAmount(goal):0, pending=reminders.filter(r=>!r.done).length, gymSessionsCount=gymCount(), finance=financeMonthData(), track=currentMusicTrack(), inv=investmentSummary();
 return `<div class="module-page home-page"><section class="welcome-card"><div><span class="eyebrow">BEM-VINDO DE VOLTA</span><h1>Olá, Ramon</h1><p>Seu painel pessoal para organizar o dia, cuidar da rotina e acompanhar o que importa.</p></div><span class="date-chip">${new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</span></section>
 <div class="quick-grid"><button class="quick-card" data-home-view="planning"><span class="quick-icon">${uiIcon("plan")}</span><b>Planejar</b><small>${pending} pendente(s)</small></button><button class="quick-card" data-home-view="gym"><span class="quick-icon">${uiIcon("gym")}</span><b>GYM</b><small>${gymSessionsCount} sessão(ões)</small></button><button class="quick-card" data-home-view="finance"><span class="quick-icon">${uiIcon("finance")}</span><b>Finanças</b><small>${money(Math.max(0,finance.available))} disponível</small></button><button class="quick-card" data-home-view="investments"><span class="quick-icon">${uiIcon("investment")}</span><b>Investimentos</b><small>${money(inv.current)} em carteira</small></button><button class="quick-card" data-home-view="food"><span class="quick-icon">${uiIcon("food")}</span><b>Dieta</b><small>Plano alimentar</small></button><button class="quick-card" data-home-view="music"><span class="quick-icon">${uiIcon("music")}</span><b>Música</b><small>${musicTracks.length} faixa(s)</small></button></div>
 <section class="feature-card home-focus"><div><span class="eyebrow">META DA SEMANA</span><h2>${goal?esc(goal.name):"Crie sua primeira meta"}</h2><p>${goal?`${money(amount)} de ${money(goal.target)} nesta semana`:`Comece pelo Planejar para acompanhar sua meta.`}</p>${goal?`<div class="progress"><div style="width:${progress}%"></div></div><span class="muted">Hoje: ${money(today)} • ${progress.toFixed(0)}% concluído</span>`:`<button class="btn primary" id="homePlanning">Abrir Planejamento</button>`}</div><div class="focus-value">${goal?progress.toFixed(0)+"%":"—"}</div></section>
 <div class="home-bottom-grid"><section class="panel-card"><div class="panel-heading"><div><h3>Música: Tocando agora</h3><span>${esc(track?.artist||"Zyn Music")}</span></div><button class="btn" id="homeMusic">Abrir</button></div><b>${esc(track?.title||"Nenhuma música selecionada")}</b></section><section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("pin")} Resumo rápido</h3><span>Hoje</span></div></div><div class="mini-summary"><div><b>${pending}</b><span>Lembretes</span></div><div><b>${gymSessionsCount}</b><span>Treinos</span></div><div><b>${financeTransactions.length}</b><span>Lançamentos</span></div></div></section></div></div>`;
}
function planningTabButton(id,label,icon=""){
 return `<button data-planning-tab="${id}" class="${planningTab===id?"active":""}">${icon?uiIcon(icon):""}${label}</button>`;
}
function planningReminderRow(r){
 const today=r.date===todayISO(), overdue=!r.done&&r.date&&r.date<todayISO();
 return `<div class="modern-list-row planning-reminder-row ${r.done?"done":""}" data-planning-reminder="${r.id}" role="button" tabindex="0">
   <button class="row-icon planning-done-btn" type="button" data-planning-done="${r.id}" aria-label="${r.done?"Reabrir":"Concluir"}" title="${r.done?"Reabrir":"Concluir"}">${uiIcon(r.done?"check":"calendar")}</button>
   <div class="row-main"><b>${esc(r.title)}</b><span>${esc(r.category||"Geral")} • ${fmtDate(r.date)}${r.time?" • "+esc(r.time):""}</span>${r.notes?`<small>${esc(r.notes)}</small>`:""}</div>
   <span class="soft-tag ${overdue?"planning-overdue":""}">${r.done?"Concluído":overdue?"Atrasado":today?"Hoje":"Pendente"}</span>
 </div>`;
}
function planningTodayView(){
 const today=todayISO();
 const todayReminders=reminders.filter(r=>r.date===today).sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));
 const pendingToday=todayReminders.filter(r=>!r.done).length;
 const goal=activeGoal();
 const amount=goal?weekEarnings(goal):0;
 const p=goal?goalProgress(goal):0;
 const todayGain=goal?dayAmount(goal,today):earnings.filter(e=>e.date===today).reduce((s,e)=>s+Number(e.amount||0),0);
 return `<div class="planning-tab-content">
  <section class="feature-card planning-feature"><div>
   <span class="eyebrow">HOJE</span><h2>${new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</h2>
   <p>${pendingToday?`Você tem ${pendingToday} pendência(s) para hoje.`:"Sua agenda de hoje está em dia."}</p>
   <div class="feature-actions"><button class="btn primary" id="planningReminder">+ Novo lembrete</button>${goal?`<button class="btn" id="planningEditGoal">${uiIcon("edit")} Editar meta</button>`:`<button class="btn" id="planningGoal">+ Criar meta</button>`}</div>
  </div><div class="focus-value">${pendingToday}</div></section>
  <section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("calendar")} Agenda de hoje</h3><span>${todayReminders.length} item(ns) cadastrados</span></div><span class="soft-tag">${pendingToday} pendente(s)</span></div>
   <div class="modern-list">${todayReminders.map(planningReminderRow).join("")||'<div class="empty">Nenhum lembrete para hoje. Aproveite para organizar seu dia.</div>'}</div>
  </section>
  <div class="stat-grid three">
   <section class="stat-card"><span>Meta semanal</span><b>${goal?p.toFixed(0)+"%":"—"}</b><small>${goal?money(amount)+" de "+money(goal.target):"Nenhuma meta ativa"}</small></section>
   <section class="stat-card"><span>Ganho de hoje</span><b>${money(todayGain)}</b><small>registrado hoje</small></section>
   <section class="stat-card"><span>Pendências</span><b>${reminders.filter(r=>!r.done).length}</b><small>em todos os dias</small></section>
  </div>
 </div>`;
}
function planningWeekView(){
 const days=getCurrentWeekDays();
 const labels=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
 return `<div class="planning-tab-content">
  <section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("calendar")} Esta semana</h3><span>Visão dos seus lembretes por dia</span></div><span class="soft-tag">${reminders.filter(r=>!r.done).length} pendente(s)</span></div>
   <div class="planning-week-grid">${days.map((d,i)=>{const list=reminders.filter(r=>r.date===d).sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));const done=list.filter(r=>r.done).length;return `<article class="planning-day-card ${d===todayISO()?"today":""}"><div class="planning-day-head"><div><b>${labels[i]}</b><span>${fmtDate(d)}</span></div><strong>${done}/${list.length}</strong></div><div class="planning-day-list">${list.slice(0,4).map(r=>`<button class="planning-day-item ${r.done?"done":""}" data-planning-reminder="${r.id}"><span>${uiIcon(r.done?"check":"calendar")}</span><b>${esc(r.title)}</b><small>${r.time?esc(r.time):"Sem horário"}</small></button>`).join("")||'<span class="planning-day-empty">Livre</span>'}</div>${list.length>4?`<small class="muted">+${list.length-4} item(ns)</small>`:""}</article>`}).join("")}</div>
  </section>
  <section class="panel-card"><div class="panel-heading"><div><h3>Resumo semanal</h3><span>Planejamento e progresso</span></div><button class="btn primary" id="planningReminder">+ Lembrete</button></div>
   <div class="stat-grid three"><div class="stat-card"><span>Total de lembretes</span><b>${reminders.filter(r=>getCurrentWeekDays().includes(r.date)).length}</b><small>nesta semana</small></div><div class="stat-card"><span>Concluídos</span><b>${reminders.filter(r=>getCurrentWeekDays().includes(r.date)&&r.done).length}</b><small>finalizados</small></div><div class="stat-card"><span>Meta semanal</span><b>${activeGoal()?goalProgress(activeGoal()).toFixed(0)+"%":"—"}</b><small>progresso atual</small></div></div>
  </section>
 </div>`;
}
function planningGoalsView(){
 const active=activeGoal();
 return `<div class="planning-tab-content">
  <div class="section-title"><div><span class="eyebrow">OBJETIVOS</span><h2>Minhas metas</h2></div><button class="btn primary" id="planningGoal">+ Nova meta</button></div>
  <div class="stack">${goals.map(g=>{const amount=weekEarnings(g),p=goalProgress(g);return `<section class="panel-card planning-goal-card"><div class="panel-heading"><div><h3>${uiIcon("goal")} ${esc(g.name)}</h3><span>${g.active===false?"Inativa":"Meta semanal ativa"}</span></div><span class="soft-tag">${p.toFixed(0)}%</span></div><div class="planning-goal-values"><div><b>${money(amount)}</b><span>realizado</span></div><div><b>${money(g.target)}</b><span>objetivo</span></div><div><b>${money(g.dailyTarget)}</b><span>meta diária</span></div></div><div class="progress"><div style="width:${p}%"></div></div><div class="actions" style="margin-top:14px"><button class="btn primary" data-goal-earning="${g.id}">${uiIcon("money")} Registrar ganho</button><button class="btn" data-goal-edit="${g.id}">${uiIcon("edit")} Editar</button><button class="btn danger" data-goal-delete="${g.id}">${uiIcon("trash")} Excluir</button></div></section>`}).join("")||'<div class="empty">Nenhuma meta cadastrada. Crie uma meta para começar a acompanhar seu progresso.</div>'}</div>
  ${active?`<section class="panel-card"><div class="panel-heading"><div><h3>Progresso diário</h3><span>${esc(active.name)}</span></div><span class="soft-tag">${pLabel(goalProgress(active))}</span></div><div class="daily-grid">${getCurrentWeekDays().map((d,i)=>{const val=dayAmount(active,d),hit=val>=active.dailyTarget;return `<div class="day-box ${hit?"hit":""} ${d===todayISO()?"today":""}"><b>${["S","T","Q","Q","S","S","D"][i]}</b><br>${money(val).replace("R$","").trim()}${hit?" ✓":""}</div>`}).join("")}</div></section>`:""}
 </div>`;
}
function pLabel(value){return `${Number(value||0).toFixed(0)}% concluído`}
function planningRemindersView(){
 const pending=reminders.filter(r=>!r.done).sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.time||"").localeCompare(b.time||""));
 const done=reminders.filter(r=>r.done).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
 return `<div class="planning-tab-content"><div class="section-title"><div><span class="eyebrow">AGENDA</span><h2>Lembretes</h2></div><button class="btn primary" id="planningReminder">+ Novo lembrete</button></div>
  <section class="panel-card"><div class="panel-heading"><div><h3>Pendentes</h3><span>${pending.length} aguardando</span></div><span class="soft-tag">${pending.filter(r=>r.date===todayISO()).length} hoje</span></div><div class="modern-list">${pending.map(planningReminderRow).join("")||'<div class="empty">Nenhum lembrete pendente.</div>'}</div></section>
  <section class="panel-card"><div class="panel-heading"><div><h3>Concluídos</h3><span>${done.length} finalizado(s)</span></div></div><div class="modern-list">${done.slice(0,12).map(planningReminderRow).join("")||'<div class="empty">Nenhum lembrete concluído ainda.</div>'}</div>${done.length>12?'<p class="muted">Mostrando os 12 concluídos mais recentes.</p>':''}</section>
 </div>`;
}
function planningView(){
 const tabs=[planningTabButton("today","Hoje","home"),planningTabButton("week","Semana","calendar"),planningTabButton("goals","Metas","goal"),planningTabButton("reminders","Lembretes","bell")].join("");
 let body=planningTab==="week"?planningWeekView():planningTab==="goals"?planningGoalsView():planningTab==="reminders"?planningRemindersView():planningTodayView();
 return `<div class="module-page"><div class="module-head"><div class="module-icon">${uiIcon("plan")}</div><div class="module-head-copy"><span class="eyebrow">ORGANIZAÇÃO</span><h1>Planejar</h1><p>Organize tarefas, metas e lembretes em um só lugar</p></div><button class="icon-btn" id="planningQuickReminder" aria-label="Novo lembrete">${uiIcon("plus")}</button></div><div class="module-tabs planning-tabs">${tabs}</div>${body}</div>`;
}
function wellnessView(){
 const t=gymToday(),c=gymCount(),shopping=shoppingItems.filter(x=>!x.done).length;
 return `<div class="module-page"><div class="module-head"><div class="module-icon">✣</div><div class="module-head-copy"><h1>Bem-estar</h1><p>Cuide do corpo e da sua rotina</p></div></div><section class="feature-card wellness-feature"><div><span class="eyebrow">HOJE</span><h2>${esc(t.workout)}</h2><p>${t.type==="rest"?"Dia de recuperação":"Treino principal"} • ${c} sessão(ões) nesta semana</p></div><button class="btn primary" id="wellGym">Abrir GYM</button></section><div class="wellness-modern-grid"><button class="wellness-modern-card" data-well-view="gym"><span class="quick-icon">✚</span><span class="eyebrow">MOVIMENTO</span><h3>GYM</h3><p>Treino, semana e histórico.</p><b>${c} sessões</b></button><button class="wellness-modern-card" data-well-view="food"><span class="quick-icon">${uiIcon("food")}</span><span class="eyebrow">ALIMENTAÇÃO</span><h3>Dieta</h3><p>Refeições, perfil e compras.</p><b>${shopping} itens pendentes</b></button><button class="wellness-modern-card" data-well-view="habits"><span class="quick-icon">✓</span><span class="eyebrow">CONSISTÊNCIA</span><h3>Hábitos</h3><p>Rotinas para manter constância.</p><b>Em preparação</b></button></div></div>`;
}
function financeAccountOptions(selected=""){
  const cards=financeAccounts.filter(a=>a.type==="card");
  const opts=[`<option value="cash" ${selected==="cash"?"selected":""}>${uiIcon("money")} Dinheiro</option>`];
  for(const c of cards) opts.push(`<option value="card:${c.id}" ${selected===`card:${c.id}`?"selected":""}>${uiIcon("card")} ${esc(c.name||"Cartão")}</option>`);
  return opts.join("");
}
function accountBalance(id){
  if(id==="cash") return Number(financeProfile?.cashBalance||0);
  if(String(id).startsWith("card:")){const c=financeAccounts.find(x=>String(x.id)===String(id).slice(5));return Number(c?.balance||0);}
  return 0;
}
async function adjustFinanceAccount(accountId, delta){
  if(!accountId || !Number.isFinite(Number(delta))) return;
  const amount=Number(delta);
  if(accountId==="cash"){
    financeProfile={...(financeProfile||{id:1}),cashBalance:Number(financeProfile?.cashBalance||0)+amount};
    await put("financeProfile",financeProfile); return;
  }
  if(String(accountId).startsWith("card:")){
    const id=Number(String(accountId).slice(5));
    const c=financeAccounts.find(x=>Number(x.id)===id); if(!c) return;
    c.balance=Number(c.balance||0)+amount;
    await put("financeAccounts",c);
  }
}
async function reverseFinanceTransaction(tx){
  if(!tx?.accountId) return;
  const delta=tx.type==="income"||tx.type==="saving"?-Number(tx.amount||0):Number(tx.amount||0);
  await adjustFinanceAccount(tx.accountId,delta);
}
function financeMonthPicker(existingKey){
  const [yy,mm]=String(existingKey||monthKey()).split("-").map(Number);
  let year=yy;
  const el=modal(`<div class="custom-modal-head"><div><span class="eyebrow">FINANÇAS</span><h2>Selecionar mês</h2><p>Escolha o período que deseja visualizar.</p></div><button class="icon-btn" id="closeMonthPicker">×</button></div><div class="month-picker"><div class="month-picker-year"><button class="btn" id="monthPrev">‹</button><strong id="monthYear">${year}</strong><button class="btn" id="monthNext">›</button></div><div class="month-grid" id="monthGrid"></div></div>`);
  const renderMonths=()=>{const grid=el.querySelector("#monthGrid");grid.innerHTML=Array.from({length:12},(_,i)=>`<button class="month-choice ${year===yy&&i+1===mm?"active":""}" data-month="${i+1}">${new Date(year,i,1).toLocaleDateString("pt-BR",{month:"long"})}</button>`).join("");grid.querySelectorAll("[data-month]").forEach(b=>b.onclick=async()=>{const key=`${year}-${String(b.dataset.month).padStart(2,"0")}`;financeProfile={...(financeProfile||{id:1}),selectedMonth:key};await put("financeProfile",financeProfile);closeModal(el);await loadData();render();});el.querySelector("#monthYear").textContent=year;};
  el.querySelector("#closeMonthPicker").onclick=()=>closeModal(el);el.querySelector("#monthPrev").onclick=()=>{year--;renderMonths()};el.querySelector("#monthNext").onclick=()=>{year++;renderMonths()};renderMonths();
}
function financeMonthData(key=monthKey()){
 const tx=financeTransactions.filter(x=>String(x.date||"").slice(0,7)===key);
 const income=tx.filter(x=>x.type==="income").reduce((a,x)=>a+Number(x.amount||0),0);
 const expense=tx.filter(x=>x.type==="expense").reduce((a,x)=>a+Number(x.amount||0),0);
 const bills=financeBills.filter(x=>x.active!==false && String(x.dueDate||"").slice(0,7)===key);
 const billsTotal=bills.reduce((a,x)=>a+Number(x.amount||0),0);
 const goal=financeGoals.find(x=>x.active!==false);
 const saved=tx.filter(x=>x.type==="saving").reduce((a,x)=>a+Number(x.amount||0),0);
 const accountTotal=Number(financeProfile?.cashBalance||0)+financeAccounts.filter(a=>a.type==="card").reduce((sum,a)=>sum+Number(a.balance||0),0);
 return {tx,income,expense,bills,billsTotal,goal,saved,available:accountTotal};
}
function financeCategoryTotals(key=monthKey()){
 const out={};
 financeTransactions.filter(x=>x.type==="expense" && String(x.date||"").slice(0,7)===key).forEach(x=>{out[x.category||"Outros"]=(out[x.category||"Outros"]||0)+Number(x.amount||0)});
 return Object.entries(out).sort((a,b)=>b[1]-a[1]);
}

function investmentSummary(){
 const rows=investmentAssets||[];
 const invested=rows.reduce((s,x)=>s+Number(x.quantity||0)*Number(x.avgPrice||0),0);
 const current=rows.reduce((s,x)=>s+Number(x.quantity||0)*Number(x.currentPrice||x.avgPrice||0),0);
 const result=current-invested;
 const returnPct=invested?result/invested*100:0;
 const dividends=rows.reduce((s,x)=>s+Number(x.dividends||0),0);
 return {invested,current,result,returnPct,dividends,count:rows.length};
}
function investmentTypeLabel(type){
 return ({stock:"Ações",fii:"FIIs",etf:"ETFs",fixed:"Renda fixa",crypto:"Cripto",other:"Outros"})[type]||"Outros";
}
function investmentForm(existing={}){
 const el=modal(`<div class="row"><div><span class="eyebrow">CARTEIRA</span><h2 style="margin:3px 0">${existing.id?"Editar ativo":"Novo investimento"}</h2></div><button class="btn" id="closeInvestment">×</button></div>
 <form id="investmentForm" class="stack"><div class="form-grid">
  <div class="field"><label>Ticker / código *</label><input name="ticker" required value="${esc(existing.ticker||"")} " placeholder="Ex.: PETR4"></div>
  <div class="field"><label>Nome *</label><input name="name" required value="${esc(existing.name||"")} " placeholder="Ex.: Petrobras PN"></div>
  <div class="field"><label>Tipo</label><select name="type">
   ${["stock","fii","etf","fixed","crypto","other"].map(t=>`<option value="${t}" ${existing.type===t?"selected":""}>${investmentTypeLabel(t)}</option>`).join("")}
  </select></div>
  <div class="field"><label>Quantidade</label><input name="quantity" type="number" min="0" step="0.000001" value="${existing.quantity??0}"></div>
  <div class="field"><label>Preço médio (R$)</label><input name="avgPrice" type="number" min="0" step="0.01" value="${existing.avgPrice??0}"></div>
  <div class="field"><label>Preço atual (R$)</label><input name="currentPrice" type="number" min="0" step="0.01" value="${existing.currentPrice??existing.avgPrice??0}"></div>
  <div class="field"><label>Proventos recebidos (R$)</label><input name="dividends" type="number" min="0" step="0.01" value="${existing.dividends??0}"></div>
  <div class="field"><label>Instituição</label><input name="institution" value="${esc(existing.institution||"")} " placeholder="Ex.: XP, Inter, Nubank"></div>
  <div class="field full"><label>Observação</label><textarea name="notes" rows="2" placeholder="Opcional">${esc(existing.notes||"")}</textarea></div>
 </div><button class="btn primary" type="submit">${existing.id?"Salvar alterações":"Adicionar à carteira"}</button></form>`);
 el.querySelector("#closeInvestment").onclick=()=>closeModal(el);
 el.querySelector("#investmentForm").onsubmit=async e=>{
  e.preventDefault(); const f=new FormData(e.target);
  const data={...(existing.id?existing:{}),ticker:String(f.get("ticker")||"").trim().toUpperCase(),name:String(f.get("name")||"").trim(),
   type:f.get("type"),quantity:Number(f.get("quantity")||0),avgPrice:Number(f.get("avgPrice")||0),currentPrice:Number(f.get("currentPrice")||0),
   dividends:Number(f.get("dividends")||0),institution:String(f.get("institution")||"").trim(),notes:String(f.get("notes")||"").trim()};
  await put("investmentAssets",data); closeModal(el); await loadData(); render(); toast(existing.id?"Investimento atualizado":"Investimento adicionado");
 };
}
function investmentsView(){
 const s=investmentSummary();
 const allocation={}; investmentAssets.forEach(x=>{const v=Number(x.quantity||0)*Number(x.currentPrice||x.avgPrice||0);const k=investmentTypeLabel(x.type);allocation[k]=(allocation[k]||0)+v;});
 const alloc=Object.entries(allocation).sort((a,b)=>b[1]-a[1]);
 return `<div class="module-page investments-page">
  <div class="module-head"><div class="module-icon chart-icon">↗</div><div class="module-head-copy"><span class="eyebrow">FINANÇAS</span><h1>Investimentos</h1><p>Acompanhe sua carteira e faça seu patrimônio crescer</p></div><button class="icon-btn">♡</button></div>
  <div class="module-tabs"><button class="active">Visão Geral</button><button>Carteira</button><button>Ações</button><button>FIIs</button><button>Metas</button></div>
  <section class="investment-modern-hero"><div><span class="eyebrow">PATRIMÔNIO TOTAL</span><strong>${money(s.current)}</strong><span>Valor atual estimado da carteira</span><div class="result-pill ${s.result>=0?"positive":"negative"}">${s.result>=0?"+":"-"}${money(Math.abs(s.result))} • ${s.returnPct.toFixed(2)}%</div></div><div class="fake-sparkline">╱╲╱╲╱╲╱╲╱</div></section>
  <div class="stat-grid four investment-stats"><div class="mini-stat"><span>${uiIcon("money")} Aportes</span><b>${money(s.invested)}</b><small>capital aplicado</small></div><div class="mini-stat"><span>${uiIcon("chart")} Rendimentos</span><b>${money(Math.max(0,s.result))}</b><small>resultado</small></div><div class="mini-stat"><span>${uiIcon("chart")} Lucro/Prejuízo</span><b>${s.result>=0?"+":"-"}${money(Math.abs(s.result))}</b><small>${s.returnPct.toFixed(2)}%</small></div><div class="mini-stat"><span>${uiIcon("money")} Proventos</span><b>${money(s.dividends)}</b><small>recebidos</small></div></div>
  <section class="panel-card"><div class="panel-heading"><div><h3>Minha carteira</h3><span>${s.count} ativos cadastrados</span></div><button class="btn primary" id="investmentAdd">+ Adicionar ativo</button></div>
   ${investmentAssets.length?`<div class="investment-modern-list">${investmentAssets.map(x=>{const cost=Number(x.quantity||0)*Number(x.avgPrice||0),cur=Number(x.quantity||0)*Number(x.currentPrice||x.avgPrice||0),r=cur-cost,pct=cost?r/cost*100:0;return `<div class="investment-modern-row"><div class="asset-badge">${esc((x.ticker||"?").slice(0,4))}</div><div class="row-main"><b>${esc(x.ticker||x.name)}</b><span>${esc(x.name||"Sem nome")} • ${investmentTypeLabel(x.type)}</span></div><div class="asset-number"><b>${money(cur)}</b><span class="${r>=0?"positive":"negative"}">${r>=0?"+":""}${pct.toFixed(1)}%</span></div><div class="actions"><button class="btn" data-invest-edit="${x.id}">Editar</button><button class="btn danger" data-invest-delete="${x.id}">×</button></div></div>`}).join("")}</div>`:`<div class="investment-empty"><div class="investment-empty-icon">↗</div><h3>Sua carteira começa aqui</h3><p>Cadastre seu primeiro ativo para acompanhar patrimônio, resultado e distribuição.</p><button class="btn primary" id="investmentEmptyAdd">Adicionar investimento</button></div>`}
  </section>
  <div class="investment-bottom-grid"><section class="panel-card"><div class="panel-heading"><div><h3>Distribuição</h3><span>Alocação da carteira</span></div></div>${alloc.length?`<div class="allocation-list">${alloc.map(([k,v])=>{const pct=s.current?v/s.current*100:0;return `<div class="allocation-item"><div class="row"><b>${esc(k)}</b><span>${pct.toFixed(0)}%</span></div><div class="progress"><div style="width:${Math.min(100,pct)}%"></div></div><small>${money(v)}</small></div>`}).join("")}</div>`:`<div class="empty">Cadastre ativos para visualizar a distribuição.</div>`}</section><section class="panel-card"><div class="panel-heading"><div><h3>Próximas ações</h3><span>Gestão da carteira</span></div></div><div class="modern-list"><div class="modern-list-row"><div class="row-icon">＋</div><div class="row-main"><b>Adicionar aporte</b><span>Registre uma nova compra</span></div></div><div class="modern-list-row"><div class="row-icon">↻</div><div class="row-main"><b>Atualizar preços</b><span>Os preços são informados por você</span></div></div></div></section></div>
 </div>`;
}
function financeCardsView(){const cards=financeAccounts.filter(c=>c.type==="card"||c.last4||c.limit!==undefined),bal=financeBalanceAccounts();return `<section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("card")} Contas e cartões</h3><span>${cards.length} cartão(ões) + dinheiro</span></div><div class="actions"><button class="btn" id="financeCashEdit">${uiIcon("money")} Dinheiro</button><button class="btn primary" id="financeCardAdd">+ Adicionar</button></div></div><div class="finance-wallet-total"><span>Saldo total disponível</span><b>${money(bal.total)}</b><small>Dinheiro + cartões em modo débito</small></div><div class="finance-card-grid"><article class="finance-card-item finance-cash-item"><div class="row"><div><span class="eyebrow">DINHEIRO</span><h3>Carteira</h3></div><span class="soft-tag">${uiIcon("money")}</span></div><div class="finance-card-balance"><span>Saldo disponível</span><b>${money(bal.cash)}</b></div><div class="row"><small>Modo débito</small><small>Dinheiro físico</small></div><div class="actions"><button class="btn" id="financeCashEditCard">Editar saldo</button></div></article>${cards.map(c=>`<article class="finance-card-item"><div class="row"><div><span class="eyebrow">CARTÃO</span><h3>${esc(c.name||"Meu cartão")}</h3></div><span class="soft-tag">•••• ${esc(c.last4||"0000")}</span></div><div class="finance-card-balance"><span>Saldo disponível</span><b>${money(Number(c.balance||0))}</b></div><div class="row"><small>Modo débito</small><small>Saldo disponível</small></div><div class="actions"><button class="btn" data-fin-card-edit="${c.id}">Editar</button><button class="btn danger" data-fin-card-delete="${c.id}">Excluir</button></div></article>`).join("")}</div>${cards.length===0?'<div class="empty" style="margin-top:12px">Adicione Nubank, Agibank ou outro cartão para controlar cada saldo separadamente.</div>':''}</section>`;}
function financeExpensesView(){const key=financeProfile?.selectedMonth||monthKey(),d=financeMonthData(key),cats=financeCategoryTotals(key);return `<section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("chart")} Gastos por categoria</h3><span>${esc(financeMonthLabel(key))}</span></div><div class="actions"><button class="btn" id="financeMonth">${uiIcon("calendar")} ${esc(financeMonthLabel(key))}</button><button class="btn primary" id="financeAdd">+ Gasto</button></div></div>${cats.length?`<div class="category-list">${cats.map(([c,v])=>`<div class="category-row"><div><b>${esc(c)}</b><span>${money(v)}</span></div><div class="progress"><div style="width:${d.expense?Math.min(100,v/d.expense*100):0}%"></div></div></div>`).join('')}</div>`:'<div class="empty">Nenhuma despesa registrada neste mês.</div>'}</section><section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("receipt")} Lançamentos</h3><span>${d.tx.length} registro(s)</span></div><button class="btn" id="financeAddIncome">+ Entrada</button></div><div class="modern-list">${d.tx.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(x=>`<div class="modern-list-row finance-tx-row" data-fin-tx-open="${x.id}" role="button" tabindex="0"><div class="row-icon">${x.type==='expense'?'−':x.type==='saving'?'◈':'＋'}</div><div class="row-main"><b>${esc(x.description)}</b><span>${esc(x.category||'Outros')} • ${fmtDate(x.date)} • ${esc(x.account||'')}</span></div><strong class="${x.type==='expense'?'negative':'positive'}">${x.type==='expense'?'−':'+'}${money(x.amount)}</strong><div class="actions"><button class="btn" data-fin-tx-edit="${x.id}">Editar</button><button class="btn danger" data-fin-tx-delete="${x.id}">×</button></div></div>`).join('')||'<div class="empty">Nenhum lançamento neste mês.</div>'}</div></section>`;}

function financeGoalsView(){return `<section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("goal")} Metas financeiras</h3><span>Objetivos para organizar seu dinheiro</span></div><button class="btn primary" id="financeGoalAdd">+ Nova meta</button></div><div class="modern-list">${financeGoals.map(g=>{const current=Number(g.current||0),target=Number(g.target||0),pct=target?Math.min(100,current/target*100):0;return `<div class="finance-goal-item"><div class="row"><div class="row-main"><b>${esc(g.name||"Meta")}</b><span>${money(current)} de ${money(target)}</span></div><span>${pct.toFixed(0)}%</span></div><div class="progress"><div style="width:${pct}%"></div></div><div class="actions"><button class="btn" data-fin-goal-edit="${g.id}">Editar</button><button class="btn danger" data-fin-goal-delete="${g.id}">Excluir</button></div></div>`}).join("")||'<div class="empty">Crie uma meta financeira, como reserva de emergência ou viagem.</div>'}</div></section>`;}
function financeCashForm(){const current=Number(financeProfile?.cashBalance||0);const el=modal(`<div class="custom-modal-head"><div><span class="eyebrow">FINANÇAS</span><h2>Saldo em dinheiro</h2><p>Defina quanto dinheiro físico está disponível.</p></div><button class="icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="financeCashForm" class="stack"><div class="field"><label>Saldo disponível (R$)</label><input name="balance" type="number" min="0" step=".01" value="${current.toFixed(2)}"></div><p class="muted">Movimentações escolhendo “Dinheiro” serão somadas ou descontadas deste saldo.</p><button class="btn primary">Salvar saldo</button></form>`);el.querySelector("#close").onclick=()=>closeModal(el);el.querySelector("#financeCashForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);financeProfile={...(financeProfile||{id:1}),cashBalance:Number(f.get("balance")||0)};await put("financeProfile",financeProfile);closeModal(el);await loadData();render();toast("Saldo em dinheiro atualizado")};}
function financeBalanceAccounts(){const cash=Number(financeProfile?.cashBalance||0);const cards=financeAccounts.filter(a=>a.type==="card");return {cash,cards,total:cash+cards.reduce((s,a)=>s+Number(a.balance||0),0)};}
function financeCardForm(existing={}){const el=modal(`<div class="custom-modal-head"><div><span class="eyebrow">FINANÇAS</span><h2>${existing.id?"Editar":"Adicionar"} cartão</h2><p>Use o cartão como uma conta de débito com saldo disponível.</p></div><button class="icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="financeCardForm" class="stack"><div class="form-grid"><div class="field full"><label>Nome *</label><input name="name" required value="${esc(existing.name||"")}" placeholder="Ex.: Nubank"></div><div class="field"><label>Últimos 4 dígitos</label><input name="last4" maxlength="4" value="${esc(existing.last4||"")}" placeholder="4582"></div><div class="field"><label>Saldo disponível (R$)</label><input name="balance" type="number" min="0" step=".01" value="${existing.balance??Math.max(0,Number(existing.limit||0)-Number(existing.used||0))}"></div></div><button class="btn primary">Salvar cartão</button></form>`);el.querySelector("#close").onclick=()=>closeModal(el);el.querySelector("#financeCardForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await put("financeAccounts",{...(existing.id?existing:{}),name:String(f.get("name")||"").trim(),last4:String(f.get("last4")||""),balance:Number(f.get("balance")||0),type:"card"});closeModal(el);await loadData();render();toast("Cartão salvo")};}
function financeGoalForm(existing={}){const el=modal(`<div class="row"><h2>${existing.id?"Editar":"Nova"} meta financeira</h2><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div><form id="financeGoalForm" class="stack"><div class="form-grid"><div class="field full"><label>Nome da meta *</label><input name="name" required value="${esc(existing.name||"")}" placeholder="Ex.: Reserva de emergência"></div><div class="field"><label>Valor alvo (R$)</label><input name="target" type="number" min="0" step=".01" value="${existing.target||0}"></div><div class="field"><label>Já guardado (R$)</label><input name="current" type="number" min="0" step=".01" value="${existing.current||0}"></div><div class="field full"><label>Prazo</label><input name="deadline" type="date" value="${existing.deadline||""}"></div></div><button class="btn primary">Salvar meta</button></form>`);el.querySelector("#close").onclick=()=>closeModal(el);el.querySelector("#financeGoalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await put("financeGoals",{...(existing.id?existing:{}),name:f.get("name"),target:Number(f.get("target")||0),current:Number(f.get("current")||0),deadline:f.get("deadline"),active:true});closeModal(el);await loadData();render();toast("Meta financeira salva")};}

function financeView(){const key=financeProfile?.selectedMonth||monthKey(),d=financeMonthData(key),cats=financeCategoryTotals(key);const plannedIncome=Number(financeProfile?.monthlyIncome||0),fixed=financeBills.filter(x=>x.active!==false).reduce((a,x)=>a+Number(x.amount||0),0),limit=Math.max(0,(plannedIncome||d.income)-fixed-(financeProfile?.monthlySavingsTarget||0));return `<div class="module-page finance-page"><div class="module-head"><div class="module-icon">${uiIcon("finance")}</div><div class="module-head-copy"><h1>Finanças</h1><p>Controle seus cartões e acompanhe seus gastos</p></div><button class="icon-btn" id="financeProfileBtn" aria-label="Configurações financeiras">${uiIcon("settings")}</button></div><div class="module-tabs finance-tabs"><button data-finance-tab="overview" class="${financeTab==="overview"?"active":""}">Visão Geral</button><button data-finance-tab="cards" class="${financeTab==="cards"?"active":""}">Cartões</button><button data-finance-tab="expenses" class="${financeTab==="expenses"?"active":""}">Gastos</button><button data-finance-tab="goals" class="${financeTab==="goals"?"active":""}">Metas</button></div>${financeTab==="cards"?financeCardsView():financeTab==="expenses"?financeExpensesView():financeTab==="goals"?financeGoalsView():`<section class="finance-investment-card"><div class="investment-small-icon">↗</div><div class="row-main"><span class="eyebrow">PATRIMÔNIO</span><h3>Investimentos</h3><p>Carteira de ações, FIIs, ETFs e outros ativos.</p></div><button class="btn primary" id="openInvestments">Abrir carteira</button></section><section class="finance-summary-card"><div><span class="eyebrow">SALDO DISPONÍVEL</span><strong>${money(Math.max(0,d.available))}</strong><span>${d.available>=0?"Dentro do planejamento":"Orçamento estourado"}</span></div><div class="summary-orb">${d.available>=0?"✓":"!"}</div></section><section class="panel-card finance-wallet-panel"><div class="panel-heading"><div><h3>${uiIcon("card")} Saldos disponíveis</h3><span>Dinheiro e cartões em modo débito</span></div><button class="btn" id="financeGoCards">${uiIcon("card")} Gerenciar</button></div><div class="finance-balance-grid"><div class="finance-balance-chip"><span>${uiIcon("money")} Dinheiro</span><b>${money(Number(financeProfile?.cashBalance||0))}</b></div>${financeAccounts.filter(a=>a.type==="card").slice(0,5).map(a=>`<div class="finance-balance-chip"><span>${uiIcon("card")} ${esc(a.name||"Cartão")}</span><b>${money(Number(a.balance||0))}</b></div>`).join("")}</div></section><section class="panel-card"><div class="panel-heading"><div><h3>Visão do mês</h3><span class="month-label">${esc(financeMonthLabel(key))}</span></div><button class="btn" id="financeMonth">${uiIcon("calendar")} ${esc(financeMonthLabel(key))}</button></div><div class="stat-grid four"><div class="mini-stat"><span>Entradas</span><b>${money(d.income)}</b><small>registradas</small></div><div class="mini-stat"><span>Despesas</span><b>${money(d.expense)}</b><small>gastos</small></div><div class="mini-stat"><span>Contas fixas</span><b>${money(d.billsTotal)}</b><small>${d.bills.length} conta(s)</small></div><div class="mini-stat"><span>Pode sobrar</span><b>${money(Math.max(0,d.available))}</b><small>saldo</small></div></div></section><section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("goal")} Plano para sobrar dinheiro</h3><span>Meta mensal de economia</span></div><span class="soft-tag">${financeProfile?.monthlySavingsTarget?money(financeProfile.monthlySavingsTarget)+" alvo":"Defina um alvo"}</span></div><div class="money-split"><div><b>${money(d.saved)}</b><span>guardado no mês</span></div><div><b>${money(Math.max(0,(financeProfile?.monthlySavingsTarget||0)-d.saved))}</b><span>faltam para a meta</span></div></div><div class="progress"><div style="width:${financeProfile?.monthlySavingsTarget?Math.min(100,d.saved/financeProfile.monthlySavingsTarget*100):0}%"></div></div><p class="muted">Limite sugerido de gastos variáveis: <b>${money(limit)}</b> no mês.</p></section><section class="panel-card"><div class="panel-heading"><div><h3>${uiIcon("pin")} Contas fixas</h3><span>${financeBills.filter(x=>x.active!==false).length} cadastradas</span></div><button class="btn" id="financeBill">${uiIcon("receipt")} Conta</button></div><div class="modern-list">${financeBills.filter(x=>x.active!==false).map(x=>`<div class="modern-list-row"><div class="row-icon">▣</div><div class="row-main"><b>${esc(x.name)}</b><span>Vencimento: ${fmtDate(x.dueDate)}</span></div><strong>${money(x.amount)}</strong></div>`).join("")||'<div class="empty">Cadastre suas contas recorrentes.</div>'}</div></section><section class="panel-card"><div class="panel-heading"><div><h3>Últimas movimentações</h3><span>${d.tx.length} no mês</span></div><button class="btn primary" id="financeAdd">${uiIcon("plus")} Lançamento</button></div><div class="modern-list">${d.tx.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,8).map(x=>`<div class="modern-list-row finance-tx-row" data-fin-tx-open="${x.id}" role="button" tabindex="0"><div class="row-icon">${x.type==="expense"?"−":"＋"}</div><div class="row-main"><b>${esc(x.description)}</b><span>${esc(x.category||"Outros")} • ${fmtDate(x.date)}</span></div><strong class="${x.type==="expense"?"negative":"positive"}">${x.type==="expense"?"−":"+"}${money(x.amount)}</strong></div>`).join("")||'<div class="empty">Nenhuma movimentação neste mês.</div>'}</div></section><section class="panel-card"><div class="panel-heading"><div><h3>Gastos por categoria</h3><span>Onde o dinheiro está indo</span></div></div>${cats.length?`<div class="category-list">${cats.slice(0,8).map(([c,v])=>`<div class="category-row"><div><b>${esc(c)}</b><span>${money(v)}</span></div><div class="progress"><div style="width:${d.expense?Math.min(100,v/d.expense*100):0}%"></div></div></div>`).join("")}</div>`:'<div class="empty">Registre despesas para visualizar as categorias.</div>'}</section>`}</div>`;}

function financeProfileForm(){
 const p=financeProfile||{};
 const el=modal(`<div class="row"><h2>Planejamento financeiro</h2><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div>
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
function financeTransactionForm(existing={}){
 const selected=existing.accountId||"cash";
 const el=modal(`<div class="custom-modal-head"><div><span class="eyebrow">FINANÇAS</span><h2>${existing.id?'Editar':'Novo'} lançamento</h2><p>Escolha de onde o dinheiro entra ou sai.</p></div><button class="icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div>
 <form id="financeTxForm" class="stack"><div class="form-grid">
 <div class="field"><label>Tipo</label><select name="type"><option value="expense">Despesa</option><option value="income">Entrada</option><option value="saving">Guardado</option></select></div>
 <div class="field"><label>Valor (R$) *</label><input name="amount" type="number" min=".01" step=".01" required value="${existing.amount??''}"></div>
 <div class="field full"><label>Descrição *</label><input name="description" required value="${esc(existing.description||'')}" placeholder="Ex.: supermercado"></div>
 <div class="field"><label>Data</label><input name="date" type="date" value="${existing.date||todayISO()}"></div>
 <div class="field"><label>Categoria</label><select name="category">${['Alimentação','Transporte','Moradia','Contas','Saúde','Lazer','Trabalho','Compras','Cartão','Outros'].map(x=>`<option ${existing.category===x?'selected':''}>${x}</option>`).join('')}</select></div>
 <div class="field full"><label>Conta / cartão</label><select name="accountId">${financeAccountOptions(selected)}</select><small class="muted">O valor será somado ou descontado do saldo disponível.</small></div>
 <div class="field full"><label>Observação</label><input name="notes" value="${esc(existing.notes||'')}" placeholder="Opcional"></div>
 </div><button class="btn primary">${existing.id?'Salvar alterações':'Salvar lançamento'}</button></form>`);
 el.querySelector('[name="type"]').value=existing.type||'expense';el.querySelector('#close').onclick=()=>closeModal(el);
 el.querySelector('#financeTxForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const data={...(existing.id?existing:{}),type:f.get('type'),amount:Number(f.get('amount')),description:String(f.get('description')||'').trim(),date:f.get('date'),category:f.get('category'),accountId:f.get('accountId'),account:f.get('accountId')==='cash'?'Dinheiro':(financeAccounts.find(x=>String(x.id)===String(f.get('accountId')).slice(5))?.name||''),notes:f.get('notes')};if(existing.id) await reverseFinanceTransaction(existing);await put('financeTransactions',data);const delta=(data.type==='income'||data.type==='saving'?1:-1)*data.amount;await adjustFinanceAccount(data.accountId,delta);closeModal(el);await loadData();render();toast(existing.id?'Lançamento atualizado':'Lançamento salvo')};
}

function financeBillForm(){
 const el=modal(`<div class="row"><h2>Nova conta fixa</h2><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div>
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
 const el=modal(`<div class="row"><h2>${existing.id?"Editar":"Novo"} lembrete</h2><button class="btn icon-btn" id="closeModal" aria-label="Fechar">${uiIcon("close")}</button></div><form id="reminderForm" class="stack"><div class="form-grid"><div class="field full"><label>Título *</label><input name="title" required value="${esc(existing.title||"")}" placeholder="Ex.: Pagar internet"></div><div class="field"><label>Categoria</label><select name="category"><option ${existing.category==="Conta"?"selected":""}>Conta</option><option ${existing.category==="Trabalho"?"selected":""}>Trabalho</option><option ${existing.category==="Saúde"?"selected":""}>Saúde</option><option ${existing.category==="Pessoal"?"selected":""}>Pessoal</option><option ${!existing.category||existing.category==="Geral"?"selected":""}>Geral</option></select></div><div class="field"><label>Data *</label><input type="date" name="date" required value="${existing.date||todayISO()}"></div><div class="field"><label>Horário</label><input type="time" name="time" value="${existing.time||""}"></div><div class="field"><label>Repetição</label><select name="repeat"><option value="none">Não repetir</option><option value="daily">Diário</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select></div><div class="field full"><label>Observação</label><textarea name="notes" rows="3" placeholder="Detalhes opcionais">${esc(existing.notes||"")}</textarea></div></div><button class="btn primary" type="submit">Salvar lembrete</button></form>`);
 el.querySelector("#closeModal").onclick=()=>closeModal(el);
 el.querySelector("#reminderForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const data={...(existing.id?existing:{}),title:f.get("title"),category:f.get("category"),date:f.get("date"),time:f.get("time"),repeat:f.get("repeat"),notes:f.get("notes"),done:existing.done||false};await put("reminders",data);closeModal(el);await loadData();render();toast("Lembrete salvo")};
}

function goalForm(existing={}){
 const el=modal(`<div class="row"><h2>${existing.id?"Editar":"Nova"} meta</h2><button class="btn icon-btn" id="closeModal" aria-label="Fechar">${uiIcon("close")}</button></div><form id="goalForm" class="stack"><div class="form-grid"><div class="field full"><label>Nome da meta *</label><input name="name" required value="${esc(existing.name||"Meta Uber e Entregas")}"></div><div class="field"><label>Valor semanal (R$) *</label><input name="target" type="number" min="1" step=".01" required value="${existing.target||700}"></div><div class="field"><label>Divisão diária</label><input name="days" type="number" min="1" max="7" value="7" readonly></div><div class="field"><label>Fonte de renda</label><select name="source"><option value="all" ${existing.source==="all"||!existing.source?"selected":""}>Uber + Entregas</option><option value="Uber" ${existing.source==="Uber"?"selected":""}>Uber</option><option value="Entregas" ${existing.source==="Entregas"?"selected":""}>Entregas</option></select></div><div class="field"><label>Meta diária calculada</label><input name="dailyTarget" readonly value="${Number(existing.dailyTarget||existing.target/7||100).toFixed(2)}"></div></div><p class="muted">A meta será dividida automaticamente por 7 dias. Você poderá registrar ganhos parciais e acompanhar cada dia da semana.</p><button class="btn primary" type="submit">Salvar meta</button></form>`);
 el.querySelector("#closeModal").onclick=()=>closeModal(el);
 const targetInput=el.querySelector('[name="target"]');const dailyInput=el.querySelector('[name="dailyTarget"]');
 targetInput.addEventListener("input",()=>dailyInput.value=(Number(targetInput.value||0)/7).toFixed(2));
 el.querySelector("#goalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const target=Number(f.get("target"));const data={...(existing.id?existing:{}),name:f.get("name"),target,dailyTarget:target/7,source:f.get("source"),active:true,updatedAt:new Date().toISOString()};await put("goals",data);closeModal(el);await loadData();render();toast("Meta salva")};
}

function earningForm(goalId){
 const goal=goals.find(g=>g.id===Number(goalId))||activeGoal();
 const el=modal(`<div class="row"><h2>Registrar ganho</h2><button class="btn icon-btn" id="closeModal" aria-label="Fechar">${uiIcon("close")}</button></div><form id="earningForm" class="stack"><div class="form-grid"><div class="field"><label>Valor (R$) *</label><input name="amount" type="number" min=".01" step=".01" required placeholder="100"></div><div class="field"><label>Data *</label><input name="date" type="date" required value="${todayISO()}"></div><div class="field"><label>Origem</label><select name="source"><option>Uber</option><option>Entregas</option></select></div><div class="field"><label>Observação</label><input name="notes" placeholder="Ex.: turno da noite"></div></div><p class="muted">Meta diária atual: ${goal?money(goal.dailyTarget):"—"}</p><button class="btn primary" type="submit">Registrar ganho</button></form>`);
 el.querySelector("#closeModal").onclick=()=>closeModal(el);
 el.querySelector("#earningForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await put("earnings",{amount:Number(f.get("amount")),date:f.get("date"),source:f.get("source"),notes:f.get("notes"),goalId:goal?.id||null,createdAt:new Date().toISOString()});closeModal(el);await loadData();render();toast("Ganho registrado")};
}

function setCloudStatus(status,message){cloudStatus=status;cloudMessage=message||"";const el=document.querySelector("#cloudStatus");if(el){el.className=`cloud-status ${status}`;el.title=cloudMessage;el.innerHTML=`<span></span>${esc(message||status)}`;}}
function currentUser(){return authSession?.user||null;}
async function refreshAuth(){const {data,error}=await supabase.auth.getSession();if(error) throw error;authSession=data.session||null;return authSession;}
async function signIn(email,password){const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error) throw error;authSession=data.session;if(!authSession) throw new Error("Não foi possível iniciar a sessão.");markAppUnlocked();await syncAll("login");render();toast("Nuvem: Conta conectada e dados sincronizados");}
async function signUp(email,password){const {data,error}=await supabase.auth.signUp({email,password});if(error) throw error;authSession=data.session||null;if(data.session){markAppUnlocked();await syncAll("signup");render();toast("Nuvem: Conta criada e sincronizada");}else{toast("Conta criada. Confira seu e-mail para confirmar o cadastro.");}}
async function signOut(){await supabase.auth.signOut();authSession=null;lockApp();setCloudStatus("offline","Sessão encerrada — entre novamente para acessar o Zyn");render();toast("Você saiu da conta. Seus dados locais foram preservados.");}
function authForm(){
 const user=currentUser();
 const el=modal(`<div class="row"><h2>Nuvem: Zyn Cloud</h2><button class="btn icon-btn" id="close" aria-label="Fechar">${uiIcon("close")}</button></div>
 ${user?`<div class="stack"><section class="card full"><div class="eyebrow">CONTA CONECTADA</div><h3>${esc(user.email||"Usuário")}</h3><p class="muted">Seus dados locais e a nuvem usam a mesma conta. O sincronismo continua funcionando depois de voltar ao online.</p></section><div class="actions"><button class="btn primary" id="syncNow">↻ Sincronizar agora</button><button class="btn danger" id="logout">Sair da conta</button></div></div>`:
 `<form id="authForm" class="stack"><div class="field"><label>E-mail</label><input name="email" type="email" required autocomplete="email" placeholder="seu@email.com"></div><div class="field"><label>Senha</label><input name="password" type="password" minlength="6" required autocomplete="current-password" placeholder="Mínimo de 6 caracteres"></div><div class="actions"><button class="btn primary" name="action" value="login">Entrar</button><button class="btn" name="action" value="signup">Criar conta</button></div><p class="muted">A conta serve apenas para identificar seus dados no Zyn Cloud. A chave usada no aplicativo é uma chave pública do Supabase; nenhuma service_role fica no navegador.</p></form>`}`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#syncNow")?.addEventListener("click",async()=>{await syncAll("manual");closeModal(el);render();toast("Nuvem: Sincronização concluída")});
 el.querySelector("#logout")?.addEventListener("click",async()=>{closeModal(el);await signOut()});
 el.querySelector("#authForm")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const email=String(f.get("email")||"").trim();const password=String(f.get("password")||"");const action=e.submitter?.value||"login";try{if(action==="signup")await signUp(email,password);else await signIn(email,password);closeModal(el);render();}catch(err){toast("Erro: "+(err?.message||"Não foi possível autenticar"));}});
}
async function readLocalRecords(){
 const stores=["reminders","events","financialAccounts","financialTransactions","financialGoals","workoutPlans","workoutSessions","habits","habitLogs","settings","goals","earnings","gymProfile","gymPlans","gymSessions","foodProfile","mealPlans","shoppingItems","financeProfile","financeAccounts","financeTransactions","financeBills","financeGoals","investmentAssets","musicTracks","musicPlaylists","musicSettings"];
 const out=[];for(const name of stores){const rows=await all(name);for(const row of rows){if(row?.id!==undefined&&row?.id!==null){if(name==="musicTracks"&&row.localOnly&&(row.fileBlob||row.fileData)) continue;const stamp=row.updatedAt||new Date().toISOString();out.push({storeName:name,recordId:String(row.id),payload:row.updatedAt?row:{...row,updatedAt:stamp},updatedAt:stamp});}}}return out;
}
async function applyCloudRecord(row){
 if(row.deleted_at){const local=(await all(row.store_name)).find(x=>String(x.id)===String(row.record_id));if(local){await removeLocalOnly(row.store_name,local.id);}return;}
 const payload=row.payload;if(!payload||payload.id===undefined)return;await put(row.store_name,payload,{touch:false});
}
function removeLocalOnly(name,id){return new Promise((resolve,reject)=>{const r=store(name,"readwrite").delete(id);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error)})}
async function syncAll(reason="auto"){
 if(syncBusy)return false;
 if(!navigator.onLine){setCloudStatus("offline","Sem internet — alterações ficam no aparelho");return false;}
 if(!currentUser()){setCloudStatus("offline","Entre na conta para sincronizar");return false;}
 syncBusy=true;setCloudStatus("syncing","Sincronizando dados…");
 try{
   const user=currentUser();
   const {data:cloudRows,error:readError}=await supabase.from("zyn_records").select("store_name,record_id,payload,updated_at,deleted_at").eq("user_id",user.id);
   if(readError)throw readError;
   const cloudMap=new Map((cloudRows||[]).map(r=>[`${r.store_name}::${r.record_id}`,r]));
   const local=await readLocalRecords();
   const queue=await all("syncQueue");
   const localMap=new Map(local.map(r=>[`${r.storeName}::${r.recordId}`,r]));
   const writes=[];const pendingDeletes=[];const appliedCloud=[];const queueKeys=new Set(queue.map(q=>`${q.storeName}::${q.recordId}`));
   for(const q of queue){const key=`${q.storeName}::${q.recordId}`;const c=cloudMap.get(key);const qTime=new Date(q.updatedAt||0).getTime();const cTime=new Date(c?.updated_at||0).getTime();if(!c||qTime>=cTime){writes.push({user_id:user.id,store_name:q.storeName,record_id:q.recordId,payload:null,updated_at:q.updatedAt,deleted_at:q.updatedAt});}else{if(c) await applyCloudRecord(c); pendingDeletes.push(q.id);}}
   for(const l of local){const key=`${l.storeName}::${l.recordId}`;const c=cloudMap.get(key);if(c?.deleted_at){const cTime=new Date(c.updated_at||c.deleted_at||0).getTime();const lTime=new Date(l.updatedAt||0).getTime();if(lTime>cTime)writes.push({user_id:user.id,store_name:l.storeName,record_id:l.recordId,payload:l.payload,updated_at:l.updatedAt,deleted_at:null});else await removeLocalOnly(l.storeName,l.payload.id);continue;}const cTime=new Date(c?.updated_at||0).getTime();const lTime=new Date(l.updatedAt||0).getTime();if(!c||lTime>cTime)writes.push({user_id:user.id,store_name:l.storeName,record_id:l.recordId,payload:l.payload,updated_at:l.updatedAt,deleted_at:null});}
   for(const c of cloudRows||[]){const key=`${c.store_name}::${c.record_id}`;if(queueKeys.has(key))continue;if(localMap.has(key))continue;if(c.deleted_at)continue;await applyCloudRecord(c);appliedCloud.push(key);}
   if(writes.length){const {error}=await supabase.from("zyn_records").upsert(writes,{onConflict:"user_id,store_name,record_id"});if(error)throw error;}
   for(const c of cloudRows||[]){const key=`${c.store_name}::${c.record_id}`;if(queueKeys.has(key))continue;const l=localMap.get(key);if(!l||c.deleted_at)continue;const cTime=new Date(c.updated_at||0).getTime();const lTime=new Date(l.updatedAt||0).getTime();if(cTime>lTime)await applyCloudRecord(c);}
   for(const q of queue)await removeLocalOnly("syncQueue",q.id);
   for(const qid of pendingDeletes)await removeLocalOnly("syncQueue",qid);
   await loadData();setCloudStatus("synced",`Sincronizado agora • ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`);return true;
 }catch(error){console.warn("[Zyn Cloud]",error);setCloudStatus("error",`Falha na sincronização: ${error?.message||error}`);return false;}
 finally{syncBusy=false;}
}
function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncAll("auto"),1200);}
function bindCloudEvents(){supabase.auth.onAuthStateChange((event,session)=>{authSession=session||null;if(session){scheduleSync();}else{setCloudStatus("offline","Entre na conta para sincronizar");}render();});window.addEventListener("online",()=>syncAll("online"));window.addEventListener("offline",()=>setCloudStatus("offline","Sem internet — alterações ficam no aparelho"));}

async function loadData(){reminders=await all("reminders");goals=await all("goals");earnings=await all("earnings");gymProfile=(await all("gymProfile"))[0]||null;gymPlans=await all("gymPlans");gymSessions=await all("gymSessions");foodProfile=(await all("foodProfile"))[0]||null;mealPlans=await all("mealPlans");shoppingItems=await all("shoppingItems");financeProfile=(await all("financeProfile"))[0]||null;financeAccounts=await all("financeAccounts");financeTransactions=await all("financeTransactions");financeBills=await all("financeBills");financeGoals=await all("financeGoals");investmentAssets=await all("investmentAssets");musicTracks=await all("musicTracks");
 // YouTube e prévias são removidos da biblioteca: o Zyn trabalha apenas com áudio completo.
 const unsupported=musicTracks.filter(t=>t.source==="youtube"||t.source==="itunes-preview");
 for(const t of unsupported){try{await remove("musicTracks",t.id)}catch(e){}}
 musicTracks=musicTracks.filter(t=>t.source!=="youtube"&&t.source!=="itunes-preview");
 // Migra arquivos antigos Blob para ArrayBuffer, uma forma mais estável de persistir áudio no IndexedDB.
 for(const t of musicTracks){
   try{
     if(!t.fileData && t.fileBlob instanceof Blob){
       t.fileData=await t.fileBlob.arrayBuffer();
       t.mimeType=t.mimeType||t.fileBlob.type||"audio/mpeg";
       delete t.fileBlob;
       await put("musicTracks",t);
     }
     if(t.fileData && !(t.fileData instanceof ArrayBuffer) && t.fileData?.buffer)t.fileData=t.fileData.buffer;
     if(t.fileData && !t.blobUrl)t.blobUrl=URL.createObjectURL(new Blob([t.fileData],{type:t.mimeType||"audio/mpeg"}));
   }catch(e){console.warn("[Zyn Music] blob",e)}
 }
 musicSelectedIds=new Set([...musicSelectedIds].filter(id=>musicTracks.some(t=>String(t.id)===String(id))));musicPlaylists=await all("musicPlaylists");if(!musicPlaylists.length){await put("musicPlaylists",{name:"Minha Playlist",trackIds:[],createdAt:new Date().toISOString()});musicPlaylists=await all("musicPlaylists");}musicSettings=(await all("musicSettings"))[0]||null;ensureMusicAudio();setupMediaSession();if(musicSettings?.currentTrackId&&!musicCurrentTrackId)musicCurrentTrackId=musicSettings.currentTrackId;
}
function bind(){
 document.querySelector("#installBtn")?.addEventListener("click", async ()=>{
   if(!deferredInstallPrompt) return;
   deferredInstallPrompt.prompt();
   const result=await deferredInstallPrompt.userChoice;
   if(result?.outcome==="accepted") toast("Zyn instalado no dispositivo");
   deferredInstallPrompt=null;
   const b=document.querySelector("#installBtn"); if(b) b.hidden=true;
 });
 document.querySelector("#themeBtn").onclick=toggleTheme;
 document.querySelector("#cloudStatus")?.addEventListener("click",authForm);
 const cloud=document.querySelector("#cloudStatus"); if(cloud){cloud.className=`cloud-status ${cloudStatus}`;cloud.title=cloudMessage;cloud.innerHTML=`<span></span>${esc(cloudStatus==="synced"?cloudMessage:(currentUser()?"Conta conectada — toque para sincronizar":"Entrar para sincronizar"))}`;}
 document.querySelector("#updateBtn").onclick=async()=>{
   const btn=document.querySelector("#updateBtn");
   if(btn){btn.disabled=true;btn.textContent="…";}
   try{
     if("serviceWorker" in navigator){
       const reg=await navigator.serviceWorker.getRegistration("./");
       if(reg){
         try{await reg.update();}catch(e){}
         if(reg.waiting){reg.waiting.postMessage({type:"SKIP_WAITING"});}
       }
       if(window.caches){
         const keys=await caches.keys();
         await Promise.all(keys.map(k=>caches.delete(k)));
       }
     }
   }catch(e){console.warn("[Zyn] atualização forçada:",e);}
   location.reload();
 };
 document.querySelectorAll("[data-view]").forEach(btn=>btn.onclick=()=>setView(btn.dataset.view));
 document.querySelector("#dockPrev")?.addEventListener("click",()=>playNextMusic(-1));
 document.querySelector("#dockNext")?.addEventListener("click",()=>playNextMusic(1));
 document.querySelector("#dockPlay")?.addEventListener("click",toggleMusicPlay);
 document.querySelector("#dockOpen")?.addEventListener("click",()=>setView("music"));
 const content=document.querySelector("#content");
 if(currentView==="home")content.innerHTML=homeView();
 if(currentView==="planning")content.innerHTML=planningView();
 if(currentView==="reminders")content.innerHTML=remindersView();
 if(currentView==="goals")content.innerHTML=goalsView();
 if(currentView==="wellness")content.innerHTML=wellnessView();
 if(currentView==="gym")content.innerHTML=gymView();
 if(currentView==="gymWorkout")content.innerHTML=gymWorkout();
 if(currentView==="food")content.innerHTML=foodView();
 if(currentView==="finance")content.innerHTML=financeView();
 if(currentView==="investments")content.innerHTML=investmentsView();
 if(currentView==="habits")content.innerHTML=habitsView();
 if(currentView==="music")content.innerHTML=musicView();
 if(currentView==="assistant")content.innerHTML=assistantView();
 document.querySelector("#newReminder")?.addEventListener("click",()=>reminderForm());
 document.querySelector("#newGoal")?.addEventListener("click",()=>goalForm());
 document.querySelector("#createGoal")?.addEventListener("click",()=>goalForm({target:700,dailyTarget:100,name:"Meta Uber e Entregas",source:"all"}));
 document.querySelector("#quickEarning")?.addEventListener("click",()=>earningForm(activeGoal()?.id));
 document.querySelector("#openGoals")?.addEventListener("click",()=>setView("goals"));
 document.querySelector("#homeReminders")?.addEventListener("click",()=>setView("reminders"));
 document.querySelectorAll("[data-goal-earning]").forEach(b=>b.onclick=()=>earningForm(b.dataset.goalEarning));
 document.querySelectorAll("[data-goal-edit]").forEach(b=>b.onclick=()=>goalForm(goals.find(g=>g.id===Number(b.dataset.goalEdit))));
 document.querySelectorAll("[data-goal-delete]").forEach(b=>b.onclick=async()=>{if(await confirmZyn("Excluir esta meta?","Excluir meta")){await remove("goals",Number(b.dataset.goalDelete));await loadData();render();toast("Meta excluída")}}); 
 document.querySelectorAll("[data-reminder-edit]").forEach(b=>b.onclick=()=>reminderForm(reminders.find(r=>r.id===Number(b.dataset.reminderEdit))));
 document.querySelectorAll("[data-reminder-delete]").forEach(b=>b.onclick=async()=>{if(await confirmZyn("Excluir este lembrete?","Excluir lembrete")){await remove("reminders",Number(b.dataset.reminderDelete));await loadData();render();toast("Lembrete excluído")}}); 
 document.querySelector("#gymProfile")?.addEventListener("click",gymProfileForm);
 document.querySelector("#editTodayGym")?.addEventListener("click",()=>gymDayForm(gymToday().day));
 document.querySelectorAll("[data-gym-open]").forEach(b=>b.addEventListener("click",e=>{if(e.target.closest("button"))return;gymDayForm(b.dataset.gymOpen)}));
 document.querySelector("#editWeek")?.addEventListener("click",gymWeekForm);
 document.querySelectorAll("[data-gym-edit]").forEach(b=>b.addEventListener("click",()=>gymDayForm(b.dataset.gymEdit)));
 document.querySelector("#startGym")?.addEventListener("click",()=>{currentView="gymWorkout";render()});
 document.querySelector("#backGym")?.addEventListener("click",()=>{currentView="gym";render()});
 document.querySelector("#beachWalk")?.addEventListener("click",beachForm);
 document.querySelector("#finishGym")?.addEventListener("click",async()=>{const p=gymToday(), ex=GYM_EX[p.workout]||[];const records=ex.map((x,i)=>({exercise:x[0],load:Number(document.querySelector(`[data-load="${i}"]`)?.value||0),reps:Number(document.querySelector(`[data-reps="${i}"]`)?.value||0)}));await put("gymSessions",{date:todayISO(),type:"Treino de academia",workout:p.workout,records});await loadData();toast("Treino salvo");currentView="gym";render()});
 document.querySelectorAll("[data-done]").forEach(b=>b.onclick=()=>{b.textContent="✓ Concluído";b.classList.add("primary")});
 document.querySelector("#financeProfileBtn")?.addEventListener("click",financeProfileForm);
 document.querySelectorAll("[data-finance-tab]").forEach(b=>b.addEventListener("click",()=>{financeTab=b.dataset.financeTab;render();}));
 document.querySelector("#financeCardAdd")?.addEventListener("click",()=>financeCardForm());
 document.querySelector("#financeCashEdit")?.addEventListener("click",financeCashForm);
 document.querySelector("#financeCashEditCard")?.addEventListener("click",financeCashForm);
 document.querySelector("#financeGoCards")?.addEventListener("click",()=>{financeTab="cards";render();});
 document.querySelectorAll("[data-fin-card-edit]").forEach(b=>b.onclick=()=>financeCardForm(financeAccounts.find(x=>String(x.id)===String(b.dataset.finCardEdit))));
 document.querySelectorAll("[data-fin-card-delete]").forEach(b=>b.onclick=async()=>{if(await confirmZyn("Excluir este cartão?","Excluir cartão")){await remove("financeAccounts",Number(b.dataset.finCardDelete));await loadData();render();}});
 document.querySelector("#financeGoalAdd")?.addEventListener("click",()=>financeGoalForm());
 document.querySelectorAll("[data-fin-goal-edit]").forEach(b=>b.onclick=()=>financeGoalForm(financeGoals.find(x=>String(x.id)===String(b.dataset.finGoalEdit))));
 document.querySelectorAll("[data-fin-goal-delete]").forEach(b=>b.onclick=async()=>{if(await confirmZyn("Excluir esta meta financeira?","Excluir meta")){await remove("financeGoals",Number(b.dataset.finGoalDelete));await loadData();render();}});
 document.querySelector("#openInvestments")?.addEventListener("click",()=>setView("investments"));
 document.querySelector("#backFinance")?.addEventListener("click",()=>setView("finance"));
 document.querySelector("#investmentAdd")?.addEventListener("click",()=>investmentForm());
 document.querySelector("#investmentEmptyAdd")?.addEventListener("click",()=>investmentForm());
 document.querySelectorAll("[data-invest-edit]").forEach(b=>b.onclick=()=>investmentForm(investmentAssets.find(x=>String(x.id)===String(b.dataset.investEdit))));
 document.querySelectorAll("[data-invest-delete]").forEach(b=>b.onclick=async()=>{if(await confirmZyn("Excluir este investimento da carteira?","Excluir investimento")){await remove("investmentAssets",Number(b.dataset.investDelete));await loadData();render();toast("Investimento excluído")}});
 document.querySelector("#financeAdd")?.addEventListener("click",financeTransactionForm);
 document.querySelector("#financeAddIncome")?.addEventListener("click",()=>financeTransactionForm({type:"income",date:todayISO()}));
 document.querySelectorAll("[data-fin-tx-open]").forEach(row=>{const open=()=>financeTransactionForm(financeTransactions.find(x=>String(x.id)===String(row.dataset.finTxOpen)));row.addEventListener("click",e=>{if(e.target.closest("button,input,a,select"))return;open();});row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});});
 document.querySelectorAll("[data-fin-tx-edit]").forEach(b=>b.onclick=()=>financeTransactionForm(financeTransactions.find(x=>String(x.id)===String(b.dataset.finTxEdit))));
 document.querySelectorAll("[data-fin-tx-delete]").forEach(b=>b.onclick=async()=>{if(await confirmZyn("Excluir este lançamento?","Excluir lançamento")){const tx=financeTransactions.find(x=>String(x.id)===String(b.dataset.finTxDelete));if(tx) await reverseFinanceTransaction(tx);await remove("financeTransactions",Number(b.dataset.finTxDelete));await loadData();render();toast("Lançamento excluído")}});
 document.querySelector("#financeBill")?.addEventListener("click",financeBillForm);
 document.querySelector("#financeMonth")?.addEventListener("click",()=>financeMonthPicker(financeProfile?.selectedMonth||monthKey()));
 document.querySelector("#foodProfile")?.addEventListener("click",foodProfileForm);
 document.querySelector("#generateMeals")?.addEventListener("click",generateMeals);
 document.querySelector("#newShopping")?.addEventListener("click",shoppingForm);
 document.querySelectorAll("[data-shop]").forEach(b=>b.onclick=async()=>{const x=shoppingItems.find(x=>x.id===Number(b.dataset.shop));if(x){x.done=!x.done;await put("shoppingItems",x);await loadData();render()}});
 document.querySelectorAll("[data-reminder-done]").forEach(b=>b.onclick=async()=>{const r=reminders.find(r=>r.id===Number(b.dataset.reminderDone));if(r){r.done=!r.done;await put("reminders",r);await loadData();render()}});
 document.querySelector("#homeMusic")?.addEventListener("click",()=>setView("music"));
 document.querySelectorAll("[data-home-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.homeView)));
 document.querySelector("#homePlanning")?.addEventListener("click",()=>setView("planning"));
 document.querySelectorAll("[data-planning-tab]").forEach(b=>b.addEventListener("click",()=>{planningTab=b.dataset.planningTab||"today";render();}));
 document.querySelector("#planningQuickReminder")?.addEventListener("click",()=>reminderForm());
 document.querySelectorAll("#planningReminder").forEach(b=>b.addEventListener("click",()=>reminderForm()));
 document.querySelector("#planningGoal")?.addEventListener("click",()=>goalForm());
 document.querySelector("#planningEditGoal")?.addEventListener("click",()=>{const g=activeGoal();if(g)goalForm(g);});
 document.querySelector("#planningGoals")?.addEventListener("click",()=>{planningTab="goals";render();});
 document.querySelector("#planningReminders")?.addEventListener("click",()=>{planningTab="reminders";render();});
 document.querySelectorAll("[data-planning-reminder]").forEach(b=>b.addEventListener("click",()=>{const r=reminders.find(x=>String(x.id)===String(b.dataset.planningReminder));if(r)reminderForm(r);}));
 document.querySelectorAll("[data-planning-done]").forEach(b=>b.addEventListener("click",async e=>{e.stopPropagation();const r=reminders.find(x=>String(x.id)===String(b.dataset.planningDone));if(r){r.done=!r.done;await put("reminders",r);await loadData();render();}}));
 document.querySelectorAll("[data-gym-tab]").forEach(b=>b.addEventListener("click",()=>{gymTab=b.dataset.gymTab||"week";render();}));
 document.querySelector("#planningReminder")?.addEventListener("click",()=>reminderForm());
 document.querySelector("#planningGoal")?.addEventListener("click",()=>goalForm());
 document.querySelector("#planningEditGoal")?.addEventListener("click",()=>{const g=activeGoal();if(g)goalForm(g);});
 document.querySelector("#planningReminders")?.addEventListener("click",()=>setView("reminders"));
 document.querySelector("#planningGoals")?.addEventListener("click",()=>setView("goals"));
 document.querySelector("#wellGym")?.addEventListener("click",()=>setView("gym"));
 document.querySelector("#wellDiet")?.addEventListener("click",()=>setView("food"));
 document.querySelectorAll("[data-well-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.wellView)));

 document.querySelectorAll("[data-music-tab]").forEach(b=>b.addEventListener("click",()=>{musicTab=b.dataset.musicTab||"library";musicSelectedIds.clear();render();}));
 const openMusicPicker=()=>document.querySelector("#musicFileInput")?.click();
 document.querySelector("#musicAddFile")?.addEventListener("click",openMusicPicker);
 document.querySelector("#musicAddFileTop")?.addEventListener("click",openMusicPicker);
 document.querySelector("#musicFileInput")?.addEventListener("change",async e=>{await addLocalMusicFiles(e.target.files);e.target.value="";});
 document.querySelector("#musicAddFolder")?.addEventListener("click",()=>document.querySelector("#musicFolderInput")?.click());
 document.querySelector("#musicFolderInput")?.addEventListener("change",async e=>{await addLocalMusicFiles(e.target.files);e.target.value="";});
 document.querySelector("#musicPlaylistNew")?.addEventListener("click",()=>musicPlaylistForm());
 document.querySelector("#musicPlayBtn")?.addEventListener("click",toggleMusicPlay);
 document.querySelector("#musicPrev")?.addEventListener("click",()=>playNextMusic(-1));
 document.querySelector("#musicNext")?.addEventListener("click",()=>playNextMusic(1));
 document.querySelector("#musicVolume")?.addEventListener("input",e=>{ensureMusicAudio().volume=Number(e.target.value);});
 document.querySelector("#musicProgress")?.addEventListener("input",e=>{if(musicAudio&&Number.isFinite(musicAudio.duration))musicAudio.currentTime=(Number(e.target.value)/100)*musicAudio.duration;});
 document.querySelector("#musicShuffle")?.addEventListener("click",async()=>{if(!musicTracks.length)return toast("Adicione músicas primeiro");const ids=musicTracks.map(t=>t.id).sort(()=>Math.random()-0.5);musicQueue=ids;musicQueueIndex=0;await playMusicTrack(musicTracks.find(t=>t.id===ids[0]),ids,0);});
 document.querySelectorAll("[data-music-play]").forEach(b=>b.onclick=async()=>{const t=musicTracks.find(x=>x.id===Number(b.dataset.musicPlay));if(t){const ids=musicContextTrackIds();await playMusicTrack(t,ids,musicContextTrackIds().findIndex(id=>String(id)===String(t.id)));}});
 document.querySelectorAll("[data-music-select]").forEach(b=>b.onchange=()=>{const id=String(b.dataset.musicSelect);if(b.checked)musicSelectedIds.add(id);else musicSelectedIds.delete(id);render();});
 document.querySelector("#musicSelectAll")?.addEventListener("click",()=>{if(musicSelectedIds.size===musicTracks.length)musicSelectedIds.clear();else musicTracks.forEach(t=>musicSelectedIds.add(String(t.id)));render();});
 document.querySelector("#musicDeleteSelected")?.addEventListener("click",async()=>{const ids=[...musicSelectedIds].map(Number).filter(Number.isFinite);if(!ids.length)return;if(!(await confirmZyn(`Excluir ${ids.length} música(s) selecionada(s) da biblioteca?`,`Excluir ${ids.length} músicas`)))return;ensureMusicAudio().pause();for(const id of ids){if(String(musicCurrentTrackId)===String(id)){musicAudio.removeAttribute("src");musicCurrentTrackId=null;}await remove("musicTracks",id);for(const p of musicPlaylists){if((p.trackIds||[]).includes(id)){p.trackIds=p.trackIds.filter(x=>x!==id);await put("musicPlaylists",p);}}}musicSelectedIds.clear();await loadData();render();toast(`${ids.length} música(s) excluída(s)`);});

 document.querySelectorAll("[data-music-playlist]").forEach(b=>b.onclick=async()=>{const p=musicPlaylists.find(x=>String(x.id)===String(b.dataset.musicPlaylist));const ids=(p?.trackIds||[]).filter(id=>musicTracks.some(t=>String(t.id)===String(id)));if(!ids.length)return toast("Essa playlist ainda está vazia");await playMusicTrack(musicTracks.find(t=>String(t.id)===String(ids[0])),ids,0);});
}
document.addEventListener("click",e=>{if(!moreMenuOpen)return;if(e.target.closest("#morePopover")||e.target.closest("#moreFab"))return;closeMoreMenu();});

function render(){
 document.body.className=theme;
 if(!appUnlocked){app.innerHTML=authGateView();bindAuthGate();return;}
 const persistentDock=document.querySelector("#musicDock");
 app.innerHTML=layout();
 if(persistentDock){const freshDock=document.querySelector("#musicDock");if(freshDock)freshDock.replaceWith(persistentDock);}
 bind();
 syncMusicDock();
}
window.addEventListener("beforeinstallprompt", e=>{
 e.preventDefault();
 deferredInstallPrompt=e;
 const b=document.querySelector("#installBtn"); if(b) b.hidden=false;
});
window.addEventListener("appinstalled", ()=>{
 deferredInstallPrompt=null;
 const b=document.querySelector("#installBtn"); if(b) b.hidden=true;
 toast("Assistente Zyn instalado");
});
(async()=>{
 try{
   await openDB();
   await loadData();
   try{await refreshAuth();}catch(error){console.warn("[Zyn Cloud] Sessão não pôde ser recuperada:",error);}
   bindCloudEvents();
   if(appUnlocked && authSession){setCloudStatus("syncing","Conectado — sincronizando…");syncAll("startup");}
   else if(appUnlocked) setCloudStatus("offline",navigator.onLine?"Entre na conta para sincronizar":"Sem internet — dados locais disponíveis");
   if("serviceWorker" in navigator){
     try{
       const reg=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});
       try{await reg.update();}catch(e){}
     }catch(e){console.warn("[Zyn] Service Worker:",e);}
   }
   render();
   if(deferredInstallPrompt){const b=document.querySelector("#installBtn");if(b)b.hidden=false;}
 }catch(error){
   console.error("[Zyn] Falha na inicialização:",error);
   app.innerHTML=`<div class="error-screen"><div class="error-card"><div class="auth-logo">Z</div><h2>O Zyn encontrou um problema</h2><p>Não foi possível iniciar o aplicativo. Atualize a página e tente novamente.</p><button class="btn primary" onclick="location.reload()">↻ Tentar novamente</button></div></div>`;
 }
})();
