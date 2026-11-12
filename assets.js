'use strict';

// ================ ЗВУК ================
const SFX = (() => {
  let ctx = null, enabled = true, ambientGain = null;
  function init() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ambientGain = ctx.createGain();
      ambientGain.gain.value = 0.03;
      ambientGain.connect(ctx.destination);
      startAmbient();
    }
  }
  function startAmbient() {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 60;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.1;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 10;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    osc.connect(ambientGain);
    osc.start(); lfo.start();
  }
  function beep(freq, dur = 0.1, type = 'sine', vol = 0.12, slideTo = null) {
    if (!enabled || !ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  }
  return {
    init, toggle() { enabled = !enabled; return enabled; }, isOn() { return enabled; },
    shoot() { beep(700, 0.04, 'square', 0.04, 400); },
    hit() { beep(200, 0.06, 'sawtooth', 0.06, 80); },
    build() { beep(300, 0.12, 'triangle', 0.12, 500); },
    sell() { beep(500, 0.12, 'triangle', 0.12, 200); },
    upgrade() { beep(400, 0.08, 'sine', 0.12, 800); setTimeout(() => beep(800, 0.12, 'sine', 0.12, 1200), 80); },
    buy() { beep(600, 0.06, 'sine', 0.1, 900); },
    error() { beep(150, 0.15, 'sawtooth', 0.12, 80); },
    waveStart() { beep(300, 0.15, 'triangle', 0.12, 600); },
    waveEnd() { beep(600, 0.12, 'sine', 0.12, 900); setTimeout(() => beep(900, 0.2, 'sine', 0.12, 1200), 120); },
    monsterDie() { beep(120, 0.08, 'sawtooth', 0.08, 60); },
    leak() { beep(150, 0.25, 'sawtooth', 0.15, 60); },
    skill() { beep(800, 0.15, 'sine', 0.15, 1600); },
    boss() { beep(80, 0.4, 'sawtooth', 0.2, 40); setTimeout(() => beep(100, 0.4, 'sawtooth', 0.15, 50), 300); },
    crit() { beep(1200, 0.08, 'sine', 0.15, 2000); },
    achievement() { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sine', 0.13), i * 80)); },
    victory() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'sine', 0.12), i * 130)); },
    defeat() { [400, 350, 300, 200].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'sawtooth', 0.12), i * 180)); },
  };
})();

// ================ БАШНИ (8 штук, 4 уровня) ================
const TOWERS = {
  archer: { name: 'Лучник', icon: '🏹', cost: 50, color: '#4ecbff', projColor: '#4ecbff',
    levels: [
      { dmg: 8, range: 110, rate: 0.55 },
      { dmg: 14, range: 130, rate: 0.45, upgradeCost: 60 },
      { dmg: 22, range: 150, rate: 0.35, upgradeCost: 120 },
      { dmg: 35, range: 170, rate: 0.28, upgradeCost: 240 },
    ], desc: 'Быстрые стрелы' },
  cannon: { name: 'Пушка', icon: '💣', cost: 90, color: '#ff8c42', projColor: '#ff8c42',
    levels: [
      { dmg: 22, range: 130, rate: 1.4, splash: 40 },
      { dmg: 40, range: 145, rate: 1.2, splash: 55, upgradeCost: 110 },
      { dmg: 70, range: 160, rate: 1.0, splash: 70, upgradeCost: 200 },
      { dmg: 110, range: 175, rate: 0.85, splash: 85, upgradeCost: 380 },
    ], desc: 'AoE урон' },
  ice: { name: 'Ледяная', icon: '❄️', cost: 75, color: '#9be7ff', projColor: '#9be7ff',
    levels: [
      { dmg: 5, range: 100, rate: 0.9, slow: 1.5 },
      { dmg: 10, range: 115, rate: 0.8, slow: 2.0, upgradeCost: 90 },
      { dmg: 16, range: 130, rate: 0.7, slow: 2.5, upgradeCost: 160 },
      { dmg: 26, range: 145, rate: 0.6, slow: 3.2, upgradeCost: 320 },
    ], desc: 'Замедляет' },
  lightning: { name: 'Молния', icon: '⚡', cost: 120, color: '#ff4ecd', projColor: '#ff4ecd',
    levels: [
      { dmg: 16, range: 150, rate: 1.1, chain: 2 },
      { dmg: 28, range: 165, rate: 0.95, chain: 3, upgradeCost: 150 },
      { dmg: 45, range: 180, rate: 0.8, chain: 4, upgradeCost: 260 },
      { dmg: 70, range: 200, rate: 0.7, chain: 5, upgradeCost: 480 },
    ], desc: 'Цепная молния' },
  sniper: { name: 'Снайпер', icon: '🎯', cost: 180, color: '#ffd166', projColor: '#ffd166',
    levels: [
      { dmg: 80, range: 280, rate: 2.5 },
      { dmg: 140, range: 300, rate: 2.2, upgradeCost: 220 },
      { dmg: 230, range: 340, rate: 1.8, upgradeCost: 380 },
      { dmg: 380, range: 400, rate: 1.5, upgradeCost: 700 },
    ], desc: 'Огромный урон' },
  poison: { name: 'Ядовитая', icon: '☠️', cost: 100, color: '#7cf78c', projColor: '#7cf78c',
    levels: [
      { dmg: 4, range: 110, rate: 0.8, dot: 3, dotDur: 2 },
      { dmg: 8, range: 125, rate: 0.7, dot: 6, dotDur: 2.5, upgradeCost: 110 },
      { dmg: 14, range: 140, rate: 0.6, dot: 10, dotDur: 3, upgradeCost: 200 },
      { dmg: 22, range: 155, rate: 0.5, dot: 16, dotDur: 3.5, upgradeCost: 380 },
    ], desc: 'Яд (DoT)' },
  tesla: { name: 'Тесла', icon: '🔋', cost: 150, color: '#c7d2fe', projColor: '#c7d2fe',
    levels: [
      { dmg: 12, range: 120, rate: 0.6, chain: 1 },
      { dmg: 22, range: 135, rate: 0.5, chain: 2, upgradeCost: 130 },
      { dmg: 38, range: 150, rate: 0.45, chain: 3, upgradeCost: 240 },
      { dmg: 60, range: 165, rate: 0.4, chain: 4, upgradeCost: 440 },
    ], desc: 'Быстрая цепь' },
  flamethrower: { name: 'Огнемёт', icon: '🔥', cost: 130, color: '#ff6b4a', projColor: '#ff6b4a',
    levels: [
      { dmg: 6, range: 90, rate: 0.2, splash: 30, dot: 2, dotDur: 1.5 },
      { dmg: 10, range: 100, rate: 0.18, splash: 40, dot: 4, dotDur: 2, upgradeCost: 120 },
      { dmg: 16, range: 110, rate: 0.15, splash: 50, dot: 7, dotDur: 2.5, upgradeCost: 220 },
      { dmg: 26, range: 120, rate: 0.13, splash: 60, dot: 12, dotDur: 3, upgradeCost: 420 },
    ], desc: 'Огонь AoE + DoT' },
};

// ================ ГЕРОИ (4 штуки) ================
const HEROES = {
  mage: { name: 'Маг', icon: '🧙', cost: 150, color: '#a855f7',
    skills: {
      Q: { name: 'Огненный шар', icon: '🔥', cd: 6 },
      W: { name: 'Метеор', icon: '☄️', cd: 15 },
      E: { name: 'Щит', icon: '🛡️', cd: 20 },
    }, passive: 'Автоатака' },
  knight: { name: 'Рыцарь', icon: '🛡️', cost: 140, color: '#ffd166',
    skills: {
      Q: { name: 'Вихрь', icon: '⚔️', cd: 5 },
      W: { name: 'Рывок', icon: '💨', cd: 12 },
      E: { name: 'Рёв', icon: '📢', cd: 18 },
    }, passive: 'Танк' },
  archer_hero: { name: 'Лучница', icon: '🏹', cost: 160, color: '#7cf78c',
    skills: {
      Q: { name: 'Залп', icon: '🏹', cd: 5 },
      W: { name: 'Ловушка', icon: '🕸️', cd: 12 },
      E: { name: 'Дождь стрел', icon: '🌧️', cd: 20 },
    }, passive: 'Дальний' },
  cleric: { name: 'Жрица', icon: '✨', cost: 170, color: '#9be7ff',
    skills: {
      Q: { name: 'Лечение', icon: '💚', cd: 8 },
      W: { name: 'Святой свет', icon: '☀️', cd: 14 },
      E: { name: 'Воскрешение', icon: '🕊️', cd: 30 },
    }, passive: 'Лечит базу' },
};

// ================ МОНСТРЫ (12 штук) ================
const MONSTERS = {
  slime: { name: 'Слизь', hp: 30, speed: 45, color: '#7cf78c', r: 12, reward: 5, ico: '🟢' },
  bat: { name: 'Летучая', hp: 20, speed: 80, color: '#b388ff', r: 10, reward: 6, ico: '🦇' },
  orc: { name: 'Орк', hp: 70, speed: 35, color: '#ff6b6b', r: 16, reward: 10, ico: '👹' },
  ghost: { name: 'Призрак', hp: 45, speed: 60, color: '#c7d2fe', r: 13, reward: 8, ico: '👻' },
  golem: { name: 'Голем', hp: 200, speed: 22, color: '#9ca3af', r: 22, reward: 25, ico: '🗿' },
  demon: { name: 'Демон', hp: 140, speed: 50, color: '#ff4ecd', r: 18, reward: 30, ico: '😈' },
  spider: { name: 'Паук', hp: 55, speed: 65, color: '#a855f7', r: 14, reward: 12, ico: '🕷️' },
  skeleton: { name: 'Скелет', hp: 40, speed: 55, color: '#e6e0ff', r: 12, reward: 7, ico: '💀' },
  wolf: { name: 'Волк', hp: 60, speed: 90, color: '#8b8b8b', r: 14, reward: 11, ico: '🐺' },
  zombie: { name: 'Зомби', hp: 80, speed: 30, color: '#6b8e23', r: 16, reward: 9, ico: '🧟' },
  wizard: { name: 'Тёмный маг', hp: 65, speed: 45, color: '#8b00ff', r: 15, reward: 15, ico: '🧟‍♂️' },
  // Боссы
  miniboss: { name: 'Мини-босс', hp: 500, speed: 38, color: '#ff8c42', r: 26, reward: 80, ico: '👺', boss: true, shield: 0.3 },
  boss: { name: 'ДРАКОН', hp: 1200, speed: 30, color: '#ff4d4d', r: 35, reward: 200, ico: '🐉', boss: true, shield: 0.2 },
  megaboss: { name: 'ДРЕВНИЙ', hp: 3000, speed: 25, color: '#8b00ff', r: 45, reward: 500, ico: '👾', boss: true, shield: 0.4 },
};

// ================ УРОВНИ ================
const LEVELS = [
  { name: 'Зелёные поля',
    path: [[0,340],[240,340],[240,140],[560,140],[560,540],[840,540],[840,340],[1200,340]],
    waves: 10, monsters: ['slime','bat'], speed: 1, startGold: 150, startHp: 20,
    bgColor: '#0a1f0a', accent: '#7cf78c' },
  { name: 'Тёмный лес',
    path: [[0,120],[340,120],[340,560],[620,560],[620,220],[980,220],[980,400],[1200,400]],
    waves: 12, monsters: ['slime','bat','orc','ghost','skeleton'], speed: 1.15, startGold: 180, startHp: 20,
    bgColor: '#1a0a2e', accent: '#a855f7' },
  { name: 'Пепельные земли',
    path: [[0,540],[180,540],[180,180],[520,180],[520,380],[760,380],[760,140],[1200,140]],
    waves: 14, monsters: ['orc','ghost','golem','spider','demon','wolf'], speed: 1.3, startGold: 200, startHp: 25,
    bgColor: '#2a0a0a', accent: '#ff6b6b' },
  { name: 'Логово дракона',
    path: [[0,340],[300,340],[300,80],[600,80],[600,600],[900,600],[900,300],[1200,300]],
    waves: 16, monsters: ['orc','golem','demon','spider','wolf','zombie','wizard'], speed: 1.4, startGold: 250, startHp: 30,
    bgColor: '#1a0505', accent: '#ff4d4d' },
];

// ================ ДОСТИЖЕНИЯ (15 штук) ================
const ACHIEVEMENTS = [
  { id: 'first_kill', name: 'Первая кровь', ico: '🩸', desc: 'Убей первого монстра', reward: 10 },
  { id: 'kill_50', name: 'Истребитель', ico: '💀', desc: 'Убей 50 монстров', reward: 25 },
  { id: 'kill_500', name: 'Мясник', ico: '⚔️', desc: 'Убей 500 монстров', reward: 100 },
  { id: 'build_10', name: 'Строитель', ico: '🏗️', desc: 'Построй 10 башен', reward: 20 },
  { id: 'build_50', name: 'Архитектор', ico: '🏰', desc: 'Построй 50 башен', reward: 100 },
  { id: 'boss_kill', name: 'Убийца боссов', ico: '🐉', desc: 'Убей первого босса', reward: 50 },
  { id: 'boss_3', name: 'Гроза драконов', ico: '🔥', desc: 'Убей 3 боссов', reward: 150 },
  { id: 'level_1', name: 'Новичок', ico: '🌟', desc: 'Пройди 1 уровень', reward: 30 },
  { id: 'level_all', name: 'Защитник', ico: '🏆', desc: 'Пройди все 4 уровня', reward: 200 },
  { id: 'hero_all', name: 'Полный отряд', ico: '👥', desc: 'Найми всех 4 героев', reward: 50 },
  { id: 'rich', name: 'Богач', ico: '💰', desc: 'Накопи 1000 золота', reward: 30 },
  { id: 'upgrade_10', name: 'Инженер', ico: '🔧', desc: 'Сделай 10 апгрейдов', reward: 40 },
  { id: 'no_leak', name: 'Безупречно', ico: '✨', desc: 'Пройди уровень без потерь HP', reward: 75 },
  { id: 'endless_10', name: 'Бесконечность', ico: '♾️', desc: 'Пройди 10 волн в endless', reward: 100 },
  { id: 'prestige_1', name: 'Перерождение', ico: '⭐', desc: 'Сделай первый престиж', reward: 250 },
];

// ================ УТИЛИТЫ ================
const Utils = {
  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },
  lerp(a, b, t) { return a + (b - a) * t; },
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
  rand(min, max) { return min + Math.random() * (max - min); },
  randInt(min, max) { return Math.floor(this.rand(min, max + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  pointOnPath(path, t) {
    let total = 0, lens = [];
    for (let i = 0; i < path.length - 1; i++) {
      const l = Math.hypot(path[i+1][0] - path[i][0], path[i+1][1] - path[i][1]);
      lens.push(l); total += l;
    }
    let d = t * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) {
        const k = d / lens[i];
        return { x: this.lerp(path[i][0], path[i+1][0], k), y: this.lerp(path[i][1], path[i+1][1], k) };
      }
      d -= lens[i];
    }
    return { x: path.at(-1)[0], y: path.at(-1)[1] };
  },
  pathLength(path) {
    let t = 0;
    for (let i = 0; i < path.length - 1; i++)
      t += Math.hypot(path[i+1][0] - path[i][0], path[i+1][1] - path[i][1]);
    return t;
  },
  distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx*dx + dy*dy;
    let t = len2 === 0 ? 0 : ((px-x1)*dx + (py-y1)*dy) / len2;
    t = this.clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t*dx), py - (y1 + t*dy));
  },
};

// ================ СОХРАНЕНИЕ ================
const Save = {
  key: 'shadow_defense_3_save',
  data: { unlockedLevels: 1, prestige: 0, achievements: [], totalKills: 0, endlessBest: 0, dailyBonus: 0, lastDailyDate: '', lastLevel: 0 },
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...this.data, ...parsed };
        this.data.achievements = this.data.achievements || [];
      }
    } catch(e) {}
    return this.data;
  },
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch(e) {}
  },
  reset() { try { localStorage.removeItem(this.key); } catch(e) {} },
};

Save.load();
