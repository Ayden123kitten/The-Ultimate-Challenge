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
let availableRoles = []; // [{ name, color }]
let currentPlayer = AUTH.getName();
let currentAuthTab = 'login'; // Track which auth tab is active: 'login' or 'signup'
let authPanelRendered = false; // Track if auth panel has been rendered
let isModerator = false; // Track moderator status

const $ = (id) => document.getElementById(id);

function formatTime(ms) {
    if (!ms || ms < 0) return '00:00:00';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function loadRoles() {
    try {
        const res = await fetch(`/api/get-roles?t=${Date.now()}`);
        if (res.ok) {
            availableRoles = await res.json();
        }
    } catch (err) {
        console.error('Failed to load roles:', err);
    }
}

function renderRoleBadge(roleName) {
    const role = availableRoles.find(r => r.name === roleName);
    if (!role) return '';
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style="background-color: ${role.color}20; color: ${role.color}; border: 1px solid ${role.color}"><span style="width: 6px; height: 6px; background-color: ${role.color}; border-radius: 50%;"></span>${role.name}</span>`;
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
        
        await loadRoles();

        renderAuthPanel();
        renderPlayers();
    } catch (err) {
        console.error('Failed to load data:', err);
        $('players-container').innerHTML = `
            <div class="col-span-full text-center text-red-400 p-8">
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
        
        // Show settings link for logged-in users
        const settingsLink = $('settings-nav-link');
        if (settingsLink) settingsLink.style.display = 'flex';
        
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
let playersSortOption = 'az';

function renderPlayers() {
    const container = $('players-container');
    container.innerHTML = '';

    const playerStats = players.map(p => {
        const playerName = p.name;
        const playerGames = games.filter(g => g.logs && g.logs.some(log => log.player === playerName));
        const currentGame = games.find(g => g.current_player === playerName);

        let totalTimeMs = 0;
        const gameHistory = [];
        let totalClaims = 0;

        games.forEach(game => {
            let gameTotalMs = 0;
            let claimCount = 0;

            if (game.logs) {
                game.logs.forEach(log => {
                    if (log.player === playerName) {
                        gameTotalMs += log.duration_ms;
                        totalTimeMs += log.duration_ms;
                        claimCount++;
                    }
                });
            }

            if (currentGame && currentGame.id === game.id && game.claimed_at) {
                const currentSessionMs = Date.now() - game.claimed_at;
                gameTotalMs += currentSessionMs;
                totalTimeMs += currentSessionMs;
                claimCount++;
            }

            totalClaims += claimCount;

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
            gameHistory,
            totalClaims
        };
    });

    // Apply sorting
    if (playersSortOption === 'az') {
        playerStats.sort((a, b) => a.name.localeCompare(b.name));
    } else if (playersSortOption === 'za') {
        playerStats.sort((a, b) => b.name.localeCompare(a.name));
    } else if (playersSortOption === 'games-played') {
        playerStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    } else if (playersSortOption === 'total-time') {
        playerStats.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
    } else if (playersSortOption === 'most-claims') {
        playerStats.sort((a, b) => b.totalClaims - a.totalClaims);
    }

    let filteredStats = playerStats;
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        filteredStats = playerStats.filter(stat => stat.name.toLowerCase().includes(query));
    }

    // Calculate leaderboard ranks
    const rankByGames = [...playerStats].sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    const rankByTime = [...playerStats].sort((a, b) => b.totalTimeMs - a.totalTimeMs);
    const rankByClaims = [...playerStats].sort((a, b) => b.totalClaims - a.totalClaims);

    const getRank = (name, type) => {
        let list;
        if (type === 'games') list = rankByGames;
        else if (type === 'time') list = rankByTime;
        else list = rankByClaims;
        const index = list.findIndex(p => p.name === name);
        return index === -1 ? '-' : index + 1;
    };

    filteredStats.forEach(stat => {
        const card = document.createElement('div');
        const isSelected = stat.name === currentPlayer;
        card.className = `glass rounded-xl p-4 transition-all cursor-pointer hover:shadow-lg ${isSelected ? 'border-2 border-ap-accent' : ''}`;
        card.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 10px; aspect-ratio: 1; justify-content: center;';
        
        card.onmouseover = function() {
            this.style.transform = 'translateY(-4px)';
            this.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
        };
        card.onmouseout = function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        };
        card.onclick = () => showPlayerModal(stat);

        // Calculate overall rank (by games played as primary metric)
        const overallRank = getRank(stat.name, 'games');
        let rankBadge = '';
        if (overallRank === 1) rankBadge = '<span class="text-yellow-400 text-lg">🥇</span>';
        else if (overallRank === 2) rankBadge = '<span class="text-gray-300 text-lg">🥈</span>';
        else if (overallRank === 3) rankBadge = '<span class="text-orange-400 text-lg">🥉</span>';
        else rankBadge = `<span class="text-slate-400 font-bold text-sm">#${overallRank}</span>`;

        const avatar = stat.pfpLink
            ? `<img src="${stat.pfpLink}" alt="${stat.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--ap-accent); background: #222;" onerror="this.src='data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23888\'><path d=\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\'/></svg>'">`
            : `<div style="width: 60px; height: 60px; border-radius: 50%; background: var(--ap-accent)/0.2; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-user" style="font-size: 1.5rem; color: var(--ap-accent);"></i></div>`;
        
        // Get player roles from players array
        const playerObj = players.find(p => p.name === stat.name);
        const playerRoles = (playerObj && playerObj.roles) ? playerObj.roles : [];
        
        // Roles HTML
        let rolesHtml = '';
        if (playerRoles.length > 0) {
            rolesHtml = '<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 4px;">';
            playerRoles.forEach(roleName => {
                const role = availableRoles.find(r => r.name === roleName);
                if (role) {
                    const roleColor = role.color;
                    const bgAlpha = parseInt(roleColor.slice(1, 3), 16) / 255 * 0.2;
                    rolesHtml += `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; background-color: ${roleColor}33; color: ${roleColor}; border: 1px solid ${roleColor};"><span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${roleColor};"></span>${role.name}</span>`;
                }
            });
            rolesHtml += '</div>';
        }


        card.innerHTML = `
            <div style="position: relative;">
                ${avatar}
                <div style="position: absolute; bottom: -5px; right: -5px; background: #1e293b; border: 2px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                    ${rankBadge}
                </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; overflow: hidden;">
                <h2 style="margin: 0; font-size: 0.95rem; color: var(--text-color); cursor: pointer; text-decoration: underline; text-underline-offset: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${stat.name} ${isSelected ? '<span style="font-size: 0.65rem; color: var(--ap-accent);">(You)</span>' : ''}</h2>
                ${rolesHtml}
            </div>
        `;

        container.appendChild(card);
    });

    if (players.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center text-slate-500 py-20">
                <i class="fa-solid fa-users-slash text-4xl mb-4"></i>
                <p>No players found</p>
            </div>
        `;
    }
}

// Modal Logic
function showPlayerModal(stat) {
    // Remove existing modal if any
    const existing = document.getElementById('player-detail-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'player-detail-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.85);
        z-index: 1000;
        display: flex;
        justify-content: center;
        align-items: center;
        backdrop-filter: blur(4px);
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: var(--bg-color);
        padding: 30px;
        border-radius: 16px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
        border: 1px solid var(--border-color);
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    `;

    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
        position: absolute;
        top: 15px; right: 20px;
        background: none;
        border: none;
        color: var(--text-muted);
        font-size: 1.5rem;
        cursor: pointer;
        line-height: 1;
    `;
    closeBtn.onclick = () => modal.remove();

    // Header
    const header = document.createElement('div');
    header.style.cssText = `display: flex; align-items: center; gap: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 20px;`;
    
    const avatar = stat.pfpLink
        ? `<img src="${stat.pfpLink}" alt="${stat.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--ap-accent);">`
        : `<div style="width: 60px; height: 60px; border-radius: 50%; background: var(--ap-accent)/0.2; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-user" style="font-size: 1.5rem; color: var(--ap-accent);"></i></div>`;

    const info = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = stat.name;
    h2.style.margin = '0 0 10px 0';
    
    // Roles in modal
    const playerObj = players.find(p => p.name === stat.name);
    const playerRoles = (playerObj && playerObj.roles) ? playerObj.roles : [];
    const modalRoles = document.createElement('div');
    modalRoles.style.cssText = `display: flex; flex-wrap: wrap; gap: 6px;`;
    playerRoles.forEach(roleName => {
        const role = availableRoles.find(r => r.name === roleName);
        if (role) {
            const badge = document.createElement('span');
            badge.textContent = role.name;
            badge.style.cssText = `
                display: inline-flex; align-items: center; gap: 4px;
                padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold;
                background-color: ${role.color}33; color: ${role.color}; border: 1px solid ${role.color};
            `;
            const dot = document.createElement('span');
            dot.style.cssText = `display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${role.color};`;
            badge.prepend(dot);
            modalRoles.appendChild(badge);
        }
    });

    info.appendChild(h2);
    info.appendChild(modalRoles);
    header.innerHTML = avatar;
    header.appendChild(info);

    // Player Settings Section (Bio, Pronouns, Discord, Website)
    const settingsSection = document.createElement('div');
    settingsSection.style.cssText = `margin-bottom: 25px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 8px;`;
    
    const hasSettings = playerObj && (playerObj.bio || playerObj.pronouns || playerObj.discord || playerObj.website);
    
    if (hasSettings) {
        if (playerObj.bio) {
            const bioDiv = document.createElement('div');
            bioDiv.style.cssText = `margin-bottom: 10px;`;
            const bioLabel = document.createElement('span');
            bioLabel.textContent = 'Bio: ';
            bioLabel.style.cssText = `font-weight: bold; color: var(--text-muted);`;
            const bioText = document.createElement('span');
            bioText.textContent = playerObj.bio;
            bioText.style.cssText = `color: var(--text-color);`;
            bioDiv.appendChild(bioLabel);
            bioDiv.appendChild(bioText);
            settingsSection.appendChild(bioDiv);
        }
        
        if (playerObj.pronouns) {
            const pronounsDiv = document.createElement('div');
            pronounsDiv.style.cssText = `margin-bottom: 10px;`;
            const pronounsLabel = document.createElement('span');
            pronounsLabel.textContent = 'Pronouns: ';
            pronounsLabel.style.cssText = `font-weight: bold; color: var(--text-muted);`;
            const pronounsText = document.createElement('span');
            pronounsText.textContent = playerObj.pronouns;
            pronounsText.style.cssText = `color: var(--ap-accent);`;
            pronounsDiv.appendChild(pronounsLabel);
            pronounsDiv.appendChild(pronounsText);
            settingsSection.appendChild(pronounsDiv);
        }
        
        if (playerObj.discord) {
            const discordDiv = document.createElement('div');
            discordDiv.style.cssText = `margin-bottom: 10px;`;
            const discordLabel = document.createElement('span');
            discordLabel.textContent = 'Discord: ';
            discordLabel.style.cssText = `font-weight: bold; color: var(--text-muted);`;
            const discordText = document.createElement('span');
            discordText.textContent = playerObj.discord;
            discordText.style.cssText = `color: #5865F2;`;
            discordDiv.appendChild(discordLabel);
            discordDiv.appendChild(discordText);
            settingsSection.appendChild(discordDiv);
        }
        
        if (playerObj.website) {
            const websiteDiv = document.createElement('div');
            websiteDiv.style.cssText = `margin-bottom: 10px;`;
            const websiteLabel = document.createElement('span');
            websiteLabel.textContent = 'Website: ';
            websiteLabel.style.cssText = `font-weight: bold; color: var(--text-muted);`;
            const websiteText = document.createElement('a');
            websiteText.textContent = playerObj.website;
            websiteText.href = playerObj.website.startsWith('http') ? playerObj.website : '#';
            websiteText.target = '_blank';
            websiteText.style.cssText = `color: var(--ap-accent); text-decoration: none;`;
            websiteText.onmouseover = function() { this.style.textDecoration = 'underline'; };
            websiteText.onmouseout = function() { this.style.textDecoration = 'none'; };
            websiteDiv.appendChild(websiteLabel);
            websiteDiv.appendChild(websiteText);
            settingsSection.appendChild(websiteDiv);
        }
        
        content.appendChild(settingsSection);
    }

    // Stats Grid
    const statsGrid = document.createElement('div');
    statsGrid.style.cssText = `
        display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin-bottom: 25px;
    `;
    
    const statBoxes = [
        { label: 'Games Played', value: stat.gamesPlayed },
        { label: 'Total Time', value: formatTime(stat.totalTimeMs) },
        { label: 'Total Claims', value: stat.totalClaims }
    ];

    statBoxes.forEach(s => {
        const box = document.createElement('div');
        box.style.cssText = `
            background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;
        `;
        const val = document.createElement('div');
        val.style.cssText = `font-size: 1.5rem; font-weight: bold; color: var(--ap-accent);`;
        val.textContent = s.value;
        const lbl = document.createElement('div');
        lbl.style.cssText = `font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; margin-top: 5px;`;
        lbl.textContent = s.label;
        box.appendChild(val);
        box.appendChild(lbl);
        statsGrid.appendChild(box);
    });

    // Game History Section
    const historySection = document.createElement('div');
    historySection.style.cssText = `margin-top: 20px;`;
    const historyTitle = document.createElement('h3');
    historyTitle.textContent = 'Games Played';
    historyTitle.style.cssText = `border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;`;
    
    const historyList = document.createElement('div');
    historyList.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;

    if (stat.gameHistory.length > 0) {
        stat.gameHistory.forEach(game => {
            const item = document.createElement('div');
            item.style.cssText = `
                background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; 
                border-left: 3px solid var(--ap-accent); font-size: 0.9rem;
                display: flex; justify-content: space-between; align-items: center;
            `;
            item.innerHTML = `
                <strong style="color: var(--text-color);">${game.gameName}</strong>
                <span style="color: var(--ap-accent); font-weight: bold; font-family: monospace;">${formatTime(game.timeMs)}</span>
            `;
            historyList.appendChild(item);
        });
    } else {
        historyList.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No games played yet.</p>';
    }

    historySection.appendChild(historyTitle);
    historySection.appendChild(historyList);

    content.appendChild(closeBtn);
    content.appendChild(header);
    content.appendChild(statsGrid);
    content.appendChild(historySection);
    modal.appendChild(content);
    
    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

// Search functionality
const searchInput = $('players-search');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderPlayers();
    });
}

// Sort functionality
const sortSelect = $('players-sort');
if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
        playersSortOption = e.target.value;
        renderPlayers();
    });
}

// Moderator status check
(async () => {
    if (AUTH.isLoggedIn()) {
        isModerator = await AUTH.checkModerator();
        console.log('Moderator status:', isModerator);
    }
})();

// Initialize
loadData();
setInterval(loadData, 10000);
