// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
    GITHUB_OWNER: 'Ayden123kitten',
    GITHUB_REPO: 'The-Ultimate-Challenge',
    BRANCH: 'main'
};

// ==========================================
// STATE & UTILS
// ==========================================
let games = [];
let players = []; // [{ name, pfp_link, has_password }]
let currentPlayer = AUTH.getName();
let currentAuthTab = 'login'; // Track which auth tab is active: 'login' or 'signup'
let authPanelRendered = false; // Track if auth panel has been rendered

const $ = (id) => document.getElementById(id);

function formatTime(ms) {
    if (!ms || ms < 0) return '00:00:00';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ==========================================
// DATA FETCHING
// ==========================================
async function loadData() {
    try {
        const [gamesRes, playersRes] = await Promise.all([
            fetch(`/api/get-games?t=${Date.now()}`),
            fetch(`/api/get-players?t=${Date.now()}`)
        ]);

        if (!gamesRes.ok) throw new Error(`Games API: ${gamesRes.status}`);
        if (!playersRes.ok) throw new Error(`Players API: ${playersRes.status}`);

        games = await gamesRes.json();
        players = await playersRes.json();

        renderAuthPanel();
        renderPlayers();
    } catch (err) {
        console.error('Failed to load data:', err);
        $('players-container').innerHTML = `
            <div class="text-center text-red-400 p-8">
                <i class="fa-solid fa-circle-exclamation text-4xl mb-4"></i>
                <p class="text-lg font-bold">Error loading player stats</p>
                <p class="text-sm mt-2">${err.message}</p>
            </div>`;
    }
}

// ==========================================
// AUTH PANEL (login / signup / logged-in state)
// ==========================================
function renderAuthPanel() {
    const panel = $('auth-panel');
    if (!panel) return;

    const currentNameEl = $('current-player-name');
    if (currentNameEl) currentNameEl.textContent = currentPlayer || 'Not logged in';

    // Don't re-render if already rendered and not logged in (preserves input values)
    if (authPanelRendered && !AUTH.isLoggedIn()) return;

    authPanelRendered = true;

    if (AUTH.isLoggedIn()) {
        panel.innerHTML = `
            <div class="glass rounded-xl p-6 flex items-center justify-between">
                <div>
                    <div class="text-sm text-slate-400">Logged in as</div>
                    <div class="text-xl font-bold text-ap-accent">${currentPlayer}</div>
                </div>
                <button id="auth-logout-btn" class="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                    Log Out
                </button>
            </div>
        `;
        $('auth-logout-btn').addEventListener('click', () => AUTH.logout());
        return;
    }

    panel.innerHTML = `
        <div class="glass rounded-xl p-6">
            <div class="flex gap-2 mb-4">
                <button id="tab-login" class="flex-1 py-2 rounded-lg font-semibold bg-ap-accent/20 text-ap-accent">Log In</button>
                <button id="tab-signup" class="flex-1 py-2 rounded-lg font-semibold bg-slate-800 text-slate-400">Sign Up</button>
            </div>

            <form id="login-form" class="space-y-3">
                <input id="login-name" type="text" placeholder="Player name" autocomplete="username"
                    class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-ap-accent">
                <div class="relative">
                    <input id="login-password" type="password" placeholder="Password" autocomplete="current-password"
                        class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-ap-accent">
                    <button type="button" id="login-toggle-password" class="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
                <button type="submit" class="w-full bg-ap-accent/80 hover:bg-ap-accent text-slate-900 font-bold py-2 rounded-lg transition-colors">
                    Log In
                </button>
                <p id="login-error" class="text-red-400 text-sm hidden"></p>
            </form>

            <form id="signup-form" class="space-y-3 hidden">
                <input id="signup-name" type="text" placeholder="Choose a player name" autocomplete="username"
                    class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-ap-accent">
                <div class="relative">
                    <input id="signup-password" type="password" placeholder="Choose a password (6+ characters)" autocomplete="new-password"
                        class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-ap-accent">
                    <button type="button" id="signup-toggle-password" class="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                </div>
                <input id="signup-pfp" type="url" placeholder="Profile picture link (optional)"
                    class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:outline-none focus:border-ap-accent">
                <p class="text-xs text-slate-500">
                    Already see your name in the list below with no password? Sign up with that exact name to claim it.
                </p>
                <button type="submit" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg transition-colors">
                    Sign Up
                </button>
                <p id="signup-error" class="text-red-400 text-sm hidden"></p>
            </form>
        </div>
    `;

    const loginTab = $('tab-login');
    const signupTab = $('tab-signup');
    const loginForm = $('login-form');
    const signupForm = $('signup-form');

    // Set initial tab state based on currentAuthTab
    if (currentAuthTab === 'signup') {
        signupTab.className = 'flex-1 py-2 rounded-lg font-semibold bg-ap-accent/20 text-ap-accent';
        loginTab.className = 'flex-1 py-2 rounded-lg font-semibold bg-slate-800 text-slate-400';
        signupForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    } else {
        loginTab.className = 'flex-1 py-2 rounded-lg font-semibold bg-ap-accent/20 text-ap-accent';
        signupTab.className = 'flex-1 py-2 rounded-lg font-semibold bg-slate-800 text-slate-400';
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    }

    loginTab.addEventListener('click', () => {
        currentAuthTab = 'login';
        loginTab.className = 'flex-1 py-2 rounded-lg font-semibold bg-ap-accent/20 text-ap-accent';
        signupTab.className = 'flex-1 py-2 rounded-lg font-semibold bg-slate-800 text-slate-400';
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
    });

    signupTab.addEventListener('click', () => {
        currentAuthTab = 'signup';
        signupTab.className = 'flex-1 py-2 rounded-lg font-semibold bg-ap-accent/20 text-ap-accent';
        loginTab.className = 'flex-1 py-2 rounded-lg font-semibold bg-slate-800 text-slate-400';
        signupForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    });

    // Toggle password visibility for login form
    const loginToggleBtn = $('login-toggle-password');
    const loginPasswordInput = $('login-password');
    loginToggleBtn.addEventListener('click', () => {
        const isPassword = loginPasswordInput.type === 'password';
        loginPasswordInput.type = isPassword ? 'text' : 'password';
        loginToggleBtn.querySelector('i').className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });

    // Toggle password visibility for signup form
    const signupToggleBtn = $('signup-toggle-password');
    const signupPasswordInput = $('signup-password');
    signupToggleBtn.addEventListener('click', () => {
        const isPassword = signupPasswordInput.type === 'password';
        signupPasswordInput.type = isPassword ? 'text' : 'password';
        signupToggleBtn.querySelector('i').className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = $('login-error');
        errorEl.classList.add('hidden');
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            await AUTH.login($('login-name').value.trim(), $('login-password').value);
            currentPlayer = AUTH.getName();
            await loadData();
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
        }
    });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = $('signup-error');
        errorEl.classList.add('hidden');
        const submitBtn = signupForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            await AUTH.signup(
                $('signup-name').value.trim(),
                $('signup-password').value,
                $('signup-pfp').value.trim()
            );
            currentPlayer = AUTH.getName();
            await loadData();
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// ==========================================
// RENDERING PLAYER STATS
// ==========================================
let searchQuery = '';

function renderPlayers() {
    const container = $('players-container');
    container.innerHTML = '';

    const playerStats = players.map(p => {
        const playerName = p.name;
        const playerGames = games.filter(g => g.logs && g.logs.some(log => log.player === playerName));
        const currentGame = games.find(g => g.current_player === playerName);

        let totalTimeMs = 0;
        const gameHistory = [];

        games.forEach(game => {
            let gameTotalMs = 0;

            if (game.logs) {
                game.logs.forEach(log => {
                    if (log.player === playerName) {
                        gameTotalMs += log.duration_ms;
                        totalTimeMs += log.duration_ms;
                    }
                });
            }

            if (currentGame && currentGame.id === game.id && game.claimed_at) {
                const currentSessionMs = Date.now() - game.claimed_at;
                gameTotalMs += currentSessionMs;
                totalTimeMs += currentSessionMs;
            }

            if (gameTotalMs > 0) {
                gameHistory.push({ gameName: game.name, timeMs: gameTotalMs });
            }
        });

        gameHistory.sort((a, b) => b.timeMs - a.timeMs);

        return {
            name: playerName,
            pfpLink: p.pfp_link,
            totalTimeMs,
            gamesPlayed: playerGames.length,
            currentGame: currentGame ? currentGame.name : null,
            gameHistory
        };
    });

    playerStats.sort((a, b) => b.totalTimeMs - a.totalTimeMs);

    let filteredStats = playerStats;
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        filteredStats = playerStats.filter(stat => stat.name.toLowerCase().includes(query));
    }

    filteredStats.forEach(stat => {
        const card = document.createElement('div');
        const isSelected = stat.name === currentPlayer;
        card.className = `glass rounded-xl p-6 flex flex-col gap-4 transition-all ${isSelected ? 'border-2 border-ap-accent' : ''}`;

        const hasCurrentGame = stat.currentGame !== null;
        const avatar = stat.pfpLink
            ? `<img src="${stat.pfpLink}" alt="${stat.name}" class="w-16 h-16 rounded-full object-cover" onerror="this.outerHTML='<div class=&quot;w-16 h-16 rounded-full bg-ap-accent/20 flex items-center justify-center&quot;><i class=&quot;fa-solid fa-user text-2xl text-ap-accent&quot;></i></div>'">`
            : `<div class="w-16 h-16 rounded-full bg-ap-accent/20 flex items-center justify-center"><i class="fa-solid fa-user text-2xl text-ap-accent"></i></div>`;

        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-4">
                    ${avatar}
                    <div>
                        <h2 class="text-2xl font-bold text-white">${stat.name} ${isSelected ? '<span class="text-xs text-ap-accent ml-2">(You)</span>' : ''}</h2>
                        <p class="text-sm text-slate-400">${stat.gamesPlayed} Game${stat.gamesPlayed !== 1 ? 's' : ''} Played</p>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-xs text-slate-400 uppercase">Total Time</div>
                    <div class="text-2xl font-mono font-bold text-ap-accent">${formatTime(stat.totalTimeMs)}</div>
                </div>
            </div>

            ${hasCurrentGame ? `
                <div class="bg-green-500/20 border border-green-500/30 rounded-lg p-3">
                    <span class="text-green-400 font-semibold"><i class="fa-solid fa-play text-xs mr-2"></i>Currently Playing:</span>
                    <span class="text-white font-bold ml-2">${stat.currentGame}</span>
                </div>
            ` : ''}

            ${stat.gameHistory.length > 0 ? `
                <div class="border-t border-slate-700 pt-4">
                    <h3 class="text-sm font-bold text-slate-400 uppercase mb-3">Games Played</h3>
                    <div class="space-y-2">
                        ${stat.gameHistory.map(game => `
                            <div class="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg">
                                <span class="text-white">${game.gameName}</span>
                                <span class="font-mono text-ap-accent">${formatTime(game.timeMs)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : `
                <div class="border-t border-slate-700 pt-4">
                    <p class="text-slate-500 text-center py-4">No games played yet</p>
                </div>
            `}
        `;

        container.appendChild(card);
    });

    if (players.length === 0) {
        container.innerHTML = `
            <div class="text-center text-slate-500 py-20">
                <i class="fa-solid fa-users-slash text-4xl mb-4"></i>
                <p>No players found</p>
            </div>
        `;
    }
}

// Search functionality
const searchInput = $('players-search');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderPlayers();
    });
}

// Initialize
loadData();
setInterval(loadData, 10000);
