(() => {
  'use strict';

  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const ui = Object.fromEntries(['score','time','best','startOverlay','endOverlay','startButton','restartButton','pauseButton','pauseBadge','combo','finalScore','finalStreak','endTitle','soundButton','soundIcon','leftButton','rightButton'].map(id => [id, document.querySelector(`#${id}`)]));
  const state = { running:false, paused:false, sound:false, score:0, best:Number(localStorage.getItem('starweaver-best') || 0), time:45, streak:0, bestStreak:0, spawnTimer:0, lastTime:0, keys:{}, objects:[], particles:[], stars:[] };
  const player = { x:0, y:0, width:26, height:32, speed:350, targetX:null };
  let audio;

  ui.best.textContent = formatScore(state.best);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = rect.width * scale; canvas.height = rect.height * scale;
    ctx.setTransform(scale,0,0,scale,0,0);
    player.y = rect.height - 48;
    if (!player.x) player.x = rect.width / 2;
    state.stars = Array.from({length:Math.floor(rect.width / 9)}, () => ({x:Math.random()*rect.width,y:Math.random()*rect.height,r:Math.random()*1.2+.2,a:Math.random()*.55+.1}));
  }

  function start() {
    state.running=true; state.paused=false; state.score=0; state.time=45; state.streak=0; state.bestStreak=0; state.spawnTimer=0; state.objects=[]; state.particles=[];
    player.x=canvas.clientWidth/2; player.targetX=null;
    ui.startOverlay.classList.remove('visible'); ui.endOverlay.classList.remove('visible'); ui.pauseBadge.classList.remove('visible');
    updateHud(); state.lastTime=performance.now(); requestAnimationFrame(loop); tone(520,.08);
  }

  function end() {
    state.running=false;
    if (state.score > state.best) { state.best=state.score; localStorage.setItem('starweaver-best',state.best); ui.endTitle.textContent='A NEW CONSTELLATION'; }
    else ui.endTitle.textContent='THE LIGHT REMEMBERS';
    ui.finalScore.textContent=formatScore(state.score); ui.finalStreak.textContent=`×${Math.max(1,state.bestStreak)}`; ui.best.textContent=formatScore(state.best); ui.endOverlay.classList.add('visible'); tone(260,.25);
  }

  function togglePause() {
    if (!state.running) return;
    state.paused=!state.paused; ui.pauseBadge.classList.toggle('visible',state.paused); ui.pauseButton.innerHTML=state.paused?'<span>▶</span> Resume':'<span>Ⅱ</span> Pause';
    if (!state.paused) { state.lastTime=performance.now(); requestAnimationFrame(loop); }
  }

  function spawn() {
    const danger=Math.random()<Math.min(.28+((45-state.time)/100),.54);
    state.objects.push({ x:24+Math.random()*(canvas.clientWidth-48), y:-20, r:danger?10+Math.random()*5:8, type:danger?'shard':'spark', speed:danger?150+Math.random()*85:120+Math.random()*70, spin:Math.random()*6 });
  }

  function loop(now) {
    if (!state.running || state.paused) return;
    const dt=Math.min((now-state.lastTime)/1000,.034); state.lastTime=now; state.time-=dt;
    if (state.time<=0) { state.time=0; update(dt); draw(); updateHud(); end(); return; }
    update(dt); draw(); updateHud(); requestAnimationFrame(loop);
  }

  function update(dt) {
    let direction=(state.keys.ArrowLeft||state.keys.a?-1:0)+(state.keys.ArrowRight||state.keys.d?1:0);
    if (direction) { player.x+=direction*player.speed*dt; player.targetX=null; }
    else if (player.targetX!==null) player.x+=(player.targetX-player.x)*Math.min(1,dt*9);
    player.x=Math.max(18,Math.min(canvas.clientWidth-18,player.x));
    state.spawnTimer-=dt; if(state.spawnTimer<=0){ spawn(); state.spawnTimer=Math.max(.28,.62-(45-state.time)*.007); }
    for(let i=state.objects.length-1;i>=0;i--){ const o=state.objects[i]; o.y+=o.speed*dt; o.spin+=dt*3;
      if(Math.abs(o.x-player.x)<player.width/2+o.r && Math.abs(o.y-player.y)<player.height/2+o.r){ hit(o); state.objects.splice(i,1); }
      else if(o.y>canvas.clientHeight+25){ if(o.type==='spark') state.streak=0; state.objects.splice(i,1); }
    }
    state.particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vy+=30*dt}); state.particles=state.particles.filter(p=>p.life>0);
  }

  function hit(o) {
    if(o.type==='spark'){ state.streak++; state.bestStreak=Math.max(state.bestStreak,state.streak); const multi=Math.min(5,1+Math.floor(state.streak/5)); state.score+=10*multi; burst(o.x,o.y,'#ffd476',12); if(multi>1){ui.combo.textContent=`×${multi} STREAK`;ui.combo.classList.add('visible');setTimeout(()=>ui.combo.classList.remove('visible'),500)} tone(600+multi*90,.05); }
    else { state.score=Math.max(0,state.score-25); state.streak=0; burst(o.x,o.y,'#ff557f',18); canvas.parentElement.animate([{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'none'}],{duration:180}); tone(120,.12); }
  }

  function burst(x,y,color,count){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=35+Math.random()*95;state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.35,color,r:1+Math.random()*2})}}
  function draw() {
    const w=canvas.clientWidth,h=canvas.clientHeight; ctx.clearRect(0,0,w,h);
    state.stars.forEach(s=>{ctx.globalAlpha=s.a*(.7+.3*Math.sin(performance.now()/900+s.x));ctx.fillStyle='#eeeaff';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()}); ctx.globalAlpha=1;
    state.objects.forEach(o=>{ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.spin);if(o.type==='spark'){ctx.shadowBlur=18;ctx.shadowColor='#ffd476';ctx.fillStyle='#ffe09a';ctx.beginPath();for(let i=0;i<8;i++){const r=i%2?o.r*.35:o.r,a=i*Math.PI/4-Math.PI/2;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill()}else{ctx.shadowBlur=13;ctx.shadowColor='#ff315f';ctx.fillStyle='#cf315d';ctx.beginPath();ctx.moveTo(0,-o.r);ctx.lineTo(o.r*.75,o.r*.75);ctx.lineTo(-o.r,o.r*.35);ctx.closePath();ctx.fill()}ctx.restore()});
    state.particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1; drawPlayer();
  }

  function drawPlayer(){ctx.save();ctx.translate(player.x,player.y);ctx.shadowBlur=18;ctx.shadowColor='#9c85ff';ctx.strokeStyle='#c3b4ff';ctx.fillStyle='rgba(133,105,255,.23)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(13,13);ctx.lineTo(0,8);ctx.lineTo(-13,13);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#ffd476';ctx.fillRect(-2,7,4,12);ctx.restore()}
  function updateHud(){ui.score.textContent=formatScore(state.score);ui.time.textContent=Math.ceil(state.time).toString().padStart(2,'0')}
  function formatScore(n){return Math.floor(n).toString().padStart(4,'0')}
  function tone(freq,duration){if(!state.sound)return;audio ||= new (window.AudioContext||window.webkitAudioContext)();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.frequency.value=freq;oscillator.type='sine';gain.gain.setValueAtTime(.05,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration)}

  window.addEventListener('resize',resize); resize(); draw();
  window.addEventListener('keydown',e=>{state.keys[e.key]=true;if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key===' '&&!state.running)start();if(e.key.toLowerCase()==='p')togglePause()});
  window.addEventListener('keyup',e=>state.keys[e.key]=false);
  canvas.addEventListener('pointerdown',e=>{if(state.running)player.targetX=e.offsetX}); canvas.addEventListener('pointermove',e=>{if(state.running&&e.buttons)player.targetX=e.offsetX});
  function bindHold(button,key){button.addEventListener('pointerdown',e=>{e.preventDefault();state.keys[key]=true});['pointerup','pointercancel','pointerleave'].forEach(event=>button.addEventListener(event,()=>state.keys[key]=false))}
  bindHold(ui.leftButton,'ArrowLeft');bindHold(ui.rightButton,'ArrowRight');
  ui.startButton.addEventListener('click',start);ui.restartButton.addEventListener('click',start);ui.pauseButton.addEventListener('click',togglePause);
  ui.soundButton.addEventListener('click',()=>{state.sound=!state.sound;ui.soundButton.setAttribute('aria-pressed',state.sound);ui.soundButton.setAttribute('aria-label',state.sound?'Turn sound off':'Turn sound on');ui.soundIcon.textContent=state.sound?'♫':'♪';tone(520,.08)});
})();
