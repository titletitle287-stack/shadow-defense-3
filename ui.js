'use strict';

const UI = (() => {
  const $ = (id) => document.getElementById(id);
  let toastTimer = null;

  function log(msg, type = '') {
    const el = $('log');
    if (!el) return;
    const div = document.createElement('div');
    div.className = type;
    div.textContent = msg;
    el.insertBefore(div, el.firstChild);
    while (el.children.length > 10) el.lastChild.remove();
  }

  function showToast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
  }

  function setWeather(type) {
    const el = $('weather');
    el.className = 'weather';
    if (type !== 'clear') el.classList.add(type);
  }

  function updateHUD() {
    const s = GameAPI.state;
    $('gold').textContent = Math.floor(s.gold);
    $('hp').textContent = s.hp;
    $('wave').textContent = s.wave;
    $('maxWave').textContent = s.endless ? '♾' : (s.maxWave || 10);
    $('kills').textContent = s.kills;
    $('prestige').textContent = s.prestige;
    renderShop();
    renderHeroes();
  }

  function renderShop() {
    const s = GameAPI.state;
    const list = $('towerList');
    list.innerHTML = '';
    for (const [key, cfg] of Object.entries(TOWERS)) {
      const card = document.createElement('div');
      const canAfford = s.gold >= cfg.cost;
      const selected = s.selectedTowerType === key;
      card.className = 'card' + (canAfford ? '' : ' disabled') + (selected ? ' sel' : '');
      card.innerHTML = '<span class="ico">' + cfg.icon + '</span>' +
        '<div class="info"><span class="name">' + cfg.name + '</span>' +
        '<span class="sub">' + cfg.desc + '</span></div>' +
        '<span class="cost">💰' + cfg.cost + '</span>';
      card.onclick = () => { GameAPI.selectTowerType(key); renderShop(); };
      list.appendChild(card);
    }
  }

  function renderHeroes() {
    const s = GameAPI.state;
    const list = $('heroList');
    list.innerHTML = '';
    for (const [key, cfg] of Object.entries(HEROES)) {
      const card = document.createElement('div');
      const owned = s.heroes.some(h => h.type === key);
      const canAfford = s.gold >= cfg.cost;
      card.className = 'card' + ((canAfford || owned) ? '' : ' disabled') + (owned ? ' sel' : '');
      card.innerHTML = '<span class="ico">' + cfg.icon + '</span>' +
        '<div class="info"><span class="name">' + cfg.name + (owned ? ' ✓' : '') + '</span>' +
        '<span class="sub">' + (owned ? 'Нанят' : cfg.passive) + '</span></div>' +
        '<span class="cost">' + (owned ? '✓' : '💰' + cfg.cost) + '</span>';
      if (!owned) card.onclick = () => { GameAPI.buyHero(key); renderHeroes(); };
      list.appendChild(card);
    }
    renderSkills();
  }

  function renderSkills() {
    const s = GameAPI.state;
    const bar = $('skillBar');
    bar.innerHTML = '';
    if (s.heroes.length === 0) {
      bar.innerHTML = '<div style="opacity:.5;font-size:9px;padding:6px">Купи героя</div>';
      return;
    }
    const hero = s.heroes[0];
    const cfg = HEROES[hero.type];
    for (const key of ['Q','W','E']) {
      const sk = cfg.skills[key];
      if (!sk) continue;
      const div = document.createElement('div');
      div.className = 'skill';
      div.dataset.key = key;
      div.dataset.hero = hero.type;
      div.innerHTML = '<span class="key">' + key + '</span><span>' + sk.icon + '</span>';
      div.onclick = () => GameAPI.useSkill(hero.type, key);
      bar.appendChild(div);
    }
  }

  function updateSkills() {
    const s = GameAPI.state;
    document.querySelectorAll('.skill').forEach(el => {
      const key = el.dataset.key, ht = el.dataset.hero;
      const cdLeft = s.heroSkills[ht + key] || 0;
      if (cdLeft > 0) {
        el.classList.add('cool'); el.classList.remove('ready');
        let cdEl = el.querySelector('.cd');
        if (!cdEl) { cdEl = document.createElement('div'); cdEl.className = 'cd'; el.appendChild(cdEl); }
        cdEl.textContent = cdLeft.toFixed(1);
      } else {
        el.classList.remove('cool'); el.classList.add('ready');
        const cdEl = el.querySelector('.cd'); if (cdEl) cdEl.remove();
      }
    });
  }

  function showTowerInfo(tower) {
    const box = $('towerInfo');
    if (!tower) { box.innerHTML = 'Кликни на башню'; $('btnSell').disabled = true; return; }
    const cfg = TOWERS[tower.type];
    const next = cfg.levels[tower.level + 1];
    const canUpgrade = next && GameAPI.state.gold >= next.upgradeCost;
    box.innerHTML = '<div style="font-size:14px;margin-bottom:4px">' + cfg.icon + ' <b>' + cfg.name + '</b></div>' +
      '<b>Ур:</b> ' + (tower.level+1) + '/4 ' + '★'.repeat(tower.level) + '<br>' +
      '<b>Урон:</b> ' + tower.dmg + '<br>' +
      '<b>Радиус:</b> ' + tower.range + '<br>' +
      (next ? '<b>След:</b> ' + next.dmg + 'dmg · ' + next.upgradeCost + '💰' : '<b>МАКС</b>') +
      (next ? '<button id="upgBtn" style="width:100%;padding:6px;border-radius:6px;border:none;font-weight:800;cursor:pointer;background:' + (canUpgrade ? 'linear-gradient(90deg,#a855f7,#4ecbff)' : '#333') + ';color:#05010f;margin-top:6px;font-size:9px" ' + (canUpgrade ? '' : 'disabled') + '>⬆ УЛУЧШИТЬ</button>' : '');
    const btn = box.querySelector('#upgBtn');
    if (btn && canUpgrade) btn.onclick = () => { GameAPI.upgradeTower(tower); showTowerInfo(tower); };
    $('btnSell').disabled = false;
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tabContent').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });

  function hideAllOverlays() {
    ['menu','tutorial','achievementsScreen','gameOver','levelEnd','victory'].forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
  }

  function showLevelEnd() {
    const s = GameAPI.state;
    $('levelEndTitle').textContent = '🏆 ' + s.levelData.name + ' пройден!';
    $('levelEndRewards').innerHTML = '<b>Волн:</b> ' + s.maxWave + '<br><b>Убито:</b> ' + s.kills + '<br><b>HP:</b> ' + s.hp + '/' + s.maxHp;
    $('levelEnd').classList.remove('hidden');
  }

  function showGameOver() { $('gameOver').classList.remove('hidden'); }

  function showVictory() {
    const s = GameAPI.state;
    $('victoryRewards').innerHTML = '<b>Все уровни пройдены!</b><br><b>Убито:</b> ' + s.totalKills;
    $('victory').classList.remove('hidden');
  }

  function renderAchievements() {
    const list = $('achList');
    list.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const unlocked = Save.data.achievements.includes(a.id);
      const item = document.createElement('div');
      item.className = 'achItem ' + (unlocked ? 'unlocked' : 'locked');
      item.innerHTML = '<span class="ico">' + a.ico + '</span>' +
        '<div style="flex:1"><b>' + a.name + '</b><br><span style="opacity:.6;font-size:9px">' + a.desc + '</span></div>' +
        (unlocked ? '✅' : '💰' + a.reward);
      list.appendChild(item);
    }
  }

  function bindButtons() {
    $('btnPlay').onclick = () => {
      SFX.init(); hideAllOverlays();
      Save.data.lastLevel = 0;
      Save.save();
      GameAPI.loadLevel(0);
      GameAPI.state.running = true;
      log('▶ Игра началась', 'ok');
    };
    $('btnContinue').onclick = () => {
      SFX.init(); hideAllOverlays();
      GameAPI.loadLevel(Save.data.lastLevel || 0);
      GameAPI.state.running = true;
    };
    $('btnEndless').onclick = () => {
      SFX.init(); hideAllOverlays();
      GameAPI.loadLevel(0, true);
      GameAPI.state.running = true;
      showToast('♾ ENDLESS MODE');
    };
    $('btnTutorial').onclick = () => { $('menu').classList.add('hidden'); $('tutorial').classList.remove('hidden'); };
    $('btnCloseTut').onclick = () => { $('tutorial').classList.add('hidden'); $('menu').classList.remove('hidden'); };
    $('btnAchievements').onclick = () => { $('menu').classList.add('hidden'); renderAchievements(); $('achievementsScreen').classList.remove('hidden'); };
    $('btnCloseAch').onclick = () => { $('achievementsScreen').classList.add('hidden'); $('menu').classList.remove('hidden'); };
    $('btnMenu').onclick = () => { $('menu').classList.remove('hidden'); GameAPI.state.paused = true; };

    $('btnStartWave').onclick = () => { if (GameAPI.state.running) GameAPI.startWave(); };
    $('btnSell').onclick = () => { const t = GameAPI.state.selectedTower; if (t) { GameAPI.sellTower(t); showTowerInfo(null); } };
    $('btnSpeed').onclick = () => {
      const s = GameAPI.state;
      if (s.speed === 1) { s.speed = 2; $('btnSpeed').textContent = '2x'; }
      else if (s.speed === 2) { s.speed = 3; $('btnSpeed').textContent = '3x'; }
      else { s.speed = 1; $('btnSpeed').textContent = '1x'; }
    };
    $('btnPause').onclick = () => { const p = GameAPI.togglePause(); $('btnPause').textContent = p ? '▶' : '⏸'; };
    $('btnSound').onclick = () => { const on = SFX.toggle(); $('btnSound').textContent = on ? '🔊' : '🔇'; };
    $('btnNextLevel').onclick = () => { hideAllOverlays(); GameAPI.nextLevel(); };
    $('btnRestart').onclick = () => { hideAllOverlays(); GameAPI.restartGame(false); };
    $('btnPlayAgain').onclick = () => { hideAllOverlays(); GameAPI.restartGame(false); };
    $('btnPrestige').onclick = () => { GameAPI.prestige(); };

    document.addEventListener('keydown', (e) => {
      if (!GameAPI.state.running) return;
      const s = GameAPI.state;
      if (s.heroes.length > 0) {
        const h = s.heroes[0];
        if (e.key.toLowerCase() === 'q') GameAPI.useSkill(h.type, 'Q');
        if (e.key.toLowerCase() === 'w') GameAPI.useSkill(h.type, 'W');
        if (e.key.toLowerCase() === 'e') GameAPI.useSkill(h.type, 'E');
      }
      if (e.key === ' ') { e.preventDefault(); $('btnStartWave').click(); }
      if (e.key.toLowerCase() === 'p') $('btnPause').click();
    });
  }

  function checkDaily() {
    const today = new Date().toDateString();
    if (Save.data.lastDailyDate !== today) {
      Save.data.lastDailyDate = today;
      Save.data.dailyBonus = 100;
      Save.save();
      setTimeout(() => showToast('🎁 Ежедневный бонус: +100💰'), 1500);
    }
  }

  function init() {
    bindButtons();
    if (Save.data.unlockedLevels > 0 && Save.data.lastLevel !== undefined) {
      $('btnContinue').style.display = 'block';
      $('btnEndless').style.display = 'block';
    }
    checkDaily();
    log('⚔️ Shadow Defense 3.0', 'info');
  }

  return { log, updateHUD, renderShop, renderHeroes, renderSkills, updateSkills, showTowerInfo, switchTab, showLevelEnd, showGameOver, showVictory, hideAllOverlays, init, showToast, setWeather };
})();

window.addEventListener('load', () => {
  setTimeout(() => {
    if (!GameAPI.state.levelData) GameAPI.loadLevel(0);
    UI.init();
  }, 100);
});
