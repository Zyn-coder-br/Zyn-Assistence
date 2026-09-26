import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";

const APP_VERSION = "1.7.4";
const SUPABASE_URL = "https://gjijbavsknxmzwilojnp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_g9_bCMdiuHGjU1ksuby0aQ_XGSRI7vo";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
window.ZynCloudDiagnostic = { version: "1.7.4", sdk: "2.117.2", url: SUPABASE_URL, keyType: SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") ? "publishable" : "unknown" };
let authSession = null;
let syncBusy = false;
let syncTimer = null;
let cloudStatus = "offline";
let cloudMessage = "Entre na sua conta para sincronizar";
const DB_NAME = "assistente-zyn-db";
const DB_VERSION = 7;
let db;
let currentView = "home";
let theme = localStorage.getItem("zyn-theme") || "light";
let reminders = [];
let goals = [];
let earnings = [];
let gymProfile = null, gymPlans = [], gymSessions = [];
let foodProfile = null, mealPlans = [], shoppingItems = [];
let financeProfile = null, financeAccounts = [], financeTransactions = [], financeBills = [], financeGoals = [];
let deferredInstallPrompt = null;
let musicTracks = [], musicPlaylists = [], musicSettings = null;
let musicAudio = null, musicCurrentTrackId = null, musicQueue = [], musicQueueIndex = -1, musicSearchBusy = false;
let musicPreviewTrack = null;
let youtubePlayer = null, youtubeApiPromise = null;

function getYouTubeId(input){
  const value=String(input||"").trim();
  if(!value)return "";
  try{
    const u=new URL(value);
    if(u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0].slice(0,11);
    if(u.hostname.includes("youtube.com")){
      if(u.pathname==="/watch") return (u.searchParams.get("v")||"").slice(0,11);
      const parts=u.pathname.split("/").filter(Boolean);
      const idx=parts.findIndex(x=>x==="embed"||x==="shorts"||x==="live");
      if(idx>=0) return String(parts[idx+1]||"").slice(0,11);
    }
  }catch(e){}
  return "";
}
function isYouTubeTrack(track){return !!track && track.source==="youtube" && !!track.youtubeId;}
function loadYouTubeAPI(){
  if(window.YT?.Player) return Promise.resolve(window.YT);
  if(youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise=new Promise((resolve,reject)=>{
    const old=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{try{old?.();}catch(e){} resolve(window.YT);};
    const script=document.createElement("script");
    script.src="https://www.youtube.com/iframe_api";
    script.async=true;
    script.onerror=()=>{youtubeApiPromise=null;reject(new Error("YouTube API indisponível"));};
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}
async function playYouTubeTrack(track,queueIds=null,index=null){
  if(!isYouTubeTrack(track)){toast("Link do YouTube inválido");return;}
  ensureMusicAudio().pause();
  musicPreviewTrack=null;
  if(queueIds){musicQueue=[...queueIds];musicQueueIndex=Math.max(0,index??musicQueue.findIndex(id=>String(id)===String(track.id)));}
  else if(!musicQueue.length){musicQueue=[track.id];musicQueueIndex=0;}
  musicCurrentTrackId=track.id;
  musicSettings={...(musicSettings||{id:1}),currentTrackId:track.id,queue:musicQueue,queueIndex:musicQueueIndex};
  await put("musicSettings",musicSettings);
  render();
  try{
    const YT=await loadYouTubeAPI();
    const host=document.querySelector("#youtubePlayer");
    if(!host)return;
    if(youtubePlayer){try{youtubePlayer.destroy();}catch(e){} youtubePlayer=null;}
    youtubePlayer=new YT.Player("youtubePlayer",{videoId:track.youtubeId,playerVars:{playsinline:1,autoplay:1,origin:location.origin,rel:0},events:{
      onReady:e=>{try{e.target.playVideo();}catch(err){} updateMediaSession();},
      onStateChange:e=>{if(e.data===0)playNextMusic(1); if(e.data===1)updateMediaSession(); if(e.data===2)updateMediaSession();},
      onError:()=>toast("⚠️ Este vídeo não pode ser reproduzido incorporado pelo YouTube.")
    }});
  }catch(e){toast("⚠️ Não foi possível carregar o player do YouTube");}
}
function ensureMusicAudio(){
  if(musicAudio) return musicAudio;
  musicAudio = document.createElement("audio");
  musicAudio.preload = "metadata";
  musicAudio.playsInline = true;
  musicAudio.setAttribute("aria-hidden","true");
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
  musicAudio.addEventListener("play",()=>{updateMusicUI();updateMediaSession();});
  musicAudio.addEventListener("pause",()=>{updateMusicUI();updateMediaSession();});
  musicAudio.addEventListener("ended",()=>{if(musicPreviewTrack){musicPreviewTrack=null;musicAudio.removeAttribute("src");updateMusicUI();return;}playNextMusic(1);});
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
  try{navigator.mediaSession.playbackState=(isYouTubeTrack(track) ? "playing" : (musicAudio?.paused?"paused":"playing"));}catch(e){}
}
function setupMediaSession(){
  if(!("mediaSession" in navigator)) return;
  const actions={play:()=>isYouTubeTrack(currentMusicTrack())?(youtubePlayer?.playVideo?.()):musicAudio?.play(),pause:()=>isYouTubeTrack(currentMusicTrack())?(youtubePlayer?.pauseVideo?.()):musicAudio?.pause(),previoustrack:()=>playNextMusic(-1),nexttrack:()=>playNextMusic(1),seekbackward:()=>{if(isYouTubeTrack(currentMusicTrack())){const t=youtubePlayer?.getCurrentTime?.()||0;youtubePlayer?.seekTo?.(Math.max(0,t-10),true);}else if(musicAudio)musicAudio.currentTime=Math.max(0,musicAudio.currentTime-10)},seekforward:()=>{if(isYouTubeTrack(currentMusicTrack())){const t=youtubePlayer?.getCurrentTime?.()||0;youtubePlayer?.seekTo?.(t+10,true);}else if(musicAudio)musicAudio.currentTime=Math.min(musicAudio.duration||0,musicAudio.currentTime+10)},seekto:(d)=>{if(!Number.isFinite(d.seekTime))return;if(isYouTubeTrack(currentMusicTrack()))youtubePlayer?.seekTo?.(d.seekTime,true);else if(musicAudio)musicAudio.currentTime=d.seekTime}};
  for(const [name,fn] of Object.entries(actions)){try{navigator.mediaSession.setActionHandler(name,fn)}catch(e){}}
}
async function playMusicTrack(track,queueIds=null,index=null){
  if(isYouTubeTrack(track)) return playYouTubeTrack(track,queueIds,index);
  ensureMusicAudio();
  if(!track?.url){toast("⚠️ Esta música não tem uma URL de áudio válida");return;}
  musicPreviewTrack=null;
  if(youtubePlayer){try{youtubePlayer.pauseVideo();youtubePlayer.destroy();}catch(e){} youtubePlayer=null;}
  if(queueIds){musicQueue=[...queueIds];musicQueueIndex=Math.max(0,index??musicQueue.findIndex(id=>String(id)===String(track.id)));}
  else if(!musicQueue.length){musicQueue=[track.id];musicQueueIndex=0;}
  musicCurrentTrackId=track.id;
  musicAudio.src=track.url;
  musicAudio.load();
  updateMediaSession();
  try{await musicAudio.play();}catch(error){toast("▶️ Toque em play novamente para iniciar a música");}
  musicSettings={...(musicSettings||{id:1}),currentTrackId:track.id,queue:musicQueue,queueIndex:musicQueueIndex};
  await put("musicSettings",musicSettings);
  render();
}
async function playNextMusic(direction=1){
  const ids=musicQueue.length?musicQueue:musicTracks.map(t=>t.id);
  if(!ids.length)return;
  let idx=musicQueue.length?musicQueueIndex:ids.findIndex(id=>String(id)===String(musicCurrentTrackId));
  if(idx<0)idx=0;
  idx+=direction;
  if(idx>=ids.length)idx=0;
  if(idx<0)idx=ids.length-1;
  const track=musicTracks.find(t=>String(t.id)===String(ids[idx]));
  if(!track)return;
  musicQueue=ids;musicQueueIndex=idx;
  await playMusicTrack(track,ids,idx);
}
async function toggleMusicPlay(){const track=currentMusicTrack()||musicTracks[0];if(isYouTubeTrack(track)){if(!youtubePlayer)return playMusicTrack(track);const state=youtubePlayer.getPlayerState?.();if(state===1)youtubePlayer.pauseVideo();else youtubePlayer.playVideo();updateMediaSession();return;}ensureMusicAudio();if(!musicAudio.src){if(track)return playMusicTrack(track);toast("Adicione uma música primeiro");return;}if(musicAudio.paused){try{await musicAudio.play()}catch(e){toast("Toque no play novamente para iniciar");}}else musicAudio.pause();updateMusicUI();updateMediaSession();}
async function addMusicTrack(track,playlistId=null){
  const youtubeId=track.youtubeId||getYouTubeId(track.url);
  const source=youtubeId?"youtube":(track.source||"direct");
  const payload={title:track.title||"Música",artist:track.artist||"Artista desconhecido",album:track.album||"",cover:track.cover||"",url:track.url||track.previewUrl||"",youtubeId:youtubeId||"",source,duration:track.duration||0,createdAt:new Date().toISOString()};
  if(!payload.url && !payload.youtubeId){toast("Informe um link válido");return;}
  await put("musicTracks",payload);
  await loadData();
  const added=musicTracks.slice().sort((a,b)=>Number(b.id)-Number(a.id))[0];
  if(playlistId){const pl=musicPlaylists.find(p=>String(p.id)===String(playlistId));if(pl){pl.trackIds=[...(pl.trackIds||[]),added.id];await put("musicPlaylists",pl);await loadData();}}
  toast("🎵 Música adicionada");
}
async function createMusicPlaylist(name){const clean=String(name||"").trim();if(!clean)return;await put("musicPlaylists",{name:clean,trackIds:[],createdAt:new Date().toISOString()});await loadData();render();toast("🎼 Playlist criada");}
function updateMusicUI(){const track=musicPreviewTrack||currentMusicTrack(), title=document.querySelector("#musicNowTitle"),artist=document.querySelector("#musicNowArtist"),cover=document.querySelector("#musicNowCover"),play=document.querySelector("#musicPlayBtn");if(title)title.textContent=track?.title||"Nenhuma música selecionada";if(artist)artist.textContent=track?.artist||"Escolha uma música ou adicione um link";if(cover){if(cover.tagName==="IMG"){cover.src=track?.cover||"";cover.style.display=track?.cover?"block":"none";}}if(play){const yt=isYouTubeTrack(track);play.textContent=yt?(youtubePlayer?.getPlayerState?.()===1?"⏸️":"▶️"):(musicAudio&&!musicAudio.paused?"⏸️":"▶️");}const status=document.querySelector("#musicStatus");if(status)status.textContent=musicPreviewTrack?"Prévia":(isYouTubeTrack(track)?"YouTube":(musicAudio&&!musicAudio.paused?"Reproduzindo":"Pausado"));}
function musicView(){
  const track=currentMusicTrack();
  const playlists=musicPlaylists;
  const youtube=isYouTubeTrack(track);
  const cover=track?.cover?`<img id="musicNowCover" src="${esc(track.cover)}" alt="Capa" />`:`<div class="music-cover-placeholder" id="musicNowCover">🎧</div>`;
  const playerMedia=``;
  return `<div class="section-title"><div><h2>🎧 Zyn Music</h2><div class="muted">Player pessoal com áudio direto, links do YouTube e prévias de busca.</div></div><div class="actions"><button class="btn" id="musicPlaylistNew">+ Playlist</button><button class="btn primary" id="musicAddLink">+ Link</button></div></div>
  <section class="music-player card full">${playerMedia}<div class="music-now">${cover}<div class="music-meta"><div class="eyebrow">TOCANDO AGORA</div><h2 id="musicNowTitle">${esc(track?.title||"Nenhuma música selecionada")}</h2><div class="muted" id="musicNowArtist">${esc(track?.artist||"Escolha uma música ou adicione um link")}</div><div class="tag" id="musicStatus">${youtube?"YouTube":(musicAudio&&!musicAudio.paused?"Reproduzindo":"Pausado")}</div></div></div>
  ${youtube?``:`<input id="musicProgress" class="music-progress" type="range" min="0" max="100" value="0" step="0.1" aria-label="Progresso da música"/><div class="music-times"><span id="musicCurrentTime">0:00</span><span id="musicDuration">0:00</span></div>`}<div class="music-controls"><button class="music-control" id="musicPrev" title="Anterior">⏮️</button><button class="music-control music-play" id="musicPlayBtn" title="Play/Pause">▶️</button><button class="music-control" id="musicNext" title="Próxima">⏭️</button></div><div class="music-extra"><button class="btn" id="musicShuffle">🔀 Aleatório</button><label class="music-volume">🔊 <input id="musicVolume" type="range" min="0" max="1" step="0.05" value="${musicAudio?musicAudio.volume:1}"/></label></div></section>
  <section class="card full"><div class="row"><h3>🔎 Buscar artista / banda</h3><span class="tag">prévia + YouTube</span></div><form id="musicSearchForm" class="music-search"><input name="query" placeholder="Ex.: Coldplay, Bruno Mars, Queen..." autocomplete="off"/><button class="btn primary" type="submit">Buscar</button></form><div id="musicSearchResults" class="stack"><div class="empty">Busque uma música e <b>ouça a prévia antes de adicionar</b> à playlist.</div></div></section>
  <section class="card full"><div class="row"><h3>🎼 Minhas playlists</h3><span class="tag">${playlists.length}</span></div><div class="music-playlists">${playlists.map(p=>`<button class="music-playlist" data-music-playlist="${p.id}"><b>${esc(p.name)}</b><span>${(p.trackIds||[]).length} música(s)</span></button>`).join("")||`<div class="empty">Crie sua primeira playlist.</div>`}</div></section>
  <section class="card full"><div class="row"><h3>🎵 Biblioteca</h3><span class="tag">${musicTracks.length} faixa(s)</span></div><div class="stack">${musicTracks.slice().reverse().map(t=>`<div class="list-item music-track-item"><div class="music-track-main">${t.cover?`<img src="${esc(t.cover)}" alt=""/>`:`<div class="mini-cover">${isYouTubeTrack(t)?"▶️":"🎵"}</div>`}<div><b>${esc(t.title)}</b><div class="muted">${esc(t.artist)}${t.source==="itunes-preview"?" • Prévia":t.source==="youtube"?" • YouTube":""}</div></div></div><div class="actions"><button class="btn" data-music-play="${t.id}">▶</button><button class="btn danger" data-music-delete="${t.id}">×</button></div></div>`).join("")||`<div class="empty">Nenhuma música ainda. Adicione um link direto ou um link do YouTube.</div>`}</div></section>`;
}
async function musicLinkForm(){
 const el=modal(`<div class="section-title"><h3>🔗 Adicionar música por link</h3><button class="btn" id="close">Fechar</button></div><form id="musicLinkForm" class="form-grid"><div class="field full"><label>Link da música</label><input name="url" type="url" placeholder="Cole um link de áudio ou do YouTube" required /><div class="muted field-help">YouTube: o vídeo será reproduzido pelo player oficial. Áudio direto: usa o player de áudio do Zyn.</div></div><div class="field"><label>Nome da música</label><input name="title" required /></div><div class="field"><label>Artista</label><input name="artist" /></div><div class="field"><label>Álbum</label><input name="album" /></div><div class="field"><label>Capa (URL opcional)</label><input name="cover" type="url" /></div><div class="field full"><label>Playlist</label><select name="playlist"><option value="">Sem playlist</option>${musicPlaylists.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div><div class="actions field full"><button class="btn primary" type="submit">Adicionar</button></div></form>`);
 el.querySelector("#close").onclick=()=>closeModal(el);el.querySelector("#musicLinkForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await addMusicTrack({url:String(f.get("url")||"").trim(),title:f.get("title"),artist:f.get("artist"),album:f.get("album"),cover:f.get("cover"),source:"direct"},f.get("playlist")||null);closeModal(el);render();};
}
async function searchMusicArtist(query){
 musicSearchBusy=true;render();
 try{const url=`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&attribute=artistTerm&limit=20`;const response=await fetch(url);if(!response.ok)throw new Error("Busca indisponível");const json=await response.json();return (json.results||[]).filter(x=>x.previewUrl).map(x=>({title:x.trackName,artist:x.artistName,album:x.collectionName,cover:x.artworkUrl100?.replace("100x100bb","600x600bb")||"",url:x.previewUrl,source:"itunes-preview",duration:x.trackTimeMillis||0}));}finally{musicSearchBusy=false;}
}

document.body.className = theme;
const app = document.querySelector("#app");
const APP_SESSION_KEY = "zyn-app-unlocked";
let appUnlocked = sessionStorage.getItem(APP_SESSION_KEY) === "1";

function markAppUnlocked(){
  appUnlocked = true;
  sessionStorage.setItem(APP_SESSION_KEY, "1");
}
function lockApp(){
  appUnlocked = false;
  sessionStorage.removeItem(APP_SESSION_KEY);
}

function authGateView(){
  const email = currentUser()?.email || "";
  return `<div class="auth-gate">
    <section class="auth-card">
      <div class="auth-brand"><div class="auth-logo">Z</div><div><div class="eyebrow">ASSISTENTE PESSOAL</div><h1>Assistente Zyn</h1></div></div>
      <div class="auth-welcome"><div class="eyebrow">ZYN CLOUD</div><h2>Bem-vindo de volta 👋</h2><p class="muted">Entre para acessar suas metas, finanças, GYM, alimentação, lembretes e o novo Zyn Music.</p></div>
      <form id="loginGateForm" class="stack">
        <div class="field"><label>E-mail</label><input name="email" type="email" required autocomplete="email" value="${esc(email)}" placeholder="seu@email.com"></div>
        <div class="field"><label>Senha</label><input name="password" type="password" minlength="6" required autocomplete="current-password" placeholder="Mínimo de 6 caracteres"></div>
        <button class="btn primary auth-submit" type="submit">Entrar no Zyn</button>
        <button class="btn auth-signup" type="button" id="loginCreateAccount">Criar conta</button>
      </form>
      <p class="auth-note">🔒 A sessão de acesso permanece enquanto o aplicativo estiver aberto ou em segundo plano. Ao fechar o aplicativo, o Zyn pede login novamente.</p>
      <div id="loginGateStatus" class="auth-status" aria-live="polite"></div>
    </section>
  </div>`;
}

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
      toast("☁️ Login realizado");
    }catch(err){
      if(status)status.textContent="❌ "+(err?.message||"Não foi possível entrar.");
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
      if(authSession){markAppUnlocked();await loadData();await syncAll("signup");render();toast("☁️ Conta criada");}
      else if(status)status.textContent="Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.";
    }catch(err){
      if(status)status.textContent="❌ "+(err?.message||"Não foi possível criar a conta.");
    }finally{if(btn){btn.disabled=false;btn.textContent="Criar conta";}}
  });
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const database=request.result;
      ["reminders","events","financialAccounts","financialTransactions","financialGoals","workoutPlans","workoutSessions","habits","habitLogs","settings","goals","earnings","gymProfile","gymPlans","gymSessions","foodProfile","mealPlans","shoppingItems","financeProfile","financeAccounts","financeTransactions","financeBills","financeGoals","musicTracks","musicPlaylists","musicSettings","syncQueue","syncMeta"].forEach(store=>{
        if(!database.objectStoreNames.contains(store)) database.createObjectStore(store,{keyPath:"id",autoIncrement:true});
      });
    };
    request.onsuccess=()=>{db=request.result;resolve(db)};
    request.onerror=()=>reject(request.error);
  });
}
function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}
function all(name){return new Promise((resolve,reject)=>{const r=store(name).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
function put(name,data,options={}){return new Promise((resolve,reject)=>{
  const payload={...(data||{})};
  if(options.touch!==false && name!=="syncQueue" && name!=="syncMeta") payload.updatedAt=new Date().toISOString();
  const r=store(name,"readwrite").put(payload);
  r.onsuccess=()=>{if(options.touch!==false && typeof scheduleSync==="function")scheduleSync();resolve(r.result)};r.onerror=()=>reject(r.error)
})}
function remove(name,id){return new Promise(async(resolve,reject)=>{
  const stamp=new Date().toISOString();
  const r=store(name,"readwrite").delete(id);
  r.onsuccess=async()=>{
    try{ if(name!=="syncQueue" && name!=="syncMeta") await put("syncQueue",{storeName:name,recordId:String(id),updatedAt:stamp,deleted:true},{touch:false}); if(typeof scheduleSync==="function") scheduleSync(); resolve(); }
    catch(e){reject(e)}
  };
  r.onerror=()=>reject(r.error)
})}
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
function uiIcon(name){const paths={home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5h5v5"/>',plan:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M7 10h10M8 14h3M14 14h2"/>',well:'<path d="M8 5v5M16 5v5M5 8h6M13 8h6M7 13c0 3 2 5 5 5s5-2 5-5"/>',finance:'<path d="M4 18V8M10 18V5M16 18v-7M21 18H3"/><path d="m17 7 3-3 2 2"/>',music:'<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="3"/><circle cx="16.5" cy="16" r="3"/>',assistant:'<path d="M7 8h10a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H9l-4 3v-7a4 4 0 0 1-2-3v-1a4 4 0 0 1 4-4Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.home}</svg>`}
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
 return `<div class="section-title"><h2>🥗 Dietas</h2><button class="btn primary" id="foodProfile">⚙️ Meu perfil</button></div>
 <section class="card full food-hero"><div class="eyebrow">MINHAS DIETAS</div><h2>Comer melhor sem complicar</h2><p class="muted">3–4 refeições por dia, com foco em economia, praticidade e variedade.</p><div class="row"><span class="tag">Objetivo: perder gordura</span><span class="tag">Referência: ${money(p.budget||125)}/semana</span></div></section>
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
function syncMusicDock(){
 const dock=document.querySelector("#musicDock");
 if(!dock)return;
 const track=currentMusicTrack();
 const active=!!track;
 dock.classList.toggle("active",active);
 dock.classList.toggle("expanded",currentView==="music");
 const title=dock.querySelector("#dockTitle");
 const artist=dock.querySelector("#dockArtist");
 const play=dock.querySelector("#dockPlay");
 const cover=dock.querySelector("#dockCover");
 if(title)title.textContent=track?.title||"Nenhuma música";
 if(artist)artist.textContent=track?.artist||"Zyn Music";
 if(cover){cover.textContent=track?.cover?"":"🎧";cover.style.backgroundImage=track?.cover?`url("${String(track.cover).replace(/"/g,"%22")}")`:"";}
 if(play){const playing=isYouTubeTrack(track)?youtubePlayer?.getPlayerState?.()===1:!!musicAudio&&!musicAudio.paused;play.textContent=playing?"⏸️":"▶️";}
 const host=document.querySelector("#youtubePlayer");
 if(host)host.classList.toggle("visible",isYouTubeTrack(track));
 updateMusicUI();
}
function moreMenu(){
 const el=modal(`<div class="section-title"><div><h3>☰ Mais</h3><div class="muted">Outras áreas do Zyn</div></div><button class="btn" id="closeMore">Fechar</button></div><div class="more-grid">
 <button class="more-item" data-more-view="planning">${uiIcon("plan")}<b>Planejamento</b><span>Lembretes + Metas</span></button>
 <button class="more-item" data-more-view="wellness">${uiIcon("well")}<b>Bem-estar</b><span>GYM + Dietas + Hábitos</span></button>
 <button class="more-item" data-more-view="finance">${uiIcon("finance")}<b>Finanças</b><span>Controle financeiro</span></button>
 <button class="more-item" data-more-view="music">${uiIcon("music")}<b>Música</b><span>Zyn Music</span></button>
 <button class="more-item" data-more-view="assistant">${uiIcon("assistant")}<b>Zyn Assistente</b><span>Seu assistente pessoal</span></button>
 </div>`);
 el.querySelector("#closeMore")?.addEventListener("click",()=>closeModal(el));
 el.querySelectorAll("[data-more-view]").forEach(b=>b.addEventListener("click",()=>{const v=b.dataset.moreView;closeModal(el);setView(v);}));
}

function layout(){
 return `<div class="shell">
  <header class="topbar"><div class="brand"><div class="brand-mark">Z</div><div><div class="eyebrow">ASSISTENTE PESSOAL</div><div class="title">Assistente Zyn</div></div></div><div class="actions"><button class="cloud-status offline" id="cloudStatus" title="Status da nuvem"><span></span>Entrar para sincronizar</button><button class="icon-btn install-btn" id="installBtn" title="Instalar Zyn" hidden>⬇️</button><button class="icon-btn" id="themeBtn" title="Alternar tema">◐</button><button class="icon-btn" id="updateBtn" title="Ver versão">↻</button></div></header>
  <main id="content"></main>
 </div>
 <div id="musicDock" class="music-dock">
   <div id="youtubePlayer" class="youtube-persistent-host"></div>
   <div class="music-dock-main"><div id="dockCover" class="music-dock-cover">🎧</div><div class="music-dock-meta"><b id="dockTitle">Nenhuma música</b><span id="dockArtist">Zyn Music</span></div><button class="music-dock-btn" id="dockPrev" title="Anterior">⏮️</button><button class="music-dock-btn dock-play" id="dockPlay" title="Play/Pause">▶️</button><button class="music-dock-btn" id="dockNext" title="Próxima">⏭️</button><button class="music-dock-open" id="dockOpen" title="Abrir Zyn Music">🎧</button></div>
 </div>
 <nav class="nav"><div class="nav-inner">
  <button data-view="home" class="${currentView==="home"?"active":""}">${uiIcon("home")}<span>Início</span></button>
  <button data-view="planning" class="${["planning","reminders","goals"].includes(currentView)?"active":""}">${uiIcon("plan")}<span>Planejar</span></button>
  <button data-view="wellness" class="${["wellness","gym","gymWorkout","food","habits"].includes(currentView)?"active":""}">${uiIcon("well")}<span>Bem-estar</span></button>
  <button data-view="finance" class="${currentView==="finance"?"active":""}">${uiIcon("finance")}<span>Finanças</span></button>
  <button id="moreNav" class="${["music","assistant"].includes(currentView)?"active":""}">${uiIcon("more")}<span>Mais</span></button>
 </div></nav>`;
}

function homeView(){
 const goal=activeGoal();
 const amount=goal?weekEarnings(goal):0;
 const progress=goal?goalProgress(goal):0;
 const today=goal?dayAmount(goal):0;
 const pending=reminders.filter(r=>!r.done).length;
 const gymSessionsCount=gymCount();
 const shoppingPending=shoppingItems.filter(x=>!x.done).length;
 const finance=financeMonthData();
 const track=currentMusicTrack();
 return `<section class="home-hero"><div><div class="eyebrow">ZYN ASSISTENTE PESSOAL</div><h1>Olá, Ramon.</h1><p>Seu painel central para organizar o dia, cuidar da rotina e acompanhar o que importa.</p></div><div class="home-date">${new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</div></section>
 <section class="home-panels">
  <button class="home-panel-card panel-plan" data-home-view="planning"><span class="panel-icon">${uiIcon("plan")}</span><div class="panel-copy"><span class="panel-kicker">ORGANIZAÇÃO</span><h3>Planejamento</h3><p>Lembretes + Metas em um único painel.</p><div class="panel-stat"><b>${pending}</b><span>pendentes</span><i>${progress.toFixed(0)}% da meta</i></div></div><span class="panel-arrow">›</span></button>
  <button class="home-panel-card panel-well" data-home-view="wellness"><span class="panel-icon">${uiIcon("well")}</span><div class="panel-copy"><span class="panel-kicker">ROTINA & SAÚDE</span><h3>Bem-estar</h3><p>GYM + Dietas + Hábitos no mesmo espaço.</p><div class="panel-stat"><b>${gymSessionsCount}</b><span>sessões/semana</span><i>${shoppingPending} itens de compras</i></div></div><span class="panel-arrow">›</span></button>
  <button class="home-panel-card panel-finance" data-home-view="finance"><span class="panel-icon">${uiIcon("finance")}</span><div class="panel-copy"><span class="panel-kicker">CONTROLE</span><h3>Finanças</h3><p>Visão mensal do dinheiro que entra, sai e sobra.</p><div class="panel-stat"><b>${money(Math.max(0,finance.available))}</b><span>disponível</span><i>${money(finance.expense)} em despesas</i></div></div><span class="panel-arrow">›</span></button>
  <button class="home-panel-card panel-music" data-home-view="music"><span class="panel-icon">${uiIcon("music")}</span><div class="panel-copy"><span class="panel-kicker">ENTRETENIMENTO</span><h3>Zyn Music</h3><p>Suas playlists, links e reprodução.</p><div class="panel-stat"><b>${musicTracks.length}</b><span>faixas</span><i>${track?esc(track.title):"Nada tocando"}</i></div></div><span class="panel-arrow">›</span></button>
  <button class="home-panel-card panel-assistant" data-home-view="assistant"><span class="panel-icon">${uiIcon("assistant")}</span><div class="panel-copy"><span class="panel-kicker">INTELIGÊNCIA PESSOAL</span><h3>Zyn Assistente</h3><p>O centro para conversar e conectar seus painéis.</p><div class="panel-stat"><b>∞</b><span>possibilidades</span><i>Seu assistente pessoal</i></div></div><span class="panel-arrow">›</span></button>
 </section>
 <section class="home-summary-grid">
  <section class="card home-summary"><div class="row"><div><span class="eyebrow">META ATIVA</span><h3>${goal?esc(goal.name):"Nenhuma meta criada"}</h3></div><span class="tag">${goal?money(amount)+" / "+money(goal.target):"Começar"}</span></div>${goal?`<div class="progress"><div style="width:${progress}%"></div></div><div class="row"><span class="muted">Hoje: ${money(today)}</span><button class="btn" id="homePlanning">Abrir planejamento</button></div>`:`<button class="btn primary" id="homePlanning">Abrir planejamento</button>`}</section>
  <section class="card home-summary music-home-card"><div class="row"><div><span class="eyebrow">TOCANDO AGORA</span><h3>${esc(track?.title||"Sua música")}</h3><div class="muted">${esc(track?.artist||"Abra o Zyn Music para começar")}</div></div><button class="btn primary" id="homeMusic">Abrir</button></div></section>
 </section>`;
}

function planningView(){
 const pending=reminders.filter(r=>!r.done).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(0,5); const goal=activeGoal(); const amount=goal?weekEarnings(goal):0; const p=goal?goalProgress(goal):0;
 return `<div class="section-title"><div><span class="eyebrow">ORGANIZAÇÃO</span><h2>Planejamento</h2><div class="muted">Lembretes e metas agora vivem no mesmo painel.</div></div><div class="actions"><button class="btn" id="planningReminder">+ Lembrete</button><button class="btn primary" id="planningGoal">+ Meta</button></div></div><div class="grid planning-grid">
 <section class="card planning-hero"><div class="row"><div><span class="eyebrow">META ATIVA</span><h2>${goal?esc(goal.name):"Crie sua primeira meta"}</h2></div><span class="tag">${goal?p.toFixed(0)+"%":"Novo"}</span></div>${goal?`<div class="metric">${money(amount)}</div><div class="muted">de ${money(goal.target)} nesta semana</div><div class="progress"><div style="width:${p}%"></div></div><div class="row"><span class="muted">Meta diária ${money(goal.dailyTarget)}</span><button class="btn" id="planningGoals">Gerenciar metas</button></div>`:`<button class="btn primary" id="planningGoals">Criar meta</button>`}</section>
 <section class="card"><div class="row"><h3>${uiIcon("plan")} Próximos lembretes</h3><span class="tag">${reminders.filter(r=>!r.done).length}</span></div>${pending.length?`<div class="stack">${pending.map(r=>`<div class="list-item"><div><b>${esc(r.title)}</b><div class="muted">${fmtDate(r.date)}${r.time?" • "+esc(r.time):""}</div></div><span class="tag warning">Pendente</span></div>`).join("")}</div>`:`<div class="empty">Nenhum lembrete pendente.</div>`}<button class="btn" id="planningReminders" style="margin-top:12px">Ver todos</button></section>
 </div>
 <div class="section-title"><h3>Visão rápida</h3></div><div class="grid"><section class="card"><div class="muted">Lembretes concluídos</div><div class="metric">${reminders.filter(r=>r.done).length}</div></section><section class="card"><div class="muted">Metas cadastradas</div><div class="metric">${goals.length}</div></section><section class="card"><div class="muted">Ganhos nesta semana</div><div class="metric">${money(earnings.filter(e=>getCurrentWeekDays().includes(e.date)).reduce((s,e)=>s+Number(e.amount||0),0))}</div></section></div>`;
}

function wellnessView(){
 const t=gymToday(); const c=gymCount(); const p=foodProfile||{}; const shopping=shoppingItems.filter(x=>!x.done).length;
 return `<div class="section-title"><div><span class="eyebrow">ROTINA & SAÚDE</span><h2>Bem-estar</h2><div class="muted">Tudo que ajuda você a cuidar do corpo e da rotina.</div></div></div><section class="wellness-hero card full"><div><span class="eyebrow">HOJE</span><h2>${esc(t.workout)}</h2><p class="muted">${t.type==="rest"?"Dia de recuperação":"Treino principal"} • ${c} sessão(ões) nesta semana</p></div><button class="btn primary" id="wellGym">Abrir GYM</button></section><div class="wellness-grid">
 <button class="wellness-card" data-well-view="gym"><span class="panel-icon">${uiIcon("well")}</span><span class="eyebrow">MOVIMENTO</span><h3>GYM</h3><p>Treino de hoje, semana, histórico e caminhada.</p><b>${c} sessões</b></button>
 <button class="wellness-card" data-well-view="food"><span class="panel-icon">${uiIcon("well")}</span><span class="eyebrow">ALIMENTAÇÃO</span><h3>Dietas</h3><p>Planejamento semanal, perfil e lista de compras.</p><b>${shopping} itens pendentes</b></button>
 <button class="wellness-card" data-well-view="habits"><span class="panel-icon">${uiIcon("plan")}</span><span class="eyebrow">CONSISTÊNCIA</span><h3>Hábitos</h3><p>Rotinas e hábitos serão acompanhados aqui.</p><b>${0} registros</b></button>
 </div><div class="card full"><div class="row"><div><span class="eyebrow">DIETAS</span><h3>${money(p.budget||125)}/semana de referência</h3><div class="muted">${p.meals||"3–4"} refeições por dia • foco em praticidade e variedade.</div></div><button class="btn" id="wellDiet">Abrir Dietas</button></div></div>`;
}
function awaitableHabitsCount(){return 0}

function assistantView(){return `<div class="section-title"><div><span class="eyebrow">CENTRO DO ZYN</span><h2>Zyn Assistente</h2><div class="muted">Seu assistente pessoal para conectar organização, bem-estar, finanças e música.</div></div></div><section class="assistant-hero card full"><div class="assistant-orb">${uiIcon("assistant")}</div><div><span class="eyebrow">ASSISTENTE PESSOAL</span><h2>O que você quer organizar hoje?</h2><p class="muted">Esta área será o centro inteligente do Zyn. Por enquanto, use os painéis abaixo para acessar cada parte da sua rotina.</p></div></section><div class="assistant-actions"><button class="home-panel-card" data-home-view="planning"><span class="panel-icon">${uiIcon("plan")}</span><div class="panel-copy"><h3>Planejamento</h3><p>Lembretes e metas.</p></div></button><button class="home-panel-card" data-home-view="wellness"><span class="panel-icon">${uiIcon("well")}</span><div class="panel-copy"><h3>Bem-estar</h3><p>GYM, Dietas e Hábitos.</p></div></button><button class="home-panel-card" data-home-view="finance"><span class="panel-icon">${uiIcon("finance")}</span><div class="panel-copy"><h3>Finanças</h3><p>Seu controle financeiro.</p></div></button><button class="home-panel-card" data-home-view="music"><span class="panel-icon">${uiIcon("music")}</span><div class="panel-copy"><h3>Zyn Music</h3><p>Seu player pessoal.</p></div></button></div>`}

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

function setCloudStatus(status,message){cloudStatus=status;cloudMessage=message||"";const el=document.querySelector("#cloudStatus");if(el){el.className=`cloud-status ${status}`;el.title=cloudMessage;el.innerHTML=`<span></span>${esc(message||status)}`;}}
function currentUser(){return authSession?.user||null;}
async function refreshAuth(){const {data,error}=await supabase.auth.getSession();if(error) throw error;authSession=data.session||null;return authSession;}
async function signIn(email,password){const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error) throw error;authSession=data.session;if(!authSession) throw new Error("Não foi possível iniciar a sessão.");markAppUnlocked();await syncAll("login");render();toast("☁️ Conta conectada e dados sincronizados");}
async function signUp(email,password){const {data,error}=await supabase.auth.signUp({email,password});if(error) throw error;authSession=data.session||null;if(data.session){markAppUnlocked();await syncAll("signup");render();toast("☁️ Conta criada e sincronizada");}else{toast("Conta criada. Confira seu e-mail para confirmar o cadastro.");}}
async function signOut(){await supabase.auth.signOut();authSession=null;lockApp();setCloudStatus("offline","Sessão encerrada — entre novamente para acessar o Zyn");render();toast("Você saiu da conta. Seus dados locais foram preservados.");}
function authForm(){
 const user=currentUser();
 const el=modal(`<div class="row"><h2>☁️ Zyn Cloud</h2><button class="btn" id="close">×</button></div>
 ${user?`<div class="stack"><section class="card full"><div class="eyebrow">CONTA CONECTADA</div><h3>${esc(user.email||"Usuário")}</h3><p class="muted">Seus dados locais e a nuvem usam a mesma conta. O sincronismo continua funcionando depois de voltar ao online.</p></section><div class="actions"><button class="btn primary" id="syncNow">↻ Sincronizar agora</button><button class="btn danger" id="logout">Sair da conta</button></div></div>`:
 `<form id="authForm" class="stack"><div class="field"><label>E-mail</label><input name="email" type="email" required autocomplete="email" placeholder="seu@email.com"></div><div class="field"><label>Senha</label><input name="password" type="password" minlength="6" required autocomplete="current-password" placeholder="Mínimo de 6 caracteres"></div><div class="actions"><button class="btn primary" name="action" value="login">Entrar</button><button class="btn" name="action" value="signup">Criar conta</button></div><p class="muted">A conta serve apenas para identificar seus dados no Zyn Cloud. A chave usada no aplicativo é uma chave pública do Supabase; nenhuma service_role fica no navegador.</p></form>`}`);
 el.querySelector("#close").onclick=()=>closeModal(el);
 el.querySelector("#syncNow")?.addEventListener("click",async()=>{await syncAll("manual");closeModal(el);render();toast("☁️ Sincronização concluída")});
 el.querySelector("#logout")?.addEventListener("click",async()=>{closeModal(el);await signOut()});
 el.querySelector("#authForm")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);const email=String(f.get("email")||"").trim();const password=String(f.get("password")||"");const action=e.submitter?.value||"login";try{if(action==="signup")await signUp(email,password);else await signIn(email,password);closeModal(el);render();}catch(err){toast("❌ "+(err?.message||"Não foi possível autenticar"));}});
}
async function readLocalRecords(){
 const stores=["reminders","events","financialAccounts","financialTransactions","financialGoals","workoutPlans","workoutSessions","habits","habitLogs","settings","goals","earnings","gymProfile","gymPlans","gymSessions","foodProfile","mealPlans","shoppingItems","financeProfile","financeAccounts","financeTransactions","financeBills","financeGoals","musicTracks","musicPlaylists","musicSettings"];
 const out=[];for(const name of stores){const rows=await all(name);for(const row of rows){if(row?.id!==undefined&&row?.id!==null){const stamp=row.updatedAt||new Date().toISOString();out.push({storeName:name,recordId:String(row.id),payload:row.updatedAt?row:{...row,updatedAt:stamp},updatedAt:stamp});}}}return out;
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

async function loadData(){reminders=await all("reminders");goals=await all("goals");earnings=await all("earnings");gymProfile=(await all("gymProfile"))[0]||null;gymPlans=await all("gymPlans");gymSessions=await all("gymSessions");foodProfile=(await all("foodProfile"))[0]||null;mealPlans=await all("mealPlans");shoppingItems=await all("shoppingItems");financeProfile=(await all("financeProfile"))[0]||null;financeAccounts=await all("financeAccounts");financeTransactions=await all("financeTransactions");financeBills=await all("financeBills");financeGoals=await all("financeGoals");musicTracks=await all("musicTracks");musicPlaylists=await all("musicPlaylists");if(!musicPlaylists.length){await put("musicPlaylists",{name:"Minha Playlist",trackIds:[],createdAt:new Date().toISOString()});musicPlaylists=await all("musicPlaylists");}musicSettings=(await all("musicSettings"))[0]||null;ensureMusicAudio();setupMediaSession();if(musicSettings?.currentTrackId&&!musicCurrentTrackId)musicCurrentTrackId=musicSettings.currentTrackId;
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
 document.querySelector("#updateBtn").onclick=()=>toast("Assistente Zyn v"+APP_VERSION);
 document.querySelectorAll("[data-view]").forEach(btn=>btn.onclick=()=>setView(btn.dataset.view));
 document.querySelector("#moreNav")?.addEventListener("click",moreMenu);
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
 document.querySelector("#homeMusic")?.addEventListener("click",()=>setView("music"));
 document.querySelectorAll("[data-home-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.homeView)));
 document.querySelector("#homePlanning")?.addEventListener("click",()=>setView("planning"));
 document.querySelector("#planningReminder")?.addEventListener("click",()=>reminderForm());
 document.querySelector("#planningGoal")?.addEventListener("click",()=>goalForm());
 document.querySelector("#planningReminders")?.addEventListener("click",()=>setView("reminders"));
 document.querySelector("#planningGoals")?.addEventListener("click",()=>setView("goals"));
 document.querySelector("#wellGym")?.addEventListener("click",()=>setView("gym"));
 document.querySelector("#wellDiet")?.addEventListener("click",()=>setView("food"));
 document.querySelectorAll("[data-well-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.wellView)));
 document.querySelector("#musicAddLink")?.addEventListener("click",musicLinkForm);
 document.querySelector("#musicPlaylistNew")?.addEventListener("click",async()=>{const name=prompt("Nome da playlist:");if(name)await createMusicPlaylist(name);});
 document.querySelector("#musicPlayBtn")?.addEventListener("click",toggleMusicPlay);
 document.querySelector("#musicPrev")?.addEventListener("click",()=>playNextMusic(-1));
 document.querySelector("#musicNext")?.addEventListener("click",()=>playNextMusic(1));
 document.querySelector("#musicVolume")?.addEventListener("input",e=>{ensureMusicAudio().volume=Number(e.target.value);});
 document.querySelector("#musicProgress")?.addEventListener("input",e=>{if(musicAudio&&Number.isFinite(musicAudio.duration))musicAudio.currentTime=(Number(e.target.value)/100)*musicAudio.duration;});
 document.querySelector("#musicShuffle")?.addEventListener("click",async()=>{if(!musicTracks.length)return toast("Adicione músicas primeiro");const ids=musicTracks.map(t=>t.id).sort(()=>Math.random()-0.5);musicQueue=ids;musicQueueIndex=0;await playMusicTrack(musicTracks.find(t=>t.id===ids[0]),ids,0);});
 document.querySelectorAll("[data-music-play]").forEach(b=>b.onclick=async()=>{const t=musicTracks.find(x=>x.id===Number(b.dataset.musicPlay));if(t)await playMusicTrack(t,musicTracks.map(x=>x.id),musicTracks.findIndex(x=>x.id===t.id));});
 document.querySelectorAll("[data-music-delete]").forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.musicDelete);if(confirm("Excluir esta música da biblioteca?")){if(String(musicCurrentTrackId)===String(id)){ensureMusicAudio().pause();ensureMusicAudio().removeAttribute("src");musicCurrentTrackId=null;}await remove("musicTracks",id);for(const p of musicPlaylists){if((p.trackIds||[]).includes(id)){p.trackIds=p.trackIds.filter(x=>x!==id);await put("musicPlaylists",p);}}await loadData();render();}});
 document.querySelector("#musicSearchForm")?.addEventListener("submit",async e=>{e.preventDefault();const q=String(new FormData(e.target).get("query")||"").trim();if(q.length<2)return toast("Digite pelo menos 2 caracteres");const box=document.querySelector("#musicSearchResults");if(box)box.innerHTML='<div class="empty">🔎 Buscando…</div>';try{const results=await searchMusicArtist(q);const target=document.querySelector("#musicSearchResults");if(!target)return;if(!results.length){target.innerHTML='<div class="empty">Nenhuma prévia encontrada para essa busca.</div>';return;}target.innerHTML=results.map((r,i)=>`<div class="list-item"><div class="music-track-main">${r.cover?`<img src="${esc(r.cover)}" alt=""/>`:`<div class="mini-cover">🎵</div>`}<div><b>${esc(r.title)}</b><div class="muted">${esc(r.artist)} • Prévia oficial de 30s</div></div></div><div class="actions"><button class="btn" data-search-preview="${i}">▶ Prévia</button><button class="btn primary" data-search-youtube="${i}">🎬 YouTube</button></div></div>`).join("");target.querySelectorAll("[data-search-preview]").forEach(btn=>btn.onclick=async()=>{const r=results[Number(btn.dataset.searchPreview)];musicPreviewTrack=r;ensureMusicAudio();musicAudio.src=r.url;musicAudio.load();try{await musicAudio.play();}catch(e){toast("Toque novamente para ouvir a prévia");}updateMusicUI();updateMediaSession();});target.querySelectorAll("[data-search-youtube]").forEach(btn=>btn.onclick=()=>{const r=results[Number(btn.dataset.searchYoutube)];const q=encodeURIComponent(`${r.artist} ${r.title}`);window.open(`https://www.youtube.com/results?search_query=${q}`,"_blank","noopener");toast("🎬 Escolha no YouTube a versão completa e copie o link para + Link");});}catch(error){const target=document.querySelector("#musicSearchResults");if(target)target.innerHTML='<div class="empty">⚠️ Não foi possível realizar a busca agora.</div>';}});
 document.querySelectorAll("[data-music-playlist]").forEach(b=>b.onclick=async()=>{const p=musicPlaylists.find(x=>String(x.id)===String(b.dataset.musicPlaylist));const ids=(p?.trackIds||[]).filter(id=>musicTracks.some(t=>String(t.id)===String(id)));if(!ids.length)return toast("Essa playlist ainda está vazia");await playMusicTrack(musicTracks.find(t=>String(t.id)===String(ids[0])),ids,0);});
}
function cleanupYouTubePlayer(){if(youtubePlayer){try{youtubePlayer.pauseVideo?.();youtubePlayer.destroy?.();}catch(e){} youtubePlayer=null;}}
function render(){
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
   if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
   render();
   if(deferredInstallPrompt){const b=document.querySelector("#installBtn");if(b)b.hidden=false;}
 }catch(error){
   console.error("[Zyn] Falha na inicialização:",error);
   app.innerHTML=`<div class="error-screen"><div class="error-card"><div class="auth-logo">Z</div><h2>O Zyn encontrou um problema</h2><p>Não foi possível iniciar o aplicativo. Atualize a página e tente novamente.</p><button class="btn primary" onclick="location.reload()">↻ Tentar novamente</button></div></div>`;
 }
})();
