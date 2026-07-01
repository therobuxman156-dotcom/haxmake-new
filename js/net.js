// ── Haxmake – networking (PeerJS WebRTC P2P) ──
const Net = (() => {
  let peer = null;
  let connections = [];
  let hostConn = null;
  let role = null;
  let roomCode = '';
  let lastSendTime = 0;
  let playerLimit = CFG.DEFAULT_LIMIT;
  let lobbyPlayers = [];
  let lobbyPeer = null;
  let gameMode = CFG.MODE_CASUAL;
  let playersReplayDone = {};
  let inGame = false;

  let onPlayerJoined=null, onPlayerLeft=null, onRoomState=null, onGameStart=null, onGameState=null, onWinByDisconnect=null, onReplay=null, onAllReplayDone=null;

  const iceConfig = { iceServers: [{ urls:'stun:stun.l.google.com:19302' }, { urls:'stun:stun1.l.google.com:19302' }] };

  function genCode() { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
  function getMyId() { return peer?peer.id:null; }
  function totalPlayers() { return 1 + connections.length; }

  // ── HOST ──
  function hostRoom(limit, hostName, mode) {
    playerLimit = limit || CFG.DEFAULT_LIMIT;
    gameMode = mode || CFG.MODE_CASUAL;
    return new Promise((resolve, reject) => {
      roomCode = genCode();
      peer = new Peer(CFG.PEER_PREFIX+roomCode, { debug:0, config:iceConfig });
      peer.on('open', () => {
        role='host'; connections=[]; lobbyPlayers=[]; playersReplayDone={}; inGame=false;
        registerInBrowser(roomCode, hostName, playerLimit, 'normal', mode);
        resolve(roomCode);
      });
      peer.on('connection', conn => {
        conn.on('open', () => {
          if (totalPlayers() >= playerLimit) { conn.send({type:'full'}); setTimeout(()=>conn.close(),500); return; }
          connections.push(conn);
          conn._playerName='Joueur'; conn._playerCountry='FR'; conn._playerInput={u:0,d:0,l:0,r:0,k:0};
          lobbyPlayers.push({id:conn.peer, name:conn._playerName, country:conn._playerCountry, team: totalPlayers()%2===1?CFG.TEAM_RED:CFG.TEAM_BLUE});
          if (onPlayerJoined) onPlayerJoined(conn.peer, conn._playerName);
          broadcastLobbyState();
        });
        conn.on('data', data => {
          if (data.type==='input') conn._playerInput=data.input;
          else if (data.type==='setName') { conn._playerName=data.name; const lp=lobbyPlayers.find(p=>p.id===conn.peer); if(lp) lp.name=data.name; broadcastLobbyState(); }
          else if (data.type==='setCountry') { conn._playerCountry=data.country; const lp=lobbyPlayers.find(p=>p.id===conn.peer); if(lp) lp.country=data.country; broadcastLobbyState(); }
          else if (data.type==='manualQuit') { handleQuit(conn); }
          else if (data.type==='replayDone') { handleReplayDone(conn); }
        });
        conn.on('close', () => { handleQuit(conn); });
        conn.on('error', () => {});
      });
      peer.on('error', err => {
        if (err.type==='unavailable-id') { roomCode=genCode(); peer.destroy(); hostRoom(playerLimit, hostName, gameMode).then(resolve).catch(reject); }
        else reject(err);
      });
    });
  }

  function handleQuit(conn) {
    // Prevent double-triggering
    if (!connections.some(c => c === conn)) return;

    const leaver = lobbyPlayers.find(p => p.id === conn.peer);
    const leaverTeam = leaver ? leaver.team : undefined;
    // Only trigger forfeit if a real game is running AND no replay is active
    const wasInLiveGame = inGame && Game && Game.running && !Game.replayActive;

    lobbyPlayers = lobbyPlayers.filter(p => p.id !== conn.peer);
    connections = connections.filter(c => c !== conn);
    if (onPlayerLeft) onPlayerLeft(conn.peer);

    // Immediate forfeit win during a live game (not replay)
    if (wasInLiveGame && leaverTeam !== undefined) {
      const winnerTeam = leaverTeam === CFG.TEAM_RED ? CFG.TEAM_BLUE : CFG.TEAM_RED;
      Game.winner = winnerTeam;
      Game.running = false;
      Game.stopReplay(); // Stop any ongoing replay
      inGame = false;
      // Notify remaining clients
      for (const c of connections) try { c.send({type:'winByDisconnect', winner: winnerTeam}); } catch(e) {}
      // Notify host itself
      if (onWinByDisconnect) onWinByDisconnect(winnerTeam);
    } else if (wasInLiveGame && leaverTeam === undefined) {
      // Leaver not found in lobbyPlayers — fallback: host (RED) wins
      Game.winner = CFG.TEAM_RED;
      Game.running = false;
      Game.stopReplay();
      inGame = false;
      for (const c of connections) try { c.send({type:'winByDisconnect', winner: CFG.TEAM_RED}); } catch(e) {}
      if (onWinByDisconnect) onWinByDisconnect(CFG.TEAM_RED);
    } else {
      broadcastLobbyState();
    }
  }

  function handleReplayDone(conn) {
    playersReplayDone[conn.peer] = true;
    checkAllReplaysDone();
  }

  function markMyReplayDone() {
    playersReplayDone['host'] = true;
    checkAllReplaysDone();
  }

  function checkAllReplaysDone() {
    const allIds = ['host', ...connections.map(c => c.peer)];
    const allDone = allIds.every(id => playersReplayDone[id]);
    if (allDone && allIds.length > 0) {
      for (const c of connections) try { c.send({type:'allReplayDone'}); } catch(e) {}
      if (onAllReplayDone) onAllReplayDone();
      playersReplayDone = {};
    }
  }

  function broadcastLobbyState() {
    lobbyPlayers = lobbyPlayers.filter(lp => connections.some(c=>c.peer===lp.id));
    const s = { type:'lobby', players: lobbyPlayers.map(p=>({id:p.id,name:p.name,country:p.country,team:p.team})), code:roomCode, limit:playerLimit, mode:gameMode };
    for (const c of connections) try { c.send(s); } catch(e) {}
  }

  function startGameOnClients(list, speed) {
    inGame = true;
    const reds=list.filter(p=>p.team===CFG.TEAM_RED), blues=list.filter(p=>p.team===CFG.TEAM_BLUE);
    const f=[];
    reds.forEach((p,i)=>f.push({...p,team:CFG.TEAM_RED,slotIndex:i}));
    blues.forEach((p,i)=>f.push({...p,team:CFG.TEAM_BLUE,slotIndex:i}));
    for (const c of connections) try { c.send({type:'start',players:f,speed,mode:gameMode}); } catch(e) {}
    unregisterFromBrowser();
    return f;
  }

  function broadcastGameState() {
    const now=performance.now();
    if (now-lastSendTime<CFG.SEND_RATE) return;
    lastSendTime=now;
    const s=Game.getState();
    for (const c of connections) try { c.send({type:'state',state:s}); } catch(e) {}
  }

  function collectInputs() {
    for (const c of connections) {
      const p=Game.players.find(pl=>pl.id===c.peer);
      if (p) { p.input=c._playerInput||{u:0,d:0,l:0,r:0,k:0}; p.name=c._playerName||p.name; p.country=c._playerCountry||p.country; }
    }
  }

  function sendReplay(frames) { for (const c of connections) try { c.send({type:'replay',frames}); } catch(e) {} }

  // ── CLIENT ──
  function joinRoom(code, name, country) {
    return new Promise((resolve, reject) => {
      roomCode=code.toUpperCase();
      peer = new Peer(undefined, { debug:0, config:iceConfig });
      peer.on('open', () => {
        hostConn = peer.connect(CFG.PEER_PREFIX+roomCode, { reliable:true });
        hostConn.on('open', () => { role='client'; hostConn.send({type:'setName',name}); hostConn.send({type:'setCountry',country}); resolve(); });
        hostConn.on('data', data => {
          if (data.type==='full') { reject(new Error('Partie complète')); return; }
          if (data.type==='lobby' && onRoomState) onRoomState(data);
          else if (data.type==='start' && onGameStart) onGameStart(data.players, data.speed, data.mode);
          else if (data.type==='state' && onGameState) onGameState(data.state);
          else if (data.type==='winByDisconnect' && onWinByDisconnect) onWinByDisconnect(data.winner);
          else if (data.type==='replay' && onReplay) onReplay(data.frames);
          else if (data.type==='allReplayDone' && onAllReplayDone) onAllReplayDone();
        });
        hostConn.on('close', () => {
          // If host disconnects during a game, client auto-wins
          if (inGame && Game && Game.running) {
            inGame = false;
            Game.running = false;
            // Client's team is the opposite of host (host=RED, client=BLUE)
            const myTeam = Game.players.find(p => p.id === getMyId());
            const myTeamId = myTeam ? myTeam.team : CFG.TEAM_BLUE;
            const winnerTeam = myTeamId === CFG.TEAM_RED ? CFG.TEAM_RED : CFG.TEAM_BLUE;
            Game.winner = winnerTeam;
            if (onWinByDisconnect) onWinByDisconnect(winnerTeam);
          }
          if (onPlayerLeft) onPlayerLeft('host');
        });
        hostConn.on('error', err => reject(err));
      });
      peer.on('error', err => reject(err));
      setTimeout(()=>reject(new Error('Connexion expirée')), 15000);
    });
  }

  function sendInput(input) { if (hostConn&&hostConn.open) hostConn.send({type:'input',input}); }
  function sendQuit() { if (hostConn&&hostConn.open) hostConn.send({type:'manualQuit'}); }
  function sendReplayDone() { if (hostConn&&hostConn.open) hostConn.send({type:'replayDone'}); }

  // ── SERVER BROWSER ──
  function registerInBrowser(code, hostName, limit, speed, mode) {
    try {
      lobbyPeer = new Peer(CFG.LOBBY_PREFIX+code, { debug:0, config:iceConfig });
      lobbyPeer._meta = { code, hostName, limit, speed, mode };
      lobbyPeer.on('connection', conn => {
        conn.on('open', () => {
          conn.send({ meta: lobbyPeer._meta, players: totalPlayers() });
          setTimeout(()=>conn.close(), 200);
        });
        conn.on('error',()=>{});
      });
      lobbyPeer.on('error', () => {});
    } catch(e) {}
  }

  function unregisterFromBrowser() { if (lobbyPeer) { try{lobbyPeer.destroy();}catch(e){} lobbyPeer=null; } }

  function browseRooms(callback) {
    const seen = JSON.parse(localStorage.getItem('haxmake_seen_rooms')||'[]');
    const now = Date.now();
    const valid = seen.filter(r => (now - r.t) < 300000);
    const found = [];
    let checked = 0;
    const total = valid.length;
    if (total===0) { callback([]); return; }
    valid.forEach(r => {
      const probe = new Peer(CFG.LOBBY_PREFIX+'probe-'+genCode(), {debug:0, config:iceConfig});
      probe.on('open', () => {
        const conn = probe.connect(CFG.LOBBY_PREFIX+r.code);
        let done=false;
        const t = setTimeout(()=>{ if(!done){done=true; probe.destroy(); checked++; if(checked>=total) callback(found); } }, CFG.BROWSE_TIMEOUT/2);
        conn.on('data', data => {
          if (!done && data.meta) { found.push({...data.meta, players:data.players}); done=true; clearTimeout(t); probe.destroy(); checked++; if(checked>=total) callback(found); }
        });
        conn.on('error', ()=>{ if(!done){done=true; probe.destroy(); checked++; if(checked>=total) callback(found);} });
      });
      probe.on('error', ()=>{ checked++; if(checked>=total) callback(found); });
    });
  }

  function rememberRoom(code) {
    const seen = JSON.parse(localStorage.getItem('haxmake_seen_rooms')||'[]');
    const filtered = seen.filter(r => r.code!==code);
    filtered.unshift({code, t:Date.now()});
    localStorage.setItem('haxmake_seen_rooms', JSON.stringify(filtered.slice(0,40)));
  }

  function close() {
    unregisterFromBrowser();
    if (peer) { peer.destroy(); peer=null; }
    connections=[]; hostConn=null; role=null; lobbyPlayers=[]; playersReplayDone={}; inGame=false;
  }

  return {
    hostRoom, joinRoom, close, getMyId,
    startGameOnClients, broadcastGameState, collectInputs, sendInput, sendReplay, sendQuit, sendReplayDone,
    registerInBrowser, unregisterFromBrowser, browseRooms, rememberRoom,
    get role(){return role;}, get roomCode(){return roomCode;}, get lobbyPlayers(){return lobbyPlayers;}, get playerLimit(){return playerLimit;}, get gameMode(){return gameMode;},
    set onPlayerJoined(v){onPlayerJoined=v;}, set onPlayerLeft(v){onPlayerLeft=v;}, set onRoomState(v){onRoomState=v;}, set onGameStart(v){onGameStart=v;}, set onGameState(v){onGameState=v;}, set onWinByDisconnect(v){onWinByDisconnect=v;}, set onReplay(v){onReplay=v;}, set onAllReplayDone(v){onAllReplayDone=v;},
    markMyReplayDone,
  };
})();
