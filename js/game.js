// ── Haxmake – game engine (physics sim + rendering) ──
const Game = (() => {
  let canvas, ctx;
  let players = [];
  let ball = null;
  let scores = [0, 0];
  let kickoffTimer = 0;
  let goalScored = -1;
  let goalAnimTimer = 0;
  let running = false;
  let isHost = false;
  let winner = -1;
  let speedMult = 1.0;
  let myId = null;

  // Replay recording (host only)
  let replayBuffer = [];
  // Replay playback (client or host)
  let replayFrames = [];
  let replayIndex = 0;
  let replaySpeed = 1;
  let replayActive = false;
  let replaySlowStart = 0;
  let replayOnEnd = null;
  let replayEnded = false;

  function init(c) { canvas = c; ctx = c.getContext('2d'); canvas.width = CFG.WIDTH + CFG.GOAL_DEPTH*2; canvas.height = CFG.HEIGHT; }
  function setSpeed(m) { speedMult = m; }

  function makePlayer(id, team, slot, name, country) {
    const sp = CFG.SPAWNS[team][slot % CFG.SPAWNS[team].length];
    return { id, team, name: name||'Player', country: country||'FR', x:sp[0], y:sp[1], vx:0, vy:0, rx:sp[0], ry:sp[1], input:{u:0,d:0,l:0,r:0,k:0}, slotIndex:slot };
  }
  function makeBall() { return { x:CFG.WIDTH/2, y:CFG.HEIGHT/2, vx:0, vy:0, rx:CFG.WIDTH/2, ry:CFG.HEIGHT/2 }; }

  function resetPositions() {
    ball.x=CFG.WIDTH/2; ball.y=CFG.HEIGHT/2; ball.vx=0; ball.vy=0; ball.rx=ball.x; ball.ry=ball.y;
    for (const p of players) {
      const sp = CFG.SPAWNS[p.team][p.slotIndex % CFG.SPAWNS[p.team].length] || [CFG.WIDTH/2, CFG.HEIGHT/2];
      p.x=sp[0]; p.y=sp[1]; p.vx=0; p.vy=0; p.rx=p.x; p.ry=p.y;
    }
    kickoffTimer = CFG.KICKOFF_DELAY;
  }

  function startGame(list, host, mult) {
    isHost=host; winner=-1; speedMult=mult||1;
    myId = host ? 'host' : (Net?Net.getMyId():null);
    players = list.map(p => makePlayer(p.id, p.team, p.slotIndex, p.name, p.country));
    ball = makeBall();
    scores=[0,0]; kickoffTimer=CFG.KICKOFF_DELAY; goalScored=-1; goalAnimTimer=0; running=true;
    replayBuffer=[]; replayFrames=[]; replayActive=false; replayEnded=false;
  }
  function stop() { running=false; }

  function simulate() {
    if (!running) return;
    const sm = speedMult;
    for (const p of players) {
      const spd = (p.input.k?CFG.PLAYER_KICK_SPEED:CFG.PLAYER_SPEED)*sm;
      if (p.input.u) p.vy-=spd; if (p.input.d) p.vy+=spd;
      if (p.input.l) p.vx-=spd; if (p.input.r) p.vx+=spd;
      const f = 1-(1-CFG.PLAYER_FRICTION)*Math.min(sm,2);
      p.vx*=f; p.vy*=f; p.x+=p.vx; p.y+=p.vy;
      Physics.wallBouncePlayer(p);
    }
    ball.vx*=CFG.BALL_FRICTION; ball.vy*=CFG.BALL_FRICTION;
    ball.x+=ball.vx; ball.y+=ball.vy;
    Physics.wallBounceBall(ball);
    for (const p of players) Physics.resolvePlayerBall(p, ball, p.input.k);
    for (let i=0;i<players.length;i++) for (let j=i+1;j<players.length;j++) Physics.resolvePlayerPlayer(players[i], players[j]);
    if (kickoffTimer<=0) {
      const s = Physics.checkGoal(ball);
      if (s>=0) {
        scores[s]++; goalScored=s; goalAnimTimer=90;
        onGoalScored(s);
        if (scores[s]>=CFG.MAX_SCORE) { winner=s; running=false; }
        else resetPositions();
      }
    }
    if (kickoffTimer>0) kickoffTimer--;
    if (goalAnimTimer>0) goalAnimTimer--;
    for (const p of players) { p.rx=p.x; p.ry=p.y; }
    ball.rx=ball.x; ball.ry=ball.y;

    // Record replay (host)
    if (isHost) {
      replayBuffer.push(getState());
      if (replayBuffer.length > CFG.REPLAY_BUFFER_SIZE) replayBuffer.shift();
    }
  }

  // Called when a goal is scored — extracts last N frames
  function onGoalScored(team) {
    if (isHost) {
      const frames = replayBuffer.slice(-CFG.REPLAY_BEFORE);
      if (Net && Net.role==='host') Net.sendReplay(frames);
      startReplay(frames, onReplayEndCallback);
    }
  }

  let onReplayEndCallback = null;
  function setOnReplayEnd(cb) { onReplayEndCallback = cb; }

  function startReplay(frames, onEnd) {
    if (!frames || !frames.length) return;
    replayFrames = frames;
    replayIndex = 0;
    replaySpeed = 1;
    replayActive = true;
    replayEnded = false;
    replaySlowStart = Math.max(0, frames.length - CFG.REPLAY_SLOW_FRAMES - 30);
    replayOnEnd = onEnd || null;
  }

  function stopReplay() {
    if (replayEnded) return;
    replayEnded = true;
    replayActive = false;
    replayFrames = [];
    replayIndex = 0;
    if (replayOnEnd) { const cb = replayOnEnd; replayOnEnd = null; cb(); }
  }

  function getReplayData() {
    if (!replayActive || replayIndex >= replayFrames.length) return null;
    // Slow down near the end
    const advance = (replayIndex >= replaySlowStart) ? 0.35 : 1;
    const frame = replayFrames[Math.floor(replayIndex)];
    replayIndex += advance;
    if (replayIndex >= replayFrames.length) {
      replayActive = false;
      if (!replayEnded && replayOnEnd) { replayEnded = true; const cb = replayOnEnd; replayOnEnd = null; cb(); }
    }
    return frame;
  }

  function getState() {
    return {
      players: players.map(p=>({id:p.id,x:p.x,y:p.y,vx:p.vx,vy:p.vy,team:p.team,name:p.name,country:p.country,slotIndex:p.slotIndex})),
      ball:{x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy},
      scores:[...scores], kickoffTimer, goalScored, goalAnimTimer, running, winner,
    };
  }

  function applyServerState(s) {
    if (!s || !s.players) return;
    scores=[...s.scores]; running=s.running; goalScored=s.goalScored; goalAnimTimer=s.goalAnimTimer; kickoffTimer=s.kickoffTimer; winner=s.winner;
    for (const sp of s.players) { const p=players.find(pp=>pp.id===sp.id); if (p){p.name=sp.name;p.country=sp.country||p.country;p.x=sp.x;p.y=sp.y;p.vx=sp.vx;p.vy=sp.vy;p.rx=sp.x;p.ry=sp.y;} }
    if (s.ball) { ball.x=s.ball.x; ball.y=s.ball.y; ball.vx=s.ball.vx; ball.vy=s.ball.vy; ball.rx=ball.x; ball.ry=ball.y; }
  }

  function extrapolateLocalPlayer(input) {
    if (!running||!myId) return;
    const me = players.find(p=>p.id===myId); if (!me) return;
    me.input=input;
    const sm=speedMult, spd=(input.k?CFG.PLAYER_KICK_SPEED:CFG.PLAYER_SPEED)*sm;
    if (input.u) me.vy-=spd; if (input.d) me.vy+=spd;
    if (input.l) me.vx-=spd; if (input.r) me.vx+=spd;
    const f=1-(1-CFG.PLAYER_FRICTION)*Math.min(sm,2);
    me.vx*=f; me.vy*=f; me.x+=me.vx; me.y+=me.vy;
    Physics.wallBouncePlayer(me);
    me.rx=me.x; me.ry=me.y;
  }

  function isGameOver() { return winner>=0; }

  // Render state (either live or replay frame)
  function drawFromState(s) {
    if (!s) return;
    const ox = CFG.GOAL_DEPTH;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=CFG.BG_COLOR; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=CFG.FIELD_COLOR; ctx.fillRect(ox,0,CFG.WIDTH,CFG.HEIGHT);
    const gy1=CFG.HEIGHT/2-CFG.GOAL_HEIGHT/2, gy2=CFG.HEIGHT/2+CFG.GOAL_HEIGHT/2;
    ctx.fillStyle='rgba(255,255,255,0.12)';
    ctx.fillRect(ox-CFG.GOAL_DEPTH,gy1,CFG.GOAL_DEPTH,CFG.GOAL_HEIGHT);
    ctx.fillRect(ox+CFG.WIDTH,gy1,CFG.GOAL_DEPTH,CFG.GOAL_HEIGHT);
    ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1;
    for(let x=ox-CFG.GOAL_DEPTH;x<ox;x+=10){ctx.beginPath();ctx.moveTo(x,gy1);ctx.lineTo(x,gy2);ctx.stroke();}
    for(let x=ox+CFG.WIDTH;x<ox+CFG.WIDTH+CFG.GOAL_DEPTH;x+=10){ctx.beginPath();ctx.moveTo(x,gy1);ctx.lineTo(x,gy2);ctx.stroke();}
    ctx.strokeStyle=CFG.LINE_COLOR; ctx.lineWidth=2; ctx.beginPath();
    ctx.rect(ox-CFG.GOAL_DEPTH,gy1,CFG.GOAL_DEPTH,CFG.GOAL_HEIGHT); ctx.rect(ox+CFG.WIDTH,gy1,CFG.GOAL_DEPTH,CFG.GOAL_HEIGHT);
    ctx.moveTo(ox+CFG.WIDTH/2,0);ctx.lineTo(ox+CFG.WIDTH/2,CFG.HEIGHT); ctx.arc(ox+CFG.WIDTH/2,CFG.HEIGHT/2,60,0,CFG.PI2); ctx.rect(ox,0,CFG.WIDTH,CFG.HEIGHT); ctx.stroke();
    ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(ox,gy1);ctx.lineTo(ox,gy2);ctx.moveTo(ox+CFG.WIDTH,gy1);ctx.lineTo(ox+CFG.WIDTH,gy2);ctx.stroke();
    // ball
    const bx=s.ball.rx!==undefined?s.ball.rx:s.ball.x, by=s.ball.ry!==undefined?s.ball.ry:s.ball.y;
    ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.arc(ox+bx+3,by+3,CFG.BALL_RADIUS,0,CFG.PI2);ctx.fill();
    ctx.fillStyle=CFG.BALL_COLOR;ctx.beginPath();ctx.arc(ox+bx,by,CFG.BALL_RADIUS,0,CFG.PI2);ctx.fill();ctx.strokeStyle='#e67e22';ctx.lineWidth=2;ctx.stroke();
    // players
    const flagFor = code => (CFG.COUNTRIES.find(c=>c.code===code)||CFG.COUNTRIES[0]).flag;
    for (const p of s.players) {
      const px=ox+(p.rx!==undefined?p.rx:p.x), py=(p.ry!==undefined?p.ry:p.y);
      ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.arc(px+2,py+2,CFG.PLAYER_RADIUS,0,CFG.PI2);ctx.fill();
      ctx.fillStyle=CFG.TEAM_COLORS[p.team];ctx.beginPath();ctx.arc(px,py,CFG.PLAYER_RADIUS,0,CFG.PI2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='bold 11px sans-serif';ctx.textAlign='center';
      const flag = p.country ? flagFor(p.country)+' ' : '';
      ctx.fillText(flag+p.name,px,py-CFG.PLAYER_RADIUS-5);
    }
    // scores
    ctx.font='bold 32px sans-serif';ctx.textAlign='center';
    ctx.fillStyle=CFG.TEAM_COLORS[0];ctx.fillText(s.scores[0],ox+CFG.WIDTH/2-40,42);
    ctx.fillStyle='#fff';ctx.fillText('-',ox+CFG.WIDTH/2,42);
    ctx.fillStyle=CFG.TEAM_COLORS[1];ctx.fillText(s.scores[1],ox+CFG.WIDTH/2+40,42);
  }

  function draw() {
    drawFromState({ players, ball, scores });
    if (goalAnimTimer>0) {
      const ox=CFG.GOAL_DEPTH;
      ctx.fillStyle=`rgba(255,255,255,${goalAnimTimer/90*0.5})`;
      ctx.font=`bold ${40+(90-goalAnimTimer)*0.5}px sans-serif`;
      ctx.fillText('GOAL !',ox+CFG.WIDTH/2,CFG.HEIGHT/2);
    }
    if (kickoffTimer>0&&kickoffTimer<50) {
      const ox=CFG.GOAL_DEPTH;
      ctx.fillStyle='rgba(255,255,255,0.7)';ctx.font='bold 24px sans-serif';
      ctx.fillText(Math.ceil(kickoffTimer/20)||'GO !',ox+CFG.WIDTH/2,CFG.HEIGHT/2+60);
    }
    if (winner>=0) {
      const ox=CFG.GOAL_DEPTH;
      ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(ox,CFG.HEIGHT/2-50,CFG.WIDTH,100);
      ctx.fillStyle=CFG.TEAM_COLORS[winner];ctx.font='bold 36px sans-serif';
      ctx.fillText(CFG.TEAM_NAMES[winner]+' gagne !',ox+CFG.WIDTH/2,CFG.HEIGHT/2+10);
    }
  }

  function drawReplay() { drawFromState(getReplayData()); }

  return {
    init, setSpeed, startGame, stop, simulate, extrapolateLocalPlayer, applyServerState, getState, draw, drawReplay, startReplay, stopReplay, setOnReplayEnd,
    get replayActive(){return replayActive;},
    isGameOver,
    get players(){return players;}, get ball(){return ball;}, get running(){return running;}, get scores(){return scores;}, get winner(){return winner;},
  };
})();
