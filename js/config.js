// ── Haxmake – configuration ──
const CFG = Object.freeze({

  // Canvas / terrain
  WIDTH: 800, HEIGHT: 500, GOAL_WIDTH: 10, GOAL_HEIGHT: 130, GOAL_DEPTH: 30,

  // Physics
  PLAYER_RADIUS: 18, BALL_RADIUS: 12,
  PLAYER_SPEED: 0.45, PLAYER_KICK_SPEED: 0.7,
  BALL_FRICTION: 0.984, PLAYER_FRICTION: 0.89,
  BALL_PLAYER_BOUNCE: 1.05, BALL_PLAYER_KICK_BOUNCE: 1.55,
  BALL_WALL_BOUNCE: 0.8, PLAYER_PLAYER_BOUNCE: 1.0,
  PLAYER_MASS: 5, BALL_MASS: 1, PI2: Math.PI * 2,

  // Speed presets
  SPEED_PRESETS: {
    slow: { label: 'Lente', mult: 0.6 },
    normal: { label: 'Normale', mult: 1.0 },
    fast: { label: 'Rapide', mult: 1.5 },
    ultra: { label: 'ULTRA rapide', mult: 2.2 },
  },
  DEFAULT_SPEED: 'normal',

  // Gameplay
  PLAYER_LIMITS: [2, 4, 6], DEFAULT_LIMIT: 2,
  MAX_SCORE: 5, KICKOFF_DELAY: 60,

  // Teams
  TEAM_RED: 0, TEAM_BLUE: 1,
  TEAM_COLORS: ['#e74c3c', '#3498db'], TEAM_NAMES: ['Rouge', 'Bleu'],
  BALL_COLOR: '#f1c40f', FIELD_COLOR: '#2d8a4e', LINE_COLOR: '#ffffff', BG_COLOR: '#1a1a2e',

  // Network
  SEND_RATE: 33, PEER_PREFIX: 'haxmake-',
  LOBBY_PREFIX: 'haxlobby-', BROWSE_TIMEOUT: 4000,

  // Ranks
  RANKS: [
    { name: 'Bronze 1', min: 0,   tier: 'bronze' },
    { name: 'Bronze 2', min: 100, tier: 'bronze' },
    { name: 'Bronze 3', min: 200, tier: 'bronze' },
    { name: 'Silver 1', min: 300, tier: 'silver' },
    { name: 'Silver 2', min: 400, tier: 'silver' },
    { name: 'Silver 3', min: 500, tier: 'silver' },
    { name: 'Gold 1',   min: 600, tier: 'gold' },
    { name: 'Gold 2',   min: 700, tier: 'gold' },
    { name: 'Diamond 1', min: 800, tier: 'diamond' },
    { name: 'Diamond 2', min: 900, tier: 'diamond' },
    { name: 'Champion', min: 1000, tier: 'champion' },
  ],
  MMR_WIN: 25, MMR_LOSS: 15,

  // Replay
  REPLAY_BUFFER_SIZE: 360,
  REPLAY_BEFORE: 360,
  REPLAY_SLOW_FRAMES: 60,

  // Input
  UP: ['ArrowUp', 'KeyW'], DOWN: ['ArrowDown', 'KeyS'],
  LEFT: ['ArrowLeft', 'KeyA'], RIGHT: ['ArrowRight', 'KeyD'],
  KICK: ['KeyX', 'Space'],
  REPLAY_SKIP: ['Space', 'KeyX'],

  // Spawns
  SPAWNS: [
    [[200, 250], [150, 150], [150, 350]],
    [[600, 250], [650, 150], [650, 350]],
  ],

  // Game modes
  MODE_CASUAL: 'casual', MODE_RANKED: 'ranked',

  // Performance
  MIN_PERF_FPS: 25,

  // Countries
  COUNTRIES: [
    { code:'FR', flag:'🇫🇷', name:'France' },
    { code:'BE', flag:'🇧🇪', name:'Belgique' },
    { code:'CH', flag:'🇨🇭', name:'Suisse' },
    { code:'CA', flag:'🇨🇦', name:'Canada' },
    { code:'US', flag:'🇺🇸', name:'USA' },
    { code:'GB', flag:'🇬🇧', name:'UK' },
    { code:'DE', flag:'🇩🇪', name:'Allemagne' },
    { code:'ES', flag:'🇪🇸', name:'Espagne' },
    { code:'IT', flag:'🇮🇹', name:'Italie' },
    { code:'PT', flag:'🇵🇹', name:'Portugal' },
    { code:'MA', flag:'🇲🇦', name:'Maroc' },
    { code:'DZ', flag:'🇩🇿', name:'Algérie' },
    { code:'TN', flag:'🇹🇳', name:'Tunisie' },
    { code:'NL', flag:'🇳🇱', name:'Pays-Bas' },
    { code:'PL', flag:'🇵🇱', name:'Pologne' },
    { code:'BR', flag:'🇧🇷', name:'Brésil' },
    { code:'JP', flag:'🇯🇵', name:'Japon' },
    { code:'OTHER', flag:'🌍', name:'Autre' },
  ],
});

function rankForMMR(mmr) {
  let r = CFG.RANKS[0];
  for (const rk of CFG.RANKS) if (mmr >= rk.min) r = rk;
  return r;
}
