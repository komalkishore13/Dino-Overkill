// Dino Game - Chrome Dino Clone with MetaMask Auth
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score-display');
const highScoreDisplay = document.getElementById('high-score-display');
const gameOverDisplay = document.getElementById('game-over');

// ======== SCREEN ELEMENTS ========
const connectScreen = document.getElementById('connect-screen');
const connectBtn = document.getElementById('connect-btn');
const connectError = document.getElementById('connect-error');


const usernameScreen = document.getElementById('username-screen');
const walletAddrDisplay = document.getElementById('wallet-address-display');
const usernameInput = document.getElementById('username-input');
const usernameError = document.getElementById('username-error');
const usernameBtn = document.getElementById('username-btn');
const usernameBackBtn = document.getElementById('username-back-btn');

const menuScreen = document.getElementById('menu-screen');
const menuWelcome = document.getElementById('menu-welcome');
const menuBest = document.getElementById('menu-best');
const menuLeaderboardBtn = document.getElementById('menu-leaderboard-btn');
const menuHighscoresBtn = document.getElementById('menu-highscores-btn');
const menuDisconnectBtn = document.getElementById('menu-disconnect-btn');
const menuControlsBtn = document.getElementById('menu-controls-btn');

const controlsScreen = document.getElementById('controls-screen');
const controlsBackBtn = document.getElementById('controls-back-btn');

const loadingScreen = document.getElementById('loading-screen');

const leaderboardScreen = document.getElementById('leaderboard-screen');
const leaderboardTable = document.getElementById('leaderboard-table');
const leaderboardBackBtn = document.getElementById('leaderboard-back-btn');

const highscoresScreen = document.getElementById('highscores-screen');
const highscoresTitle = document.getElementById('highscores-title');
const highscoresTable = document.getElementById('highscores-table');
const highscoresBackBtn = document.getElementById('highscores-back-btn');

// ======== AUTH STATE ========
let currentWallet = null;
let currentUsername = null;
let appState = 'connect'; // connect, select, username, menu, playing

// ======== PLAYER DATA (API + localStorage cache) ========
let cachedLeaderboard = [];

function getCachedPlayers() {
    return JSON.parse(localStorage.getItem('dinoPlayers') || '{}');
}
function setCachedPlayer(username, data) {
    const players = getCachedPlayers();
    players[username.toLowerCase()] = data;
    localStorage.setItem('dinoPlayers', JSON.stringify(players));
}

async function getPlayersForWallet(wallet) {
    try {
        const res = await fetch(`/api/players/wallet/${wallet}`);
        if (!res.ok) throw new Error('API error');
        const players = await res.json();
        players.forEach(p => setCachedPlayer(p.username, p));
        return players;
    } catch (err) {
        console.warn('API unavailable, using localStorage fallback:', err);
        const players = getCachedPlayers();
        const walletLower = wallet.toLowerCase();
        return Object.entries(players)
            .filter(([, data]) => data.wallet?.toLowerCase() === walletLower)
            .map(([username, data]) => ({ username, ...data }));
    }
}

async function isUsernameTaken(username) {
    try {
        const res = await fetch(`/api/players/check/${username}`);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        return data.taken;
    } catch (err) {
        console.warn('API unavailable, using localStorage fallback:', err);
        const players = getCachedPlayers();
        return !!players[username.toLowerCase()];
    }
}

async function savePlayer(username, data) {
    setCachedPlayer(username, data);
    try {
        const res = await fetch('/api/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, wallet: data.wallet })
        });
        if (!res.ok) throw new Error('API error');
        return await res.json();
    } catch (err) {
        console.warn('API unavailable, saved to localStorage only:', err);
    }
}

async function getPlayer(username) {
    try {
        const res = await fetch(`/api/players/${username}`);
        if (!res.ok) throw new Error('API error');
        const player = await res.json();
        setCachedPlayer(username, player);
        return player;
    } catch (err) {
        console.warn('API unavailable, using localStorage fallback:', err);
        const players = getCachedPlayers();
        return players[username.toLowerCase()] || null;
    }
}

async function fetchLeaderboard() {
    try {
        const res = await fetch('/api/players/leaderboard');
        if (!res.ok) throw new Error('API error');
        const lb = await res.json();
        cachedLeaderboard = lb;
        return lb;
    } catch (err) {
        console.warn('API unavailable, using localStorage fallback:', err);
        const players = getCachedPlayers();
        const lb = Object.entries(players)
            .map(([username, data]) => ({
                username, wallet: data.wallet, bestScore: data.bestScore || 0
            }))
            .sort((a, b) => b.bestScore - a.bestScore)
            .slice(0, 10);
        cachedLeaderboard = lb;
        return lb;
    }
}

// Synchronous — for canvas rendering at 60fps
function getLeaderboard() {
    return cachedLeaderboard;
}

async function addScoreToHistory(username, newScore) {
    // Update localStorage cache immediately (synchronous) for responsive UI
    const players = getCachedPlayers();
    const player = players[username.toLowerCase()];
    if (player) {
        if (!player.scores) player.scores = [];
        player.scores.push({
            score: newScore,
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        });
        player.scores.sort((a, b) => b.score - a.score);
        player.scores = player.scores.slice(0, 20);
        if (newScore > (player.bestScore || 0)) player.bestScore = newScore;
        setCachedPlayer(username, player);
    }

    // Fire API call in background
    try {
        const res = await fetch(`/api/players/${username}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: newScore })
        });
        if (!res.ok) throw new Error('API error');
        const updated = await res.json();
        setCachedPlayer(username, updated);
        fetchLeaderboard();
    } catch (err) {
        console.warn('API unavailable, score saved to localStorage only:', err);
    }
}

// ======== METAMASK ========
function shortenAddress(addr) {
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

async function connectMetaMask() {
    if (typeof window.ethereum === 'undefined') {
        connectError.textContent = 'MetaMask not found. Please install the extension.';
        return;
    }
    try {
        connectError.textContent = '';
        showLoading();
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts.length > 0) {
            currentWallet = accounts[0];
            await enterAfterConnect();
        } else { hideLoading(); }
    } catch (err) {
        hideLoading();
        connectError.textContent = 'Connection rejected. Please try again.';
    }
}

// One player per wallet: go to menu if player exists, otherwise username setup
async function enterAfterConnect() {
    const walletPlayers = await getPlayersForWallet(currentWallet);
    if (walletPlayers.length > 0) {
        currentUsername = walletPlayers[0].username;
        await showMenu();
    } else {
        showUsernameScreen();
    }
}

function showLoading() { loadingScreen.classList.remove('hidden'); }
function hideLoading() { loadingScreen.classList.add('hidden'); }

function showScreen(screen) {
    connectScreen.classList.add('hidden');
    usernameScreen.classList.add('hidden');
    menuScreen.classList.add('hidden');
    leaderboardScreen.classList.add('hidden');
    highscoresScreen.classList.add('hidden');
    controlsScreen.classList.add('hidden');
    loadingScreen.classList.add('hidden');
    if (screen) screen.classList.remove('hidden');
}

function showConnectScreen() {
    appState = 'connect';
    currentWallet = null;
    currentUsername = null;
    connectError.textContent = '';
    showScreen(connectScreen);
}

function showUsernameScreen() {
    appState = 'username';
    usernameInput.value = '';
    usernameError.textContent = '';
    walletAddrDisplay.textContent = shortenAddress(currentWallet);
    showScreen(usernameScreen);
    usernameInput.focus();
}

async function showMenu() {
    appState = 'menu';
    showLoading();
    const player = await getPlayer(currentUsername);
    menuWelcome.textContent = 'Welcome, ' + currentUsername + '!';
    menuBest.textContent = 'Best Score: ' + (player?.bestScore || 0);
    highScore = player?.bestScore || 0;
    showScreen(menuScreen);
    fetchLeaderboard(); // pre-warm cache for game-over screen
}

async function showLeaderboard(fromGameOver) {
    appState = fromGameOver ? 'playing' : 'leaderboard';
    if (!fromGameOver) showLoading();
    const lb = await fetchLeaderboard();
    let html = '<div class="table-header"><span class="col-rank">RANK</span><span class="col-name">USERNAME</span><span class="col-score">SCORE</span><span class="col-marker"></span></div>';
    if (lb.length === 0) {
        html += '<div class="table-row"><span style="width:100%;text-align:center">No scores yet</span></div>';
    } else {
        lb.forEach((entry, i) => {
            const isMe = entry.username === currentUsername;
            const cls = isMe ? 'table-row highlight' : 'table-row';
            const marker = isMe ? '◄' : '';
            html += `<div class="${cls}"><span class="col-rank">${i + 1}.</span><span class="col-name">${entry.username}</span><span class="col-score">${entry.bestScore}</span><span class="col-marker">${marker}</span></div>`;
        });
    }
    leaderboardTable.innerHTML = html;
    if (!fromGameOver) showScreen(leaderboardScreen);
}

async function showHighscores() {
    appState = 'highscores';
    showLoading();
    const player = await getPlayer(currentUsername);
    highscoresTitle.textContent = currentUsername + "'s  H I G H  S C O R E S";
    let html = '<div class="table-header"><span class="col-rank">#</span><span class="col-name">SCORE</span><span class="col-date">DATE</span></div>';
    const scores = player?.scores || [];
    if (scores.length === 0) {
        html += '<div class="table-row"><span style="width:100%;text-align:center">No games played yet</span></div>';
    } else {
        scores.forEach((s, i) => {
            html += `<div class="table-row"><span class="col-rank">${i + 1}.</span><span class="col-name">${s.score}</span><span class="col-date">${s.date}</span></div>`;
        });
    }
    highscoresTable.innerHTML = html;
    showScreen(highscoresScreen);
}

async function submitUsername() {
    const name = usernameInput.value.trim();
    if (!name) {
        usernameError.textContent = 'Username cannot be empty';
        return;
    }
    if (name.length < 2) {
        usernameError.textContent = 'Username must be at least 2 characters';
        return;
    }
    usernameBtn.disabled = true;
    usernameError.textContent = '';
    showLoading();
    const taken = await isUsernameTaken(name);
    if (taken) {
        hideLoading();
        usernameError.textContent = 'Username "' + name + '" already taken';
        usernameBtn.disabled = false;
        return;
    }
    currentUsername = name;
    await savePlayer(name, { wallet: currentWallet, bestScore: 0, scores: [] });
    usernameBtn.disabled = false;
    await showMenu();
}

// ======== BUTTON EVENTS ========
connectBtn.addEventListener('click', connectMetaMask);
usernameBtn.addEventListener('click', submitUsername);
usernameBackBtn.addEventListener('click', showConnectScreen);
usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitUsername();
});
menuLeaderboardBtn.addEventListener('click', () => showLeaderboard(false));
menuHighscoresBtn.addEventListener('click', showHighscores);
menuControlsBtn.addEventListener('click', () => { appState = 'controls'; showScreen(controlsScreen); });
controlsBackBtn.addEventListener('click', showMenu);
menuDisconnectBtn.addEventListener('click', showConnectScreen);
leaderboardBackBtn.addEventListener('click', showMenu);
highscoresBackBtn.addEventListener('click', showMenu);

// Listen for MetaMask account changes
if (window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            showConnectScreen();
        } else {
            currentWallet = accounts[0];
            enterAfterConnect();
        }
    });
}

// ======== GAME ENGINE (preserved) ========

// Dynamic canvas sizing
let CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_LINE, GROUND_Y, HUD_Y;

// Sun position: computed in resizeCanvas
let SUN_X, SUN_Y, SUN_RADIUS;

function resizeCanvas() {
    CANVAS_WIDTH = window.innerWidth;
    CANVAS_HEIGHT = window.innerHeight;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    GROUND_LINE = Math.floor(CANVAS_HEIGHT * 0.69);
    GROUND_Y = GROUND_LINE - DINO_DRAW_H;
    // HUD sits just above the dino's max jump peak
    const maxJumpHeight = (JUMP_FORCE * JUMP_FORCE) / (2 * GRAVITY); // ~367.5px
    HUD_Y = Math.max(20, GROUND_Y - maxJumpHeight - 30);
    // Sun position: top-right, ~2 inches from right edge and ~2 inches from top
    SUN_RADIUS = Math.max(30, CANVAS_WIDTH * 0.03);
    SUN_X = CANVAS_WIDTH - 192;
    SUN_Y = 192;
    if (dino && !dino.isJumping) {
        if (dino.isDucking) {
            dino.y = GROUND_Y + (dino.standHeight - dino.duckHeight);
        } else {
            dino.y = GROUND_Y;
        }
    }
}

// Constants
const GRAVITY = 0.15;
const JUMP_FORCE = -10.5;
const INITIAL_SPEED = 1.5;
const MAX_SPEED = 8;
const MIN_OBSTACLE_GAP = 90;
const DINO_X = 60;

// ======== LOAD ALL SPRITES ========
const dinoIdleImg = new Image();
dinoIdleImg.src = 'dino_cropped.png';

const dinoRunSheet = new Image();
dinoRunSheet.src = 'dino_run_aligned.png';
const DINO_FRAMES = 4;
const DINO_FRAME_W = 276;
const DINO_FRAME_H = 267;

const birdSheet = new Image();
birdSheet.src = 'bird_run_aligned.png';
const BIRD_FRAMES = 4;
const BIRD_FRAME_W = 281;
const BIRD_FRAME_H = 152;

const cactusSmallImg = new Image();
cactusSmallImg.src = 'small_cactus_cropped.png';

const cactusLargeImg = new Image();
cactusLargeImg.src = 'large_cactus_cropped.png';

const cactusClusterImg = new Image();
cactusClusterImg.src = 'cactus_cluster_cropped.png';

const shieldImg = new Image();
shieldImg.src = 'shield.webp';

const dashImg = new Image();
dashImg.src = 'dash.png';

const multiplierImg = new Image();
multiplierImg.src = '2x.png';

// Draw sizes
const DINO_DRAW_W = 60;
const DINO_DRAW_H = 66;
const DINO_DUCK_W = 80;
const DINO_DUCK_H = 40;

// Game state
let gameState = 'waiting'; // waiting, intro, running, dying, over
let score = 0;
let highScore = 0;
let gameSpeed = INITIAL_SPEED;
let frameCount = 0;
let obstacleTimer = 0;
let groundOffset = 0;
let dinoAnimFrame = 0;
let animAccum = 0;
let newHighScoreTime = 0;
let highScoreBeaten = false;
let scoreAccum = 0; // accumulator for score ticking

// ======== COLLECTIBLES & IMMUNITY ========
let collectibles = []; // active collectible items on screen
let collectibleNextSpawnTime = 0; // Date.now() when next spawn is allowed
let immunityActive = false;
let immunityEndTime = 0; // Date.now() when immunity expires
const IMMUNITY_DURATION_MS = 6000; // 6 seconds (real time)
const SHIELD_COOLDOWN_MS = 10000; // 10 seconds after collection
const COLLECTIBLE_SIZE = 36; // draw size of the collectible icon
let collectibleOrbitPhase = 0; // phase for rotating circles around icon

// ======== DASH POWER-UP ========
let dashActive = false;
let dashEndTime = 0;
const DASH_DURATION_MS = 5000; // 5 seconds real time
const DASH_COOLDOWN_MS = 10000; // 10 seconds after collection
let dashOriginalX = 0; // dino's original x before dash
let dashPhase = 'idle'; // 'idle' | 'forward' | 'sustain' | 'return'
let dashDinoX = 0; // animated x position during dash
let flyingObstacles = []; // obstacles knocked into the air during dash
let dashSpeedLines = []; // speed line particles
let dashTrailParticles = []; // dust trail behind dino
const DASH_TESTING = false;

// ======== MULTIPLIER POWER-UP ========
let multiplierActive = false;
let multiplierEndTime = 0;
const MULTIPLIER_DURATION_MS = 7000; // 7 seconds real time
const MULTIPLIER_COOLDOWN_MS = 10000; // 10 seconds after collection
const MULTIPLIER_TESTING = false;

// ======== DINO HEALTH SYSTEM ========
const HEALTH_TESTING = false;
let dinoHeadPickups = 0; // 0-10, each pickup = half a HUD head
const MAX_DINO_PICKUPS = 10; // 10 pickups = 5 full heads
let healthHeads = []; // active head collectibles on screen
let healthNextSpawnScore = 100; // next score threshold to spawn
let healthHitImmune = false; // 2s immunity after taking a hit
let healthHitImmuneEnd = 0;
const HEALTH_HIT_IMMUNITY_MS = 2000;
const DINO_HEAD_SIZE = 32; // collectible size in-game

// Intro animation state
let introPhase = 0; // 0=clouds, 1=ground, 2=dino falling, 3=dino running, 4=done
let introTimer = 0;
let introCloudsShown = 0;
let introGroundProgress = 0;
let introDinoY = -80; // dino starts above screen
let introDinoVel = 0;
let introDinoLanded = false;
let introRunFrames = 0;
let introClouds = [];
let introDustParticles = [];

// Death animation state
let deathTimer = 0;
const DEATH_DURATION = 180; // 3 seconds at 60fps
let deathDinoVelY = 0;
let deathDinoRotation = 0;
let deathDinoY = 0;
// Game over box slide-in animation
let gameOverAnimTimer = 0;
const GAMEOVER_ANIM_DURATION = 40; // ~0.67s slide-in

// ======== DAY/NIGHT THEME ========
const THEME_CYCLE_SCORE = 450;         // toggle every 450 points
const THEME_TRANSITION_FRAMES = 120;   // 2-second smooth transition
let isNight = false;
let themeT = 0;                        // 0 = day, 1 = night (interpolated)
let themeTransitioning = false;
let themeTransitionDir = 0;            // +1 toward night, -1 toward day
let lastThemeCycle = 0;
let stars = [];

function initStars() {
    stars = [];
    for (let i = 0; i < 120; i++) {
        stars.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * GROUND_LINE * 0.85,
            size: 0.5 + Math.random() * 2.2,
            twinkleSpeed: 0.02 + Math.random() * 0.04,
            twinklePhase: Math.random() * Math.PI * 2
        });
    }
}

// Interpolate a single channel value between day and night
function lerpV(dayVal, nightVal) {
    return Math.round(dayVal + (nightVal - dayVal) * themeT);
}

// Get theme-interpolated rgb string
function themeRgb(dr, dg, db, nr, ng, nb) {
    return `rgb(${lerpV(dr, nr)},${lerpV(dg, ng)},${lerpV(db, nb)})`;
}

function themeRgba(dr, dg, db, da, nr, ng, nb, na) {
    const a = da + (na - da) * themeT;
    return `rgba(${lerpV(dr, nr)},${lerpV(dg, ng)},${lerpV(db, nb)},${a.toFixed(3)})`;
}

// Common theme colors (computed each frame would be wasteful, so use functions)
function getBgColor() { return themeRgb(255, 255, 255, 20, 20, 30); }
function getGroundColor() { return themeRgb(83, 83, 83, 200, 200, 200); }
function getCloudColor() { return themeRgb(224, 224, 224, 50, 50, 60); }
function getHudColor() { return themeRgb(83, 83, 83, 200, 200, 200); }
function getHudSecondaryColor() { return themeRgb(153, 153, 153, 120, 120, 120); }
function getDustColor() { return themeRgb(153, 153, 153, 100, 100, 100); }

function drawStars() {
    if (themeT <= 0) return;
    ctx.save();
    stars.forEach(s => {
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(s.twinklePhase));
        const alpha = themeT * twinkle;
        if (alpha < 0.01) return;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
        // Crosshair sparkle on bigger stars
        if (s.size > 1.5 && twinkle > 0.7) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(s.x - s.size * 2, s.y);
            ctx.lineTo(s.x + s.size * 2, s.y);
            ctx.moveTo(s.x, s.y - s.size * 2);
            ctx.lineTo(s.x, s.y + s.size * 2);
            ctx.stroke();
        }
    });
    ctx.restore();
}

function updateStarTwinkle() {
    stars.forEach(s => {
        s.twinklePhase += s.twinkleSpeed;
        // Scroll stars slowly with the game (parallax)
        s.x -= gameSpeed * 0.15;
        if (s.x < -5) {
            s.x = CANVAS_WIDTH + Math.random() * 20;
            s.y = Math.random() * GROUND_LINE * 0.85;
        }
    });
}

const dino = {
    x: DINO_X,
    y: 0,
    width: DINO_DRAW_W,
    height: DINO_DRAW_H,
    velocityY: 0,
    isJumping: false,
    isDucking: false,
    standWidth: DINO_DRAW_W,
    standHeight: DINO_DRAW_H,
    duckWidth: DINO_DUCK_W,
    duckHeight: DINO_DUCK_H
};

// Initialize canvas size
resizeCanvas();
window.addEventListener('resize', () => { resizeCanvas(); initStars(); });

// Arrays
let obstacles = [];
let clouds = [];
let groundBumps = [];

// ======== SKY BIRDS (daytime only) ========
let skyBirds = [];

function initSkyBirds() {
    skyBirds = [];
    const count = 8 + Math.floor(Math.random() * 5); // 8-12 birds
    for (let i = 0; i < count; i++) {
        skyBirds.push({
            x: Math.random() * CANVAS_WIDTH,
            y: 40 + Math.random() * (GROUND_LINE * 0.35),
            speed: 0.3 + Math.random() * 0.5,
            wingPhase: Math.random() * Math.PI * 2,
            wingSpeed: 0.08 + Math.random() * 0.06,
            size: 3 + Math.random() * 4, // small silhouettes
            drift: Math.random() * 0.3 - 0.15 // slight vertical drift
        });
    }
}

function updateSkyBirds() {
    skyBirds.forEach(b => {
        b.x -= b.speed + gameSpeed * 0.1;
        b.y += Math.sin(b.wingPhase * 0.3) * b.drift;
        b.wingPhase += b.wingSpeed;
        if (b.x < -20) {
            b.x = CANVAS_WIDTH + 10 + Math.random() * 50;
            b.y = 40 + Math.random() * (GROUND_LINE * 0.35);
        }
    });
}

function drawSkyBirds() {
    // Only visible during day (fade out at night)
    if (themeT >= 0.95) return;
    const alpha = (1 - themeT) * 0.55;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = themeRgb(50, 50, 50, 140, 140, 140);
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';

    skyBirds.forEach(b => {
        const wingY = Math.sin(b.wingPhase) * b.size * 0.6;
        ctx.beginPath();
        // Left wing
        ctx.moveTo(b.x - b.size, b.y + wingY);
        ctx.quadraticCurveTo(b.x - b.size * 0.4, b.y - Math.abs(wingY) * 0.3, b.x, b.y);
        // Right wing
        ctx.quadraticCurveTo(b.x + b.size * 0.4, b.y - Math.abs(wingY) * 0.3, b.x + b.size, b.y + wingY);
        ctx.stroke();
    });

    ctx.restore();
}

// ======== COLLECTIBLES (Shield / Immunity) ========

function spawnCollectible() {
    if (collectibles.length > 0) return;
    if (Date.now() < collectibleNextSpawnTime) return;

    // Don't spawn if any obstacle is near the right edge (avoid overlap)
    const safeZone = CANVAS_WIDTH - 150;
    for (let i = 0; i < obstacles.length; i++) {
        if (obstacles[i].x > safeZone) return; // obstacle too close, skip this frame
    }

    // Pick power-up type (equal 1/3 chance each)
    const r = Math.random();
    let type;
    if (r < 0.33) type = 'shield';
    else if (r < 0.66) type = 'dash';
    else type = 'multiplier';

    const y = GROUND_LINE - COLLECTIBLE_SIZE;

    collectibles.push({
        type: type,
        x: CANVAS_WIDTH + COLLECTIBLE_SIZE,
        y: y,
        width: COLLECTIBLE_SIZE,
        height: COLLECTIBLE_SIZE,
        bobPhase: Math.random() * Math.PI * 2
    });
}

function spawnHealthHead() {
    if (healthHeads.length > 0) return;
    if (dinoHeadPickups >= MAX_DINO_PICKUPS) return;

    // Don't spawn if obstacle near right edge
    const safeZone = CANVAS_WIDTH - 150;
    for (let i = 0; i < obstacles.length; i++) {
        if (obstacles[i].x > safeZone) return;
    }

    // Random: ground or sky
    const inSky = Math.random() < 0.5;
    const y = inSky
        ? GROUND_LINE - DINO_DRAW_H - 40 - Math.random() * 80 // sky (reachable by jump)
        : GROUND_LINE - DINO_HEAD_SIZE; // ground level

    healthHeads.push({
        x: CANVAS_WIDTH + DINO_HEAD_SIZE,
        y: y,
        width: DINO_HEAD_SIZE,
        height: DINO_HEAD_SIZE,
        bobPhase: Math.random() * Math.PI * 2
    });
}

function activateDash() {
    dashActive = true;
    dashEndTime = Date.now() + DASH_DURATION_MS;
    dashOriginalX = dino.x;
    dashDinoX = dino.x;
    dashPhase = 'forward';
    flyingObstacles = [];
    dashSpeedLines = [];
    dashTrailParticles = [];
    // Seed initial speed lines
    for (let i = 0; i < 20; i++) {
        dashSpeedLines.push({
            x: Math.random() * CANVAS_WIDTH,
            y: Math.random() * CANVAS_HEIGHT * 0.8,
            len: 30 + Math.random() * 80,
            speed: 15 + Math.random() * 25,
            alpha: 0.15 + Math.random() * 0.25
        });
    }
}

function updateDash() {
    if (!dashActive) return;

    const now = Date.now();
    const elapsed = DASH_DURATION_MS - (dashEndTime - now);
    const remaining = dashEndTime - now;

    if (remaining <= 0) {
        // Dash ended — snap dino back + grant 2s immunity grace period
        dashActive = false;
        dashPhase = 'idle';
        dino.x = dashOriginalX;
        flyingObstacles = [];
        dashSpeedLines = [];
        dashTrailParticles = [];
        immunityActive = true;
        immunityEndTime = Date.now() + 2000;
        return;
    }

    // Phase: forward rush (first 0.4s) — dino moves to ~70% of screen
    const forwardDur = 400;
    // Phase: sustain (middle) — dino stays at right side, plowing through
    // Phase: return (last 0.5s) — dino slides back to original position
    const returnDur = 500;

    if (elapsed < forwardDur) {
        // Rush forward
        const t = elapsed / forwardDur;
        const ease = 1 - Math.pow(1 - t, 3); // ease-out
        dashDinoX = dashOriginalX + (CANVAS_WIDTH * 0.6 - dashOriginalX) * ease;
        dashPhase = 'forward';
    } else if (remaining > returnDur) {
        // Sustain at right side
        dashDinoX = CANVAS_WIDTH * 0.6;
        dashPhase = 'sustain';
    } else {
        // Return to original position
        const t = 1 - (remaining / returnDur);
        const ease = t * t; // ease-in
        dashDinoX = CANVAS_WIDTH * 0.6 + (dashOriginalX - CANVAS_WIDTH * 0.6) * ease;
        dashPhase = 'return';
    }

    dino.x = dashDinoX;

    // Check obstacles — knock them flying when dino hits them
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        if (checkCollision(dino, obs)) {
            // Remove from obstacles, add to flying debris
            flyingObstacles.push({
                type: obs.type,
                subtype: obs.subtype,
                x: obs.x,
                y: obs.y,
                width: obs.width,
                height: obs.height,
                animFrame: obs.animFrame || 0,
                velX: 5 + Math.random() * 10,
                velY: -(8 + Math.random() * 12),
                rotation: 0,
                rotSpeed: 0.1 + Math.random() * 0.2 * (Math.random() < 0.5 ? 1 : -1),
                alpha: 1
            });
            obstacles.splice(i, 1);
        }
    }

    // Update flying obstacles
    for (let i = flyingObstacles.length - 1; i >= 0; i--) {
        const f = flyingObstacles[i];
        f.x += f.velX;
        f.y += f.velY;
        f.velY += 0.4; // gravity
        f.rotation += f.rotSpeed;
        f.alpha -= 0.012;
        if (f.alpha <= 0 || f.y > CANVAS_HEIGHT + 100) {
            flyingObstacles.splice(i, 1);
        }
    }

    // Update speed lines
    dashSpeedLines.forEach(l => {
        l.x -= l.speed;
        if (l.x + l.len < 0) {
            l.x = CANVAS_WIDTH + Math.random() * 100;
            l.y = Math.random() * CANVAS_HEIGHT * 0.8;
            l.len = 30 + Math.random() * 80;
        }
    });

    // Spawn trail particles behind dino
    if (Math.random() < 0.6) {
        dashTrailParticles.push({
            x: dino.x - 5,
            y: GROUND_LINE - 2 - Math.random() * 10,
            size: 3 + Math.random() * 6,
            alpha: 0.5 + Math.random() * 0.3,
            velX: -(2 + Math.random() * 4),
            velY: -(Math.random() * 2)
        });
    }

    // Update trail particles
    for (let i = dashTrailParticles.length - 1; i >= 0; i--) {
        const p = dashTrailParticles[i];
        p.x += p.velX;
        p.y += p.velY;
        p.alpha -= 0.025;
        p.size *= 0.97;
        if (p.alpha <= 0) dashTrailParticles.splice(i, 1);
    }
}

function updateCollectibles() {
    collectibleOrbitPhase += 0.04;

    // Spawn logic — don't spawn during any active power-up
    const anyPowerActive = immunityActive || dashActive || multiplierActive;
    if (!HEALTH_TESTING && collectibles.length === 0 && !anyPowerActive && score > 30) {
        spawnCollectible();
    }

    // Move collectibles left
    for (let i = collectibles.length - 1; i >= 0; i--) {
        const c = collectibles[i];
        c.x -= gameSpeed;
        c.bobPhase += 0.05;

        // Off-screen removal
        if (c.x + c.width < 0) {
            collectibles.splice(i, 1);
            collectibleNextSpawnTime = Date.now() + 7000; // 7s cooldown for missed
            continue;
        }

        // Collision with dino
        const pad = 4;
        if (
            dino.x + pad < c.x + c.width - pad &&
            dino.x + dino.width - pad > c.x + pad &&
            dino.y + pad < c.y + c.height - pad &&
            dino.y + dino.height - pad > c.y + pad
        ) {
            const ctype = c.type;
            collectibles.splice(i, 1);

            if (ctype === 'shield') {
                immunityActive = true;
                immunityEndTime = Date.now() + IMMUNITY_DURATION_MS;
                collectibleNextSpawnTime = Date.now() + SHIELD_COOLDOWN_MS;
            } else if (ctype === 'dash') {
                activateDash();
                collectibleNextSpawnTime = Date.now() + DASH_COOLDOWN_MS;
            } else if (ctype === 'multiplier') {
                multiplierActive = true;
                multiplierEndTime = Date.now() + MULTIPLIER_DURATION_MS;
                collectibleNextSpawnTime = Date.now() + MULTIPLIER_COOLDOWN_MS;
            }
        }
    }

    // Update immunity (real-time based)
    if (immunityActive) {
        if (Date.now() >= immunityEndTime) {
            immunityActive = false;
        }
    }

    // Update multiplier (real-time based)
    if (multiplierActive) {
        if (Date.now() >= multiplierEndTime) {
            multiplierActive = false;
        }
    }

    // Update dash
    updateDash();

    // ======== HEALTH HEADS ========
    // Spawn logic — every 100 score (testing: also spawn first one early)
    if (healthHeads.length === 0 && score >= healthNextSpawnScore) {
        spawnHealthHead();
    }
    if (HEALTH_TESTING && healthHeads.length === 0 && frameCount > 60 && frameCount < 180 && dinoHeadPickups === 0) {
        spawnHealthHead();
    }

    // Move health heads left
    for (let i = healthHeads.length - 1; i >= 0; i--) {
        const h = healthHeads[i];
        h.x -= gameSpeed;
        h.bobPhase += 0.05;

        // Off-screen removal — advance threshold so next spawns at next 100
        if (h.x + h.width < 0) {
            healthHeads.splice(i, 1);
            healthNextSpawnScore = (Math.floor(score / 100) + 1) * 100;
            continue;
        }

        // Collision with dino
        const pad = 4;
        if (
            dino.x + pad < h.x + h.width - pad &&
            dino.x + dino.width - pad > h.x + pad &&
            dino.y + pad < h.y + h.height - pad &&
            dino.y + dino.height - pad > h.y + pad
        ) {
            healthHeads.splice(i, 1);
            if (dinoHeadPickups < MAX_DINO_PICKUPS) {
                dinoHeadPickups++;
            }
            healthNextSpawnScore = (Math.floor(score / 100) + 1) * 100;
        }
    }

    // Update health hit immunity
    if (healthHitImmune && Date.now() >= healthHitImmuneEnd) {
        healthHitImmune = false;
    }
}

function drawCollectible(c) {
    const cx = c.x + c.width / 2;
    const bob = Math.sin(c.bobPhase) * 4; // gentle float
    const cy = c.y + c.height / 2 + bob;
    const r = c.width / 2;

    ctx.save();

    // Glow behind the shield (grayscale)
    const glowV = lerpV(120, 200);
    const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.8);
    glow.addColorStop(0, `rgba(${glowV}, ${glowV}, ${glowV}, 0.3)`);
    glow.addColorStop(0.6, `rgba(${glowV}, ${glowV}, ${glowV}, 0.08)`);
    glow.addColorStop(1, `rgba(${glowV}, ${glowV}, ${glowV}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Draw icon image based on type
    const iconImg = c.type === 'dash' ? dashImg : c.type === 'multiplier' ? multiplierImg : shieldImg;
    if (iconImg.complete) {
        ctx.drawImage(iconImg, cx - r, cy - r, c.width, c.height);
    } else {
        const fv = lerpV(100, 200);
        ctx.fillStyle = `rgba(${fv}, ${fv}, ${fv}, 0.8)`;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }

    // 2 rotating dots around the icon (grayscale)
    const dotV1 = lerpV(80, 210);
    const dotV2 = lerpV(60, 180);
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
        const orbitAngle = collectibleOrbitPhase + i * Math.PI;
        const orbitR = r * 1.3;
        const ox = cx + Math.cos(orbitAngle) * orbitR;
        const oy = cy + Math.sin(orbitAngle) * orbitR;
        const dotR = 4;
        const dv = i === 0 ? dotV1 : dotV2;

        ctx.beginPath();
        ctx.arc(ox, oy, dotR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${dv}, ${dv}, ${dv}, 0.9)`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${dv}, ${dv}, ${dv}, 0.35)`;
        ctx.beginPath();
        ctx.arc(ox, oy, dotR + 3, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Orbit trail (faint circle)
    const trailV = lerpV(140, 180);
    ctx.strokeStyle = `rgba(${trailV}, ${trailV}, ${trailV}, 0.12)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

// Offscreen canvas for tinting dino heads
const _tintCanvas = document.createElement('canvas');
const _tintCtx = _tintCanvas.getContext('2d');

function getHealthColor() {
    // Green in day, cyan in night, interpolated
    const r = Math.round(0 + (204 - 0) * themeT);
    const g = Math.round(180 + (0 - 180) * themeT);
    const b = Math.round(0 + (0 - 0) * themeT);
    return { r, g, b, hex: `rgb(${r},${g},${b})` };
}

function drawTintedDinoHead(destCtx, img, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (!img.complete) return;
    const col = getHealthColor();
    _tintCanvas.width = dw;
    _tintCanvas.height = dh;
    _tintCtx.clearRect(0, 0, dw, dh);
    _tintCtx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    _tintCtx.globalCompositeOperation = 'source-atop';
    _tintCtx.fillStyle = col.hex;
    _tintCtx.fillRect(0, 0, dw, dh);
    _tintCtx.globalCompositeOperation = 'source-over';
    destCtx.drawImage(_tintCanvas, dx, dy);
}

function drawHealthHead(h) {
    const bob = Math.sin(h.bobPhase) * 4;
    const cx = h.x + h.width / 2;
    const cy = h.y + h.height / 2 + bob;
    const col = getHealthColor();

    ctx.save();
    // Glow
    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, h.width);
    glow.addColorStop(0, `rgba(${col.r}, ${col.g}, ${col.b}, 0.3)`);
    glow.addColorStop(1, `rgba(${col.r}, ${col.g}, ${col.b}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, h.width, 0, Math.PI * 2);
    ctx.fill();

    // Draw tinted dino head
    drawTintedDinoHead(ctx, dinoIdleImg, 0, 0, dinoIdleImg.width, dinoIdleImg.width * 0.5,
        cx - h.width / 2, cy - h.height / 2, h.width, h.height * 0.8);
    ctx.restore();
}

function drawHealthHUD() {
    const headSize = 22;
    const headDrawH = Math.round(headSize * 0.8);
    const gap = 6;
    const pad = 8;
    const headsW = 5 * headSize + 4 * gap;
    const boxX = 6;
    const boxY = HUD_Y - 16;
    const boxW = Math.max(headsW, 80) + pad * 2 + 6;
    const boxH = headDrawH + 24 + pad * 2;
    const headStartX = boxX + pad + 3;
    const headStartY = boxY + pad + 20;
    const fullHeads = Math.floor(dinoHeadPickups / 2);
    const hasHalf = dinoHeadPickups % 2 === 1;

    ctx.save();

    // Retro black box background
    const bgV = lerpV(0, 30);
    ctx.fillStyle = `rgb(${bgV},${bgV},${bgV})`;
    ctx.fillRect(boxX, boxY, boxW, boxH);

    // Border (double-line retro style)
    const borderV = lerpV(83, 200);
    ctx.strokeStyle = `rgb(${borderV},${borderV},${borderV})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX + 3, boxY + 3, boxW - 6, boxH - 6);

    // Player name inside the box
    if (currentUsername) {
        ctx.fillStyle = `rgb(${borderV},${borderV},${borderV})`;
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(currentUsername.toUpperCase(), headStartX, boxY + pad + 12);
    }

    // Blink HUD heads during health hit immunity (matches dino blink)
    const blinkHide = healthHitImmune && Math.floor(Date.now() / 100) % 2 === 0;

    if (!blinkHide) {
        for (let i = 0; i < 5; i++) {
            const hx = headStartX + i * (headSize + gap);
            const hy = headStartY;

            if (i < fullHeads) {
                ctx.globalAlpha = 1;
                drawTintedDinoHead(ctx, dinoIdleImg, 0, 0, dinoIdleImg.width, dinoIdleImg.width * 0.5,
                    hx, hy, headSize, headDrawH);
            } else if (i === fullHeads && hasHalf) {
                // Top half — faded gray
                ctx.save();
                ctx.beginPath();
                ctx.rect(hx, hy, headSize, headDrawH / 2);
                ctx.clip();
                ctx.globalAlpha = 0.25;
                if (dinoIdleImg.complete) {
                    ctx.drawImage(dinoIdleImg, 0, 0, dinoIdleImg.width, dinoIdleImg.width * 0.5,
                        hx, hy, headSize, headDrawH);
                }
                ctx.restore();
                // Bottom half — filled
                ctx.save();
                ctx.beginPath();
                ctx.rect(hx, hy + headDrawH / 2, headSize, headDrawH / 2);
                ctx.clip();
                ctx.globalAlpha = 1;
                drawTintedDinoHead(ctx, dinoIdleImg, 0, 0, dinoIdleImg.width, dinoIdleImg.width * 0.5,
                    hx, hy, headSize, headDrawH);
                ctx.restore();
            } else {
                ctx.globalAlpha = 0.25;
                if (dinoIdleImg.complete) {
                    ctx.drawImage(dinoIdleImg, 0, 0, dinoIdleImg.width, dinoIdleImg.width * 0.5,
                        hx, hy, headSize, headDrawH);
                }
            }
        }
    }
    ctx.restore();
}

function drawPowerTimerBar(frac, blink, message, seconds) {
    const barH = 8;
    const barY = GROUND_LINE + 20;
    const fillW = CANVAS_WIDTH * frac;
    ctx.save();
    ctx.globalAlpha = 0.7 * blink;

    // Border
    const borderV = lerpV(40, 80);
    ctx.strokeStyle = `rgb(${borderV}, ${borderV}, ${borderV})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, barY, CANVAS_WIDTH, barH);

    // Background
    const bgV = lerpV(50, 100);
    ctx.fillStyle = `rgba(${bgV}, ${bgV}, ${bgV}, 0.3)`;
    ctx.fillRect(0, barY, CANVAS_WIDTH, barH);

    // Diagonal stripes fill
    if (fillW > 0) {
        ctx.beginPath();
        ctx.rect(0, barY, fillW, barH);
        ctx.clip();

        const stripeW = 6;
        const stripeV = frac > 0.3 ? lerpV(60, 180) : lerpV(40, 130);
        ctx.fillStyle = `rgb(${stripeV}, ${stripeV}, ${stripeV})`;
        ctx.fillRect(0, barY, fillW, barH);

        const lightV = frac > 0.3 ? lerpV(90, 230) : lerpV(70, 170);
        ctx.fillStyle = `rgb(${lightV}, ${lightV}, ${lightV})`;
        for (let x = -barH; x < fillW + barH; x += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(x, barY + barH);
            ctx.lineTo(x + barH, barY);
            ctx.lineTo(x + barH + stripeW, barY);
            ctx.lineTo(x + stripeW, barY + barH);
            ctx.closePath();
            ctx.fill();
        }
    }

    ctx.restore();

    // Message below the bar
    ctx.save();
    ctx.globalAlpha = 0.8 * blink;
    ctx.fillStyle = getHudColor();
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(message + ' ' + seconds + 's', CANVAS_WIDTH / 2, barY + barH + 22);
    ctx.restore();
}

function drawImmunityEffect() {
    if (!immunityActive) return;

    ctx.save();
    const dcx = dino.x + dino.width / 2;
    const dcy = dino.y + dino.height / 2;
    const shieldR = Math.max(dino.width, dino.height) * 0.7;

    // Pulsing shield bubble
    const pulse = 1 + Math.sin(frameCount * 0.1) * 0.08;
    const remainMs = Math.max(0, immunityEndTime - Date.now());
    const blink = remainMs < 3000 ? (Math.floor(remainMs / 130) % 2 === 0 ? 1 : 0.3) : 1; // blink last 3s

    const bv = lerpV(120, 200); // bubble grayscale value

    ctx.globalAlpha = 0.3 * blink;

    // Shield bubble glow (grayscale)
    const bubbleGrad = ctx.createRadialGradient(dcx, dcy, shieldR * 0.3 * pulse, dcx, dcy, shieldR * pulse);
    bubbleGrad.addColorStop(0, `rgba(${bv}, ${bv}, ${bv}, 0.12)`);
    bubbleGrad.addColorStop(0.7, `rgba(${bv}, ${bv}, ${bv}, 0.2)`);
    bubbleGrad.addColorStop(1, `rgba(${bv}, ${bv}, ${bv}, 0)`);
    ctx.fillStyle = bubbleGrad;
    ctx.beginPath();
    ctx.arc(dcx, dcy, shieldR * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Shield ring (grayscale)
    ctx.globalAlpha = 0.5 * blink;
    ctx.strokeStyle = `rgba(${bv}, ${bv}, ${bv}, 0.5)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dcx, dcy, shieldR * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Small shield icon above dino
    if (shieldImg.complete) {
        const iconSize = 18;
        const iconY = dino.y - 20;
        ctx.globalAlpha = 0.7 * blink;
        ctx.drawImage(shieldImg, dcx - iconSize / 2, iconY - iconSize / 2, iconSize, iconSize);
    }

    // Full-width timer bar below ground line
    drawPowerTimerBar(remainMs / IMMUNITY_DURATION_MS, blink, 'Immune for', Math.ceil(remainMs / 1000));

    ctx.restore();
}

function drawDashEffect() {
    if (!dashActive) return;
    ctx.save();

    const remaining = Math.max(0, dashEndTime - Date.now());
    const blink = remaining < 2000 ? (Math.floor(remaining / 130) % 2 === 0 ? 1 : 0.4) : 1;

    // Speed lines across the screen
    const lv = lerpV(80, 190);
    dashSpeedLines.forEach(l => {
        ctx.globalAlpha = l.alpha * blink;
        ctx.strokeStyle = `rgb(${lv}, ${lv}, ${lv})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x + l.len, l.y);
        ctx.stroke();
    });

    // Trail particles behind dino
    const tv = lerpV(130, 190);
    dashTrailParticles.forEach(p => {
        ctx.globalAlpha = p.alpha * blink;
        ctx.fillStyle = `rgb(${tv}, ${tv}, ${tv})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Flying obstacles (tumbling through the air)
    flyingObstacles.forEach(f => {
        ctx.save();
        ctx.globalAlpha = f.alpha;
        ctx.translate(f.x + f.width / 2, f.y + f.height / 2);
        ctx.rotate(f.rotation);
        // Draw the obstacle image rotated
        if (f.type === 'cactus') {
            let img;
            if (f.subtype === 'large') img = cactusLargeImg;
            else if (f.subtype === 'cluster') img = cactusClusterImg;
            else img = cactusSmallImg;
            if (img.complete) {
                ctx.drawImage(img, -f.width / 2, -f.height / 2, f.width, f.height);
            }
        } else if (f.type === 'bird' && birdSheet.complete) {
            const sx = f.animFrame * BIRD_FRAME_W;
            ctx.drawImage(birdSheet, sx, 0, BIRD_FRAME_W, BIRD_FRAME_H, -f.width / 2, -f.height / 2, f.width, f.height);
        }
        ctx.restore();
    });

    // Full-width timer bar below ground line
    drawPowerTimerBar(remaining / DASH_DURATION_MS, blink, 'Dashing for', Math.ceil(remaining / 1000));

    // Small dash icon above dino
    const dcx = dino.x + dino.width / 2;
    if (dashImg.complete) {
        const iconSize = 18;
        const iconY = dino.y - 20;
        ctx.globalAlpha = 0.7 * blink;
        ctx.drawImage(dashImg, dcx - iconSize / 2, iconY - iconSize / 2, iconSize, iconSize);
    }

    ctx.restore();
}

function drawMultiplierEffect() {
    if (!multiplierActive) return;

    ctx.save();
    const dcx = dino.x + dino.width / 2;
    const remainMs = Math.max(0, multiplierEndTime - Date.now());
    const blink = remainMs < 2000 ? (Math.floor(remainMs / 130) % 2 === 0 ? 1 : 0.3) : 1;

    // Small 2x icon above dino
    if (multiplierImg.complete) {
        const iconSize = 18;
        const iconY = dino.y - 20;
        ctx.globalAlpha = 0.7 * blink;
        ctx.drawImage(multiplierImg, dcx - iconSize / 2, iconY - iconSize / 2, iconSize, iconSize);
    }

    // Full-width timer bar below ground line
    drawPowerTimerBar(remainMs / MULTIPLIER_DURATION_MS, blink, 'Score multiplied for', Math.ceil(remainMs / 1000));

    // "2X" text on HUD (top right area, below score)
    ctx.globalAlpha = 0.8 * blink;
    ctx.fillStyle = getHudColor();
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('2X SCORE', CANVAS_WIDTH - 15, HUD_Y + 20);
    ctx.textAlign = 'left';

    ctx.restore();
}

// ======== BACKGROUND ELEMENTS (Sun, Tumbleweed, Tornado) ========

// Background element (tumbleweed or tornado) — only one at a time
let bgElement = null; // { type: 'tumbleweed' | 'tornado', x, y, ... }
let bgElementCooldown = 0; // frames until next spawn

function initBgElement() {
    bgElement = null;
    bgElementCooldown = 180 + Math.floor(Math.random() * 300); // 3-8 seconds
}

function spawnBgElement() {
    if (bgElement) return;
    bgElementCooldown--;
    if (bgElementCooldown > 0) return;

    const type = Math.random() < 0.5 ? 'tumbleweed' : 'tornado';
    if (type === 'tumbleweed') {
        const size = 50 + Math.random() * 30; // 50-80px (2x bigger)
        bgElement = {
            type: 'tumbleweed',
            x: CANVAS_WIDTH + size,
            y: GROUND_LINE - size / 2, // center sits on ground (radius = size/2)
            size: size,
            rotation: 0,
            rotSpeed: 0.04 + Math.random() * 0.03,
            speed: 1.2 + Math.random() * 0.8,
            bouncePhase: 0, // start at ground
            bounceAmp: 8 + Math.random() * 10, // bigger bounces
            onGround: true,
            // tumbleweed branch angles (procedural)
            branches: [],
            // Extra detail: inner tangles
            tangles: []
        };
        // Generate random branch structure
        const numBranches = 12 + Math.floor(Math.random() * 8); // more branches
        for (let i = 0; i < numBranches; i++) {
            const angle = (Math.PI * 2 * i) / numBranches + (Math.random() - 0.5) * 0.4;
            const len = 0.5 + Math.random() * 0.5; // fraction of radius
            const hasSubBranch = Math.random() < 0.6;
            bgElement.branches.push({
                angle,
                len,
                subAngle: hasSubBranch ? angle + (Math.random() - 0.5) * 1.2 : 0,
                subLen: hasSubBranch ? len * (0.3 + Math.random() * 0.4) : 0
            });
        }
        // Generate inner tangle curves for realism
        for (let i = 0; i < 10; i++) {
            bgElement.tangles.push({
                startAngle: Math.random() * Math.PI * 2,
                arc: 0.8 + Math.random() * 2.5,
                radiusFrac: 0.2 + Math.random() * 0.7
            });
        }
    } else {
        // Tornado (procedural)
        bgElement = {
            type: 'tornado',
            x: CANVAS_WIDTH + 120,
            y: GROUND_LINE,
            speed: 0.8 + Math.random() * 0.6,
            width: 96 + Math.random() * 48,
            height: 240 + Math.random() * 144,
            phase: 0,
            dustParticles: [],
            swaySeed: Math.random() * 1000
        };
        for (let i = 0; i < 35; i++) {
            bgElement.dustParticles.push({
                angle: Math.random() * Math.PI * 2,
                heightFrac: Math.random(),
                speed: 0.04 + Math.random() * 0.1,
                radiusFrac: 0.2 + Math.random() * 0.8,
                size: 1 + Math.random() * 3
            });
        }
    }
}

function updateBgElement() {
    if (!bgElement) {
        spawnBgElement();
        return;
    }

    if (bgElement.type === 'tumbleweed') {
        bgElement.x -= bgElement.speed + gameSpeed * 0.3;
        bgElement.rotation += bgElement.rotSpeed;
        bgElement.bouncePhase += 0.06;
        // Bounce: use abs(sin) so it only goes UP from ground, never below
        const r = bgElement.size / 2;
        const bounce = Math.abs(Math.sin(bgElement.bouncePhase)) * bgElement.bounceAmp;
        bgElement.y = GROUND_LINE - r - bounce;

        // Remove when off-screen left
        if (bgElement.x < -bgElement.size * 2) {
            bgElement = null;
            bgElementCooldown = 180 + Math.floor(Math.random() * 300);
        }
    } else if (bgElement.type === 'tornado') {
        bgElement.x -= bgElement.speed + gameSpeed * 0.2;
        bgElement.phase += 0.03;

        bgElement.dustParticles.forEach(p => {
            p.angle += p.speed;
            p.heightFrac += 0.003;
            if (p.heightFrac > 1) p.heightFrac = 0;
        });

        if (bgElement.x < -bgElement.width * 2) {
            bgElement = null;
            bgElementCooldown = 240 + Math.floor(Math.random() * 360);
        }
    }
}

function drawSunMoon() {
    if (!SUN_X) return;
    ctx.save();

    // Radius shrinks for moon (60% of sun)
    const r = SUN_RADIUS * (1 - themeT * 0.4);

    if (themeT < 1) {
        // === SUN (fades out as night approaches) ===
        const sunAlpha = 1 - themeT;

        // Outer glow
        const gradient = ctx.createRadialGradient(SUN_X, SUN_Y, r * 0.3, SUN_X, SUN_Y, r * 2.5);
        gradient.addColorStop(0, `rgba(200, 200, 200, ${(0.2 * sunAlpha).toFixed(3)})`);
        gradient.addColorStop(0.5, `rgba(180, 180, 180, ${(0.08 * sunAlpha).toFixed(3)})`);
        gradient.addColorStop(1, 'rgba(180, 180, 180, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(SUN_X, SUN_Y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Sun body
        ctx.fillStyle = `rgba(210, 210, 210, ${(0.35 * sunAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(SUN_X, SUN_Y, r, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        ctx.fillStyle = `rgba(230, 230, 230, ${(0.4 * sunAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(SUN_X, SUN_Y, r * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Sun rays
        ctx.strokeStyle = `rgba(190, 190, 190, ${(0.15 * sunAlpha).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 * i) / 12;
            ctx.beginPath();
            ctx.moveTo(SUN_X + Math.cos(angle) * r * 1.15, SUN_Y + Math.sin(angle) * r * 1.15);
            ctx.lineTo(SUN_X + Math.cos(angle) * r * 1.6, SUN_Y + Math.sin(angle) * r * 1.6);
            ctx.stroke();
        }
    }

    if (themeT > 0) {
        // === MOON (fades in as night approaches) ===
        const moonAlpha = themeT;

        // Moon glow
        const moonGlow = ctx.createRadialGradient(SUN_X, SUN_Y, r * 0.3, SUN_X, SUN_Y, r * 3);
        moonGlow.addColorStop(0, `rgba(220, 220, 240, ${(0.25 * moonAlpha).toFixed(3)})`);
        moonGlow.addColorStop(0.4, `rgba(200, 200, 220, ${(0.1 * moonAlpha).toFixed(3)})`);
        moonGlow.addColorStop(1, 'rgba(200, 200, 220, 0)');
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(SUN_X, SUN_Y, r * 3, 0, Math.PI * 2);
        ctx.fill();

        // Moon body — full moon, bright white
        ctx.fillStyle = `rgba(220, 220, 230, ${(0.9 * moonAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(SUN_X, SUN_Y, r, 0, Math.PI * 2);
        ctx.fill();

        // Subtle surface shading (darker edge gradient for depth)
        const surfGrad = ctx.createRadialGradient(
            SUN_X - r * 0.15, SUN_Y - r * 0.1, r * 0.1,
            SUN_X, SUN_Y, r
        );
        surfGrad.addColorStop(0, `rgba(240, 240, 245, ${(0.3 * moonAlpha).toFixed(3)})`);
        surfGrad.addColorStop(0.7, 'rgba(240, 240, 245, 0)');
        surfGrad.addColorStop(1, `rgba(160, 160, 170, ${(0.2 * moonAlpha).toFixed(3)})`);
        ctx.fillStyle = surfGrad;
        ctx.beginPath();
        ctx.arc(SUN_X, SUN_Y, r, 0, Math.PI * 2);
        ctx.fill();

        // Crater marks (subtle dark patches)
        ctx.globalAlpha = moonAlpha * 0.15;
        ctx.fillStyle = '#888';
        ctx.beginPath();
        ctx.arc(SUN_X - r * 0.25, SUN_Y - r * 0.15, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(SUN_X + r * 0.2, SUN_Y + r * 0.25, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(SUN_X + r * 0.05, SUN_Y - r * 0.4, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(SUN_X - r * 0.35, SUN_Y + r * 0.3, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}

function drawTumbleweed(tw) {
    const r = tw.size / 2;

    // Ground shadow (moves with bounce height)
    ctx.save();
    const heightAboveGround = GROUND_LINE - r - tw.y;
    const shadowScale = Math.max(0.3, 1 - heightAboveGround / 40);
    ctx.globalAlpha = 0.12 * shadowScale;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(tw.x, GROUND_LINE + 2, r * 0.8 * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(tw.x, tw.y);
    ctx.rotate(tw.rotation);
    ctx.globalAlpha = 0.45;

    const mainColor = themeRgb(100, 90, 70, 170, 160, 140);
    const lightColor = themeRgb(140, 130, 100, 200, 190, 170);
    const darkColor = themeRgb(70, 60, 45, 130, 120, 100);

    // Outer rough edge (slightly bumpy circle)
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i <= 36; i++) {
        const a = (Math.PI * 2 * i) / 36;
        const wobble = r * (0.92 + Math.sin(a * 5 + 1.3) * 0.08 + Math.sin(a * 8 + 2.7) * 0.05);
        const px = Math.cos(a) * wobble;
        const py = Math.sin(a) * wobble;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    // Inner tangle rings (offset circles)
    ctx.lineWidth = 1;
    ctx.strokeStyle = darkColor;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 0.12, -r * 0.08, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-r * 0.1, r * 0.12, r * 0.38, 0, Math.PI * 2);
    ctx.stroke();

    // Inner tangle curves
    ctx.strokeStyle = lightColor;
    ctx.lineWidth = 0.7;
    if (tw.tangles) {
        tw.tangles.forEach(tg => {
            const cr = r * tg.radiusFrac;
            ctx.beginPath();
            ctx.arc(0, 0, cr, tg.startAngle, tg.startAngle + tg.arc);
            ctx.stroke();
        });
    }

    // Branches radiating from center
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = mainColor;
    tw.branches.forEach(b => {
        const endX = Math.cos(b.angle) * r * b.len;
        const endY = Math.sin(b.angle) * r * b.len;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Sub-branches
        if (b.subLen > 0) {
            ctx.lineWidth = 0.8;
            const subEndX = endX + Math.cos(b.subAngle) * r * b.subLen;
            const subEndY = endY + Math.sin(b.subAngle) * r * b.subLen;
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(subEndX, subEndY);
            ctx.stroke();

            // Tiny twig off sub-branch
            const twigAngle = b.subAngle + (Math.random() < 0.5 ? 0.6 : -0.6);
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(subEndX, subEndY);
            ctx.lineTo(subEndX + Math.cos(twigAngle) * r * 0.15, subEndY + Math.sin(twigAngle) * r * 0.15);
            ctx.stroke();
            ctx.lineWidth = 1.2;
        }
    });

    // Wispy outer strands (curly)
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = lightColor;
    for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10 + 0.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
        const cp1x = Math.cos(a + 0.4) * r * 1.15;
        const cp1y = Math.sin(a + 0.4) * r * 1.15;
        const cp2x = Math.cos(a + 0.2) * r * 1.05;
        const cp2y = Math.sin(a + 0.2) * r * 1.05;
        const endx = Math.cos(a + 0.5) * r * 0.9;
        const endy = Math.sin(a + 0.5) * r * 0.9;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy);
        ctx.stroke();
    }

    // Small debris dots scattered inside
    ctx.fillStyle = darkColor;
    for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8 + 0.5;
        const dr = r * (0.2 + (i % 3) * 0.2);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * dr, Math.sin(a) * dr, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawTornado(t) {
    ctx.save();
    ctx.globalAlpha = 0.3;

    const baseX = t.x;
    const baseY = t.y;
    const w = t.width;
    const h = t.height;

    // Helper: get funnel width and sway at a given height fraction
    function funnelX(frac) {
        const sliceW = w * (0.15 + frac * 0.85); // very narrow at bottom, wide at top
        const sway = Math.sin(t.phase + frac * 4 + t.swaySeed) * (1 - frac) * 18
                   + Math.sin(t.phase * 1.7 + frac * 6) * (1 - frac) * 6;
        return { sliceW, sway };
    }

    // Filled funnel body with gradient shading
    const slices = 35;
    for (let i = 0; i < slices; i++) {
        const frac = i / slices;
        const fracNext = (i + 1) / slices;
        const y1 = baseY - frac * h;
        const y2 = baseY - fracNext * h;
        const f1 = funnelX(frac);
        const f2 = funnelX(fracNext);

        // Filled band with gradient from dark edges to lighter center
        const tv = lerpV(85 + frac * 30, 150 + frac * 40);
        const edgeTv = lerpV(60 + frac * 20, 120 + frac * 30);
        ctx.fillStyle = `rgba(${tv}, ${tv}, ${tv}, ${0.15 + (1 - frac) * 0.15})`;
        ctx.beginPath();
        ctx.moveTo(baseX + f1.sway - f1.sliceW / 2, y1);
        ctx.lineTo(baseX + f2.sway - f2.sliceW / 2, y2);
        ctx.lineTo(baseX + f2.sway + f2.sliceW / 2, y2);
        ctx.lineTo(baseX + f1.sway + f1.sliceW / 2, y1);
        ctx.closePath();
        ctx.fill();

        // Edge strokes for definition
        ctx.strokeStyle = `rgba(${edgeTv}, ${edgeTv}, ${edgeTv}, ${0.25 + (1 - frac) * 0.2})`;
        ctx.lineWidth = 0.6 + frac * 0.8;
        ctx.beginPath();
        ctx.moveTo(baseX + f1.sway - f1.sliceW / 2, y1);
        ctx.lineTo(baseX + f2.sway - f2.sliceW / 2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(baseX + f1.sway + f1.sliceW / 2, y1);
        ctx.lineTo(baseX + f2.sway + f2.sliceW / 2, y2);
        ctx.stroke();
    }

    // Horizontal ellipse bands for the swirling look
    for (let i = 0; i < 18; i++) {
        const frac = i / 18;
        const y = baseY - frac * h;
        const f = funnelX(frac);
        const tv = lerpV(75, 160);
        ctx.strokeStyle = `rgba(${tv}, ${tv}, ${tv}, ${0.2 + frac * 0.15})`;
        ctx.lineWidth = 0.8 + frac * 1.0;
        ctx.beginPath();
        ctx.ellipse(baseX + f.sway, y, f.sliceW / 2, 1.5 + frac * 3, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Spiral vortex lines (5 spirals for density)
    for (let s = 0; s < 5; s++) {
        const tv = lerpV(70, 165);
        ctx.strokeStyle = `rgba(${tv}, ${tv}, ${tv}, 0.2)`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= 60; i++) {
            const frac = i / 60;
            const y = baseY - frac * h;
            const f = funnelX(frac);
            const spiralAngle = t.phase * 3 + frac * 10 + s * (Math.PI * 2 / 5);
            const x = baseX + f.sway + Math.cos(spiralAngle) * f.sliceW / 2 * 0.85;
            if (!started) { ctx.moveTo(x, y); started = true; }
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Debris / dust particles swirling inside
    t.dustParticles.forEach(p => {
        const frac = p.heightFrac;
        const y = baseY - frac * h;
        const f = funnelX(frac);
        const x = baseX + f.sway + Math.cos(p.angle) * f.sliceW / 2 * p.radiusFrac;
        const tv = lerpV(100, 170);
        ctx.fillStyle = `rgba(${tv}, ${tv}, ${tv}, ${0.3 + frac * 0.2})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });

    // Flying debris at edges (small streaks)
    ctx.strokeStyle = themeRgba(90, 90, 90, 0.25, 160, 160, 160, 0.25);
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
        const frac = (i + 0.5) / 8;
        const f = funnelX(frac);
        const y = baseY - frac * h;
        const side = i % 2 === 0 ? 1 : -1;
        const debrisX = baseX + f.sway + side * (f.sliceW / 2 + 3 + Math.sin(t.phase * 2 + i) * 5);
        ctx.beginPath();
        ctx.moveTo(debrisX, y - 2);
        ctx.lineTo(debrisX + side * 4, y + 1);
        ctx.stroke();
    }

    // Ground dust cloud at base
    const dustTv = lerpV(130, 175);
    ctx.fillStyle = `rgba(${dustTv}, ${dustTv}, ${dustTv}, 0.15)`;
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + 2, w * 0.9, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${dustTv}, ${dustTv}, ${dustTv}, 0.08)`;
    ctx.beginPath();
    ctx.ellipse(baseX + Math.sin(t.phase) * 5, baseY + 4, w * 1.3, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function initClouds() {
    clouds = [];
    for (let i = 0; i < 5; i++) {
        clouds.push({
            x: Math.random() * CANVAS_WIDTH,
            y: 30 + Math.random() * (CANVAS_HEIGHT * 0.3),
            width: 60 + Math.random() * 40,
            speed: 0.5 + Math.random() * 0.5
        });
    }
}

function initGround() {
    groundBumps = [];
    for (let i = 0; i < 40; i++) {
        groundBumps.push({
            x: Math.random() * CANVAS_WIDTH,
            size: 1 + Math.random() * 3
        });
    }
}

function resetGame() {
    dino.y = GROUND_Y;
    dino.velocityY = 0;
    dino.isJumping = false;
    dino.isDucking = false;
    dino.width = dino.standWidth;
    dino.height = dino.standHeight;
    obstacles = [];
    score = 0;
    scoreAccum = 0;
    gameSpeed = INITIAL_SPEED;
    frameCount = 0;
    obstacleTimer = 0;
    groundOffset = 0;
    dinoAnimFrame = 0;
    highScoreBeaten = false;
    newHighScoreTime = 0;
    nextSpawnAt = 60 + Math.random() * 80;
    // Reset collectibles & immunity
    collectibles = [];
    collectibleNextSpawnTime = Date.now() + 7000;
    immunityActive = false;
    immunityEndTime = 0;
    multiplierActive = false;
    multiplierEndTime = 0;
    dashActive = false;
    dashEndTime = 0;
    dashPhase = 'idle';
    flyingObstacles = [];
    dashSpeedLines = [];
    dashTrailParticles = [];
    dino.x = DINO_X;
    gameOverDisplay.classList.add('hidden');
    initClouds();
    initGround();
    initBgElement();
    initSkyBirds();
    // Reset to day theme
    isNight = false;
    themeT = 0;
    themeTransitioning = false;
    lastThemeCycle = 0;
}

function startIntro() {
    appState = 'playing';
    showScreen(null); // hide all overlays
    gameState = 'intro';

    // Reset intro state
    introPhase = 0;
    introTimer = 0;
    introCloudsShown = 0;
    introGroundProgress = 0;
    introDinoY = -80;
    introDinoVel = 0;
    introDinoLanded = false;
    introRunFrames = 0;
    introDustParticles = [];

    // Prepare intro clouds at random positions
    introClouds = [];
    for (let i = 0; i < 5; i++) {
        introClouds.push({
            x: CANVAS_WIDTH * 0.1 + Math.random() * CANVAS_WIDTH * 0.8,
            y: 30 + Math.random() * (CANVAS_HEIGHT * 0.3),
            width: 60 + Math.random() * 40,
            speed: 0.5 + Math.random() * 0.5,
            opacity: 0
        });
    }

    // Reset game variables but don't start running yet
    obstacles = [];
    score = 0;
    scoreAccum = 0;
    gameSpeed = INITIAL_SPEED;
    frameCount = 0;
    obstacleTimer = 0;
    groundOffset = 0;
    dinoAnimFrame = 0;
    animAccum = 0;
    highScoreBeaten = false;
    newHighScoreTime = 0;
    nextSpawnAt = 60 + Math.random() * 80;
    // Reset health system
    dinoHeadPickups = 0;
    healthHeads = [];
    healthNextSpawnScore = HEALTH_TESTING ? 0 : 100;
    healthHitImmune = false;
    healthHitImmuneEnd = 0;
    gameOverDisplay.classList.add('hidden');
    initGround();
    // Reset to day theme
    isNight = false;
    themeT = 0;
    themeTransitioning = false;
    lastThemeCycle = 0;
}

function startGame() {
    appState = 'playing';
    showScreen(null); // hide all overlays
    gameState = 'running';
    resetGame();
}

function onGameOver() {
    gameState = 'dying';
    deathTimer = 0;
    deathDinoVelY = -6; // pop up first
    deathDinoRotation = 0;
    deathDinoY = dino.y;
    // Save score — addScoreToHistory updates localStorage cache first (sync), then fires API in background
    if (currentUsername) {
        addScoreToHistory(currentUsername, score);
        const cached = getCachedPlayers();
        const player = cached[currentUsername.toLowerCase()];
        highScore = player?.bestScore || 0;
    }
}

function finishDeath() {
    gameState = 'over';
    gameOverAnimTimer = 0;
}

// Input handling
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();

        // From menu, start intro transition
        if (appState === 'menu') {
            startIntro();
            return;
        }

        // In game (ignore input during intro and dying)
        if (appState === 'playing' && gameState !== 'intro' && gameState !== 'dying') {
            if (gameState === 'over') {
                startIntro();
                return;
            } else if (gameState === 'running' && !dino.isJumping) {
                dino.velocityY = JUMP_FORCE;
                dino.isJumping = true;
            }
        }
    }

    if ((e.code === 'ArrowDown' || e.code === 'KeyS') && appState === 'playing' && gameState === 'running') {
        e.preventDefault();
        if (!dino.isDucking) {
            dino.isDucking = true;
            dino.width = dino.duckWidth;
            dino.height = dino.duckHeight;
            dino.y = GROUND_Y + (dino.standHeight - dino.duckHeight);
        }
    }

    // Escape to go back to menu from game over
    if (e.code === 'Escape' && appState === 'playing' && gameState === 'over') {
        showMenu();
    }
});

document.addEventListener('keyup', (e) => {
    if ((e.code === 'ArrowDown' || e.code === 'KeyS') && appState === 'playing' && gameState === 'running') {
        dino.isDucking = false;
        dino.width = dino.standWidth;
        dino.height = dino.standHeight;
        if (!dino.isJumping) {
            dino.y = GROUND_Y;
        }
    }
});

// Spawn obstacles
let nextSpawnAt = 60 + Math.random() * 80;

function pickCactus() {
    const r = Math.random();
    let subtype, w, h;
    if (r < 0.35) {
        subtype = 'small';
        w = 30; h = 40;
    } else if (r < 0.7) {
        subtype = 'large';
        w = 30; h = 60;
    } else {
        subtype = 'cluster';
        w = 30; h = 33;
    }
    return { subtype, w, h };
}

function spawnObstacle() {
    if (score < 5) return;

    obstacleTimer++;
    if (obstacleTimer < nextSpawnAt) return;
    obstacleTimer = 0;
    const speedFactor = Math.max(0.2, 1 - (gameSpeed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED) * 0.8);
    nextSpawnAt = Math.floor((150 * speedFactor) + Math.random() * (250 * speedFactor));

    if (score > 200 && Math.random() < 0.3) {
        const flyHeight = Math.random() < 0.5 ? GROUND_Y + 30 : GROUND_Y - 70;
        obstacles.push({
            type: 'bird',
            x: CANVAS_WIDTH,
            y: flyHeight,
            width: 58,
            height: 40,
            animFrame: 0
        });
    } else {
        const c1 = pickCactus();
        obstacles.push({
            type: 'cactus',
            subtype: c1.subtype,
            x: CANVAS_WIDTH,
            y: GROUND_LINE - c1.h,
            width: c1.w,
            height: c1.h
        });

        if (Math.random() < 0.4) {
            const c2 = pickCactus();
            obstacles.push({
                type: 'cactus',
                subtype: c2.subtype,
                x: CANVAS_WIDTH + c1.w + 5,
                y: GROUND_LINE - c2.h,
                width: c2.w,
                height: c2.h
            });
        }
    }
}

function checkCollision(a, b) {
    const pad = 8;
    return (
        a.x + pad < b.x + b.width - pad &&
        a.x + a.width - pad > b.x + pad &&
        a.y + pad < b.y + b.height - pad &&
        a.y + a.height - pad > b.y + pad
    );
}

// ======== INTRO ANIMATION ========
// Timing: ~3 seconds total at 60fps (180 frames)
// Phase 0 (clouds):  ~1.3s   Phase 1 (ground): ~0.6s
// Phase 2 (fall):    ~0.7s   Phase 3 (run):    ~0.4s

function spawnDustParticles() {
    const footX = DINO_X + DINO_DRAW_W / 2;
    const footY = GROUND_LINE;
    for (let i = 0; i < 12; i++) {
        const angle = Math.PI + (Math.random() - 0.5) * Math.PI; // spread upward
        const speed = 1.5 + Math.random() * 3;
        introDustParticles.push({
            x: footX + (Math.random() - 0.5) * 30,
            y: footY - Math.random() * 5,
            vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1),
            vy: -Math.random() * 2.5 - 0.5,
            size: 3 + Math.random() * 5,
            opacity: 0.7 + Math.random() * 0.3,
            life: 0
        });
    }
}

function updateIntro() {
    introTimer++;

    // Update dust particles in all phases
    for (let i = introDustParticles.length - 1; i >= 0; i--) {
        const p = introDustParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03; // slight gravity on dust
        p.vx *= 0.97; // friction
        p.life++;
        p.opacity = Math.max(0, p.opacity - 0.018);
        p.size *= 0.99;
        if (p.opacity <= 0) introDustParticles.splice(i, 1);
    }

    if (introPhase === 0) {
        // Phase 0: Clouds fade in one by one (~1.3s)
        const cloudInterval = 12;
        const targetShown = Math.min(introClouds.length, Math.floor(introTimer / cloudInterval) + 1);
        introCloudsShown = targetShown;

        for (let i = 0; i < introClouds.length; i++) {
            if (i < introCloudsShown) {
                introClouds[i].opacity = Math.min(1, introClouds[i].opacity + 0.06);
            }
        }

        if (introCloudsShown >= introClouds.length && introClouds[introClouds.length - 1].opacity >= 1) {
            introPhase = 1;
            introTimer = 0;
        }
    } else if (introPhase === 1) {
        // Phase 1: Ground draws left to right (~0.6s)
        introGroundProgress = Math.min(1, introTimer / 35);
        if (introGroundProgress >= 1) {
            introPhase = 2;
            introTimer = 0;
            introDinoY = -80;
            introDinoVel = 0;
        }
    } else if (introPhase === 2) {
        // Phase 2: Dino falls from sky (~0.7s)
        introDinoVel += 0.5;
        introDinoY += introDinoVel;

        if (introDinoY >= GROUND_Y) {
            introDinoY = GROUND_Y;
            introDinoVel = 0;
            introDinoLanded = true;
            spawnDustParticles();
            introPhase = 3;
            introTimer = 0;
        }
    } else if (introPhase === 3) {
        // Phase 3: Dino runs in place (~0.4s) then game starts
        introRunFrames++;
        animAccum += INITIAL_SPEED;
        if (animAccum >= 35) {
            animAccum = 0;
            dinoAnimFrame = (dinoAnimFrame + 1) % DINO_FRAMES;
        }

        if (introRunFrames >= 25) {
            introPhase = 4;
            gameState = 'running';
            dino.y = GROUND_Y;
            dino.velocityY = 0;
            dino.isJumping = false;
            dino.isDucking = false;
            dino.width = dino.standWidth;
            dino.height = dino.standHeight;
            clouds = introClouds.map(c => ({
                x: c.x,
                y: c.y,
                width: c.width,
                speed: c.speed
            }));
        }
    }
}

function renderIntro() {
    // Always day during intro (themeT is 0)
    ctx.fillStyle = getBgColor();
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Sun in background during intro
    drawSunMoon();

    // Draw clouds that have appeared
    const cColor = getCloudColor();
    for (let i = 0; i < introClouds.length; i++) {
        const cloud = introClouds[i];
        if (cloud.opacity <= 0) continue;
        ctx.save();
        ctx.globalAlpha = cloud.opacity;
        ctx.fillStyle = cColor;
        ctx.fillRect(cloud.x, cloud.y, cloud.width, 10);
        ctx.fillRect(cloud.x + 8, cloud.y - 6, cloud.width - 16, 8);
        ctx.fillRect(cloud.x + 16, cloud.y - 10, cloud.width - 32, 6);
        ctx.restore();
    }

    // Draw ground (phase 1+)
    if (introPhase >= 1) {
        const groundWidth = introPhase >= 2 ? CANVAS_WIDTH : CANVAS_WIDTH * introGroundProgress;
        ctx.fillStyle = getGroundColor();
        ctx.fillRect(0, GROUND_LINE, groundWidth, 2);

        // Ground bumps only after ground fully drawn
        if (introPhase >= 2) {
            groundBumps.forEach(bump => {
                if (bump.x < groundWidth) {
                    ctx.fillRect(bump.x, GROUND_LINE + 4, bump.size * 3, 1);
                    ctx.fillRect(bump.x + 1, GROUND_LINE + 6, bump.size * 2, 1);
                }
            });
        }
    }

    // Draw dust particles (behind dino)
    introDustParticles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = getDustColor();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // Draw dino (phase 2+)
    if (introPhase >= 2) {
        if (introPhase === 2) {
            if (dinoIdleImg.complete) {
                ctx.drawImage(dinoIdleImg, DINO_X, introDinoY, DINO_DRAW_W, DINO_DRAW_H);
            }
        } else if (introPhase === 3) {
            if (dinoRunSheet.complete) {
                const sx = dinoAnimFrame * DINO_FRAME_W;
                ctx.drawImage(
                    dinoRunSheet,
                    sx, 0, DINO_FRAME_W, DINO_FRAME_H,
                    DINO_X, GROUND_Y, DINO_DRAW_W, DINO_DRAW_H
                );
            }
        }
    }

    // Username and score display during intro
    if (currentUsername) {
        ctx.fillStyle = getHudColor();
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(currentUsername, 15, HUD_Y);
    }
    ctx.fillStyle = getHudColor();
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('00000', CANVAS_WIDTH - 15, HUD_Y);
    if (highScore > 0) {
        ctx.fillStyle = getHudSecondaryColor();
        ctx.fillText('HI ' + String(highScore).padStart(5, '0'), CANVAS_WIDTH - 95, HUD_Y);
    }
    ctx.textAlign = 'left';
}

function updateDying() {
    deathTimer++;
    deathDinoVelY += 0.35; // gravity
    deathDinoY += deathDinoVelY;
    deathDinoRotation += 0.06; // spin

    if (deathTimer >= DEATH_DURATION) {
        finishDeath();
    }
}

function updateGame() {
    if (gameState !== 'running') return;
    frameCount++;

    if (dino.isJumping) {
        dino.velocityY += GRAVITY;
        dino.y += dino.velocityY;
        if (dino.isDucking) dino.velocityY += GRAVITY * 0.5;

        const landY = dino.isDucking
            ? GROUND_Y + (dino.standHeight - dino.duckHeight)
            : GROUND_Y;
        if (dino.y >= landY) {
            dino.y = landY;
            dino.velocityY = 0;
            dino.isJumping = false;
        }
    }

    animAccum += gameSpeed;
    if (animAccum >= 35) {
        animAccum = 0;
        dinoAnimFrame = (dinoAnimFrame + 1) % DINO_FRAMES;
    }

    spawnObstacle();

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.x -= gameSpeed;

        if (obs.type === 'bird') {
            obs.animAccum = (obs.animAccum || 0) + gameSpeed;
            if (obs.animAccum >= 40) {
                obs.animAccum = 0;
                obs.animFrame = (obs.animFrame + 1) % BIRD_FRAMES;
            }
        }

        if (obs.x + obs.width < 0) { obstacles.splice(i, 1); continue; }
        if (!immunityActive && !dashActive && !healthHitImmune && checkCollision(dino, obs)) {
            // Check if player has full health heads to absorb hit
            const fullHeads = Math.floor(dinoHeadPickups / 2);
            if (fullHeads > 0) {
                // Consume 1 full head (2 pickups) and grant 2s immunity
                dinoHeadPickups -= 2;
                healthHitImmune = true;
                healthHitImmuneEnd = Date.now() + HEALTH_HIT_IMMUNITY_MS;
                obstacles.splice(i, 1);
                continue;
            }
            onGameOver();
            return;
        }
    }

    clouds.forEach(cloud => {
        cloud.x -= cloud.speed * (gameSpeed / 3);
        if (cloud.x + cloud.width < 0) {
            cloud.x = CANVAS_WIDTH + Math.random() * 100;
            cloud.y = 30 + Math.random() * (CANVAS_HEIGHT * 0.3);
        }
    });

    groundOffset = (groundOffset + gameSpeed) % CANVAS_WIDTH;
    groundBumps.forEach(bump => {
        bump.x -= gameSpeed;
        if (bump.x < -5) bump.x = CANVAS_WIDTH + Math.random() * 20;
    });

    // Score ticks: +1 every 18 frames normally, +2 every 18 frames with multiplier
    scoreAccum++;
    if (scoreAccum >= 18) {
        scoreAccum = 0;
        score += multiplierActive ? 2 : 1;
    }

    // Check for new highscore during gameplay
    if (highScore > 0 && score > highScore && !highScoreBeaten) {
        highScoreBeaten = true;
        newHighScoreTime = Date.now();
    }

    const targetSpeed = INITIAL_SPEED + Math.floor(score / 50) * 0.10;
    gameSpeed = Math.min(targetSpeed, MAX_SPEED);
    // Dash overrides speed to max
    if (dashActive) gameSpeed = MAX_SPEED;

    // Update background element (tumbleweed/tornado)
    updateBgElement();
    updateSkyBirds();
    updateCollectibles();

    // Day/Night theme cycling every 450 points
    const currentCycle = Math.floor(score / THEME_CYCLE_SCORE);
    if (currentCycle !== lastThemeCycle) {
        lastThemeCycle = currentCycle;
        isNight = currentCycle % 2 === 1; // odd cycles = night
        themeTransitioning = true;
        themeTransitionDir = isNight ? 1 : -1;
    }
    if (themeTransitioning) {
        themeT += themeTransitionDir * (1 / THEME_TRANSITION_FRAMES);
        themeT = Math.max(0, Math.min(1, themeT));
        if (themeT <= 0 || themeT >= 1) themeTransitioning = false;
    }
    updateStarTwinkle();
}

// ======== DRAWING FUNCTIONS ========

function drawDino() {
    // Blink dino when health hit immunity is active
    if (healthHitImmune && Math.floor(Date.now() / 100) % 2 === 0) {
        return; // skip drawing every other frame for blink effect
    }
    if (gameState === 'dying') {
        // Death animation: dino tumbles and falls
        if (!dinoIdleImg.complete) return;
        ctx.save();
        const dcx = dino.x + DINO_DRAW_W / 2;
        const dcy = deathDinoY + DINO_DRAW_H / 2;
        ctx.translate(dcx, dcy);
        ctx.rotate(deathDinoRotation);
        ctx.drawImage(dinoIdleImg, -DINO_DRAW_W / 2, -DINO_DRAW_H / 2, DINO_DRAW_W, DINO_DRAW_H);
        ctx.restore();
        return;
    }
    if (dino.isDucking) {
        if (!dinoIdleImg.complete) return;
        ctx.save();
        ctx.translate(dino.x, dino.y);
        ctx.scale(1.3, 0.6);
        ctx.drawImage(dinoIdleImg, 0, 0, DINO_DUCK_W / 1.3, DINO_DUCK_H / 0.6);
        ctx.restore();
    } else if (gameState === 'running' && !dino.isJumping && dinoRunSheet.complete) {
        const sx = dinoAnimFrame * DINO_FRAME_W;
        ctx.drawImage(
            dinoRunSheet,
            sx, 0, DINO_FRAME_W, DINO_FRAME_H,
            dino.x, dino.y, DINO_DRAW_W, DINO_DRAW_H
        );
    } else {
        if (!dinoIdleImg.complete) return;
        ctx.drawImage(dinoIdleImg, dino.x, dino.y, DINO_DRAW_W, DINO_DRAW_H);
    }
}

function drawCactus(obs) {
    let img;
    if (obs.subtype === 'large') img = cactusLargeImg;
    else if (obs.subtype === 'cluster') img = cactusClusterImg;
    else img = cactusSmallImg;
    if (img.complete) {
        ctx.drawImage(img, obs.x, obs.y, obs.width, obs.height);
    }
}

function drawBird(obs) {
    if (!birdSheet.complete) return;
    const sx = obs.animFrame * BIRD_FRAME_W;
    ctx.drawImage(
        birdSheet,
        sx, 0, BIRD_FRAME_W, BIRD_FRAME_H,
        obs.x, obs.y, obs.width, obs.height
    );
}

function drawGround() {
    ctx.fillStyle = getGroundColor();
    ctx.fillRect(0, GROUND_LINE, CANVAS_WIDTH, 2);
    groundBumps.forEach(bump => {
        ctx.fillRect(bump.x, GROUND_LINE + 4, bump.size * 3, 1);
        ctx.fillRect(bump.x + 1, GROUND_LINE + 6, bump.size * 2, 1);
    });
}

function drawClouds() {
    ctx.fillStyle = getCloudColor();
    clouds.forEach(cloud => {
        ctx.fillRect(cloud.x, cloud.y, cloud.width, 10);
        ctx.fillRect(cloud.x + 8, cloud.y - 6, cloud.width - 16, 8);
        ctx.fillRect(cloud.x + 16, cloud.y - 10, cloud.width - 32, 6);
    });
}

function drawGameOverWithLeaderboard() {
    const cy = CANVAS_HEIGHT / 2;

    // ===== Layout: 3 equal boxes in a row =====
    const lb = getLeaderboard();
    const displayCount = Math.min(lb.length, 10);
    const rowH = 24;
    const panelPad = 20;

    // Leaderboard box height drives all boxes
    const lbContentH = 40 + 30 + 20 + Math.max(displayCount, 2) * rowH + 20;
    const boxH = Math.max(lbContentH, 200);
    const boxW = Math.min(320, (CANVAS_WIDTH - 120) / 3);
    const gap = 30;
    const totalW = boxW * 3 + gap * 2;
    const startX = Math.floor((CANVAS_WIDTH - totalW) / 2);
    const boxY = Math.floor(cy - boxH / 2);

    // Fade in overlay (adapts to theme: white in day, dark-tinted in night)
    const t = Math.min(1, gameOverAnimTimer / GAMEOVER_ANIM_DURATION);
    const ov = lerpV(255, 40);
    ctx.fillStyle = `rgba(${ov}, ${ov}, ${ov}, ${(0.85 * t).toFixed(2)})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out

    // Slide offsets
    const lbSlide = (1 - ease) * (-boxW - startX - 50);  // from left
    const goSlide = (1 - ease) * (-boxY - boxH - 50);     // from top
    const ctrlSlide = (1 - ease) * (CANVAS_WIDTH + 50);   // from right

    // ===== BOX 1 (LEFT): Leaderboard — slides from left =====
    const lbX = startX + lbSlide;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.clip();
    ctx.fillStyle = '#111';
    ctx.fillRect(lbX, boxY, boxW, boxH);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px "Courier New", monospace';
    let ly = boxY + 28;
    ctx.fillText('L E A D E R B O A R D', lbX + boxW / 2, ly);
    ly += 22;

    ctx.fillStyle = '#555';
    ctx.fillRect(lbX + panelPad, ly, boxW - panelPad * 2, 1);
    ly += 16;

    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText('#', lbX + panelPad, ly);
    ctx.fillText('PLAYER', lbX + panelPad + 28, ly);
    ctx.textAlign = 'right';
    ctx.fillText('BEST', lbX + boxW - panelPad, ly);
    ly += 6;
    ctx.fillStyle = '#444';
    ctx.fillRect(lbX + panelPad, ly, boxW - panelPad * 2, 1);
    ly += 14;

    for (let i = 0; i < displayCount; i++) {
        const entry = lb[i];
        const isMe = entry.username === currentUsername;

        if (isMe) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(lbX + panelPad - 4, ly - 12, boxW - panelPad * 2 + 8, 20);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 13px "Courier New", monospace';
        } else {
            ctx.fillStyle = '#ccc';
            ctx.font = '13px "Courier New", monospace';
        }

        ctx.textAlign = 'left';
        ctx.fillText((i + 1) + '.', lbX + panelPad, ly);
        ctx.fillText(entry.username, lbX + panelPad + 28, ly);
        ctx.textAlign = 'right';
        ctx.fillText(String(entry.bestScore), lbX + boxW - panelPad, ly);

        if (isMe && highScoreBeaten) {
            ctx.fillStyle = '#000';
            ctx.font = 'bold 9px "Courier New", monospace';
            ctx.fillText('NEW!', lbX + boxW - panelPad, ly - 11);
        }

        ly += rowH;
    }
    ctx.restore(); // end leaderboard clip

    // ===== BOX 2 (CENTER): Game Over + Score — drops from top =====
    const goX = startX + boxW + gap;
    const goY = boxY + goSlide;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.clip();
    ctx.fillStyle = '#111';
    ctx.fillRect(goX, goY, boxW, boxH);

    const goCx = goX + boxW / 2;
    const goCy = goY + boxH / 2;
    ctx.textAlign = 'center';

    if (highScoreBeaten) {
        const blink = Math.floor(Date.now() / 300) % 2 === 0;
        if (blink) {
            ctx.fillStyle = '#fff';
            ctx.font = '900 28px "Courier New", monospace';
            ctx.fillText('N E W', goCx, goCy - 40);
            ctx.fillText('H I G H', goCx, goCy - 10);
            ctx.fillText('S C O R E !', goCx, goCy + 20);
        }
    } else {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 34px "Courier New", monospace';
        ctx.fillText('G A M E', goCx, goCy - 20);
        ctx.fillText('O V E R', goCx, goCy + 20);
    }

    ctx.fillStyle = '#888';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('SCORE', goCx, goCy + 55);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px "Courier New", monospace';
    ctx.fillText(String(score), goCx, goCy + 82);
    ctx.restore(); // end center clip

    // ===== BOX 3 (RIGHT): Controls — slides from right =====
    const ctrlX = startX + (boxW + gap) * 2 + ctrlSlide;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.clip();
    ctx.fillStyle = '#111';
    ctx.fillRect(ctrlX, boxY, boxW, boxH);

    const ctrlCx = ctrlX + boxW / 2;
    const ctrlCy = boxY + boxH / 2;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillText('Press SPACE', ctrlCx, ctrlCy - 20);
    ctx.fillText('to Restart', ctrlCx, ctrlCy + 6);

    ctx.fillStyle = '#777';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('Press ESC', ctrlCx, ctrlCy + 50);
    ctx.fillText('for Main Menu', ctrlCx, ctrlCy + 68);
    ctx.restore(); // end right clip

    ctx.textAlign = 'left';
}

function renderGame() {
    // Theme-aware background fill
    ctx.fillStyle = getBgColor();
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Stars (only visible at night)
    drawStars();

    // Background layers (behind everything)
    drawSunMoon();
    drawClouds();
    drawSkyBirds();

    // Background element (tumbleweed or tornado) — behind ground and game objects
    if (bgElement) {
        if (bgElement.type === 'tumbleweed') drawTumbleweed(bgElement);
        else if (bgElement.type === 'tornado') drawTornado(bgElement);
    }

    drawGround();

    // Invert sprites based on theme (day=normal, night=inverted)
    if (themeT > 0.01) ctx.filter = `invert(${themeT.toFixed(2)})`;

    obstacles.forEach(obs => {
        if (obs.type === 'cactus') drawCactus(obs);
        else if (obs.type === 'bird') drawBird(obs);
    });

    // Draw collectibles (above obstacles, below dino)
    collectibles.forEach(c => drawCollectible(c));
    healthHeads.forEach(h => drawHealthHead(h));

    drawDino();

    // Power-up effects (drawn on top of dino)
    drawImmunityEffect();
    drawDashEffect();
    drawMultiplierEffect();

    // Health HUD
    if (gameState === 'running' || gameState === 'over') {
        drawHealthHUD();
    }

    // Reset filter after sprites
    if (themeT > 0.01) ctx.filter = 'none';

    if (gameState === 'over') {
        gameOverAnimTimer = Math.min(gameOverAnimTimer + 1, GAMEOVER_ANIM_DURATION);
        drawGameOverWithLeaderboard();
    }

    // New highscore notification during gameplay (blinking)
    if (gameState === 'running' && newHighScoreTime > 0 && Date.now() - newHighScoreTime < 5000) {
        const blink = Math.floor((Date.now() - newHighScoreTime) / 300) % 2 === 0;
        if (blink) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.fillStyle = getGroundColor();
            ctx.font = '900 34px "Courier New", monospace';
            ctx.fillText('N E W  H I G H  S C O R E !', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3);
            ctx.font = '900 26px "Courier New", monospace';
            ctx.fillText(String(score), CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.3 + 38);
            ctx.restore();
        }
    }

    // Score (top right) during gameplay
    if (appState === 'playing') {
        // Score top right
        ctx.fillStyle = getHudColor();
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(String(score).padStart(5, '0'), CANVAS_WIDTH - 15, HUD_Y);
        if (highScore > 0) {
            ctx.fillStyle = getHudSecondaryColor();
            ctx.fillText('HI ' + String(highScore).padStart(5, '0'), CANVAS_WIDTH - 95, HUD_Y);
        }
        ctx.textAlign = 'left';
    }
}

// Game loop
function gameLoop() {
    if (appState === 'playing') {
        if (gameState === 'intro') {
            updateIntro();
            renderIntro();
        } else if (gameState === 'dying') {
            updateDying();
            renderGame();
        } else {
            updateGame();
            renderGame();
        }
    }
    requestAnimationFrame(gameLoop);
}

// Initialize
initClouds();
initGround();
initStars();
initSkyBirds();
showConnectScreen();
gameLoop();
