'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const state = {
  running: false, paused: false, speed: 1,
  levelIndex: 0, levelData: null, pathLen: 0,
  gold: 0, hp: 0, maxHp: 20,
  wave: 0, maxWave: 0,
  kills: 0, totalKills: 0,
  towers: [], heroes: [], monsters: [], projectiles: [], particles: [], floatingTexts: [],
  spawnQueue: [], spawnTimer: 0, waveActive: false,
  selectedTower: null, selectedTowerType: null,
  hoverPos: { x: -100, y: -100 },
  time: 0, gameOver: false, levelComplete: false,
  bossActive: false, heroSkills: {},
  hoveredTower: null,
  endless: false,
  weather: 'clear',
  weatherTimer: 30,
  streak: 0,
  critChance: 0.1,
  prestige: 0,
  hpLostThisLevel: 0,
  upgradeCount: 0,
  heroesBought: [],
  dailyReady: false,
};

function loadLevel(index, endless = false) {
  const save = Save.load();
  state.levelIndex = index;
  const ld = LEVELS[index];
  state.levelData = ld;
  state.pathLen = Utils.pathLength(ld.path);
  state.endless = endless;
  const pBonus = 1 + save.prestige * 0.5;
  state.gold = Math.floor(ld.startGold * pBonus);
  state.hp = ld.startHp + save.prestige * 5;
  state.maxHp = state.hp;
  state.wave = 0;
  state.maxWave = endless ? 9999 : ld.waves;
  state.towers = []; state.heroes = []; state.monsters = [];
  state.projectiles = []; state.particles = []; state.floatingTexts = [];
  state.spawnQueue = []; state.spawnTimer = 0;
  state.waveActive = false;
  state.selectedTower = null; state.selectedTowerType = null;
  state.levelComplete = false; state.gameOver = false; state.bossActive = false;
  state.heroSkills = {};
  state.kills = 0;
  state.hpLostThisLevel = 0;
  state.upgradeCount = 0;
  state.heroesBought = [];
  state.prestige = save.prestige;
  state.weather = 'clear';
  state.weatherTimer = 30;
  UI.updateHUD(); UI.renderShop(); UI.renderHeroes(); UI.renderSkills();
  UI.setWeather('clear');
  UI.log('📍 ' + (endless ? '♾ ENDLESS' : 'Уровень ' + (index+1) + ': ' + ld.name), 'info');
}

function startWave() {
  if (state.waveActive) return;
  if (!state.endless && state.wave >= state.maxWave) return;
  state.wave++;
  state.waveActive = true;
  state.spawnQueue = [];
  state.spawnTimer = 0;
  const ld = state.levelData;
  const wave = state.wave;
  const isBossWave = !state.endless && (wave === state.maxWave);
  const isMegaBossWave = state.endless && wave % 20 === 0;
  const isMiniBossWave = wave % 5 === 0 && !isBossWave && !isMegaBossWave;
  const baseCount = Math.min(5 + wave * 2, 40);
  const pool = ld.monsters;

  for (let i = 0; i < baseCount; i++) {
    const t = Utils.pick(pool);
    state.spawnQueue.push({ type: t, delay: i * (state.endless ? 0.35 : 0.55) });
  }
  if (isBossWave) { state.spawnQueue.push({ type: 'boss', delay: (baseCount + 2) * 0.55 }); state.bossActive = true; SFX.boss(); }
  else if (isMegaBossWave) { state.spawnQueue.push({ type: 'megaboss', delay: (baseCount + 2) * 0.4 }); state.bossActive = true; SFX.boss(); }
  else if (isMiniBossWave) { state.spawnQueue.push({ type: 'miniboss', delay: (baseCount + 1) * 0.55 }); SFX.boss(); }

  SFX.waveStart();
  UI.log('🌊 Волна ' + wave + (isBossWave ? ' 🐉 БОСС!' : isMiniBossWave ? ' 👺 Мини-босс!' : isMegaBossWave ? ' 👾 МЕГА-БОСС!' : ''), 'warn');
  UI.updateHUD();
}

function spawnMonster(type) {
  const cfg = MONSTERS[type];
  const hpScale = 1 + (state.wave - 1) * 0.14 + state.levelIndex * 0.35 + (state.endless ? state.wave * 0.05 : 0);
  const shieldPct = cfg.shield || 0;
  state.monsters.push({
    type, x: state.levelData.path[0][0], y: state.levelData.path[0][1],
    hp: cfg.hp * hpScale, maxHp: cfg.hp * hpScale,
    shield: cfg.hp * hpScale * shieldPct,
    maxShield: cfg.hp * hpScale * shieldPct,
    speed: cfg.speed * state.levelData.speed, baseSpeed: cfg.speed * state.levelData.speed,
    r: cfg.r, t: 0, reward: Math.floor(cfg.reward * (1 + state.levelIndex * 0.2)),
    color: cfg.color, slowT: 0, dotT: 0, dotDmg: 0, hitFlash: 0,
    boss: cfg.boss || false, ico: cfg.ico, dead: false,
    wobble: Math.random() * Math.PI * 2,
  });
}

function tryBuildTower(type, x, y) {
  const cfg = TOWERS[type];
  if (state.gold < cfg.cost) { SFX.error(); UI.log('❌ Мало золота', 'err'); return false; }
  if (onPath(x, y, 28)) { SFX.error(); UI.log('❌ На дороге', 'err'); return false; }
  if (state.towers.some(t => Utils.dist(t, {x, y}) < 30)) { SFX.error(); UI.log('❌ Близко', 'err'); return false; }
  state.gold -= cfg.cost;
  const lvl = cfg.levels[0];
  state.towers.push({
    x, y, type, level: 0, dmg: lvl.dmg, range: lvl.range, rate: lvl.rate, cd: 0,
    splash: lvl.splash || 0, slow: lvl.slow || 0, chain: lvl.chain || 0,
    dot: lvl.dot || 0, dotDur: lvl.dotDur || 0,
    color: cfg.color, projColor: cfg.projColor, angle: 0,
  });
  SFX.build();
  UI.log('✅ ' + cfg.name, 'ok');
  checkAchievement('build_10', () => state.towers.length >= 10);
  checkAchievement('build_50', () => { Save.data.totalBuilds = (Save.data.totalBuilds || 0) + 1; return Save.data.totalBuilds >= 50; });
  UI.updateHUD(); UI.renderShop();
  return true;
}

function upgradeTower(tower) {
  const cfg = TOWERS[tower.type];
  const next = cfg.levels[tower.level + 1];
  if (!next) { UI.log('Максимальный уровень', 'warn'); return; }
  if (state.gold < next.upgradeCost) { SFX.error(); UI.log('❌ Мало золота', 'err'); return; }
  state.gold -= next.upgradeCost;
  tower.level++;
  tower.dmg = next.dmg; tower.range = next.range; tower.rate = next.rate;
  if (next.splash) tower.splash = next.splash;
  if (next.slow) tower.slow = next.slow;
  if (next.chain) tower.chain = next.chain;
  if (next.dot) tower.dot = next.dot;
  if (next.dotDur) tower.dotDur = next.dotDur;
  state.upgradeCount++;
  SFX.upgrade();
  UI.log('⭐ Ур. ' + (tower.level + 1), 'ok');
  checkAchievement('upgrade_10', () => state.upgradeCount >= 10);
  UI.updateHUD(); UI.showTowerInfo(tower);
}

function sellTower(tower) {
  const cfg = TOWERS[tower.type];
  let value = cfg.cost;
  for (let i = 0; i < tower.level; i++) value += cfg.levels[i + 1].upgradeCost;
  value = Math.floor(value * 0.7);
  state.gold += value;
  state.towers = state.towers.filter(t => t !== tower);
  state.selectedTower = null;
  SFX.sell();
  UI.log('💰 +' + value, 'info');
  UI.updateHUD(); UI.renderShop(); UI.showTowerInfo(null);
}

function buyHero(type) {
  const cfg = HEROES[type];
  if (state.gold < cfg.cost) { SFX.error(); return; }
  if (state.heroes.some(h => h.type === type)) { SFX.error(); UI.log('❌ Уже нанят', 'err'); return; }
  state.gold -= cfg.cost;
  state.heroes.push({ type, x: W/2, y: H/2, color: cfg.color, atkCd: 0, pulse: 0 });
  for (const k of ['Q','W','E']) state.heroSkills[type + k] = 0;
  state.heroesBought.push(type);
  SFX.buy();
  UI.log('🦸 ' + cfg.name, 'ok');
  checkAchievement('hero_all', () => new Set(state.heroesBought).size >= 4);
  UI.updateHUD(); UI.renderHeroes(); UI.renderSkills();
}

function useSkill(heroType, key) {
  const hero = state.heroes.find(h => h.type === heroType);
  if (!hero) { SFX.error(); return; }
  const cfg = HEROES[heroType];
  const sk = cfg.skills[key];
  if (!sk) return;
  const cdKey = heroType + key;
  if (state.heroSkills[cdKey] > 0) return;
  state.heroSkills[cdKey] = sk.cd;
  SFX.skill();
  const alive = state.monsters.filter(m => !m.dead);

  if (heroType === 'mage') {
    if (key === 'Q') { const t = alive.sort((a,b) => Utils.dist(hero,a) - Utils.dist(hero,b))[0]; if (t) explodeAt(t.x, t.y, 80, 60, '#ff4d4d'); }
    else if (key === 'W') { const t = alive.sort((a,b) => b.hp - a.hp)[0]; if (t) explodeAt(t.x, t.y, 140, 180, '#ff8c42', true); }
    else if (key === 'E') { state.hp = Math.min(state.maxHp, state.hp + 5); UI.log('🛡️ +5 HP', 'ok'); }
  }
  if (heroType === 'knight') {
    if (key === 'Q') { alive.forEach(m => { if (Utils.dist(hero, m) < 100) damageMonster(m, 80); }); for (let i = 0; i < 30; i++) spawnParticle(hero.x, hero.y, '#ffd166', 400); }
    else if (key === 'W') { const t = alive.sort((a,b) => Utils.dist(hero,a) - Utils.dist(hero,b))[0]; if (t) { hero.x = t.x; hero.y = t.y; alive.forEach(m => { if (Utils.dist(hero, m) < 90) damageMonster(m, 100); }); for (let i = 0; i < 40; i++) spawnParticle(hero.x, hero.y, '#ffd166', 500); } }
    else if (key === 'E') { alive.forEach(m => { m.slowT = Math.max(m.slowT, 3); }); UI.log('📢 Замедление', 'ok'); }
  }
  if (heroType === 'archer_hero') {
    if (key === 'Q') { alive.forEach(m => damageMonster(m, 30)); }
    else if (key === 'W') { alive.forEach(m => { if (Utils.dist(hero, m) < 200) m.slowT = Math.max(m.slowT, 4); }); UI.log('🕸️ Ловушка', 'ok'); }
    else if (key === 'E') { alive.forEach(m => damageMonster(m, 70)); for (let i = 0; i < 60; i++) { const m = alive[Math.floor(Math.random() * alive.length)]; if (m) spawnParticle(m.x, m.y, '#7cf78c', 300); } }
  }
  if (heroType === 'cleric') {
    if (key === 'Q') { state.hp = Math.min(state.maxHp, state.hp + 3); UI.log('💚 +3 HP', 'ok'); }
    else if (key === 'W') { alive.forEach(m => { if (Utils.dist(hero, m) < 150) damageMonster(m, 50); }); for (let i = 0; i < 20; i++) spawnParticle(hero.x, hero.y, '#9be7ff', 300); }
    else if (key === 'E') { state.hp = Math.min(state.maxHp, state.hp + 10); UI.log('🕊️ +10 HP', 'ok'); }
  }
  UI.renderSkills(); UI.updateHUD();
}

function explodeAt(x, y, radius, dmg, color) {
  state.monsters.forEach(m => { if (!m.dead && Utils.dist({x,y}, m) < radius) damageMonster(m, dmg); });
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
    state.particles.push({ x: x + Math.cos(a)*r, y: y + Math.sin(a)*r, vx: Math.cos(a)*200, vy: Math.sin(a)*200, life: 0.8, color, r: 4 });
  }
  state.particles.push({ x, y, vx: 0, vy: 0, life: 0.6, color, r: radius/2, ring: true });
}

function damageMonster(m, dmg, fromDot = false) {
  const crit = Math.random() < state.critChance;
  const finalDmg = crit ? dmg * 2 : dmg;
  if (crit) { SFX.crit(); state.floatingTexts.push({ x: m.x, y: m.y - 30, text: 'CRIT!', life: 1, color: '#ff4ecd', size: 20 }); }

  let remaining = finalDmg;
  if (m.shield > 0) {
    const absorbed = Math.min(m.shield, remaining);
    m.shield -= absorbed; remaining -= absorbed;
  }
  m.hp -= remaining;
  if (!fromDot) m.hitFlash = 0.1;

  if (!fromDot || Math.random() < 0.3) {
    state.floatingTexts.push({ x: m.x + Utils.rand(-8,8), y: m.y - 15, text: Math.floor(finalDmg), life: 0.8, color: fromDot ? '#7cf78c' : crit ? '#ff4ecd' : '#ffd166', size: 16 });
  }
  if (m.hp <= 0 && !m.dead) {
    m.dead = true;
    state.gold += m.reward; state.kills++; state.totalKills++;
    Save.data.totalKills = (Save.data.totalKills || 0) + 1;
    SFX.monsterDie();
    for (let i = 0; i < (m.boss ? 40 : 10); i++) spawnParticle(m.x, m.y, m.color, 300);
    if (m.boss) {
      state.bossActive = false;
      UI.log('🐉 +' + m.reward, 'ok');
      SFX.victory();
      Save.data.bossKills = (Save.data.bossKills || 0) + 1;
      checkAchievement('boss_kill', () => Save.data.bossKills >= 1);
      checkAchievement('boss_3', () => Save.data.bossKills >= 3);
    }
    checkAchievement('first_kill', () => Save.data.totalKills >= 1);
    checkAchievement('kill_50', () => Save.data.totalKills >= 50);
    checkAchievement('kill_500', () => Save.data.totalKills >= 500);
    Save.save();
    UI.updateHUD();
  }
}

function checkAchievement(id, condition) {
  if (Save.data.achievements.includes(id)) return;
  if (condition()) {
    Save.data.achievements.push(id);
    Save.save();
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (ach) {
      SFX.achievement();
      UI.showToast('🏆 ' + ach.name + '! +' + ach.reward + '💰');
      state.gold += ach.reward;
    }
  }
}

function spawnParticle(x, y, color, speed) {
  const a = Math.random() * Math.PI * 2;
  state.particles.push({ x, y, vx: Math.cos(a)*Utils.rand(50,speed), vy: Math.sin(a)*Utils.rand(50,speed), life: Utils.rand(0.4,0.9), color, r: Utils.rand(2,4) });
}

function onPath(x, y, pad) {
  const path = state.levelData.path;
  for (let i = 0; i < path.length - 1; i++) {
    if (Utils.distToSegment(x, y, path[i][0], path[i][1], path[i+1][0], path[i+1][1]) < pad) return true;
  }
  return false;
}

function update(dt) {
  if (!state.running || state.paused || state.gameOver || state.levelComplete) return;
  state.time += dt;

  // Погода
  state.weatherTimer -= dt;
  if (state.weatherTimer <= 0) {
    state.weatherTimer = Utils.rand(20, 40);
    const options = ['clear', 'clear', 'rain', 'snow', 'storm'];
    state.weather = Utils.pick(options);
    UI.setWeather(state.weather);
    if (state.weather !== 'clear') UI.log('☁️ Погода: ' + state.weather, 'info');
  }
  let weatherMod = 1;
  if (state.weather === 'rain') weatherMod = 0.85;
  if (state.weather === 'snow') weatherMod = 0.7;
  if (state.weather === 'storm') weatherMod = 1.15;

  if (state.waveActive && state.spawnQueue.length > 0) {
    state.spawnTimer += dt;
    while (state.spawnQueue.length > 0 && state.spawnQueue[0].delay <= state.spawnTimer) {
      spawnMonster(state.spawnQueue.shift().type);
    }
  }

  for (const m of state.monsters) {
    if (m.dead) continue;
    if (m.slowT > 0) m.slowT -= dt;
    if (m.dotT > 0) { m.dotT -= dt; if (Math.random() < dt * 2) damageMonster(m, m.dotDmg * 0.3, true); }
    if (m.hitFlash > 0) m.hitFlash -= dt;
    m.wobble += dt * 6;
    const spd = m.speed * weatherMod * (m.slowT > 0 ? 0.5 : 1);
    m.t += spd * dt / state.pathLen;
    const p = Utils.pointOnPath(state.levelData.path, Math.min(m.t, 1));
    m.x = p.x; m.y = p.y;
    if (m.t >= 1) {
      m.dead = true; state.hp--; state.hpLostThisLevel++;
      SFX.leak(); UI.log('💔 Прорыв!', 'err'); UI.updateHUD();
      Save.data.lastLevel = state.levelIndex;
      Save.save();
    }
  }

  for (const t of state.towers) {
    t.cd -= dt;
    if (t.cd > 0) continue;
    const target = state.monsters.filter(m => !m.dead && Utils.dist(t, m) <= t.range).sort((a,b) => Utils.dist(t,a) - Utils.dist(t,b))[0];
    if (!target) continue;
    t.cd = t.rate;
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    SFX.shoot();
    if (t.chain > 0) fireChain(t, target);
    else fireProjectile(t, target);
  }

  for (const h of state.heroes) {
    h.atkCd -= dt; h.pulse = Math.max(0, h.pulse - dt * 3);
    if (h.atkCd <= 0) {
      let target = null, minD = Infinity;
      const range = h.type === 'archer_hero' ? 220 : h.type === 'mage' ? 150 : h.type === 'cleric' ? 130 : 80;
      for (const m of state.monsters) { if (m.dead) continue; const d = Utils.dist(h, m); if (d < range && d < minD) { minD = d; target = m; } }
      if (target) {
        h.atkCd = h.type === 'knight' ? 0.8 : h.type === 'archer_hero' ? 0.6 : 1.0;
        h.pulse = 1;
        const dmg = h.type === 'knight' ? 25 : h.type === 'archer_hero' ? 18 : h.type === 'cleric' ? 12 : 22;
        damageMonster(target, dmg);
        if (h.type !== 'knight') state.projectiles.push({ x: h.x, y: h.y, target, dmg: 0, speed: 600, color: h.color, visualOnly: true });
      }
    }
  }

  for (const k in state.heroSkills) if (state.heroSkills[k] > 0) { state.heroSkills[k] -= dt; if (state.heroSkills[k] < 0) state.heroSkills[k] = 0; }

  for (const p of state.projectiles) {
    if (!p.target || p.target.dead) { p.dead = true; continue; }
    const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy);
    if (d < 12) {
      if (!p.visualOnly) {
        damageMonster(p.target, p.dmg);
        if (p.slow) p.target.slowT = Math.max(p.target.slowT, p.slow);
        if (p.dot) { p.target.dotT = p.dotDur; p.target.dotDmg = p.dot; }
        if (p.splash) state.monsters.forEach(m => { if (m !== p.target && !m.dead && Utils.dist(p.target, m) < p.splash) damageMonster(m, p.dmg * 0.5); });
        SFX.hit();
      }
      p.dead = true;
    } else { p.x += (dx/d)*p.speed*dt; p.y += (dy/d)*p.speed*dt; }
  }

  for (const pt of state.particles) { if (!pt.ring) { pt.x += pt.vx*dt; pt.y += pt.vy*dt; pt.vx *= 0.95; pt.vy *= 0.95; } pt.life -= dt; }
  for (const ft of state.floatingTexts) { ft.y -= dt*40; ft.life -= dt; }

  state.monsters = state.monsters.filter(m => !m.dead);
  state.projectiles = state.projectiles.filter(p => !p.dead);
  state.particles = state.particles.filter(p => p.life > 0);
  state.floatingTexts = state.floatingTexts.filter(ft => ft.life > 0);

  if (state.waveActive && state.spawnQueue.length === 0 && state.monsters.length === 0) {
    state.waveActive = false;
    const bonus = 20 + state.wave * 5;
    state.gold += bonus;
    SFX.waveEnd();
    UI.log('✅ Волна отбита +' + bonus, 'ok');
    UI.updateHUD();
    if (state.endless) {
      if (state.wave > Save.data.endlessBest) { Save.data.endlessBest = state.wave; Save.save(); }
      checkAchievement('endless_10', () => state.wave >= 10);
    } else if (state.wave >= state.maxWave) {
      state.levelComplete = true; state.running = false; SFX.victory();
      if (state.hpLostThisLevel === 0) checkAchievement('no_leak', () => true);
      checkAchievement('level_1', () => state.levelIndex >= 0);
      if (state.levelIndex + 1 >= LEVELS.length) {
        checkAchievement('level_all', () => true);
      }
      Save.data.unlockedLevels = Math.max(Save.data.unlockedLevels, state.levelIndex + 2);
      Save.data.lastLevel = state.levelIndex;
      Save.save();
      UI.showLevelEnd();
    }
  }

  if (state.hp <= 0 && !state.gameOver) { state.gameOver = true; state.running = false; SFX.defeat(); UI.showGameOver(); }
  checkAchievement('rich', () => state.gold >= 1000);
}

function fireProjectile(t, target) {
  state.projectiles.push({ x: t.x, y: t.y, target, dmg: t.dmg, speed: 550, color: t.projColor, slow: t.slow, splash: t.splash, dot: t.dot, dotDur: t.dotDur });
}

function fireChain(t, target) {
  const hit = new Set();
  let current = target, dmg = t.dmg;
  for (let i = 0; i <= t.chain && current; i++) {
    damageMonster(current, dmg);
    hit.add(current);
    if (t.slow) current.slowT = Math.max(current.slowT, t.slow);
    state.projectiles.push({ x: t.x, y: t.y, target: current, dmg: 0, speed: 1200, color: t.projColor, visualOnly: true, zap: true });
    dmg *= 0.7;
    let next = null, minD = 100;
    for (const m of state.monsters) { if (m.dead || hit.has(m)) continue; const d = Utils.dist(current, m); if (d < minD) { minD = d; next = m; } }
    current = next;
  }
}

// ================ РЕНДЕР ================
function render() {
  const ld = state.levelData;
  if (!ld) return;
  ctx.fillStyle = ld.bgColor || '#05010f'; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W/2, H/2, 100, W/2, H/2, Math.max(W, H));
  grad.addColorStop(0, 'rgba(168,85,247,0.05)');
  grad.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(78,203,255,.04)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  drawPath(ld);
  if (state.selectedTowerType) drawBuildHints();
  if (state.selectedTower) drawRangeCircle(state.selectedTower);
  if (state.hoveredTower && state.hoveredTower !== state.selectedTower) drawRangeCircle(state.hoveredTower, 0.3);
  if (state.selectedTowerType) drawBuildPreview();
  for (const t of state.towers) drawTower(t);
  for (const h of state.heroes) drawHero(h);
  for (const p of state.projectiles) {
    if (p.zap) {
      ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.shadowColor = p.color; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      const dx = p.target.x - p.x, dy = p.target.y - p.y, steps = 4;
      for (let i = 1; i <= steps; i++) { const t = i/steps; const jitter = i < steps ? Utils.rand(-8,8) : 0; ctx.lineTo(p.x + dx*t + jitter, p.y + dy*t + jitter); }
      ctx.stroke(); ctx.shadowBlur = 0;
    } else {
      ctx.save(); ctx.shadowColor = p.color; ctx.shadowBlur = 20; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
  for (const m of state.monsters) drawMonster(m);
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 1.5));
    if (pt.ring) { ctx.strokeStyle = pt.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r * (1.5 - pt.life), 0, Math.PI*2); ctx.stroke(); }
    else { ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI*2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  for (const ft of state.floatingTexts) {
    ctx.globalAlpha = Math.min(1, ft.life * 2); ctx.fillStyle = ft.color;
    ctx.font = 'bold ' + (ft.size || 16) + 'px sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
    ctx.strokeText(ft.text, ft.x, ft.y); ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  if (state.paused) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 60px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('⏸ ПАУЗА', W/2, H/2); ctx.textAlign = 'left';
  }
}

function drawPath(ld) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 50;
  ctx.beginPath(); ld.path.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke();
  ctx.strokeStyle = ld.accent || '#a855f7'; ctx.globalAlpha = 0.25; ctx.lineWidth = 44; ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowColor = ld.accent || '#a855f7'; ctx.shadowBlur = 20;
  ctx.strokeStyle = ld.accent || '#a855f7'; ctx.lineWidth = 3; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.setLineDash([10, 15]); ctx.stroke(); ctx.setLineDash([]);
}

function drawBuildHints() {
  ctx.fillStyle = 'rgba(78,203,255,.15)';
  for (let x = 20; x < W; x += 40) for (let y = 20; y < H; y += 40) {
    if (!onPath(x, y, 32) && !state.towers.some(t => Utils.dist(t, {x,y}) < 30)) { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill(); }
  }
}

function drawRangeCircle(tower, alpha = 0.5) {
  ctx.globalAlpha = alpha; ctx.strokeStyle = tower.color; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
  ctx.beginPath(); ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = tower.color; ctx.globalAlpha = alpha * 0.15;
  ctx.beginPath(); ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
}

function drawBuildPreview() {
  const { x, y } = state.hoverPos;
  if (x < 0 || y < 0) return;
  const cfg = TOWERS[state.selectedTowerType];
  const canBuild = !onPath(x, y, 28) && !state.towers.some(t => Utils.dist(t, {x,y}) < 30) && state.gold >= cfg.cost;
  ctx.globalAlpha = 0.5; ctx.strokeStyle = canBuild ? cfg.color : '#ff4d4d'; ctx.lineWidth = 2; ctx.setLineDash([6,6]);
  ctx.beginPath(); ctx.arc(x, y, cfg.levels[0].range, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = canBuild ? cfg.color : '#ff4d4d'; ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(x, y, cfg.levels[0].range, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(cfg.icon, x, y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function drawTower(t) {
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(t.x, t.y+3, 22, 0, Math.PI*2); ctx.fill();
  ctx.save(); ctx.shadowColor = t.color; ctx.shadowBlur = 20 + (t.level*10);
  ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(t.x, t.y, 18, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(5,1,15,.7)'; ctx.beginPath(); ctx.arc(t.x, t.y, 12, 0, Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.angle || 0);
  ctx.fillStyle = t.color; ctx.shadowColor = t.color; ctx.shadowBlur = 10;
  ctx.fillRect(8, -3, 16, 6); ctx.restore();
  ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(TOWERS[t.type].icon, t.x, t.y);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (t.level > 0) { ctx.font = '10px sans-serif'; ctx.fillStyle = '#ffd166'; ctx.textAlign = 'center'; ctx.fillText('★'.repeat(t.level), t.x, t.y - 24); ctx.textAlign = 'left'; }
  if (state.selectedTower === t) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.arc(t.x, t.y, 24, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }
}

function drawHero(h) {
  const cfg = HEROES[h.type];
  ctx.save(); ctx.shadowColor = h.color; ctx.shadowBlur = 25 + h.pulse * 30;
  const scale = 1 + h.pulse * 0.3;
  ctx.fillStyle = h.color; ctx.beginPath(); ctx.arc(h.x, h.y, 18*scale, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(5,1,15,.7)'; ctx.beginPath(); ctx.arc(h.x, h.y, 13*scale, 0, Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(cfg.icon, h.x, h.y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function drawMonster(m) {
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(m.x, m.y + m.r*0.7, m.r, m.r*0.4, 0, 0, Math.PI*2); ctx.fill();
  const wobble = Math.sin(m.wobble) * 2;
  const flash = m.hitFlash > 0;
  ctx.save(); ctx.shadowColor = m.color; ctx.shadowBlur = m.boss ? 40 : 15;
  ctx.fillStyle = flash ? '#fff' : m.color; ctx.beginPath(); ctx.arc(m.x, m.y + wobble, m.r, 0, Math.PI*2); ctx.fill();
  if (m.boss) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); }
  ctx.restore();
  if (m.shield > 0) {
    ctx.strokeStyle = 'rgba(155,231,255,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(m.x, m.y + wobble, m.r + 6, 0, Math.PI*2); ctx.stroke();
  }
  ctx.font = (m.r * 1.6) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(m.ico, m.x, m.y + wobble); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (m.slowT > 0) { ctx.fillStyle = 'rgba(155,231,255,.4)'; ctx.beginPath(); ctx.arc(m.x, m.y + wobble, m.r + 3, 0, Math.PI*2); ctx.fill(); }
  if (m.dotT > 0) { ctx.strokeStyle = 'rgba(124,247,140,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y + wobble, m.r + 5, 0, Math.PI*2); ctx.stroke(); }
  const w = Math.max(m.r * 2, m.boss ? 80 : 24);
  const hpPct = Utils.clamp(m.hp / m.maxHp, 0, 1);
  const barY = m.y - m.r - 12;
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(m.x - w/2, barY, w, 5);
  ctx.fillStyle = hpPct > 0.5 ? '#7cf78c' : hpPct > 0.25 ? '#ffd166' : '#ff4ecd';
  ctx.fillRect(m.x - w/2, barY, w * hpPct, 5);
  if (m.maxShield > 0) {
    const shPct = Utils.clamp(m.shield / m.maxShield, 0, 1);
    ctx.fillStyle = 'rgba(155,231,255,.8)'; ctx.fillRect(m.x - w/2, barY - 5, w * shPct, 3);
  }
}

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  let cx, cy;
  if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
  else if (e.changedTouches && e.changedTouches.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
  else { cx = e.clientX; cy = e.clientY; }
  return { x: (cx - rect.left) * W / rect.width, y: (cy - rect.top) * H / rect.height };
}

canvas.addEventListener('mousemove', (e) => {
  const p = getCanvasPos(e);
  state.hoverPos.x = p.x; state.hoverPos.y = p.y;
  let hovered = null;
  for (const t of state.towers) { if (Utils.dist(t, p) < 24) { hovered = t; break; } }
  state.hoveredTower = hovered;
});

function handleClick(e) {
  if (!state.running || state.paused) return;
  const p = getCanvasPos(e);
  let clicked = null;
  for (const t of state.towers) { if (Utils.dist(t, p) < 30) { clicked = t; break; } }
  if (clicked) { state.selectedTower = clicked; state.selectedTowerType = null; UI.showTowerInfo(clicked); UI.renderShop(); UI.switchTab('info'); return; }
  if (state.selectedTowerType) {
    const ok = tryBuildTower(state.selectedTowerType, p.x, p.y);
    if (ok) { state.selectedTowerType = null; UI.renderShop(); }
  } else { state.selectedTower = null; UI.showTowerInfo(null); }
}

canvas.addEventListener('click', handleClick);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleClick(e); }, { passive: false });

let lastTime = performance.now();
function loop(now) {
  const rawDt = (now - lastTime) / 1000; lastTime = now;
  const dt = Math.min(rawDt, 0.05) * state.speed;
  if (state.running && !state.paused) update(dt);
  render();
  if (state.heroes.length) UI.updateSkills();
  requestAnimationFrame(loop);
}

window.GameAPI = {
  state, startWave, loadLevel, buyHero, useSkill, upgradeTower, sellTower, tryBuildTower,
  selectTowerType(type) { state.selectedTower = null; state.selectedTowerType = type; UI.showTowerInfo(null); },
  setSpeed(s) { state.speed = s; },
  togglePause() { state.paused = !state.paused; return state.paused; },
  restartGame(endless = false) { Save.load(); loadLevel(Save.data.lastLevel || 0, endless); state.running = true; UI.hideAllOverlays(); },
  nextLevel() { if (state.levelIndex + 1 < LEVELS.length) { loadLevel(state.levelIndex + 1); state.running = true; } else { UI.showVictory(); } },
  prestige() {
    Save.data.prestige = (Save.data.prestige || 0) + 1;
    Save.save();
    checkAchievement('prestige_1', () => Save.data.prestige >= 1);
    loadLevel(0);
    state.running = true;
    UI.hideAllOverlays();
    UI.showToast('⭐ Престиж ' + Save.data.prestige + '!');
  },
};

requestAnimationFrame(loop);
