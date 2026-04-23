const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const stageInfoEl = document.getElementById('stageInfo');
const scoreInfoEl = document.getElementById('scoreInfo');
const loveInfoEl = document.getElementById('loveInfo');
const pauseBtn = document.getElementById('pauseBtn');
const shopBtn = document.getElementById('shopBtn');
const heartCountEl = document.getElementById('heartCount');
const statusBtn = document.getElementById('statusBtn');
const fusionBtn = document.getElementById('fusionBtn');
const overlayEl = document.getElementById('overlay');

const W = canvas.width;
const H = canvas.height;
const STORAGE_KEY = 'yumi_brick_breaker_stage_shop_v141_r4fusion';

const THEMES = [
  { top: '#1e1b4b', bottom: '#0f172a', block: '#f472b6', number: '#fbcfe8', boss: '#fb7185', accent: '#f9a8d4', line: '#fdf2f8' },
  { top: '#082f49', bottom: '#0f172a', block: '#38bdf8', number: '#bae6fd', boss: '#60a5fa', accent: '#7dd3fc', line: '#e0f2fe' },
  { top: '#312e81', bottom: '#0f172a', block: '#a78bfa', number: '#ddd6fe', boss: '#c084fc', accent: '#c4b5fd', line: '#f5f3ff' },
  { top: '#3f1d2e', bottom: '#0f172a', block: '#fb7185', number: '#fecdd3', boss: '#f97316', accent: '#fda4af', line: '#fff1f2' },
  { top: '#1f2937', bottom: '#0f172a', block: '#f8fafc', number: '#cbd5e1', boss: '#f59e0b', accent: '#fde68a', line: '#ffffff' }
];

const BRICK = {
  cols: 8,
  gap: 4,
  height: 20,
  top: 38,
};
BRICK.width = Math.floor((W - 8 - BRICK.gap * (BRICK.cols - 1)) / BRICK.cols);
BRICK.left = 4;
const ROW_STEP = BRICK.height + BRICK.gap;
const START_ROWS = 6;
const BASE_PADDLE = { width: 92, height: 13, y: H - 112 };
const BALL_RADIUS = 7;
const BASE_BALL_SPEED = 5.2;
const LOVE_DELAY = 3000;
const LASER_INTERVAL = 7000;
const MISSILE_INTERVAL = 380;
const MAX_STAGE_ROW_INTERVAL = 8000;
const CORE_DROP_CHANCE = 0.025;

const save = loadSave();
const state = {
  stage: 1,
  score: 0,
  totalLove: save.totalLove || 0,
  runLove: 0,
  destroyedThisStage: 0,
  destroyedTotal: 0,
  status: 'start', // start, playing, paused, shop, status, choose, love, gameover1, gameover2
  previousStatus: 'start',
  rowTimer: 0,
  lastTime: 0,
  bossStage: false,
  bossSpawnAnim: 0,
  bossHp: 0,
  bossMaxHp: 0,
  hearts: 0,
  shopCharge: 0,
  comboTextUntil: 0,
  comboText: '',
  overlaysLocked: false,
  particles: [],
  floatingTexts: [],
  missiles: [],
  beams: [],
  lastVerticalAt: 0,
  lastHorizontalAt: 0,
  lastMissileAt: 0,
  pauseRequested: false,
  loveUntil: 0,
  gameOverTapCount: 0,
  selectedCoreUntil: 0,
  shopOffers: [],
  rerollCost: 1,
  heartCycleProgress: 0,
  heartScheduledRows: [],
  firstCoreGranted: false,
  diseaseArmed: false,
  diseaseBallUid: null,
  lastFusionMissileAt: 0,
  lastFusionNuclearAt: 0,
  lastFusionBarrierAt: 0,
  barrierUntil: 0,
  returnToShopAfterFusion: false,
  pendingInstantFusion: false,
  itemLevels: {
    triangle: 0,
    long: 0,
    vlaser: 0,
    hlaser: 0,
  },
  fusionLevels: {
    disease: 0,
    missile: 0,
    fshield: 0,
    nuclear: 0,
    barrier: 0,
    laserboost: 0,
  },
  fusionRegistry: {
    disease: false,
    missile: false,
    fshield: false,
    nuclear: false,
    barrier: false,
    laserboost: false,
  },
  upgrades: {
    crit: 0,
    attack: 0,
    maxBallBonus: 0,
    giantBall: 0,
    speed: 0,
    leftDrone: 0,
    rightDrone: 0,
    shield: 0,
  },
};

const paddle = {
  x: W / 2 - BASE_PADDLE.width / 2,
  y: BASE_PADDLE.y,
  width: BASE_PADDLE.width,
  height: BASE_PADDLE.height,
};

let bricks = [];
let balls = [];
let drones = [];
let items = [];
let debuffs = [];


function updateHUD() {
  stageInfoEl.textContent = `STAGE ${state.stage}`;
  scoreInfoEl.textContent = `점수 ${Math.floor(state.score)}`;
  if (loveInfoEl) loveInfoEl.textContent = `사랑 ${state.totalLove}`;
  heartCountEl.textContent = String(state.hearts);

  const blocked = ['choose','love','gameover1','gameover2','start','shop','status','paused','fusion'].includes(state.status);
  const canOpenShop = state.hearts >= 5 && state.shopCharge >= 5 && !blocked;
  shopBtn.style.opacity = canOpenShop ? '1' : '0.45';
  shopBtn.style.transform = canOpenShop ? 'scale(1)' : 'scale(0.96)';
  if (state.hearts >= 5) shopBtn.classList.remove('disabled');
  else shopBtn.classList.add('disabled');

  const canFuse = eligibleFusionDefs().some((def) => !state.fusionRegistry[def.id]);
  fusionBtn.classList.toggle('ready', canFuse);
}


function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function persistSave() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    totalLove: state.totalLove,
  }));
}

function theme() {
  return THEMES[Math.floor((state.stage - 1) / 10) % THEMES.length];
}

function nowMs() { return performance.now(); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rand(min, max) { return min + Math.random() * (max - min); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }


function currentHeartPerCycleCount() {
  if (state.stage >= 200) return 5;
  if (state.stage >= 100) return 4;
  return 3;
}

function pickHeartRowsPerCycle() {
  const set = new Set();
  const target = Math.min(5, currentHeartPerCycleCount());
  while (set.size < target) set.add(1 + Math.floor(Math.random() * 5));
  return [...set];
}

const FUSION_DEFS = [
  { id: 'disease', pair: ['triangle', 'vlaser'], name: '질병' },
  { id: 'missile', pair: ['triangle', 'hlaser'], name: '미사일' },
  { id: 'fshield', pair: ['triangle', 'long'], name: '실드' },
  { id: 'nuclear', pair: ['long', 'vlaser'], name: '핵융합' },
  { id: 'barrier', pair: ['long', 'hlaser'], name: '장벽' },
  { id: 'laserboost', pair: ['vlaser', 'hlaser'], name: '레이저 강화' },
];
const FUSION_NAME = Object.fromEntries(FUSION_DEFS.map((d) => [d.id, d.name]));
const BASE_CORE_NAMES = { triangle: '세모', long: '긴 패들', vlaser: '세로 번개', hlaser: '가로 번개' };
let BALL_UID_SEQ = 1;

function mainFusionText() {
  const parts = Object.entries(state.fusionLevels)
    .filter(([, lv]) => lv > 0)
    .map(([id, lv]) => `${FUSION_NAME[id]} Lv${lv}`);
  return parts.length ? `융합: ${parts.join(' · ')}` : '융합 없음';
}

function coreLevelText() {
  const entries = [];
  if (state.itemLevels.triangle) entries.push(`세모 Lv.${state.itemLevels.triangle}`);
  if (state.itemLevels.long) entries.push(`패들 Lv.${state.itemLevels.long}`);
  if (state.itemLevels.vlaser) entries.push(`세로 Lv.${state.itemLevels.vlaser}`);
  if (state.itemLevels.hlaser) entries.push(`가로 Lv.${state.itemLevels.hlaser}`);
  return entries.length ? entries.join(' · ') : '코어 없음';
}

function fusionDefsAvailable() {
  return FUSION_DEFS.filter((d) => state.fusionRegistry[d.id]);
}

function randomCoreType() {
  const pool = ['triangle', 'long', 'vlaser', 'hlaser', ...fusionDefsAvailable().map((d) => d.id)];
  return choice(pool);
}

function shieldCapacity() {
  return Math.max(10, state.fusionLevels.fshield + 1);
}

function laserBoostDamage() {
  return state.fusionLevels.laserboost > 0 ? state.fusionLevels.laserboost + 1 : 1;
}

function nuclearCooldownMs() { return Math.max(3000, 13000 - state.fusionLevels.nuclear * 1000); }
function barrierCooldownMs() { return Math.max(3000, 13000 - state.fusionLevels.barrier * 1000); }
function barrierDurationMs() { return 1000 + Math.max(0, state.fusionLevels.barrier - 1) * 200; }
function missileDamage() { return state.fusionLevels.missile * 0.5; }
function diseaseDps() { return state.fusionLevels.disease; }
function shieldFusionCap() { return state.fusionLevels.fshield + 1; }
function coreDisplayName(type) { return BASE_CORE_NAMES[type] || FUSION_NAME[type] || type; }

function getFusionDefByPair(a, b) {
  const pair = [a, b].sort().join('|');
  return FUSION_DEFS.find((d) => d.pair.slice().sort().join('|') === pair) || null;
}


function spawnCoreDropFromBrick(brick) {
  items.push({
    x: brick.x + brick.width / 2,
    y: brick.y + brick.height / 2,
    vy: 1.65,
    vx: rand(-0.35, 0.35),
    wobble: rand(0, Math.PI * 2),
    rotation: rand(-0.2, 0.2),
    spin: rand(-0.04, 0.04),
    type: randomCoreType(),
    size: 23,
    collectAfter: nowMs() + 700,
  });
}

function attackPower() { return 1 + state.upgrades.attack * 0.25; }
function critChance() { return state.upgrades.crit * 0.05; }
function ballSpeed() { return BASE_BALL_SPEED + state.upgrades.speed * 0.5; }
function shieldCount() { return state.upgrades.shield || 0; }
function longMultiplier() {
  const lv = state.itemLevels.long;
  if (lv <= 0) return 1;
  return 1 + (3.55 * lv) / 10; // Lv10 => x4.55 near full width
}
function maxBallCount() {
  const base = Math.max(2, state.itemLevels.triangle + 1);
  return base + (state.upgrades.maxBallBonus || 0);
}

function splitCountForLevel() {
  const lv = state.itemLevels.triangle;
  if (lv <= 0) return 0;
  return lv + 1 + (state.upgrades.maxBallBonus || 0);
}
function lightningCount(lv) {
  if (lv <= 0) return 0;
  if (lv >= 10) return 5;
  if (lv >= 7) return 4;
  if (lv >= 5) return 3;
  if (lv >= 3) return 2;
  return 1;
}
function dronePower(side) {
  const v = side === 'left' ? state.upgrades.leftDrone : state.upgrades.rightDrone;
  return v * 0.5;
}

function isGiantBall(ball) {
  return ball.r > BALL_RADIUS * 1.5;
}



function bossNumber() { return Math.floor(state.stage / 10); }
function bossDebuffCount() {
  const n = bossNumber();
  if (n >= 121) return 12;
  if (n >= 111) return 10;
  if (n >= 101) return 10;
  if (n >= 11) return Math.min(10, Math.floor((n - 1) / 10));
  return 0;
}

function bossReinforcementCount() {
  const n = bossNumber();
  if (n >= 121) return 12;
  if (n >= 111) return 10;
  return 5;
}
function bossDebuffInterval() {
  return bossNumber() >= 121 ? 1500 : 2000;
}
function strongestBlockHp() {
  const plan = currentNumberBlockPlan();
  return Math.max(1, plan.hp);
}

function rowIntervalMs() {
  if (state.stage >= 250) return 500;
  if (state.stage >= 200) return 700;
  if (state.stage >= 100) return 1000;
  if (state.stage >= 70) return 2000;
  const bucket = Math.floor((state.stage - 1) / 10);
  return Math.max(3000, 8000 - bucket * 1000);
}

function currentNumberBlockPlan() {
  if (state.stage === 1) return { hp: 1, count: 0 };
  const cycleIndex = state.stage - 2;
  return {
    hp: 2 + Math.floor(cycleIndex / 6),
    count: Math.min(BRICK.cols, 1 + (cycleIndex % 6)),
  };
}

function addFloatingText(text, x, y, color = '#ffffff', size = 16) {
  state.floatingTexts.push({ text, x, y, color, size, until: nowMs() + 900 });
}

function addParticles(x, y, color, count = 12, speed = 2.4) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const s = rand(0.4, speed);
    state.particles.push({ x, y, vx: Math.cos(angle) * s, vy: Math.sin(angle) * s, size: rand(2, 4), color, until: nowMs() + rand(300, 700) });
  }
}

function makeBall(x, y, angle = -Math.PI / 2) {
  const speed = ballSpeed();
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: BALL_RADIUS,
    held: false,
    paddleHits: 0,
    skipSplitUntil: 0,
    bombReady: false,
    touchingIds: new Set(),
    uid: BALL_UID_SEQ++,
    disease: false,
  };
}

function resetPaddle() {
  paddle.width = BASE_PADDLE.width * longMultiplier();
  paddle.height = BASE_PADDLE.height;
  paddle.x = clamp(paddle.x, 0, W - paddle.width);
}

function syncHeldBalls() {
  const held = balls.filter((b) => b.held);
  if (!held.length) return;
  const center = paddle.x + paddle.width / 2;
  const spread = Math.min(10, paddle.width / 6);
  held.forEach((ball, idx) => {
    const offset = (idx - (held.length - 1) / 2) * spread;
    ball.x = center + offset;
    ball.y = paddle.y - 10;
    ball.vx = 0;
    ball.vy = 0;
  });
}

function launchHeldBalls(targetX, targetY) {
  const held = balls.filter((b) => b.held);
  if (!held.length) return;
  let dx = targetX - (paddle.x + paddle.width / 2);
  let dy = targetY - paddle.y;
  if (dy > -30) dy = -30;
  const baseAngle = Math.atan2(dy, dx);
  const fan = held.length > 1 ? Math.min(Math.PI / 3, held.length * 0.08) : 0;
  held.forEach((ball, idx) => {
    const offset = held.length > 1 ? (-fan / 2) + (fan * idx) / (held.length - 1) : 0;
    ball.held = false;
    const speed = ballSpeed();
    ball.vx = Math.cos(baseAngle + offset) * speed;
    ball.vy = Math.sin(baseAngle + offset) * speed;
  });
  state.status = 'playing';
}

let BRICK_UID_SEQ = 1;

function createBrick(col, row, type = 'normal', hp = 1) {
  const x = BRICK.left + col * (BRICK.width + BRICK.gap);
  const y = BRICK.top + row * ROW_STEP;
  return {
    x,
    y,
    col,
    row,
    width: BRICK.width,
    height: BRICK.height,
    type,
    hp,
    maxHp: hp,
    uid: BRICK_UID_SEQ++,
  };
}

function allBlocksCleared() {
  return bricks.every((b) => b.destroyed || b.type === 'boss');
}

function createStageRows() {
  bricks = [];
  resetPaddle();
  state.heartCycleProgress = 0;
  state.heartScheduledRows = pickHeartRowsPerCycle();
  const heartCol = Math.floor(rand(0, BRICK.cols));
  const numberPlan = currentNumberBlockPlan();
  const protectedCols = new Set();
  if (numberPlan.count > 0) {
    while (protectedCols.size < numberPlan.count) protectedCols.add(Math.floor(rand(0, BRICK.cols)));
  }
  for (let r = 0; r < START_ROWS; r += 1) {
    for (let c = 0; c < BRICK.cols; c += 1) {
      let type = 'normal';
      let hp = 1;
      if (r === 0 && c === heartCol) {
        type = 'heart';
      } else if (protectedCols.has(c) && r >= START_ROWS - 2) {
        type = 'number';
        hp = numberPlan.hp;
      }
      bricks.push(createBrick(c, r, type, hp));
    }
  }
}

function maybeMarkNewRowHeart(newRowBricks) {
  state.heartCycleProgress += 1;
  if (state.heartScheduledRows.includes(state.heartCycleProgress) && newRowBricks.length) {
    const nonHeart = newRowBricks.filter((b) => b.type !== 'heart');
    const target = choice(nonHeart.length ? nonHeart : newRowBricks);
    target.type = 'heart';
    target.hp = 1;
    target.maxHp = 1;
  }
  if (state.heartCycleProgress >= 5) {
    state.heartCycleProgress = 0;
    state.heartScheduledRows = pickHeartRowsPerCycle();
  }
}

function createBossStage() {
  if (bricks.some((b) => !b.destroyed && b.type === 'boss')) return;
  const hp = (state.stage + 10);
  state.bossMaxHp = hp;
  state.bossHp = hp;
  const spawnY = BRICK.top - 3 * ROW_STEP;
  bricks.push({
    x: BRICK.left,
    y: spawnY,
    targetY: BRICK.top,
    width: W - 8,
    height: BRICK.height * 3 + BRICK.gap * 2,
    type: 'boss',
    hp,
    maxHp: hp,
    destroyed: false,
    uid: BRICK_UID_SEQ++,
    hitCooldownUntil: 0,
    lastDebuffAt: 0,
  });
}

function initStage() {
  state.rowTimer = 0;
  state.bossStage = state.stage % 10 === 0;
  state.destroyedThisStage = 0;
  if (!balls.length) {
    balls = [makeBall(paddle.x + paddle.width / 2, paddle.y - 12)];
    balls[0].held = true;
  }
  syncHeldBalls();
  updateHUD();
}

function fullReset() {
  state.stage = 1;
  state.score = 0;
  state.runLove = 0;
  state.destroyedThisStage = 0;
  state.destroyedTotal = 0;
  state.status = 'start';
  state.previousStatus = 'start';
  state.lastVerticalAt = nowMs();
  state.lastHorizontalAt = nowMs();
  state.lastMissileAt = nowMs();
  state.gameOverTapCount = 0;
  state.shopOffers = [];
  state.rerollCost = 1;
  state.heartCycleProgress = 0;
  state.heartScheduledRows = pickHeartRowsPerCycle();
  state.hearts = 0;
  state.shopCharge = 0;
  state.firstCoreGranted = false;
  state.diseaseArmed = false;
  state.diseaseBallUid = null;
  state.lastFusionMissileAt = 0;
  state.lastFusionNuclearAt = 0;
  state.lastFusionBarrierAt = 0;
  state.barrierUntil = 0;
  state.returnToShopAfterFusion = false;
  state.pendingInstantFusion = false;
  state.itemLevels = { triangle: 0, long: 0, vlaser: 0, hlaser: 0 };
  state.fusionLevels = { disease: 0, missile: 0, fshield: 0, nuclear: 0, barrier: 0, laserboost: 0 };
  state.fusionRegistry = { disease: false, missile: false, fshield: false, nuclear: false, barrier: false, laserboost: false };
  state.upgrades = {
    crit: 0,
    attack: 0,
    maxBallBonus: 0,
    giantBall: 0,
    speed: 0,
    leftDrone: 0,
    rightDrone: 0,
    shield: 0,
  };
  bricks = [];
  balls = [];
  items = [];
  debuffs = [];
  state.particles = [];
  state.floatingTexts = [];
  state.missiles = [];
  state.beams = [];
  paddle.x = W / 2 - BASE_PADDLE.width / 2;
  resetPaddle();
  createStageRows();
  initStage();
}

function update(dt) {
  if (state.status === 'love') {
    if (nowMs() >= state.loveUntil) {
      closeOverlay();
      balls = balls.length ? balls : [makeBall(paddle.x + paddle.width / 2, paddle.y - 12)];
      balls.forEach((b) => { b.paddleHits = 0; });
      state.status = 'playing';
    }
    return;
  }
  if (state.status !== 'playing') return;

  updateBossAnimation(dt);
  updateRows(dt);
  updateAbilities(dt);
  updateBossDebuffs();
  updateItems();
  updateBalls(dt);
  updateEffects(dt);
  syncHeldBalls();
  checkDanger();
  updateHUD();
}

function openOverlay(html) {
  overlayEl.innerHTML = html;
  overlayEl.classList.remove('hidden');
}
function closeOverlay() {
  overlayEl.classList.add('hidden');
  overlayEl.innerHTML = '';
}

function startRun(targetX = paddle.x + paddle.width / 2, targetY = BRICK.top) {
  closeOverlay();
  state.status = 'playing';
  if (balls.some((b) => b.held)) {
    launchHeldBalls(targetX, targetY);
  }
}

function showStartOverlay() {
  state.status = 'start';
  openOverlay(`
    <div class="modal">
      <h2>탭해서 시작</h2>
      <p>20개를 부수면 다음 스테이지. 10스테이지마다 거대한 보스 블록이 위에서 내려온다.</p>
      <div class="cards cols-2">
        <div class="card"><h3>하트 상점</h3><div class="desc">왼쪽 아래 ♥ 버튼으로 5/10/15 하트 카드 중 하나를 고를 수 있어.</div></div>
        <div class="card"><h3>코어 아이템</h3><div class="desc">일반/숫자 블록을 깨면 낮은 확률로 세모 · 긴 패들 · 세로 · 가로 번개가 떨어진다.</div></div>
      </div>
      <div class="actions"><button id="startRunBtn" class="primary-btn" style="flex:1">시작</button></div>
    </div>
  `);
  document.getElementById('startRunBtn').onclick = () => {
    startRun(paddle.x + paddle.width / 2, BRICK.top);
  };
}

function showGameOverOverlay() {
  state.status = 'gameover1';
  state.gameOverTapCount = 0;
  openOverlay(`
    <div class="modal center-note">
      <h2>게임 오버</h2>
      <p>당신은 유미에게 <strong>${state.runLove}번</strong> 사랑한다고 말했습니다!</p>
      <p>한 번 탭해서 계속.</p>
    </div>
  `);
}

function advanceGameOverTap() {
  if (state.status === 'gameover1') {
    state.status = 'gameover2';
    openOverlay(`
      <div class="modal center-note">
        <h2>더 많이 사랑을 고백해보세요!</h2>
        <p>한 번 더 탭하면 처음으로 돌아갑니다.</p>
      </div>
    `);
    return;
  }
  if (state.status === 'gameover2') {
    closeOverlay();
    fullReset();
    showStartOverlay();
  }
}

function offerPreview(offer) {
  switch (offer.key) {
    case 'crit': {
      const cur = Math.round(critChance() * 100);
      return `현재 ${cur}% → ${cur + 5}%`;
    }
    case 'attack': {
      const cur = attackPower();
      return `현재 ${cur.toFixed(2)} → ${(cur + 0.25).toFixed(2)}`;
    }
    case 'addBall': {
      const cur = maxBallCount();
      return `현재 최대 ${cur}개 → ${cur + 1}개`;
    }
    case 'giantBall': {
      return '현재 공 중 하나가 2배, 이미 모두 2배면 하나가 3배';
    }
    case 'speed': {
      const cur = ballSpeed();
      return `현재 ${cur.toFixed(1)} → ${(cur + 0.5).toFixed(1)}`;
    }
    case 'leftDrone': {
      const cur = dronePower('left');
      return `현재 ${cur.toFixed(1)} → ${(cur + 0.5).toFixed(1)}`;
    }
    case 'rightDrone': {
      const cur = dronePower('right');
      return `현재 ${cur.toFixed(1)} → ${(cur + 0.5).toFixed(1)}`;
    }
    case 'shield': {
      const cur = shieldCount();
      return `현재 ${cur}개 → ${Math.min(shieldCapacity(), cur + 1)}개`;
    }
    case 'clearBottomRows': {
      return '패들에 가장 가까운 2줄 즉시 삭제';
    }
    case 'instantFusion': {
      return '두 Lv10 기본 코어를 즉시 융합 등록';
    }
    default:
      return '';
  }
}

function showPauseOverlay() {
  state.previousStatus = state.status;
  state.status = 'paused';
  openOverlay(`
    <div class="modal center-note">
      <h2>일시정지</h2>
      <p>왼쪽 아래 ♥ 상점, 오른쪽 아래 상태 버튼도 사용할 수 있어.</p>
      <div class="actions">
        <button id="resumeBtn" class="primary-btn" style="flex:1">계속</button>
      </div>
    </div>
  `);
  document.getElementById('resumeBtn').onclick = () => {
    closeOverlay();
    state.status = 'playing';
  };
}


function shopPool() {
  return [
    { key: 'crit', cost: 5, title: '치명타 +5%', desc: '공의 치명타 확률이 5% 증가', apply: () => state.upgrades.crit += 1 },
    { key: 'attack', cost: 5, title: '공격력 +0.25', desc: '공격력이 0.25 증가', apply: () => state.upgrades.attack += 1 },
    { key: 'addBall', cost: 5, title: '최대 공 +1', desc: '세모가 있는 패들 반사 시 최대 공 한도가 1 증가한 상태로 적용', apply: () => tryIncreaseMaxBall() },
    { key: 'speed', cost: 5, title: '속도 +0.5', desc: '공 기본 속도 +0.5', apply: () => state.upgrades.speed += 1 },
    { key: 'giantBall', cost: 10, title: '거대 공', desc: '현재 공 중 랜덤 1개를 2배로, 이미 모두 2배면 1개를 3배로', apply: () => upgradeRandomBallSize() },
    { key: 'clearBottomRows', cost: 10, title: '아래 2줄 삭제', desc: '패들에 가장 가까운 2줄을 제거 (보스 제외)', apply: () => clearBottomRows() },
    { key: 'shield', cost: 10, title: '실드 +1', desc: '보스 디버프 1개를 막는 패들 실드 추가', apply: () => state.upgrades.shield = Math.min(shieldCapacity(), (state.upgrades.shield || 0) + 1) },
    { key: 'leftDrone', cost: 15, title: '뿅뿅이', desc: '왼쪽 하트 드론 공격력 +0.5', apply: () => state.upgrades.leftDrone += 1 },
    { key: 'rightDrone', cost: 15, title: '뾱뾱이', desc: '오른쪽 하트 드론 공격력 +0.5', apply: () => state.upgrades.rightDrone += 1 },
    { key: 'instantFusion', cost: 15, title: '즉시 융합', desc: 'Lv10 기본 코어 2개를 레벨 소모 없이 등록', apply: () => triggerInstantFusion() },
  ];
}


function makeShopOffers() {
  const costs = [5, 10, 15].map(() => choice([5, 10, 15]));
  const pool = shopPool();
  return costs.map((cost) => choice(pool.filter((p) => p.cost === cost)));
}

function showShopOverlay(resume = false) {
  state.previousStatus = state.status;
  state.status = 'shop';
  state.shopCharge = 0;
  if (!resume) {
    state.rerollCost = 1;
    state.shopOffers = makeShopOffers();
  }

  function renderShop() {
    openOverlay(`
      <div class="modal">
        <h2>하트 상점</h2>
        <p>하트를 원하는 만큼 쓸 수 있어. 닫으면 다시 5개를 더 모아야 열 수 있어.</p>
        <div class="cards cols-3" id="shopCards"></div>
        <div class="actions">
          <button id="rerollBtn" class="ghost-btn" style="flex:1">리롤 (${state.rerollCost}♥)</button>
          <button id="closeShopBtn" class="primary-btn" style="flex:1">닫기</button>
        </div>
      </div>
    `);
    const wrap = document.getElementById('shopCards');
    state.shopOffers.forEach((offer, i) => {
      const disabled = state.hearts < offer.cost;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div>
          <div class="cost">${offer.cost} ♥</div>
          <h3>${offer.title}</h3>
          <div class="desc">${offer.desc}</div>
          <div class="desc preview">${offerPreview(offer)}</div>
        </div>
        <button class="${disabled ? 'disabled' : ''}" ${disabled ? 'disabled' : ''}>구매</button>
      `;
      card.querySelector('button').onclick = () => {
        if (state.hearts < offer.cost) return;
        state.hearts -= offer.cost;
        offer.apply();
        updateHUD();
        if (!state.pendingInstantFusion) renderShop();
      };
      wrap.appendChild(card);
    });

    const rerollBtn = document.getElementById('rerollBtn');
    if (state.hearts < state.rerollCost) {
      rerollBtn.classList.add('disabled');
      rerollBtn.disabled = true;
    }
    rerollBtn.onclick = () => {
      if (state.hearts < state.rerollCost) return;
      state.hearts -= state.rerollCost;
      state.rerollCost *= 2;
      state.shopOffers = makeShopOffers();
      updateHUD();
      renderShop();
    };

    document.getElementById('closeShopBtn').onclick = () => {
      closeOverlay();
      state.status = 'playing';
      updateHUD();
    };
  }

  renderShop();
}

function showStatusOverlay() {
  state.previousStatus = state.status;
  state.status = 'status';
  openOverlay(`
    <div class="modal">
      <h2>현재 능력치</h2>
      <div class="kv"><span>공격력</span><strong>${attackPower().toFixed(2)}</strong></div>
      <div class="kv"><span>치명타</span><strong>${Math.round(critChance() * 100)}%</strong></div>
      <div class="kv"><span>현재 공 수</span><strong>${balls.length}</strong></div>
      <div class="kv"><span>최대 공 수</span><strong>${maxBallCount()}</strong></div>
      <div class="kv"><span>공 속도</span><strong>${ballSpeed().toFixed(1)}</strong></div>
      <div class="kv"><span>거대 공 업그레이드</span><strong>${state.upgrades.giantBall || 0}</strong></div>
      <div class="kv"><span>실드</span><strong>${shieldCount()} / ${shieldCapacity()}</strong></div>
      <div class="kv"><span>왼쪽 드론</span><strong>${dronePower('left').toFixed(1)}</strong></div>
      <div class="kv"><span>오른쪽 드론</span><strong>${dronePower('right').toFixed(1)}</strong></div>
      <div class="kv"><span>세모</span><strong>Lv.${state.itemLevels.triangle}</strong></div>
      <div class="kv"><span>긴 패들</span><strong>Lv.${state.itemLevels.long}</strong></div>
      <div class="kv"><span>세로 번개</span><strong>Lv.${state.itemLevels.vlaser}</strong></div>
      <div class="kv"><span>가로 번개</span><strong>Lv.${state.itemLevels.hlaser}</strong></div>
      <div class="kv"><span>융합 상태</span><strong>${mainFusionText().replace('융합: ', '')}</strong></div>
      <div class="kv"><span>질병</span><strong>Lv.${state.fusionLevels.disease}</strong></div>
      <div class="kv"><span>미사일</span><strong>Lv.${state.fusionLevels.missile}</strong></div>
      <div class="kv"><span>융합 실드</span><strong>Lv.${state.fusionLevels.fshield}</strong></div>
      <div class="kv"><span>핵융합</span><strong>Lv.${state.fusionLevels.nuclear}</strong></div>
      <div class="kv"><span>장벽</span><strong>Lv.${state.fusionLevels.barrier}</strong></div>
      <div class="kv"><span>레이저 강화</span><strong>Lv.${state.fusionLevels.laserboost}</strong></div>
      <div class="actions"><button id="closeStatusBtn" class="primary-btn" style="flex:1">닫기</button></div>
    </div>
  `);
  document.getElementById('closeStatusBtn').onclick = () => {
    closeOverlay();
    state.status = (state.previousStatus === 'playing' || state.previousStatus === 'shop' || state.previousStatus === 'status' || state.previousStatus === 'fusion') ? 'playing' : 'paused';
  };
}


function upgradeRandomBallSize() {
  if (!balls.length) {
    addFloatingText('공 없음', paddle.x + paddle.width / 2, paddle.y - 24, '#fca5a5', 14);
    return;
  }
  const normal = balls.filter((b) => b.r < BALL_RADIUS * 2);
  const doubled = balls.filter((b) => b.r >= BALL_RADIUS * 2 && b.r < BALL_RADIUS * 3);
  if (normal.length) {
    const target = choice(normal);
    target.r = BALL_RADIUS * 2;
    addFloatingText('거대 공!', target.x, target.y, '#93c5fd', 15);
  } else if (doubled.length) {
    const target = choice(doubled);
    target.r = BALL_RADIUS * 3;
    addFloatingText('초거대 공!', target.x, target.y, '#60a5fa', 15);
  } else {
    addFloatingText('모든 공 최대', paddle.x + paddle.width / 2, paddle.y - 24, '#fde68a', 14);
  }
  state.upgrades.giantBall = (state.upgrades.giantBall || 0) + 1;
}

function clearBottomRows() {
  const rows = [...new Set(bricks.filter((b) => !b.destroyed && b.type !== 'boss').map((b) => b.row))].sort((a,b)=>b-a).slice(0,2);
  bricks.forEach((b) => {
    if (!b.destroyed && b.type !== 'boss' && rows.includes(b.row)) {
      destroyBrick(b, true);
    }
  });
  addFloatingText(`아래 ${rows.length}줄 삭제`, paddle.x + paddle.width/2, paddle.y - 26, '#fde68a', 14);
}

function triggerInstantFusion() {
  state.pendingInstantFusion = true;
  state.returnToShopAfterFusion = true;
  showFusionOverlay();
}

function spawnBossReinforcements() {
  const count = bossReinforcementCount();
  const hp = strongestBlockHp();
  const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
  const candidates = [];
  for (let row = 0; row < Math.max(START_ROWS + 4, 12); row += 1) {
    for (let col = 0; col < BRICK.cols; col += 1) {
      const probe = createBrick(col, row, 'elite', hp);
      const overlapsBoss = boss && !(probe.x + probe.width <= boss.x || probe.x >= boss.x + boss.width || probe.y + probe.height <= boss.y || probe.y >= boss.y + boss.height);
      if (overlapsBoss) continue;
      candidates.push({ col, row });
    }
  }

  const selected = [];
  while (candidates.length && selected.length < count) {
    const idx = Math.floor(Math.random() * candidates.length);
    selected.push(candidates.splice(idx, 1)[0]);
  }

  let created = 0;
  for (const pos of selected) {
    const existing = bricks.find((b) => !b.destroyed && b.type !== 'boss' && b.col === pos.col && b.row === pos.row);
    if (existing) {
      existing.type = 'elite';
      existing.hp = Math.max(existing.hp, hp);
      existing.maxHp = existing.hp;
      created += 1;
    } else {
      const brick = createBrick(pos.col, pos.row, 'elite', hp);
      bricks.push(brick);
      created += 1;
    }
  }

  const missing = Math.max(0, count - created);
  if (boss && missing > 0) {
    boss.hp += missing * 2;
    boss.maxHp += missing * 2;
    state.bossHp = boss.hp;
    state.bossMaxHp = boss.maxHp;
  }
  addFloatingText('보스 증원!', W / 2, BRICK.top + 24, '#fca5a5', 20);
}

function spawnBossDebuffs() {
  const count = bossDebuffCount();
  if (!count) return;
  const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
  const y = boss ? boss.y + boss.height + 12 : BRICK.top - 16;
  for (let i = 0; i < count; i += 1) {
    debuffs.push({
      x: rand(24, W - 24),
      y,
      vy: rand(2.7, 3.5),
      vx: rand(-0.6, 0.6),
      spin: rand(-0.09, 0.09),
      rot: rand(0, Math.PI * 2),
      size: 18 + Math.min(8, count * 0.35)
    });
  }
  addFloatingText(`디버프 x${count}`, W / 2, Math.max(40, y), '#c084fc', 16);
}

function randomActiveCoreKey() {

  const keys = Object.keys(state.itemLevels).filter((k) => state.itemLevels[k] > 0);
  return keys.length ? choice(keys) : null;
}

function applyBossDebuff() {
  if (shieldCount() > 0) {
    state.upgrades.shield -= 1;
    addFloatingText('실드 방어!', paddle.x + paddle.width / 2, paddle.y - 18, '#93c5fd', 15);
    return;
  }
  const hits = bossNumber() >= 121 ? 2 : 1;
  let changed = false;
  for (let i = 0; i < hits; i += 1) {
    const key = randomActiveCoreKey();
    if (!key) break;
    state.itemLevels[key] = Math.max(0, state.itemLevels[key] - 1);
    changed = true;
  }
  if (changed) {
    resetPaddle();
    updateHUD();
    addFloatingText('코어 다운!', paddle.x + paddle.width / 2, paddle.y - 18, '#fca5a5', 15);
  } else {
    addFloatingText('디버프 무효', paddle.x + paddle.width / 2, paddle.y - 18, '#fde68a', 14);
  }
}

function updateBossDebuffs() {
  for (const d of debuffs) {
    d.y += d.vy;
    d.x += d.vx || 0;
    d.rot = (d.rot || 0) + (d.spin || 0);
    if (d.x - d.size <= 0) { d.x = d.size; d.vx = Math.abs(d.vx || 0.4); }
    if (d.x + d.size >= W) { d.x = W - d.size; d.vx = -Math.abs(d.vx || 0.4); }
  }
  debuffs = debuffs.filter((d) => {
    const caught = d.y + d.size >= paddle.y && d.y - d.size <= paddle.y + paddle.height && d.x >= paddle.x && d.x <= paddle.x + paddle.width;
    if (caught) {
      applyBossDebuff();
      addParticles(d.x, d.y, '#c084fc', 14, 3.2);
      return false;
    }
    return d.y - d.size <= H + 20;
  });
}


function eligibleFusionDefs() {
  return FUSION_DEFS.filter((d) => state.itemLevels[d.pair[0]] >= 10 && state.itemLevels[d.pair[1]] >= 10);
}

function renderFusionCard(def, instant = false) {
  const registered = state.fusionRegistry[def.id];
  const eligible = state.itemLevels[def.pair[0]] >= 10 && state.itemLevels[def.pair[1]] >= 10;
  const disabled = registered || !eligible;
  const left = `${coreDisplayName(def.pair[0])} Lv.${state.itemLevels[def.pair[0]]}`;
  const right = `${coreDisplayName(def.pair[1])} Lv.${state.itemLevels[def.pair[1]]}`;
  return `
    <div class="card">
      <div>
        <div class="cost">${registered ? '등록됨' : instant ? '즉시 융합' : 'Lv5 소모'}</div>
        <h3>${def.name}</h3>
        <div class="desc">${left} + ${right}</div>
        <div class="desc preview">현재 Lv.${state.fusionLevels[def.id]}</div>
      </div>
      <button data-fusion="${def.id}" class="${disabled ? 'disabled' : ''}" ${disabled ? 'disabled' : ''}>${registered ? '완료' : '융합'}</button>
    </div>`;
}

function performFusion(defId, instant = false) {
  const def = FUSION_DEFS.find((d) => d.id === defId);
  if (!def || state.fusionRegistry[def.id]) return;
  if (!instant) {
    if (state.itemLevels[def.pair[0]] < 10 || state.itemLevels[def.pair[1]] < 10) return;
    state.itemLevels[def.pair[0]] = Math.max(0, state.itemLevels[def.pair[0]] - 5);
    state.itemLevels[def.pair[1]] = Math.max(0, state.itemLevels[def.pair[1]] - 5);
  }
  state.fusionRegistry[def.id] = true;
  state.fusionLevels[def.id] = Math.max(1, state.fusionLevels[def.id]);
  updateHUD();
  addFloatingText(`${def.name} 등록!`, paddle.x + paddle.width / 2, paddle.y - 28, '#fde68a', 15);
  closeOverlay();
  if (state.returnToShopAfterFusion) {
    state.returnToShopAfterFusion = false;
    state.pendingInstantFusion = false;
    state.status = 'shop';
    showShopOverlay(true);
  } else {
    state.status = 'playing';
  }
}

function showFusionOverlay() {
  state.previousStatus = state.status === 'shop' ? 'shop' : state.status;
  state.status = 'fusion';
  const instant = !!state.pendingInstantFusion;
  openOverlay(`
    <div class="modal">
      <h2>융합</h2>
      <p>${instant ? '즉시 융합: 레벨 소모 없이 등록' : 'Lv10 기본 코어 2개를 융합하면 각 코어 Lv5를 소모해 새 융합 코어를 등록해.'}</p>
      <div class="cards cols-2" id="fusionCards">${FUSION_DEFS.map((d) => renderFusionCard(d, instant)).join('')}</div>
      <div class="actions"><button id="closeFusionBtn" class="primary-btn" style="flex:1">닫기</button></div>
    </div>
  `);
  document.querySelectorAll('[data-fusion]').forEach((btn) => {
    btn.onclick = () => performFusion(btn.getAttribute('data-fusion'), instant);
  });
  document.getElementById('closeFusionBtn').onclick = () => {
    closeOverlay();
    if (state.returnToShopAfterFusion) {
      state.returnToShopAfterFusion = false;
      state.pendingInstantFusion = false;
      state.status = 'shop';
      showShopOverlay(true);
    } else {
      state.pendingInstantFusion = false;
      state.status = state.previousStatus === 'paused' ? 'paused' : 'playing';
    }
  };
}


function movePaddle(clientX) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  paddle.x = clamp((clientX - rect.left) * scaleX - paddle.width / 2, 0, W - paddle.width);
  syncHeldBalls();
}

function pointerPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function circleRectCollision(ball, rect) {
  const closestX = clamp(ball.x, rect.x, rect.x + rect.width);
  const closestY = clamp(ball.y, rect.y, rect.y + rect.height);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  return dx * dx + dy * dy <= ball.r * ball.r;
}

function stageAdvance() {
  state.stage += 1;
  state.bossStage = state.stage % 10 === 0;
  state.destroyedThisStage = 0;
  state.rowTimer = 0;
  if (state.bossStage) createBossStage();
  updateHUD();
  addFloatingText(`STAGE ${state.stage}`, W / 2, H / 2, theme().accent, 22);
}

function registerDestroyed(brick) {
  if (brick.type === 'boss') return;
  state.score += 1;
  state.destroyedThisStage += 1;
  state.destroyedTotal += 1;
  if (state.destroyedThisStage >= 20) {
    stageAdvance();
  }
}

function destroyBrick(brick, silent = false) {
  if (brick.destroyed) return;
  brick.destroyed = true;
  if (!silent) registerDestroyed(brick);
  if (!silent) {
    addParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.type === 'heart' ? '#fb7185' : theme().accent, 10);
  }
  if (brick.type === 'heart' && !silent) {
    state.hearts += 1;
    state.shopCharge += 1;
    persistSave();
    updateHUD();
    addFloatingText('+1 ♥', brick.x + brick.width / 2, brick.y + brick.height / 2, '#fb7185', 16);
  }
  if (!silent && brick.type !== 'heart' && brick.type !== 'boss') {
    if (!state.firstCoreGranted) {
      state.firstCoreGranted = true;
      spawnCoreDropFromBrick(brick);
    } else if (Math.random() < CORE_DROP_CHANCE) {
      spawnCoreDropFromBrick(brick);
    }
  }
  if (brick.type === 'boss') {
    state.hearts += 5;
    state.shopCharge += 5;
    state.runLove += 1;
    state.totalLove += 1;
    persistSave();
    updateHUD();
    state.loveUntil = nowMs() + LOVE_DELAY;
    state.status = 'love';
    openOverlay(`
      <div class="modal center-note">
        <div class="big-love">유미야 사랑해!</div>
        <p>하트 +5 · 3초 뒤 다음 스테이지로 이어집니다.</p>
      </div>
    `);
  }
}

function damageBrick(brick, amount, isBeam = false, textColor = null) {
  if (brick.destroyed) return;
  if (brick.type === 'boss') {
    const now = nowMs();
    if (brick.hitCooldownUntil && now < brick.hitCooldownUntil) return;
    brick.hitCooldownUntil = now + 55;
  }
  brick.hp -= amount;
  if (brick.type === 'boss') {
    state.bossHp = Math.max(0, brick.hp);
    if (!brick.phaseTriggered && brick.hp <= brick.maxHp / 2) {
      brick.phaseTriggered = true;
      spawnBossReinforcements();
      brick.lastDebuffAt = nowMs();
      if (bossDebuffCount() > 0) spawnBossDebuffs();
    }
  }
  if (brick.hp <= 0) {
    destroyBrick(brick);
  } else if (!isBeam) {
    addFloatingText(`-${amount % 1 === 0 ? amount : amount.toFixed(2)}`, brick.x + brick.width / 2, brick.y + 8, textColor || '#fff', 12);
  }
}


function infectBrick(brick) {
  if (state.fusionLevels.disease <= 0) return;
  brick.diseaseDps = Math.max(brick.diseaseDps || 0, diseaseDps());
}

function updateDiseaseDots(dt) {
  if (state.fusionLevels.disease <= 0) return;
  for (const brick of bricks) {
    if (brick.destroyed || !brick.diseaseDps) continue;
    damageBrick(brick, brick.diseaseDps * (dt / 1000), true);
  }
}

function spawnFusionMissiles() {
  if (state.fusionLevels.missile <= 0) return;
  const now = nowMs();
  if (now - state.lastFusionMissileAt < 500) return;
  state.lastFusionMissileAt = now;
  const y = paddle.y - 24;
  const inset = Math.min(12, paddle.width * 0.08);
  const leftX = paddle.x + inset;
  const rightX = paddle.x + paddle.width - inset;
  const dmg = missileDamage();
  state.missiles.push({ x: leftX, y, vx: 0, vy: -6, dmg, color: '#38bdf8', fusion: 'missile' });
  state.missiles.push({ x: rightX, y, vx: 0, vy: -6, dmg, color: '#38bdf8', fusion: 'missile' });
}

function fireNuclearBeam() {
  if (state.fusionLevels.nuclear <= 0) return;
  const now = nowMs();
  const cd = nuclearCooldownMs();
  if (now - state.lastFusionNuclearAt < cd) return;
  state.lastFusionNuclearAt = now;
  const x = paddle.x + paddle.width / 2;
  state.beams.push({ type: 'nuclear', x, startedAt: now, until: now + 420, color: '#93c5fd' });
  bricks.filter((b) => !b.destroyed && b.type !== 'boss' && x >= b.x && x <= b.x + b.width).forEach((brick) => damageBrick(brick, 10, true));
  const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
  if (boss && x >= boss.x && x <= boss.x + boss.width) damageBrick(boss, 10, true);
}

function updateBarrier(dt) {
  if (state.fusionLevels.barrier <= 0) return;
  const now = nowMs();
  const cd = barrierCooldownMs();
  if (now - state.lastFusionBarrierAt >= cd && now >= state.barrierUntil) {
    state.lastFusionBarrierAt = now;
    state.barrierUntil = now + barrierDurationMs();
  }
  if (now < state.barrierUntil) {
    const y = paddle.y - 38;
    const dmg = state.fusionLevels.barrier * (dt / 1000);
    bricks.filter((b) => !b.destroyed && b.type !== 'boss' && y >= b.y && y <= b.y + b.height).forEach((brick) => damageBrick(brick, dmg, true));
    const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
    if (boss && y >= boss.y && y <= boss.y + boss.height) damageBrick(boss, dmg, true);
  }
}

function maybeClearDiseaseBall() {
  if (state.diseaseBallUid == null) return;
  if (!balls.some((b) => b.uid === state.diseaseBallUid)) state.diseaseBallUid = null;
}

function armDiseaseOnBall(ball) {
  if (!state.diseaseArmed) return false;
  if (state.diseaseBallUid != null) return false;
  if (!ball || isGiantBall(ball) || ball.disease) return false;
  ball.disease = true;
  state.diseaseArmed = false;
  state.diseaseBallUid = ball.uid;
  addFloatingText('질병 공', ball.x, ball.y - 12, '#86efac', 14);
  return true;
}

function activeNormalBallCount(list = balls) {
  return list.filter((b) => !isGiantBall(b)).length;
}

function spawnSeedBallFromGiant(sourceBall, outList) {
  if (state.itemLevels.triangle <= 0) return false;
  if (activeNormalBallCount(balls) > 0 || activeNormalBallCount(outList) > 0) return false;
  if ((outList.length || balls.length) >= maxBallCount()) return false;
  const angle = Math.atan2(sourceBall.vy, sourceBall.vx) + (Math.random() < 0.5 ? -0.32 : 0.32);
  const seed = makeBall(sourceBall.x, sourceBall.y, angle);
  seed.skipSplitUntil = nowMs() + 250;
  outList.push(seed);
  addFloatingText('씨앗 공', seed.x, seed.y - 12, '#fde68a', 13);
  armDiseaseOnBall(seed);
  return true;
}

function critDamage(base) {
  const critical = Math.random() < critChance();
  return { amount: critical ? base * 2 : base, critical };
}

function findBrickAtGrid(col, row) {
  return bricks.find((b) => !b.destroyed && b.type !== 'boss' && b.col === col && b.row === row);
}

function explosionAt(col, row) {
  const splash = bombSplashDamage();
  for (let r = row - 1; r <= row + 1; r += 1) {
    for (let c = col - 1; c <= col + 1; c += 1) {
      if (c === col && r === row) continue;
      const target = findBrickAtGrid(c, r);
      if (target) damageBrick(target, splash, true);
    }
  }
}

function splitBall(ball, totalCount) {
  if (nowMs() < ball.skipSplitUntil) return [ball];
  const speed = Math.max(3, Math.hypot(ball.vx, ball.vy));
  const spread = Math.PI / 2;
  const out = [];
  for (let i = 0; i < totalCount; i += 1) {
    const t = totalCount === 1 ? 0 : i / (totalCount - 1);
    const angle = -Math.PI / 2 - spread / 2 + spread * t;
    out.push({
      x: ball.x,
      y: ball.y - 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: ball.r,
      held: false,
      paddleHits: ball.paddleHits,
      skipSplitUntil: nowMs() + 350,
      bombReady: false,
      touchingIds: new Set(),
      uid: BALL_UID_SEQ++,
      disease: false,
    });
  }
  addParticles(ball.x, ball.y, theme().accent, 14, 3.5);
  return out;
}

function spawnSelfSplit(ball) {
  const speed = Math.max(3, Math.hypot(ball.vx, ball.vy));
  const angle = Math.atan2(ball.vy, ball.vx) + rand(-0.5, 0.5);
  balls.push({
    x: ball.x,
    y: ball.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: ball.r,
    held: false,
    paddleHits: 0,
    skipSplitUntil: nowMs() + 350,
    bombReady: false,
    touchingIds: new Set(),
    uid: BALL_UID_SEQ++,
    disease: false,
  });
  addFloatingText('+분열', ball.x, ball.y, '#fde68a', 12);
}

function tryIncreaseMaxBall() {
  state.upgrades.maxBallBonus = (state.upgrades.maxBallBonus || 0) + 1;
  addFloatingText('최대 공 증가!', paddle.x + paddle.width / 2, paddle.y - 24, '#93c5fd', 15);
  updateHUD();
}

function addNewRow() {
  bricks.filter((b) => !b.destroyed).forEach((b) => {
    if (b.type === 'boss') {
      b.y += ROW_STEP;
      b.targetY = (b.targetY ?? b.y) + ROW_STEP;
    } else {
      b.row += 1;
      b.y += ROW_STEP;
    }
  });
  const plan = currentNumberBlockPlan();
  const numberCols = new Set();
  while (numberCols.size < plan.count) numberCols.add(Math.floor(rand(0, BRICK.cols)));
  const newRowBricks = [];
  for (let c = 0; c < BRICK.cols; c += 1) {
    const type = numberCols.has(c) ? 'number' : 'normal';
    const hp = type === 'number' ? plan.hp : 1;
    const brick = createBrick(c, 0, type, hp);
    bricks.push(brick);
    newRowBricks.push(brick);
  }
  maybeMarkNewRowHeart(newRowBricks);
}

function randomUniqueIndexes(total, count) {
  const set = new Set();
  while (set.size < Math.min(total, count)) set.add(Math.floor(rand(0, total)));
  return [...set];
}

function fireVerticalLightning() {
  const count = lightningCount(state.itemLevels.vlaser);
  if (!count) return;
  const cols = randomUniqueIndexes(BRICK.cols, count);
  cols.forEach((col) => {
    state.beams.push({ type: 'v', x: BRICK.left + col * (BRICK.width + BRICK.gap) + BRICK.width / 2, startedAt: nowMs(), until: nowMs() + 320, color: '#60a5fa' });
    bricks.filter((b) => !b.destroyed && b.type !== 'boss' && b.col === col).forEach((brick) => damageBrick(brick, 1, true));
    const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
    if (boss) {
      const bx = boss.x + boss.width / 2;
      if (Math.abs((BRICK.left + col * (BRICK.width + BRICK.gap) + BRICK.width / 2) - bx) < boss.width / 2) damageBrick(boss, laserBoostDamage(), true);
    }
  });
}

function fireHorizontalLightning() {
  const count = lightningCount(state.itemLevels.hlaser);
  if (!count) return;
  const rowCount = 14;
  const rows = randomUniqueIndexes(rowCount, count);
  rows.forEach((row) => {
    state.beams.push({ type: 'h', y: BRICK.top + row * ROW_STEP + BRICK.height / 2, startedAt: nowMs(), until: nowMs() + 320, color: '#c084fc' });
    bricks.filter((b) => !b.destroyed && b.type !== 'boss' && b.row === row).forEach((brick) => damageBrick(brick, 1, true));
    const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
    if (boss) {
      const by = BRICK.top + row * ROW_STEP + BRICK.height / 2;
      if (by >= boss.y && by <= boss.y + boss.height) damageBrick(boss, laserBoostDamage(), true);
    }
  });
}

function updateDrones(dt) {
  const now = nowMs();
  if (now - state.lastMissileAt < MISSILE_INTERVAL) return;
  state.lastMissileAt = now;
  const powerLeft = dronePower('left');
  const powerRight = dronePower('right');
  const sweep = Math.sin(now / 400) * (Math.PI / 4);
  if (powerLeft > 0) {
    state.missiles.push({ x: paddle.x + paddle.width / 2 - 24, y: paddle.y - 20, vx: Math.cos(-Math.PI / 2 + sweep) * 4.4, vy: Math.sin(-Math.PI / 2 + sweep) * 4.4, dmg: powerLeft, color: '#fb7185' });
  }
  if (powerRight > 0) {
    state.missiles.push({ x: paddle.x + paddle.width / 2 + 24, y: paddle.y - 20, vx: Math.cos(-Math.PI / 2 - sweep) * 4.4, vy: Math.sin(-Math.PI / 2 - sweep) * 4.4, dmg: powerRight, color: '#f9a8d4' });
  }
}

function updateMissiles(dt) {
  for (const m of state.missiles) {
    m.x += m.vx;
    m.y += m.vy;
    for (const brick of bricks) {
      if (brick.destroyed) continue;
      if (m.x >= brick.x && m.x <= brick.x + brick.width && m.y >= brick.y && m.y <= brick.y + brick.height) {
        damageBrick(brick, m.dmg, true);
        m.dead = true;
        addParticles(m.x, m.y, m.color, 6);
        break;
      }
    }
  }
  state.missiles = state.missiles.filter((m) => !m.dead && m.x >= -20 && m.x <= W + 20 && m.y >= -20 && m.y <= H + 20);
}

function handleBallBrickCollision(ball, prevX, prevY) {
  const currentTouching = new Set();
  for (const brick of bricks) {
    if (brick.destroyed) continue;
    const rect = { x: brick.x, y: brick.y, width: brick.width, height: brick.height };
    if (!circleRectCollision(ball, rect)) continue;
    currentTouching.add(brick.uid);

    const giant = isGiantBall(ball);

    if (brick.type !== 'boss' && giant) {
      if (!ball.touchingIds.has(brick.uid)) {
        const result = critDamage(attackPower());
        damageBrick(brick, result.amount, false, result.critical ? '#ef4444' : '#ffffff');
        if (ball.disease) infectBrick(brick);
        if (result.critical) addFloatingText('CRIT!', brick.x + brick.width / 2, brick.y - 6, '#ef4444', 13);
      }
      continue;
    }

    const result = critDamage(attackPower());
    damageBrick(brick, result.amount, false, result.critical ? '#ef4444' : '#ffffff');
    if (ball.disease) infectBrick(brick);
    if (result.critical) addFloatingText('CRIT!', brick.x + brick.width / 2, brick.y - 6, '#ef4444', 13);

    const overlapLeft = Math.abs(ball.x + ball.r - brick.x);
    const overlapRight = Math.abs(brick.x + brick.width - (ball.x - ball.r));
    const overlapTop = Math.abs(ball.y + ball.r - brick.y);
    const overlapBottom = Math.abs(brick.y + brick.height - (ball.y - ball.r));
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapLeft) {
      ball.x = brick.x - ball.r - 0.5;
      ball.vx = -Math.abs(ball.vx);
    } else if (minOverlap === overlapRight) {
      ball.x = brick.x + brick.width + ball.r + 0.5;
      ball.vx = Math.abs(ball.vx);
    } else if (minOverlap === overlapTop) {
      ball.y = brick.y - ball.r - 0.5;
      ball.vy = -Math.abs(ball.vy);
    } else {
      ball.y = brick.y + brick.height + ball.r + 0.5;
      ball.vy = Math.abs(ball.vy);
    }


    ball.touchingIds = currentTouching;
    return true;
  }
  ball.touchingIds = currentTouching;
  return false;
}

function updateBossAnimation(dt) {
  const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
  if (!boss) return;
  if (boss.targetY == null) boss.targetY = boss.y;
  if (boss.y < boss.targetY) {
    boss.y = Math.min(boss.targetY, boss.y + dt * 0.12);
  }
}

function updateBalls(dt) {
  const next = [];
  for (const ball of balls) {
    if (ball.held) {
      next.push(ball);
      continue;
    }
    const prevX = ball.x;
    const prevY = ball.y;
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x - ball.r <= 0) { ball.x = ball.r; ball.vx *= -1; }
    if (ball.x + ball.r >= W) { ball.x = W - ball.r; ball.vx *= -1; }
    if (ball.y - ball.r <= 0) { ball.y = ball.r; ball.vy *= -1; }

    const triSplitCount = splitCountForLevel();
    const triZone = triSplitCount > 0 && !isGiantBall(ball) ? {
      x: paddle.x,
      y: paddle.y - 24,
      width: paddle.width,
      height: 24 + paddle.height,
    } : null;

    if (triZone && circleRectCollision(ball, triZone) && ball.vy > 0) {
      const allowed = Math.max(1, maxBallCount() - (balls.length - 1));
      if (allowed > 1) {
        const spawned = splitBall(ball, Math.min(triSplitCount, allowed));
        if (state.diseaseArmed) {
          const host = spawned.find((b) => !isGiantBall(b));
          if (host) armDiseaseOnBall(host);
        }
        next.push(...spawned);
      } else {
        ball.vy *= -1;
        ball.y = paddle.y - ball.r - 1;
        armDiseaseOnBall(ball);
        next.push(ball);
      }
      continue;
    }

    const paddleRect = { x: paddle.x, y: paddle.y, width: paddle.width, height: paddle.height };
    if (circleRectCollision(ball, paddleRect) && ball.vy > 0) {
      const hit = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const angle = hit * (Math.PI / 3);
      const speed = ballSpeed();
      ball.vx = Math.sin(angle) * speed;
      ball.vy = -Math.abs(Math.cos(angle) * speed);
      ball.y = paddle.y - ball.r - 1;
      armDiseaseOnBall(ball);
      next.push(ball);
      if (isGiantBall(ball)) {
        spawnSeedBallFromGiant(ball, next);
      }
      continue;
    }

    handleBallBrickCollision(ball, prevX, prevY);
    if (ball.y - ball.r <= H + 20) next.push(ball);
  }
  balls = next;
  maybeClearDiseaseBall();
  if (!balls.length) triggerGameOver();
}

function triggerGameOver() {
  if (state.status === 'gameover1' || state.status === 'gameover2') return;
  persistSave();
  showGameOverOverlay();
}


function collectCoreItem(item) {
  const basic = Object.prototype.hasOwnProperty.call(state.itemLevels, item.type);
  const fusion = Object.prototype.hasOwnProperty.call(state.fusionLevels, item.type);
  if (basic) {
    const prev = state.itemLevels[item.type];
    state.itemLevels[item.type] = Math.min(10, state.itemLevels[item.type] + 1);
    resetPaddle();
    updateHUD();
    const nextLv = state.itemLevels[item.type];
    const tag = prev === 0 ? 'NEW' : nextLv === prev ? 'MAX' : 'Lv Up';
    addFloatingText(tag, item.x, item.y - 10, '#ffffff', 14);
    addFloatingText(`${coreDisplayName(item.type)} Lv.${nextLv}`, item.x, item.y + 8, theme().accent, 14);
    addParticles(item.x, item.y, theme().accent, 14, 3.2);
    return;
  }
  if (fusion) {
    const prev = state.fusionLevels[item.type];
    state.fusionLevels[item.type] = Math.min(10, state.fusionLevels[item.type] + 1);
    if (item.type === 'fshield') {
      state.upgrades.shield = Math.min(shieldCapacity(), (state.upgrades.shield || 0) + 1);
    }
    if (item.type === 'disease' && state.diseaseBallUid == null) {
      state.diseaseArmed = true;
    }
    updateHUD();
    const nextLv = state.fusionLevels[item.type];
    const tag = prev === 0 ? 'NEW' : nextLv === prev ? 'MAX' : 'Lv Up';
    addFloatingText(tag, item.x, item.y - 10, '#ffffff', 14);
    addFloatingText(`${coreDisplayName(item.type)} Lv.${nextLv}`, item.x, item.y + 8, '#fde68a', 14);
    addParticles(item.x, item.y, '#fde68a', 16, 3.4);
    return;
  }
}


function updateItems() {
  const now = nowMs();
  for (const item of items) {
    item.y += item.vy;
    item.x += item.vx || 0;
    if (item.x - item.size <= 0) { item.x = item.size; item.vx = Math.abs(item.vx || 0.35); }
    if (item.x + item.size >= W) { item.x = W - item.size; item.vx = -Math.abs(item.vx || 0.35); }
    item.wobble = (item.wobble || 0) + 0.08;
    item.x += Math.sin(item.wobble) * 0.25;
    item.rotation = (item.rotation || 0) + (item.spin || 0);
  }
  items = items.filter((item) => {
    const canCollect = now >= (item.collectAfter || 0);
    const caught = canCollect && item.y + item.size >= paddle.y && item.y - item.size <= paddle.y + paddle.height && item.x >= paddle.x && item.x <= paddle.x + paddle.width;
    if (caught) {
      collectCoreItem(item);
      return false;
    }
    return item.y - item.size <= H + 30;
  });
}

function updateRows(dt) {
  state.rowTimer += dt;
  if (state.rowTimer >= rowIntervalMs()) {
    state.rowTimer = 0;
    addNewRow();
  }
}

function updateAbilities(dt) {
  const now = nowMs();
  if (state.itemLevels.vlaser > 0 && now - state.lastVerticalAt >= LASER_INTERVAL) {
    state.lastVerticalAt = now;
    fireVerticalLightning();
  }
  if (state.itemLevels.hlaser > 0 && now - state.lastHorizontalAt >= LASER_INTERVAL) {
    state.lastHorizontalAt = now;
    fireHorizontalLightning();
  }
  const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
  if (boss && boss.phaseTriggered && bossDebuffCount() > 0) {
    boss.lastDebuffAt = boss.lastDebuffAt || now;
    if (now - boss.lastDebuffAt >= bossDebuffInterval()) {
      boss.lastDebuffAt = now;
      spawnBossDebuffs();
    }
  }
  spawnFusionMissiles();
  fireNuclearBeam();
  updateBarrier(dt);
  updateDrones(dt);
}

function updateEffects(dt) {
  const now = nowMs();
  state.beams = state.beams.filter((b) => b.until > now);
  updateDiseaseDots(dt);
  state.floatingTexts = state.floatingTexts.filter((t) => t.until > now);
  state.particles = state.particles.filter((p) => p.until > now);
  state.particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.98;
    p.vy *= 0.98;
  });
  updateMissiles(dt);
}

function checkDanger() {
  if (bricks.some((b) => !b.destroyed && b.y + b.height >= paddle.y - 6)) {
    triggerGameOver();
  }
}

function update(dt) {
  if (state.status === 'love') {
    if (nowMs() >= state.loveUntil) {
      closeOverlay();
      balls = balls.length ? balls : [makeBall(paddle.x + paddle.width / 2, paddle.y - 12)];
      balls.forEach((b) => { b.paddleHits = 0; });
      state.status = 'playing';
    }
    return;
  }
  if (state.status !== 'playing') return;

  updateBossAnimation(dt);
  updateRows(dt);
  updateAbilities(dt);
  updateBossDebuffs();
  updateItems();
  updateBalls(dt);
  updateEffects(dt);
  syncHeldBalls();
  checkDanger();
  updateHUD();
}

function drawBackground() {
  const t = theme();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, t.top);
  grad.addColorStop(1, t.bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < H; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function roundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function drawBricks() {
  const t = theme();
  for (const brick of bricks) {
    if (brick.destroyed) continue;
    if (brick.type === 'boss') {
      roundRect(brick.x, brick.y, brick.width, brick.height, 14, t.boss, 'rgba(255,255,255,0.25)');
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`BOSS ${Math.ceil(brick.hp)}`, brick.x + brick.width / 2, brick.y + brick.height / 2 + 6);
      continue;
    }
    let fill = t.block;
    let stroke = 'rgba(255,255,255,0.12)';
    if (brick.type === 'number') fill = t.number;
    if (brick.type === 'elite') fill = '#f59e0b';
    if (brick.type === 'heart') {
      const pulse = 0.86 + Math.sin(nowMs() / 180) * 0.14;
      ctx.save();
      ctx.globalAlpha = pulse;
      fill = '#fb7185';
      roundRect(brick.x, brick.y, brick.width, brick.height, 6, fill, 'rgba(255,255,255,0.4)');
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(253,164,175,0.45)';
      ctx.lineWidth = 4;
      roundRect(brick.x - 1, brick.y - 1, brick.width + 2, brick.height + 2, 7, null, 'rgba(253,164,175,0.45)');
      ctx.restore();
    } else {
      roundRect(brick.x, brick.y, brick.width, brick.height, 6, fill, stroke);
      if (brick.diseaseDps) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        roundRect(brick.x, brick.y, brick.width, brick.height, 6, '#22c55e', null);
        ctx.restore();
      }
    }
    ctx.textAlign = 'center';
    if (brick.type === 'heart') {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('♥', brick.x + brick.width / 2, brick.y + brick.height / 2 + 5);
    } else if (brick.type === 'number' || brick.type === 'elite') {
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(String(Math.ceil(brick.hp)), brick.x + brick.width / 2, brick.y + brick.height / 2 + 5);
    }
  }
}

function drawItems() {
  for (const item of items) {
    const pulse = 0.92 + Math.sin(nowMs() / 150 + item.x) * 0.08;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation || 0);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = theme().accent;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.arc(0, 0, item.size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.fill();
    ctx.strokeStyle = theme().accent;
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = theme().accent;
    if (item.type === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(-13, 10);
      ctx.lineTo(13, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (item.type === 'long') {
      roundRect(-22, -6, 44, 12, 6, theme().accent, '#ffffff');
    } else if (item.type === 'vlaser') {
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(-6, -2);
      ctx.lineTo(1, -2);
      ctx.lineTo(-5, 16);
      ctx.lineTo(7, 1);
      ctx.lineTo(0, 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (item.type === 'hlaser') {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(-6, -2);
      ctx.lineTo(1, -2);
      ctx.lineTo(-5, 16);
      ctx.lineTo(7, 1);
      ctx.lineTo(0, 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (item.type === 'disease') {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#bbf7d0'; ctx.stroke();
      for (let i=0;i<4;i++){ const a=i*Math.PI/2; ctx.beginPath(); ctx.moveTo(Math.cos(a)*12, Math.sin(a)*12); ctx.lineTo(Math.cos(a)*17, Math.sin(a)*17); ctx.stroke(); }
    } else if (item.type === 'missile') {
      roundRect(-18,-4,36,8,4,'#38bdf8','#ffffff');
      ctx.beginPath(); ctx.moveTo(-20,0); ctx.lineTo(-10,-8); ctx.lineTo(-10,8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(20,0); ctx.lineTo(10,-8); ctx.lineTo(10,8); ctx.closePath(); ctx.fill();
    } else if (item.type === 'fshield') {
      ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(13,-8); ctx.lineTo(9,12); ctx.lineTo(0,17); ctx.lineTo(-9,12); ctx.lineTo(-13,-8); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (item.type === 'nuclear') {
      roundRect(-6,-18,12,36,4,'#60a5fa','#ffffff');
    } else if (item.type === 'barrier') {
      roundRect(-24,-5,48,10,5,'#a78bfa','#ffffff');
    } else if (item.type === 'laserboost') {
      roundRect(-4,-18,8,36,4,'#f472b6','#ffffff');
      roundRect(-18,-4,36,8,4,'#f472b6','#ffffff');
    }
    ctx.restore();
  }
}

function drawPaddle() {
  roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 7, '#ffffff', null);
  if (shieldCount() > 0) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    roundRect(paddle.x - 3, paddle.y - 5, paddle.width + 6, paddle.height + 10, 10, '#60a5fa', '#bfdbfe');
    ctx.restore();
    ctx.fillStyle = '#dbeafe';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`x${shieldCount()}`, paddle.x + paddle.width / 2, paddle.y - 8);
  }
  if (state.itemLevels.triangle > 0) {
    ctx.fillStyle = theme().accent;
    ctx.beginPath();
    ctx.moveTo(paddle.x + paddle.width / 2, paddle.y - 24);
    ctx.lineTo(paddle.x + paddle.width / 2 - 18, paddle.y);
    ctx.lineTo(paddle.x + paddle.width / 2 + 18, paddle.y);
    ctx.closePath();
    ctx.fill();
    if (state.fusionLevels.missile > 0) {
      ctx.fillStyle = '#38bdf8';
      const inset = Math.min(12, paddle.width * 0.08);
      roundRect(paddle.x + inset - 5, paddle.y - 19, 10, 20, 3, '#38bdf8', null);
      roundRect(paddle.x + paddle.width - inset - 5, paddle.y - 19, 10, 20, 3, '#38bdf8', null);
    }
  }
}

function drawBalls() {
  balls.forEach((ball) => {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    if (ball.disease) {
      ctx.fillStyle = '#22c55e';
      ctx.fill();
      ctx.strokeStyle = '#86efac';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (ball.r >= BALL_RADIUS * 3 - 0.1) {
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (ball.r >= BALL_RADIUS * 2 - 0.1) {
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  });
}

function drawDrones() {
  const leftPower = dronePower('left');
  const rightPower = dronePower('right');
  if (leftPower > 0) {
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(paddle.x + paddle.width / 2 - 24, paddle.y - 20, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('♥', paddle.x + paddle.width / 2 - 24, paddle.y - 17);
  }
  if (rightPower > 0) {
    ctx.fillStyle = '#f9a8d4';
    ctx.beginPath();
    ctx.arc(paddle.x + paddle.width / 2 + 24, paddle.y - 20, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('♥', paddle.x + paddle.width / 2 + 24, paddle.y - 17);
  }
}

function drawMissiles() {
  state.missiles.forEach((m) => {
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x - m.vx * 2, m.y - m.vy * 2);
    ctx.stroke();
  });
}


function drawBeams() {
  const now = nowMs();
  state.beams.forEach((beam) => {
    const progress = clamp((now - (beam.startedAt || now)) / Math.max(1, (beam.until - (beam.startedAt || now))), 0, 1);
    ctx.strokeStyle = beam.color;
    ctx.lineWidth = beam.type === 'nuclear' ? 16 : 4;
    ctx.globalAlpha = beam.type === 'nuclear' ? 0.92 : 0.78;
    ctx.beginPath();
    if (beam.type === 'v' || beam.type === 'nuclear') {
      const endY = paddle.y + 18;
      const drawEnd = -42 + (endY + 42) * progress;
      ctx.moveTo(beam.x, -42);
      ctx.lineTo(beam.x, drawEnd);
    } else {
      const drawEnd = -42 + (W + 84) * progress;
      ctx.moveTo(-42, beam.y);
      ctx.lineTo(drawEnd, beam.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
  if (now < state.barrierUntil && state.fusionLevels.barrier > 0) {
    const y = paddle.y - 38;
    ctx.strokeStyle = '#c4b5fd';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.strokeStyle = '#ede9fe';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}


function drawParticles() {
  state.particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, (p.until - nowMs()) / 700);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
  state.floatingTexts.forEach((t) => {
    ctx.globalAlpha = Math.max(0, (t.until - nowMs()) / 900);
    ctx.fillStyle = t.color;
    ctx.font = `bold ${t.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y - ((900 - (t.until - nowMs())) / 45));
  });
  ctx.globalAlpha = 1;
}

function drawBossBar() {
  const boss = bricks.find((b) => !b.destroyed && b.type === 'boss');
  if (!boss) return;
  const x = 42;
  const y = 12;
  const w = W - 84;
  roundRect(x, y, w, 12, 6, 'rgba(255,255,255,0.12)', null);
  const ratio = clamp(boss.hp / boss.maxHp, 0, 1);
  roundRect(x, y, w * ratio, 12, 6, theme().boss, null);
}

function drawDebuffs() {
  debuffs.forEach((d) => {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot || 0);
    const pulse = 1 + Math.sin(nowMs() / 120 + d.x) * 0.08;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#a855f7';
    ctx.strokeStyle = '#f0abfc';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const ang = Math.PI / 3 * i - Math.PI / 6;
      const rr = d.size * (i === 2 ? 0.72 : 1);
      const px = Math.cos(ang) * rr;
      const py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -d.size * 0.35);
    ctx.lineTo(0, d.size * 0.15);
    ctx.lineTo(-d.size * 0.26, -0.5);
    ctx.moveTo(0, d.size * 0.15);
    ctx.lineTo(d.size * 0.26, -0.5);
    ctx.stroke();

    ctx.restore();
  });
}

function drawOverlayHints() {
  if (state.status === 'start') return;
  if (state.status === 'playing' && balls.every((b) => b.held)) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('탭해서 발사', W / 2, H / 2 - 10);
  }
}

function draw() {
  drawBackground();
  drawBeams();
  drawBricks();
  drawItems();
  drawDebuffs();
  drawMissiles();
  drawPaddle();
  drawDrones();
  drawBalls();
  drawParticles();
  drawFloatingTexts();
  drawBossBar();
  drawOverlayHints();
}

function handleTap(clientX, clientY) {
  const pos = pointerPos(clientX, clientY);
  if (state.status === 'gameover1' || state.status === 'gameover2') {
    advanceGameOverTap();
    return;
  }
  if (state.status === 'start') {
    startRun(pos.x, pos.y);
    return;
  }
  if (balls.some((b) => b.held)) {
    launchHeldBalls(pos.x, pos.y);
  }
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  movePaddle(t.clientX);
  handleTap(t.clientX, t.clientY);
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  movePaddle(e.touches[0].clientX);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  movePaddle(e.clientX);
  handleTap(e.clientX, e.clientY);
});
canvas.addEventListener('mousemove', (e) => {
  if (e.buttons === 1) movePaddle(e.clientX);
});

pauseBtn.onclick = () => {
  if (state.status === 'playing') showPauseOverlay();
  else if (state.status === 'paused') {
    closeOverlay();
    state.status = 'playing';
  }
};
shopBtn.onclick = () => {
  if (state.hearts < 5 || state.shopCharge < 5 || ['choose', 'love', 'gameover1', 'gameover2', 'start', 'shop', 'status', 'paused', 'fusion'].includes(state.status)) return;
  showShopOverlay();
};
statusBtn.onclick = () => {
  if (['choose', 'love', 'gameover1', 'gameover2', 'start', 'fusion'].includes(state.status)) return;
  showStatusOverlay();
};
fusionBtn.onclick = () => {
  if (['choose', 'love', 'gameover1', 'gameover2', 'start', 'shop', 'status', 'paused'].includes(state.status)) return;
  showFusionOverlay();
};

overlayEl.addEventListener('click', (e) => {
  if (state.status === 'gameover1' || state.status === 'gameover2') {
    advanceGameOverTap();
    return;
  }
  if (e.target === overlayEl && state.status === 'paused') {
    closeOverlay();
    state.status = 'playing';
  }
});

overlayEl.addEventListener('touchstart', (e) => {
  if (state.status === 'gameover1' || state.status === 'gameover2') {
    e.preventDefault();
    advanceGameOverTap();
  }
}, { passive: false });


function fitViewport() {
  const topbar = document.querySelector('.topbar');
  const topH = topbar ? topbar.getBoundingClientRect().height : 56;
  const reserve = topH + 110;
  const maxH = Math.max(340, window.innerHeight - reserve);
  const maxW = Math.min(430, window.innerWidth - 16);
  let cssW = maxW;
  let cssH = cssW * (H / W);
  if (cssH > maxH) {
    cssH = maxH;
    cssW = cssH * (W / H);
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
}

window.addEventListener('resize', fitViewport);
window.addEventListener('orientationchange', () => setTimeout(fitViewport, 50));

function loop(ts) {
  if (!state.lastTime) state.lastTime = ts;
  const dt = ts - state.lastTime;
  state.lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

fullReset();
showStartOverlay();
fitViewport();
requestAnimationFrame(loop);
