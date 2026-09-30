import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";

const APP_VERSION = "2.1.0";
const SUPABASE_URL = "https://gjijbavsknxmzwilojnp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_g9_bCMdiuHGjU1ksuby0aQ_XGSRI7vo";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
window.ZynCloudDiagnostic = { version: "2.0.9", sdk: "2.117.2", url: SUPABASE_URL, keyType: SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") ? "publishable" : "unknown" };
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
let foodTab = "today";
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
let assistantMessages = [];
let assistantBusy = false;
let assistantRecording = false;
let assistantRecorder = null;
let assistantAudioChunks = [];
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
async function musicLocalFingerprint(buffer){
  try{
    const source=buffer instanceof ArrayBuffer?buffer:buffer?.buffer;
    if(!source)return "";
    const digest=await crypto.subtle.digest("SHA-256",source);
    return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
  }catch(e){return "";}
}

function musicLocalNameKey(value){return String(value||"").trim().toLowerCase().replace(/\s+/g," ");}

async function musicFindDuplicateLocal(payload){
  if(!payload?.fileData)return null;
  const size=Number(payload.fileSize||payload.fileData.byteLength||0);
  const name=musicLocalNameKey(payload.fileName||payload.title);
  const fingerprint=String(payload.fingerprint||"");
  for(const t of musicTracks){
    if(t.source!=="local" || !t.fileData)continue;
    const tSize=Number(t.fileSize||t.fileData.byteLength||0);
    if(!size || !tSize || size!==tSize)continue;
    let tFingerprint=String(t.fingerprint||"");
    if(!tFingerprint){
      tFingerprint=await musicLocalFingerprint(t.fileData);
      if(tFingerprint){try{await put("musicTracks",{...t,fileSize:tSize,fingerprint:tFingerprint},{touch:false});}catch(e){}}
    }
    if(fingerprint && tFingerprint && fingerprint===tFingerprint)return t;
    if(!fingerprint && !tFingerprint && name && name===musicLocalNameKey(t.fileName||t.title))return t;
    if(name && name===musicLocalNameKey(t.fileName||t.title) && fingerprint===tFingerprint)return t;
  }
  return null;
}

async function musicRemoveDuplicateLocals(){
  const locals=musicTracks.filter(t=>t.source==="local"&&t.fileData);
  if(locals.length<2)return 0;
  const seen=new Map();
  const duplicateIds=[];
  const canonicalByDuplicate=new Map();
  for(const t of locals.slice().sort((a,b)=>Number(a.id)-Number(b.id))){
    const size=Number(t.fileSize||t.fileData?.byteLength||0);
    if(!size)continue;
    let fp=String(t.fingerprint||"");
    if(!fp)fp=await musicLocalFingerprint(t.fileData);
    if(fp){
      const key=`fp:${fp}`;
      if(seen.has(key)){duplicateIds.push(Number(t.id));canonicalByDuplicate.set(Number(t.id),Number(seen.get(key).id));}
      else seen.set(key,t);
    }
  }
  if(!duplicateIds.length)return 0;
  const duplicateSet=new Set(duplicateIds);
  for(const id of duplicateIds)await remove("musicTracks",id);
  for(const pl of musicPlaylists){
    const oldIds=Array.isArray(pl.trackIds)?pl.trackIds:[];
    const next=[];
    for(const id of oldIds){
      const canonical=canonicalByDuplicate.get(Number(id));
      const finalId=canonical||Number(id);
      if(!next.includes(finalId) && !duplicateSet.has(finalId))next.push(finalId);
    }
    if(next.length!==oldIds.length || next.some((id,i)=>id!==oldIds[i]))await put("musicPlaylists",{...pl,trackIds:next},{touch:false});
  }
  return duplicateIds.length;
}

async function addMusicTrack(track,playlistId=null){
  const rawUrl=String(track.url||"").trim();
  if(/(^|\.)youtube\.com($|\.)|youtu\.be/i.test(rawUrl)){toast("Links do YouTube não são aceitos. Importe o arquivo de áudio completo.");return false;}
  const source=track.fileData?"local":(track.fileBlob?"local":(track.source||"direct"));
  const payload={title:track.title||"Música",artist:track.artist||"Artista desconhecido",album:track.album||"",cover:track.cover||"",url:source==="local"?"":rawUrl,youtubeId:"",source,duration:track.duration||0,createdAt:new Date().toISOString()};
  if(track.fileData){payload.fileData=track.fileData;payload.localOnly=true;payload.mimeType=track.mimeType||"audio/mpeg";payload.fileName=track.fileName||track.title||"música";}
  else if(track.fileBlob){
    try{payload.fileData=await track.fileBlob.arrayBuffer();payload.localOnly=true;payload.mimeType=track.fileBlob.type||"audio/mpeg";payload.fileName=track.fileName||track.title||"música";}
    catch(e){toast("Não foi possível guardar este arquivo de áudio");return false;}
  }
  if(!payload.url && !payload.fileData){toast("Selecione um arquivo de áudio completo ou informe um link direto de áudio");return false;}
  if(source==="local" && payload.fileData){
    payload.fileSize=Number(payload.fileData.byteLength||0);
    payload.fingerprint=await musicLocalFingerprint(payload.fileData);
    const duplicate=await musicFindDuplicateLocal(payload);
    if(duplicate){return false;}
  }
  await put("musicTracks",payload);
  await loadData();
  const added=musicTracks.slice().sort((a,b)=>Number(b.id)-Number(a.id))[0];
  if(playlistId){const pl=musicPlaylists.find(p=>String(p.id)===String(playlistId));if(pl){pl.trackIds=[...(pl.trackIds||[]),added.id];await put("musicPlaylists",pl);await loadData();}}
  return true;
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
async function addLocalMusicFiles(files){const list=[...files].filter(f=>f&&(f.type||"").startsWith("audio/"));if(!list.length)return toast("Escolha um arquivo de áudio");let added=0,duplicates=0;for(const file of list){const cleanName=(file.name||"Música").replace(/\.[^/.]+$/," ").trim()||"Música";const ok=await addMusicTrack({fileBlob:file,fileName:file.name,title:cleanName,artist:"Minha biblioteca",album:"Biblioteca do Zyn",mimeType:file.type},null);if(ok)added++;else duplicates++;}await loadData();render();toast(`Música: ${added} adicionada(s)${duplicates?` • ${duplicates} duplicada(s) ignorada(s)`:""}`);}

/* V1.8.1 HOTFIX — restored core IndexedDB/helpers accidentally omitted during UI merge. */
function activeGoal(){return goals.find(g=>g.active!==false)||goals[0]}

function all(name){return new Promise((resolve,reject)=>{const r=store(name).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}

function zynApiUrl(){return String(localStorage.getItem("zyn-ai-endpoint")||"").trim().replace(/\/$/,"")}
function zynContext(){return {today:todayISO(),goals:goals.map(g=>({id:g.id,name:g.name,target:g.target,days:g.days,startDate:g.startDate,dailyTarget:g.dailyTarget,source:g.source,progress:goalProgress(g),earned:goalEarnings(g)})),reminders:reminders.filter(r=>!r.done).slice(0,20).map(r=>({id:r.id,title:r.title,date:r.date,time:r.time,category:r.category})),earnings:earnings.slice(-30).map(e=>({id:e.id,amount:e.amount,date:e.date,source:e.source,notes:e.notes})),finance:{accounts:financeAccounts.map(a=>({id:a.id,name:a.name,balance:a.balance||0})),transactions:financeTransactions.slice(-30).map(t=>({id:t.id,type:t.type,amount:t.amount,date:t.date,description:t.description,category:t.category}))},gym:{goal:gymGoal(),days:gymProfile?.days||null},food:{profile:foodProfile?{goal:foodProfile.goal,meals:foodProfile.meals}:null}}}
function assistantMessageHtml(m){return `<div class="zyn-msg ${m.role}"><div class="zyn-msg-avatar">${m.role==="user"?"Você":uiIcon("assistant")}</div><div class="zyn-msg-body">${esc(m.text).replace(/\n/g,"<br>")}</div></div>`}
function assistantView(){const endpoint=zynApiUrl();return `<div class="module-page assistant-page"><div class="module-head"><div class="module-icon">${uiIcon("assistant")}</div><div class="module-head-copy"><span class="eyebrow">CENTRO INTELIGENTE</span><h1>Zyn Assistente</h1><p>Converse com o Zyn por texto ou voz e deixe ele ajudar a organizar sua rotina.</p></div><button class="icon-btn" id="zynSettings" title="Configurar conexão">${uiIcon("settings")}</button></div><section class="assistant-hero card full"><div class="assistant-orb">${uiIcon("assistant")}</div><div><span class="eyebrow">IA ZYN</span><h2>Seu assistente está começando a ganhar vida.</h2><p class="muted">Ele poderá criar lembretes, registrar ganhos, consultar informações e ajudar você dentro dos módulos.</p><span class="soft-tag ${endpoint?"success":""}">${endpoint?"Conexão configurada":"Conexão ainda não configurada"}</span></div></section><section class="panel-card zyn-chat-card"><div id="zynMessages" class="zyn-messages">${assistantMessages.length?assistantMessages.map(assistantMessageHtml).join(""):`<div class="zyn-empty"><div class="assistant-orb small">${uiIcon("assistant")}</div><b>Olá! Eu sou o Zyn.</b><span>Escreva algo como: “Zyn, me lembre amanhã às 8h de pagar a internet”.</span></div>`}</div><form id="zynChatForm" class="zyn-chat-form"><button type="button" class="icon-btn" id="zynMic" title="Falar com Zyn" aria-label="Falar com Zyn">${uiIcon("mic")}</button><textarea id="zynInput" rows="1" placeholder="Converse com o Zyn..." ${assistantBusy?"disabled":""}></textarea><button class="btn primary" type="submit" ${assistantBusy?"disabled":""}>${assistantBusy?uiIcon("refresh"):uiIcon("send")} <span>Enviar</span></button></form><div class="muted zyn-chat-hint">A IA usa um servidor seguro. A chave da OpenAI nunca fica dentro do aplicativo.</div></section></div>`}
function zynSettingsForm(){const current=zynApiUrl();const el=modal(`<div class="row"><div><span class="eyebrow">IA ZYN</span><h2>Conexão do assistente</h2></div><button class="btn icon-btn" id="closeModal" aria-label="Fechar">${uiIcon("close")}</button></div><form id="zynEndpointForm" class="stack"><div class="field"><label>URL do backend do Zyn</label><input name="endpoint" value="${esc(current)}" placeholder="https://seu-backend.exemplo.com"></div><p class="muted">O backend mantém a chave da OpenAI protegida. Não coloque uma chave da OpenAI aqui.</p><div class="actions"><button class="btn" type="button" id="zynClear">Limpar</button><button class="btn primary" type="submit">${uiIcon("check")} Salvar conexão</button></div></form>`);el.querySelector("#closeModal").onclick=()=>closeModal(el);el.querySelector("#zynClear").onclick=()=>{localStorage.removeItem("zyn-ai-endpoint");closeModal(el);render()};el.querySelector("#zynEndpointForm").onsubmit=e=>{e.preventDefault();const url=String(new FormData(e.target).get("endpoint")||"").trim().replace(/\/$/,"");if(url)localStorage.setItem("zyn-ai-endpoint",url);else localStorage.removeItem("zyn-ai-endpoint");closeModal(el);render();toast(url?"Conexão do Zyn salva":"Conexão removida")}}
async function zynSendMessage(text){const clean=String(text||"").trim();if(!clean)return;if(!zynApiUrl()){toast("Configure primeiro a conexão da IA do Zyn");zynSettingsForm();return;}assistantMessages.push({role:"user",text:clean});assistantBusy=true;render();try{const res=await fetch(zynApiUrl()+"/api/zyn/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:clean,context:zynContext()})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Erro ${res.status}`);if(data.reply)assistantMessages.push({role:"assistant",text:data.reply});if(Array.isArray(data.actions)&&data.actions.length){for(const action of data.actions){const result=await zynExecuteAction(action);assistantMessages.push({role:"assistant",text:result.message});}}}catch(e){assistantMessages.push({role:"assistant",text:`Não consegui falar com meu servidor agora. ${e.message||"Verifique a conexão."}`});}finally{assistantBusy=false;render();setTimeout(()=>{const box=document.querySelector("#zynMessages");if(box)box.scrollTop=box.scrollHeight;},0)}}
async function zynExecuteAction(action){const name=action?.name,args=action?.arguments||{};if(name==="create_reminder"){const data={title:String(args.title||"Lembrete"),category:String(args.category||"Geral"),date:String(args.date||todayISO()),time:String(args.time||""),repeat:String(args.repeat||"none"),notes:String(args.notes||""),done:false};await put("reminders",data);await loadData();return {message:`Pronto. Criei o lembrete “${data.title}” para ${fmtDate(data.date)}${data.time?` às ${data.time}`:""}.`}}if(name==="add_earning"){const amount=Number(args.amount);if(!Number.isFinite(amount)||amount<=0)return {message:"Não consegui registrar esse ganho porque o valor não é válido."};const goal=activeGoal();const data={amount,date:String(args.date||todayISO()),source:String(args.source||"Outros"),notes:String(args.notes||"Criado pelo Zyn"),goalId:goal?.id||null,createdAt:new Date().toISOString()};await put("earnings",data);await loadData();return {message:`Pronto. Registrei ${money(amount)} em ${data.source} no dia ${fmtDate(data.date)}.`}}if(name==="create_goal"){const target=Number(args.target),days=Math.max(1,Math.min(3650,Number(args.days||7)));if(!Number.isFinite(target)||target<=0)return {message:"Não consegui criar a meta porque o valor não é válido."};const data={name:String(args.name||"Nova meta"),target,days,startDate:String(args.startDate||todayISO()),dailyTarget:target/days,source:String(args.source||"all"),active:true,createdAt:new Date().toISOString()};await put("goals",data);await loadData();return {message:`Meta criada: ${data.name}, ${money(target)} em ${days} dias (${money(target/days)} por dia).`}}return {message:"Entendi o pedido, mas essa ação ainda está sendo conectada ao Zyn."}}
async function zynStartRecording(){if(assistantRecording){assistantRecorder?.stop();return;}if(!navigator.mediaDevices?.getUserMedia){toast("Seu navegador não oferece gravação de áudio");return;}const endpoint=zynApiUrl();if(!endpoint){zynSettingsForm();return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});assistantAudioChunks=[];assistantRecorder=new MediaRecorder(stream,{mimeType:"audio/webm"});assistantRecording=true;assistantRecorder.ondataavailable=e=>{if(e.data.size)assistantAudioChunks.push(e.data)};assistantRecorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());assistantRecording=false;const blob=new Blob(assistantAudioChunks,{type:"audio/webm"});const fd=new FormData();fd.append("audio",blob,"zyn.webm");const mic=document.querySelector("#zynMic");if(mic)mic.disabled=true;try{const res=await fetch(endpoint+"/api/zyn/transcribe",{method:"POST",body:fd});const data=await res.json();if(!res.ok)throw new Error(data.error||"Falha na transcrição");const input=document.querySelector("#zynInput");if(input){input.value=data.text||"";input.focus();}}catch(e){toast(e.message||"Não consegui transcrever o áudio");}finally{const m=document.querySelector("#zynMic");if(m)m.disabled=false;}};assistantRecorder.start();toast("Zyn está ouvindo… toque novamente para parar");}catch(e){toast("Não foi possível acessar o microfone")}}


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

function goalStartDate(goal){return goal?.startDate||todayISO()}
function goalEndDate(goal){const start=new Date(goalStartDate(goal)+"T12:00:00");const days=Math.max(1,Number(goal?.days||7));start.setDate(start.getDate()+days-1);return dateKey(start)}
function goalDaysList(goal){const start=new Date(goalStartDate(goal)+"T12:00:00");const days=Math.max(1,Number(goal?.days||7));return Array.from({length:days},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return dateKey(d)})}
function goalEarnings(goal){const days=new Set(goalDaysList(goal));return earnings.filter(e=>days.has(e.date)&&(!goal.source||goal.source==="all"||goal.source===e.source)).reduce((sum,e)=>sum+Number(e.amount||0),0)}
function goalProgress(goal){const amount=goalEarnings(goal);return Math.min(100,goal.target?amount/goal.target*100:0)}
function goalDayLabel(goal,date){const d=new Date(date+"T12:00:00");return d.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","").slice(0,3).toUpperCase()}

function goalsView(){
 return `<div class="section-title"><h2>Metas</h2><button class="btn primary" id="newGoal">${uiIcon("goal")} Nova meta</button></div>
 <div class="stack">${goals.map(g=>{const amount=goalEarnings(g);const p=goalProgress(g);const days=goalDaysList(g);const previewDays=days.slice(0,7);return `<section class="card full"><div class="row"><h3>${uiIcon("goal")} ${esc(g.name)}</h3><span class="tag">${g.active===false?"Inativa":"Ativa"}</span></div><div class="row"><div><div class="metric">${money(amount)}</div><div class="muted">de ${money(g.target)} no período</div></div><div style="text-align:right"><div class="metric">${p.toFixed(1)}%</div><div class="muted">concluído</div></div></div><div class="progress"><div style="width:${p}%"></div></div><div class="row"><span class="muted">Diária: ${money(g.dailyTarget)}</span><span class="muted">Período: ${g.days||7} dia(s)</span></div><div class="daily-grid">${previewDays.map(d=>{const val=dayAmount(g,d);const hit=val>=g.dailyTarget;return `<div class="day-box ${hit?"hit":""} ${d===todayISO()?"today":""}"><b>${goalDayLabel(g,d)}</b><br>${money(val).replace("R$","").trim()}${hit?" ✓":""}</div>`}).join("")}${days.length>7?`<div class="muted" style="grid-column:1/-1;text-align:center">+ ${days.length-7} dia(s) no período</div>`:""}</div><div class="actions" style="margin-top:15px"><button class="btn primary" data-goal-earning="${g.id}">${uiIcon("money")} Registrar ganho</button><button class="btn" data-goal-edit="${g.id}">${uiIcon("edit")} Editar</button><button class="btn danger" data-goal-delete="${g.id}">${uiIcon("trash")} Excluir</button></div></section>`}).join("")||`<div class="empty">Nenhuma meta cadastrada. Crie sua primeira meta.</div>`}</div>`;
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
 mic:'<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/>',
 send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
