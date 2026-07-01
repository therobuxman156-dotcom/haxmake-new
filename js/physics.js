// ── Haxmake – physics helpers ──
const Physics = (() => {
  const PI2 = Math.PI * 2;

  // Vector ops (mutable for speed – no alloc)
  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function collideCircles(a, ra, b, rb) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const minD = ra + rb;
    if (d >= minD || d === 0) return false;

    const nx = dx / d, ny = dy / d;
    const overlap = minD - d;
    return { nx, ny, overlap };
  }

  function resolvePlayerBall(player, ball, kicking) {
    const hit = collideCircles(player, CFG.PLAYER_RADIUS, ball, CFG.BALL_RADIUS);
    if (!hit) return false;

    // Separate
    const totalMass = CFG.PLAYER_MASS + CFG.BALL_MASS;
    const ratio = CFG.BALL_MASS / totalMass;
    ball.x += hit.nx * hit.overlap * (1 - ratio);
    ball.y += hit.ny * hit.overlap * (1 - ratio);
    player.x -= hit.nx * hit.overlap * ratio;
    player.y -= hit.ny * hit.overlap * ratio;

    // Relative velocity along normal
    const dvx = ball.vx - player.vx, dvy = ball.vy - player.vy;
    const dvn = dvx * hit.nx + dvy * hit.ny;
    if (dvn > 0) return true; // separating

    const bounce = kicking ? CFG.BALL_PLAYER_KICK_BOUNCE : CFG.BALL_PLAYER_BOUNCE;
    const j = -(1 + bounce) * dvn / (1 / CFG.PLAYER_MASS + 1 / CFG.BALL_MASS);

    ball.vx += j * hit.nx / CFG.BALL_MASS;
    ball.vy += j * hit.ny / CFG.BALL_MASS;
    player.vx -= j * hit.nx / CFG.PLAYER_MASS;
    player.vy -= j * hit.ny / CFG.PLAYER_MASS;
    return true;
  }

  function resolvePlayerPlayer(a, b) {
    const hit = collideCircles(a, CFG.PLAYER_RADIUS, b, CFG.PLAYER_RADIUS);
    if (!hit) return false;

    a.x -= hit.nx * hit.overlap * 0.5;
    a.y -= hit.ny * hit.overlap * 0.5;
    b.x += hit.nx * hit.overlap * 0.5;
    b.y += hit.ny * hit.overlap * 0.5;

    const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
    const dvn = dvx * hit.nx + dvy * hit.ny;
    if (dvn > 0) return true;

    const j = -(1 + CFG.PLAYER_PLAYER_BOUNCE) * dvn * 0.5;
    a.vx -= j * hit.nx;
    a.vy -= j * hit.ny;
    b.vx += j * hit.nx;
    b.vy += j * hit.ny;
    return true;
  }

  function wallBounceBall(ball) {
    const r = CFG.BALL_RADIUS;
    const gw = CFG.GOAL_WIDTH;
    const gh = CFG.GOAL_HEIGHT;
    const gy1 = CFG.HEIGHT / 2 - gh / 2;
    const gy2 = CFG.HEIGHT / 2 + gh / 2;

    // Top / bottom walls
    if (ball.y - r < 0) { ball.y = r; ball.vy = -ball.vy * CFG.BALL_WALL_BOUNCE; }
    if (ball.y + r > CFG.HEIGHT) { ball.y = CFG.HEIGHT - r; ball.vy = -ball.vy * CFG.BALL_WALL_BOUNCE; }

    // Left wall (except goal opening)
    if (ball.x - r < 0) {
      if (ball.y > gy1 && ball.y < gy2) {
        // Goal! don't bounce – let it go
      } else {
        ball.x = r;
        ball.vx = -ball.vx * CFG.BALL_WALL_BOUNCE;
      }
    }

    // Right wall (except goal opening)
    if (ball.x + r > CFG.WIDTH) {
      if (ball.y > gy1 && ball.y < gy2) {
        // Goal!
      } else {
        ball.x = CFG.WIDTH - r;
        ball.vx = -ball.vx * CFG.BALL_WALL_BOUNCE;
      }
    }

    // Goal back walls and inner walls
    if (ball.x - r < -CFG.GOAL_DEPTH && ball.y > gy1 && ball.y < gy2) {
      ball.x = -CFG.GOAL_DEPTH + r;
      ball.vx = -ball.vx * CFG.BALL_WALL_BOUNCE;
    }
    if (ball.x + r > CFG.WIDTH + CFG.GOAL_DEPTH && ball.y > gy1 && ball.y < gy2) {
      ball.x = CFG.WIDTH + CFG.GOAL_DEPTH - r;
      ball.vx = -ball.vx * CFG.BALL_WALL_BOUNCE;
    }
    // Goal top/bot inner walls
    if (ball.x < 0 && ball.x > -CFG.GOAL_DEPTH) {
      if (ball.y - r < gy1 && ball.vy < 0) { ball.y = gy1 + r; ball.vy = -ball.vy * CFG.BALL_WALL_BOUNCE; }
      if (ball.y + r > gy2 && ball.vy > 0) { ball.y = gy2 - r; ball.vy = -ball.vy * CFG.BALL_WALL_BOUNCE; }
    }
    if (ball.x > CFG.WIDTH && ball.x < CFG.WIDTH + CFG.GOAL_DEPTH) {
      if (ball.y - r < gy1 && ball.vy < 0) { ball.y = gy1 + r; ball.vy = -ball.vy * CFG.BALL_WALL_BOUNCE; }
      if (ball.y + r > gy2 && ball.vy > 0) { ball.y = gy2 - r; ball.vy = -ball.vy * CFG.BALL_WALL_BOUNCE; }
    }
  }

  function wallBouncePlayer(p) {
    const r = CFG.PLAYER_RADIUS;
    if (p.x - r < 0) { p.x = r; p.vx = 0; }
    if (p.x + r > CFG.WIDTH) { p.x = CFG.WIDTH - r; p.vx = 0; }
    if (p.y - r < 0) { p.y = r; p.vy = 0; }
    if (p.y + r > CFG.HEIGHT) { p.y = CFG.HEIGHT - r; p.vy = 0; }
  }

  function checkGoal(ball) {
    const gy1 = CFG.HEIGHT / 2 - CFG.GOAL_HEIGHT / 2;
    const gy2 = CFG.HEIGHT / 2 + CFG.GOAL_HEIGHT / 2;
    if (ball.x < -CFG.BALL_RADIUS && ball.y > gy1 && ball.y < gy2) return CFG.TEAM_BLUE; // blue scored
    if (ball.x > CFG.WIDTH + CFG.BALL_RADIUS && ball.y > gy1 && ball.y < gy2) return CFG.TEAM_RED; // red scored
    return -1;
  }

  return { dist, collideCircles, resolvePlayerBall, resolvePlayerPlayer, wallBounceBall, wallBouncePlayer, checkGoal };
})();
