// ── Haxmake – input handler ──
const Input = (() => {
  const keys = {};
  const prev = {};
  let frame = 0;

  document.addEventListener('keydown', e => {
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
  });
  document.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  function isDown(codes) {
    return codes.some(c => !!keys[c]);
  }

  // Call once per frame to track edge triggers
  function tick() {
    for (const k in keys) prev[k] = keys[k];
    frame++;
  }

  // Just pressed this frame
  function justPressed(codes) {
    return codes.some(c => keys[c] && !prev[c]);
  }

  function getState() {
    return {
      u: isDown(CFG.UP),
      d: isDown(CFG.DOWN),
      l: isDown(CFG.LEFT),
      r: isDown(CFG.RIGHT),
      k: isDown(CFG.KICK),
      kj: justPressed(CFG.KICK),
    };
  }

  return { tick, getState, isDown, justPressed };
})();
