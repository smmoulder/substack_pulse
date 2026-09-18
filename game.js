(() => {
  'use strict';

  const ROUND_SECONDS = 45;
  const MAX_LIVES = 3;
  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const ids = [
    'score', 'time', 'sparkMeter', 'lifeMeter', 'multiplier', 'startOverlay',
    'endOverlay', 'startButton', 'restartButton', 'pauseButton',
    'pauseBadge', 'combo', 'finalScore', 'finalStreak', 'endTitle',
    'soundButton', 'soundIcon', 'leftButton', 'rightButton'
  ];
  const ui = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
  const state = {
    running: false,
    paused: false,
    sound: false,
    score: 0,
    best: readBestScore(),
    time: ROUND_SECONDS,
    lives: MAX_LIVES,
    streak: 0,
    bestMultiplier: 1,
    spawnTimer: 0,
    lastTime: 0,
    keys: {},
    objects: [],
    particles: [],
    stars: []
  };
  const player = { x: 0, y: 0, width: 26, height: 32, speed: 350, targetX: null };
  let audio;
  let comboTimeout;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    player.y = rect.height - 48;
    player.x = Math.max(18, Math.min(rect.width - 18, player.x || rect.width / 2));
    state.stars = Array.from({ length: Math.floor(rect.width / 9) }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      r: Math.random() * 1.2 + 0.2,
      alpha: Math.random() * 0.55 + 0.1
    }));
    draw();
  }

  function start() {
    Object.assign(state, {
      running: true,
      paused: false,
      score: 0,
      time: ROUND_SECONDS,
      lives: MAX_LIVES,
      streak: 0,
      bestMultiplier: 1,
      spawnTimer: 0,
      objects: [],
      particles: []
    });
    player.x = canvas.clientWidth / 2;
    player.targetX = null;
    ui.startOverlay.classList.remove('visible');
    ui.endOverlay.classList.remove('visible');
    ui.pauseBadge.classList.remove('visible');
    ui.pauseButton.innerHTML = '<span>Ⅱ</span> Pause';
    updateHud();
    state.lastTime = performance.now();
    requestAnimationFrame(loop);
    tone(520, 0.08);
  }

  function end(reason = 'time') {
    state.running = false;
    if (state.score > state.best) {
      state.best = state.score;
      saveBestScore(state.best);
      ui.endTitle.textContent = 'A NEW CONSTELLATION';
    } else {
      ui.endTitle.textContent = reason === 'hull' ? 'LOST TO THE VOID' : 'THE LIGHT REMEMBERS';
    }
    ui.finalScore.textContent = formatScore(state.score);
    ui.finalStreak.textContent = `×${state.bestMultiplier}`;
    ui.endOverlay.classList.add('visible');
    tone(260, 0.25);
  }

  function togglePause(force) {
    if (!state.running) return;
    const next = typeof force === 'boolean' ? force : !state.paused;
    if (next === state.paused) return;
    state.paused = next;
    ui.pauseBadge.classList.toggle('visible', state.paused);
    ui.pauseButton.innerHTML = state.paused ? '<span>▶</span> Resume' : '<span>Ⅱ</span> Pause';
    if (!state.paused) {
      state.lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function spawn() {
    const progress = 1 - state.time / ROUND_SECONDS;
    const isShard = Math.random() < Math.min(0.28 + progress * 0.26, 0.54);
    state.objects.push({
      x: 24 + Math.random() * (canvas.clientWidth - 48),
      y: -20,
      r: isShard ? 10 + Math.random() * 5 : 8,
      type: isShard ? 'shard' : 'spark',
      speed: isShard ? 150 + Math.random() * 85 : 120 + Math.random() * 70,
      spin: Math.random() * 6
    });
  }

  function loop(now) {
    if (!state.running || state.paused) return;
    const dt = Math.min((now - state.lastTime) / 1000, 0.034);
    state.lastTime = now;
    state.time = Math.max(0, state.time - dt);
    update(dt);
    draw();
    updateHud();
    if (state.lives <= 0) end('hull');
    else if (state.time <= 0) end('time');
    else requestAnimationFrame(loop);
  }

  function update(dt) {
    const movingLeft = state.keys.ArrowLeft || state.keys.a || state.keys.A;
    const movingRight = state.keys.ArrowRight || state.keys.d || state.keys.D;
    const direction = (movingLeft ? -1 : 0) + (movingRight ? 1 : 0);
    if (direction) {
      player.x += direction * player.speed * dt;
      player.targetX = null;
    } else if (player.targetX !== null) {
      player.x += (player.targetX - player.x) * Math.min(1, dt * 9);
    }
    player.x = Math.max(18, Math.min(canvas.clientWidth - 18, player.x));

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawn();
      const elapsed = ROUND_SECONDS - state.time;
      state.spawnTimer = Math.max(0.28, 0.62 - elapsed * 0.007);
    }

    for (let i = state.objects.length - 1; i >= 0; i -= 1) {
      const object = state.objects[i];
      object.y += object.speed * dt;
      object.spin += dt * 3;
      const touching = Math.abs(object.x - player.x) < player.width / 2 + object.r
        && Math.abs(object.y - player.y) < player.height / 2 + object.r;
      if (touching) {
        hit(object);
        state.objects.splice(i, 1);
      } else if (object.y > canvas.clientHeight + 25) {
        if (object.type === 'spark') state.streak = 0;
        state.objects.splice(i, 1);
      }
    }

    state.particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
      particle.vy += 30 * dt;
    });
    state.particles = state.particles.filter((particle) => particle.life > 0);
  }

  function hit(object) {
    if (object.type === 'spark') {
      state.streak += 1;
      const multiplier = Math.min(5, 1 + Math.floor(state.streak / 5));
      state.bestMultiplier = Math.max(state.bestMultiplier, multiplier);
      state.score += 10 * multiplier;
      burst(object.x, object.y, '#ffd476', 12);
      if (multiplier > 1) showCombo(multiplier);
      tone(600 + multiplier * 90, 0.05);
      return;
    }
    state.score = Math.max(0, state.score - 25);
    state.lives -= 1;
    state.streak = 0;
    burst(object.x, object.y, '#ff557f', 18);
    canvas.parentElement.animate(
      [{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }],
      { duration: 180 }
    );
    tone(120, 0.12);
  }

  function showCombo(multiplier) {
    clearTimeout(comboTimeout);
    ui.combo.textContent = `×${multiplier} STREAK`;
    ui.combo.classList.add('visible');
    comboTimeout = setTimeout(() => ui.combo.classList.remove('visible'), 600);
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 95;
      state.particles.push({
        x, y, color,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.35,
        r: 1 + Math.random() * 2
      });
    }
  }

  function draw() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);
    drawStars();
    state.objects.forEach(drawObject);
    state.particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life * 2);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    drawPlayer();
  }

  function drawStars() {
    state.stars.forEach((star) => {
      ctx.globalAlpha = star.alpha * (0.7 + 0.3 * Math.sin(performance.now() / 900 + star.x));
      ctx.fillStyle = '#eeeaff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawObject(object) {
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.rotate(object.spin);
    if (object.type === 'spark') {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ffd476';
      ctx.fillStyle = '#ffe09a';
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const radius = i % 2 ? object.r * 0.35 : object.r;
        const angle = i * Math.PI / 4 - Math.PI / 2;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.shadowBlur = 13;
      ctx.shadowColor = '#ff315f';
      ctx.fillStyle = '#cf315d';
      ctx.beginPath();
      ctx.moveTo(0, -object.r);
      ctx.lineTo(object.r * 0.75, object.r * 0.75);
      ctx.lineTo(-object.r, object.r * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#9c85ff';
    ctx.strokeStyle = '#c3b4ff';
    ctx.fillStyle = 'rgba(133,105,255,.23)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(13, 13);
    ctx.lineTo(0, 8);
    ctx.lineTo(-13, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd476';
    ctx.fillRect(-2, 7, 4, 12);
    ctx.restore();
  }

  function updateHud() {
    const multiplier = Math.min(5, 1 + Math.floor(state.streak / 5));
    const sparkProgress = multiplier === 5 ? 5 : state.streak % 5;
    const damage = MAX_LIVES - state.lives;
    ui.score.textContent = formatScore(state.score);
    ui.time.textContent = Math.ceil(state.time).toString().padStart(2, '0');
    ui.multiplier.textContent = `×${multiplier}`;
    [...ui.sparkMeter.children].forEach((segment, index) => segment.classList.toggle('filled', index < sparkProgress));
    [...ui.lifeMeter.children].forEach((segment, index) => segment.classList.toggle('filled', index < damage));
    ui.sparkMeter.setAttribute('aria-valuenow', sparkProgress);
    ui.sparkMeter.setAttribute('aria-label', `Spark meter: ${sparkProgress} of 5 toward the next multiplier`);
    ui.lifeMeter.setAttribute('aria-valuenow', damage);
    ui.lifeMeter.setAttribute('aria-label', `Void damage: ${damage} of ${MAX_LIVES} hits`);
  }

  function formatScore(value) {
    return Math.floor(value).toString().padStart(4, '0');
  }

  function readBestScore() {
    try {
      return Number(window.localStorage.getItem('starweaver-best') || 0);
    } catch {
      return 0;
    }
  }

  function saveBestScore(value) {
    try {
      window.localStorage.setItem('starweaver-best', value);
    } catch {
      // The game remains playable when storage is blocked or unavailable.
    }
  }

  function tone(frequency, duration) {
    if (!state.sound) return;
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.05, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  }

  function bindHold(button, key) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      state.keys[key] = true;
      button.setPointerCapture?.(event.pointerId);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => {
      button.addEventListener(eventName, () => { state.keys[key] = false; });
    });
  }

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (event) => {
    const isSpace = event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
    state.keys[event.key] = true;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key) || isSpace) event.preventDefault();
    if (isSpace && !state.running) start();
    if (event.key.toLowerCase() === 'p') togglePause();
  });
  window.addEventListener('keyup', (event) => { state.keys[event.key] = false; });
  window.addEventListener('blur', () => togglePause(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) togglePause(true);
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (state.running) player.targetX = event.offsetX;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (state.running && event.buttons) player.targetX = event.offsetX;
  });
  bindHold(ui.leftButton, 'ArrowLeft');
  bindHold(ui.rightButton, 'ArrowRight');
  ui.startButton.addEventListener('click', start);
  ui.restartButton.addEventListener('click', start);
  ui.pauseButton.addEventListener('click', () => togglePause());
  ui.soundButton.addEventListener('click', () => {
    state.sound = !state.sound;
    ui.soundButton.setAttribute('aria-pressed', state.sound);
    ui.soundButton.setAttribute('aria-label', state.sound ? 'Turn sound off' : 'Turn sound on');
    ui.soundIcon.textContent = state.sound ? '♫' : '♪';
    tone(520, 0.08);
  });

  resize();
  updateHud();
})();
