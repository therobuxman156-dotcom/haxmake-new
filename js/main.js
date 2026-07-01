// ── Haxmake – main (menu, lobby, game loop) ──
const Main = (() => {
  let phase = 'menu';
  let playerName = '';
  let selectedLimit = CFG.DEFAULT_LIMIT;
  let selectedSpeed = CFG.DEFAULT_SPEED;
  let selectedMode = CFG.MODE_CASUAL;
  let selectedCountry = localStorage.getItem('haxmake_country') || 'FR';
  let showRoomCodes = true;
  let winnerShown = false;
  let lastReplayTimer = null;
  let currentGameMode = CFG.MODE_CASUAL;

  let fpsSamples = [];
  let lastFrameTime = 0;
  let perfWarningShown = false;
  let wasReplayActive = false;

  const $ = id => document.getElementById(id);
  const showScreen = n => { document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(n).classList.add('active'); };
  const flagFor = code => (CFG.COUNTRIES.find(c=>c.code===code)||CFG.COUNTRIES[0]).flag;
  const nameFor = code => (CFG.COUNTRIES.find(c=>c.code===code)||CFG.COUNTRIES[0]).name;

  function rankBadge(mmr) {
    if (!Auth || !Auth.isLoggedIn) return '<span class="rank-badge rank-none">Non classé</span>';
    const r = rankForMMR(mmr);
    return `<span class="rank-badge rank-${r.tier}">${r.name} · ${mmr} MMR</span>`;
  }

  function init() {
    Game.init($('gameCanvas'));
    const saved = localStorage.getItem('haxmake_name');
    if (saved) $('hostName').value = saved;

    if (typeof Auth !== 'undefined' && Auth.init()) { Auth.onProfileChange = updateAuthUI; }

    // Country selector
    const csel = $('countrySelect');
    if (csel) {
      CFG.COUNTRIES.forEach(c => { const o=document.createElement('option'); o.value=c.code; o.textContent=c.flag+' '+c.name; csel.appendChild(o); });
      csel.value=selectedCountry;
      csel.onchange=()=>{ selectedCountry=csel.value; localStorage.setItem('haxmake_country', selectedCountry); if(Auth.isLoggedIn) Auth.setCountry(selectedCountry); };
    }

    const room = new URLSearchParams(location.search).get('room');
    if (room) { phase='joining'; showScreen('joinScreen'); $('roomInput').value=room; $('joinName').value=saved||''; doJoin(); }

    // Menu
    $('btnHost').onclick = () => {
      playerName = Auth.isLoggedIn ? Auth.name : ($('hostName').value.trim()||'Host');
      localStorage.setItem('haxmake_name',playerName);
      selectedLimit=parseInt($('limitSelect').value)||2;
      selectedSpeed=$('speedSelect').value||'normal';
      selectedMode=$('modeSelect')?($('modeSelect').value||CFG.MODE_CASUAL):CFG.MODE_CASUAL;
      doHost();
    };
    $('btnSolo').onclick = () => doSolo();
    $('btnJoin').onclick = () => { $('joinName').value=$('hostName').value.trim()||saved||''; showScreen('joinScreen'); };
    $('btnBrowser').onclick = () => openBrowser();
    $('btnSignIn')?.addEventListener('click', () => Auth.signIn());
    $('btnSignOut')?.addEventListener('click', () => Auth.signOut());

    // Join
    $('btnDoJoin').onclick = () => doJoin();
    $('btnBackJoin').onclick = () => { Net.close(); phase='menu'; showScreen('menuScreen'); };

    // Browser
    $('btnRefreshBrowser').onclick = () => openBrowser();
    $('btnToggleCodes')?.addEventListener('click', () => { showRoomCodes = !showRoomCodes; openBrowser(); });
    $('btnBackBrowser').onclick = () => { showScreen('menuScreen'); };

    // Lobby
    $('btnStart').onclick = () => startGame();
    $('btnLeaveLobby').onclick = () => { Net.close(); phase='menu'; showScreen('menuScreen'); };

    // In-game quit
    $('btnQuitMatch')?.addEventListener('click', () => {
      Net.sendQuit();
      setTimeout(()=>{ Net.close(); phase='menu'; showScreen('menuScreen'); }, 100);
    });

    // Game over
    $('btnPlayAgain').onclick = () => { Net.close(); phase='menu'; showScreen('menuScreen'); };
    $('btnBackMenu').onclick = () => { Net.close(); phase='menu'; showScreen('menuScreen'); };

    showScreen('menuScreen');
    updateAuthUI();
    updateMMRDisplay();
    requestAnimationFrame(loop);
  }

  function updateAuthUI() {
    const info = $('authInfo');
    if (!info) return;
    if (Auth.isLoggedIn) {
      info.innerHTML = `👤 <b>${Auth.name}</b> ${flagFor(Auth.country)} ${rankBadge(Auth.mmr)} <button id="btnSignOut" class="btn-small btn-secondary">Déconnexion</button>`;
      const btn = $('btnSignOut'); if (btn) btn.onclick = () => Auth.signOut();
      $('hostName').value = Auth.name;
      if (Auth.country) { selectedCountry = Auth.country; const csel = $('countrySelect'); if (csel) csel.value = Auth.country; }
    } else {
      info.innerHTML = Auth.isReady ? '<button id="btnSignIn" class="btn-small btn-primary">Se connecter avec Google</button>' : '<span style="font-size:11px;color:#7f8c8d">Firebase non configuré (js/firebase-config.js)</span>';
      const btn = $('btnSignIn'); if (btn) btn.onclick = () => Auth.signIn();
    }
    updateMMRDisplay();
  }

  function updateMMRDisplay() {
    const el = $('mmrCorner');
    if (!el) return;
    if (Auth.isLoggedIn) {
      const r = rankForMMR(Auth.mmr);
      el.innerHTML = `${flagFor(Auth.country)} ${r.name} · ${Auth.mmr} MMR <br><span style="font-size:11px;color:#7f8c8d">${Auth.wins}V / ${Auth.losses}D</span>`;
    } else {
      el.innerHTML = '<span style="color:#7f8c8d;font-size:12px">Non connecté</span>';
    }
  }

  function checkPerformance() {
    if (phase !== 'playing') return;
    if (fpsSamples.length < 30) return;
    const avgFps = fpsSamples.reduce((a, b) => a + b) / fpsSamples.length;
    if (avgFps < CFG.MIN_PERF_FPS && !perfWarningShown) {
      showPerformanceWarning('⚠️ Performances faibles détectées ! Le jeu peut être lent. Essayez de réduire la vitesse ou activez l\'accélération matérielle dans les paramètres de votre navigateur.');
    } else if (avgFps >= CFG.MIN_PERF_FPS + 5 && perfWarningShown) {
      hidePerformanceWarning();
    }
  }

  function showPerformanceWarning(message) {
    const warningEl = $('performanceWarning');
    if (warningEl) { warningEl.textContent = message; warningEl.style.display = 'block'; perfWarningShown = true; }
  }

  function hidePerformanceWarning() {
    const warningEl = $('performanceWarning');
    if (warningEl) { warningEl.style.display = 'none'; perfWarningShown = false; }
  }

  // ── SOLO ──
  function doSolo() {
    playerName=$('hostName').value.trim()||'Solo';
    localStorage.setItem('haxmake_name',playerName);
    selectedSpeed=$('speedSelect').value||'normal';
    selectedMode=CFG.MODE_CASUAL; currentGameMode=CFG.MODE_CASUAL;
    const mult=CFG.SPEED_PRESETS[selectedSpeed]?.mult||1;
    const list=[
      {id:'solo',name:playerName,country:selectedCountry,team:CFG.TEAM_RED,slotIndex:0},
      {id:'bot',name:'Bot',country:'OTHER',team:CFG.TEAM_BLUE,slotIndex:0}
    ];
    phase='playing'; winnerShown=false; showScreen('gameScreen');
    Game.startGame(list, true, mult);
    Game.setOnReplayEnd(() => { /* solo: replay ends, game continues */ });
    startBotAI();
  }

  let botInterval=null;
  function startBotAI() {
    if (botInterval) clearInterval(botInterval);
    botInterval = setInterval(() => {
      if(!Game.running) return;
      const bot=Game.players.find(p=>p.id==='bot'), b=Game.ball;
      if(!bot||!b) return;
      const dx=b.x-bot.x, dy=b.y-bot.y;
      bot.input={u:dy<-15,d:dy>15,l:dx<-15,r:dx>15,k:Math.abs(dx)<40&&Math.abs(dy)<40};
    }, 50);
  }

  // ── HOST ──
  async function doHost() {
    showScreen('lobbyScreen'); $('lobbyTitle').textContent='Création...'; $('btnStart').style.display='none'; $('lobbyPlayers').innerHTML=''; $('playerCounter').textContent=''; $('hostLimitInfo').style.display='none';
    try {
      const code = await Net.hostRoom(selectedLimit, playerName, selectedMode);
      phase='lobby'; $('roomCodeDisplay').textContent=code;
      $('shareUrl').textContent=location.origin+location.pathname+'?room='+code;
      Net.rememberRoom(code);
      $('lobbyTitle').textContent='Partie créée !';
      const modeLabel = selectedMode===CFG.MODE_RANKED?'🏆 Classé':'🎮 Occasionnel';
      $('hostLimitInfo').textContent=selectedLimit+' joueurs · '+(CFG.SPEED_PRESETS[selectedSpeed]?.label||'Normale')+' · '+modeLabel;
      $('hostLimitInfo').style.display='block';
      updateLobbyUI();
      Net.onPlayerJoined=()=>updateLobbyUI();
      Net.onPlayerLeft=()=>updateLobbyUI();
    } catch(e) { $('lobbyTitle').textContent='Erreur : '+e.message; }
  }

  function updateLobbyUI() {
    const list=Net.lobbyPlayers, total=list.length+1, limit=Net.playerLimit;
    const c=$('lobbyPlayers'); c.innerHTML='';
    const hd=document.createElement('div'); hd.className='lobby-player team-red'; hd.textContent=playerName+' (host)'; c.appendChild(hd);
    list.forEach(p=>{ const d=document.createElement('div'); d.className='lobby-player '+(p.team===CFG.TEAM_RED?'team-red':'team-blue'); d.textContent=`${flagFor(p.country||'FR')} ${p.name}`; c.appendChild(d); });
    $('playerCounter').textContent=total+' / '+limit+' joueurs';
    $('btnStart').style.display=total>=2?'inline-block':'none';
  }

  // ── JOIN ──
  async function doJoin() {
    const name = Auth.isLoggedIn ? Auth.name : ($('joinName').value.trim()||'Joueur');
    const code=$('roomInput').value.trim().toUpperCase();
    localStorage.setItem('haxmake_name',name); playerName=name;
    $('joinStatus').textContent='Connexion...'; $('joinStatus').className='';
    try {
      await Net.joinRoom(code, name, selectedCountry);
      phase='lobby'; showScreen('lobbyScreen');
      $('lobbyTitle').textContent='Connecté ! En attente...';
      $('roomCodeDisplay').textContent=code; $('shareUrl').textContent='';
      $('btnStart').style.display='none'; $('hostLimitInfo').style.display='none';
      $('lobbyPlayers').innerHTML='<div class="lobby-player" style="background:#555">En attente...</div>';
      $('playerCounter').textContent='1 / ? joueurs';
      Net.onRoomState=(data)=>{
        const c=$('lobbyPlayers'); c.innerHTML='';
        data.players.forEach(p=>{
          const d=document.createElement('div');
          d.className='lobby-player '+(p.team===CFG.TEAM_RED?'team-red':'team-blue');
          d.textContent=`${flagFor(p.country||'FR')} ${p.name}${p.id===Net.getMyId()?' (toi)':''}`;
          c.appendChild(d);
        });
        $('playerCounter').textContent=(data.players.length+1)+' / '+(data.limit||'?')+' joueurs';
      };
      Net.onGameStart=(playerList,speed,mode)=>{
        currentGameMode=mode||CFG.MODE_CASUAL;
        selectedSpeed=speed||'normal';
        beginGame(playerList, CFG.SPEED_PRESETS[selectedSpeed]?.mult||1);
      };
      Net.onWinByDisconnect=(w)=>{ Game.winner=w; Game.running=false; onGameOver(); };
      Net.onReplay=(frames)=>{ playReplay(frames); };
      Net.onAllReplayDone=()=>{ onGameOver(); };
    } catch(e) { $('joinStatus').textContent=e.message; $('joinStatus').className='error'; }
  }

  // ── SERVER BROWSER ──
  function openBrowser() {
    showScreen('browserScreen');
    const list = $('browserList');
    list.innerHTML = '<div style="text-align:center;color:#95a5a6;padding:20px">Recherche de parties...</div>';
    Net.browseRooms((rooms) => {
      list.innerHTML = '';
      if (rooms.length===0) {
        list.innerHTML = '<div style="text-align:center;color:#95a5a6;padding:20px">Aucune partie disponible. Crée la tienne !</div>';
        return;
      }
      rooms.forEach(r => {
        const card = document.createElement('div');
        card.className = 'server-card';
        const modeLabel = r.mode===CFG.MODE_RANKED?'🏆 Classé':'🎮 Occasionnel';
        const codeDisplay = showRoomCodes ? ` · Code: ${r.code}` : '';
        card.innerHTML = `<div class="server-info"><div class="server-name">${modeLabel} · ${r.hostName||'Hôte'}</div><div class="server-meta">${r.players||1}/${r.limit} joueurs · ${CFG.SPEED_PRESETS[r.speed]?.label||'Normale'}${codeDisplay}</div></div><button class="btn-small btn-success">Rejoindre</button>`;
        card.querySelector('button').onclick = () => { $('roomInput').value=r.code; $('joinName').value=$('hostName').value.trim()||localStorage.getItem('haxmake_name')||''; showScreen('joinScreen'); doJoin(); };
        list.appendChild(card);
      });
    });
  }

  // ── START ──
  function startGame() {
    const all=[{id:'host',name:playerName,country:selectedCountry,team:CFG.TEAM_RED,slotIndex:0}];
    Net.lobbyPlayers.forEach((p,i)=>all.push({id:p.id,name:p.name,country:p.country,team:i%2===0?CFG.TEAM_BLUE:CFG.TEAM_RED,slotIndex:i%2===0?0:0}));
    currentGameMode = Net.gameMode;
    const mult=CFG.SPEED_PRESETS[selectedSpeed]?.mult||1;
    beginGame(Net.startGameOnClients(all, selectedSpeed), mult);
  }

  function beginGame(list, mult) {
    phase='playing'; winnerShown=false; showScreen('gameScreen');
    Game.startGame(list, Net.role==='host', mult);
    Game.setOnReplayEnd(() => {
      const banner = $('replayBanner');
      if (banner) banner.style.display='none';
      if (lastReplayTimer) { clearTimeout(lastReplayTimer); lastReplayTimer = null; }
      if (Net.role === 'host') Net.markMyReplayDone();
      else if (Net.role === 'client') Net.sendReplayDone();
      else { /* solo: nothing to do */ }
    });
    if (Net.role!=='host') Net.onGameState=(s)=>Game.applyServerState(s);
  }

  // ── REPLAY ──
  function playReplay(frames) {
    Game.startReplay(frames, () => {
      const banner = $('replayBanner');
      if (banner) banner.style.display='none';
      if (lastReplayTimer) { clearTimeout(lastReplayTimer); lastReplayTimer = null; }
      if (Net.role === 'host') Net.markMyReplayDone();
      else if (Net.role === 'client') Net.sendReplayDone();
      else { /* solo */ }
    });
    if (lastReplayTimer) clearTimeout(lastReplayTimer);
    const banner = $('replayBanner');
    if (banner) { banner.style.display='block'; banner.textContent='🎬 REPLAY (Espace pour passer)'; }
    lastReplayTimer = setTimeout(() => { if (banner) banner.style.display='none'; }, 15000);
  }

  function skipReplay() {
    Game.stopReplay();
    const banner = $('replayBanner');
    if (banner) banner.style.display='none';
    if (lastReplayTimer) { clearTimeout(lastReplayTimer); lastReplayTimer = null; }
    if (Net.role === 'host') Net.markMyReplayDone();
    else if (Net.role === 'client') Net.sendReplayDone();
  }

  // ── GAME OVER + MMR ──
  async function onGameOver() {
    if (winnerShown) return;
    winnerShown = true;

    // Validate winner
    if (Game.winner < 0 || Game.winner > 1) {
      Game.winner = CFG.TEAM_RED; // fallback
    }

    const myTeam = (() => {
      if (Net.role==='host') return CFG.TEAM_RED;
      const me = Game.players.find(p=>p.id===Net.getMyId());
      return me ? me.team : -1;
    })();
    const won = myTeam === Game.winner;
    const isRanked = currentGameMode === CFG.MODE_RANKED;
    if (Auth.isLoggedIn) await Auth.applyResult(won, isRanked);
    setTimeout(() => {
      phase='gameover'; showScreen('gameOverScreen');
      $('winnerText').textContent = CFG.TEAM_NAMES[Game.winner]+' gagne !';
      $('finalScore').textContent = Game.scores[0]+' - '+Game.scores[1];
      const mmrEl = $('mmrChange');
      if (mmrEl) {
        if (Auth.isLoggedIn) {
          if (isRanked) {
            const delta = won ? CFG.MMR_WIN : -CFG.MMR_LOSS;
            mmrEl.innerHTML = `${won?'<span style="color:#2ecc71">+':'<span style="color:#e74c3c">'}${delta} MMR</span> · ${rankBadge(Auth.mmr)}`;
          } else {
            mmrEl.innerHTML = `<span style="color:#7f8c8d">Occasionnel · pas de changement de MMR</span><br>${rankBadge(Auth.mmr)}`;
          }
        } else { mmrEl.innerHTML = ''; }
      }
    }, 1500);
  }

  function updateInGamePlayerList() {
    const listEl = $('inGamePlayerList');
    if (!listEl) return;
    listEl.innerHTML = '';
    Game.players.forEach(p => {
      const playerDiv = document.createElement('div');
      playerDiv.className = `in-game-player-item team-${p.team === CFG.TEAM_RED ? 'red' : 'blue'}`;
      playerDiv.innerHTML = `${flagFor(p.country || 'FR')} ${p.name}`;
      listEl.appendChild(playerDiv);
    });
  }

  // ── LOOP ──
  function loop(currentTime) {
    requestAnimationFrame(loop);

    // FPS calculation and performance warning
    if (lastFrameTime && currentTime) {
      const delta = currentTime - lastFrameTime;
      if (delta > 0) {
        const fps = 1000 / delta;
        fpsSamples.push(fps);
        if (fpsSamples.length > 60) fpsSamples.shift();
        checkPerformance();
      }
    }
    if (currentTime) lastFrameTime = currentTime;

    if (phase!=='playing') return;

    // Replay playback priority
    if (Game.replayActive) {
      if (!wasReplayActive) {
        wasReplayActive = true;
        const banner = $('replayBanner');
        if (banner) { banner.style.display='block'; banner.textContent='🎬 REPLAY (Espace pour passer)'; }
      }
      if (Input.justPressed(CFG.REPLAY_SKIP)) { skipReplay(); return; }
      Game.drawReplay();
      return;
    }
    wasReplayActive = false;

    Input.tick();
    const input = Input.getState();

    if (Net.role==='host' || !Net.role) {
      const lp = Game.players.find(p=>p.id==='host'||p.id==='solo');
      if (lp) lp.input=input;
      Net.collectInputs();
      Game.simulate();
      Net.broadcastGameState();
    } else {
      Net.sendInput(input);
      Game.extrapolateLocalPlayer(input);
    }

    Game.draw();

    updateInGamePlayerList();

    if (Game.isGameOver() && !winnerShown) onGameOver();
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', () => Main.init());
