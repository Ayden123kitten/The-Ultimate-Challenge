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
let players = [];
let settings = {};
let cheesetrackerData = {};
// currentPlayer now comes from AUTH (requires signup/login), not a freely-typed name.
let currentPlayer = AUTH.getName();

const $ = (id) => document.getElementById(id);

function formatTime(ms) {
    if (!ms || ms < 0) return '00:00:00';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function loadCheesetrackerData() {
    if (!settings.cheesetracker_url) return;
    
    try {
        const response = await fetch(`/api/cheesetracker-data?t=${Date.now()}`);
        if (response.ok) {
            cheesetrackerData = await response.json();
        }
    } catch (error) {
        console.error('Failed to load Cheesetracker data:', error);
    }
}

// ==========================================
// DATA FETCHING
// ==========================================
async function loadData() {
    try {
        const baseRawUrl = `https://raw.githubusercontent.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/${CONFIG.BRANCH}/data`;

        const [gamesRes, playersRes, settingsRes] = await Promise.all([
            fetch(`/api/get-games?t=${Date.now()}`),          // via API to bypass raw CDN cache
            fetch(`/api/get-players?t=${Date.now()}`),        // via API so password_hash never reaches the browser
            fetch(`${baseRawUrl}/settings.json?t=${Date.now()}`)
        ]);

        if (!gamesRes.ok) throw new Error(`Games API: ${gamesRes.status}`);
        if (!playersRes.ok) throw new Error(`Players API: ${playersRes.status}`);
        if (!settingsRes.ok) throw new Error(`Settings file: ${settingsRes.status}`);

        games = await gamesRes.json();
        players = await playersRes.json();
        settings = await settingsRes.json();

        // Load Cheesetracker data after settings are loaded
        await loadCheesetrackerData();

        populatePlayerSelect();
        updateCompletedGamesCount();
        renderGames();
        updateGlobalTimer();
    } catch (err) {
        console.error('Failed to load data:', err);
        $('games-container').innerHTML = `
            <div class="col-span-full text-center text-red-400 p-8">
                <i class="fa-solid fa-circle-exclamation text-4xl mb-4"></i>
                <p class="text-lg font-bold">Error loading games</p>
                <p class="text-sm mt-2">${err.message}</p>
                <p class="text-xs mt-4 text-slate-500">
                    Check that CONFIG in app.js has your correct GitHub username and repo name.
                </p>
            </div>`;
    }
}

function populatePlayerSelect() {
    const currentNameEl = $('current-player-name');

    if (currentNameEl) {
        currentNameEl.textContent = currentPlayer ? currentPlayer : 'Not logged in';
    }

    const logoutBtn = $('logout-btn');
    if (logoutBtn) {
        logoutBtn.style.display = currentPlayer ? 'inline-flex' : 'none';
    }
}

function updateCompletedGamesCount() {
    const totalGames = games.length;
    // Count games as completed if either manually marked or Cheesetracker shows 100%
    const completedGames = games.filter(g => {
        if (g.completed === true) return true;
        const ctData = cheesetrackerData[g.id] || {};
        const totalChecks = ctData.totalChecks || g.cheesetracker_total_checks || 0;
        const completedChecks = ctData.completedChecks || g.cheesetracker_completed_checks || 0;
        return totalChecks > 0 && completedChecks >= totalChecks;
    }).length;
    const countEl = $('total-games-count');
    if (countEl) {
        countEl.textContent = `${completedGames}/${totalGames}`;
    }
}

// ==========================================
// RENDERING
// ==========================================
let searchQuery = '';
let gamesSortOption = 'az';

function renderGames() {
    const container = $('games-container');
    container.innerHTML = '';

    let sortedGames = [...games];

    // Apply sorting
    if (gamesSortOption === 'az') {
        sortedGames.sort((a, b) => a.name.localeCompare(b.name));
    } else if (gamesSortOption === 'za') {
        sortedGames.sort((a, b) => b.name.localeCompare(a.name));
    } else if (gamesSortOption === 'times-claimed') {
        sortedGames.sort((a, b) => {
            const aClaims = a.logs ? a.logs.length : 0;
            const bClaims = b.logs ? b.logs.length : 0;
            return bClaims - aClaims;
        });
    } else if (gamesSortOption === 'unique-claims') {
        sortedGames.sort((a, b) => {
            const aPlayers = new Set(a.logs ? a.logs.map(log => log.player) : []);
            const bPlayers = new Set(b.logs ? b.logs.map(log => log.player) : []);
            return bPlayers.size - aPlayers.size;
        });
    } else if (gamesSortOption === 'total-time') {
        sortedGames.sort((a, b) => b.total_time_ms - a.total_time_ms);
    } else if (gamesSortOption === 'core') {
        sortedGames.sort((a, b) => {
            const aIsCore = a.mod_version === 'Core';
            const bIsCore = b.mod_version === 'Core';
            if (aIsCore && !bIsCore) return -1;
            if (!aIsCore && bIsCore) return 1;
            return 0;
        });
    } else if (gamesSortOption === 'custom') {
        sortedGames.sort((a, b) => {
            const aIsCustom = a.mod_version && a.mod_version !== 'Core';
            const bIsCustom = b.mod_version && b.mod_version !== 'Core';
            if (aIsCustom && !bIsCustom) return -1;
            if (!aIsCustom && bIsCustom) return 1;
            return 0;
        });
    }

    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        sortedGames = sortedGames.filter(game =>
            game.name.toLowerCase().includes(query)
        );
    }

    sortedGames.forEach(game => {
        const isClaimed = game.current_player !== null;
        const isMyClaim = isClaimed && game.current_player === currentPlayer;
        const canClaim = !isClaimed && currentPlayer !== '';

        let currentSessionMs = 0;
        if (isClaimed && game.claimed_at) {
            currentSessionMs = Date.now() - game.claimed_at;
        }
        const totalTimeMs = game.total_time_ms + currentSessionMs;

        const hasRules = game.rules && game.rules.trim() !== '';
        const hasCoverImage = game.logo && game.logo.trim() !== '';
        const hasExtraInfo = game.extra_information && game.extra_information.trim() !== '';
        const hasApworldVersion = game.apworld_version && game.apworld_version.trim() !== '';
        const hasModVersion = game.mod_version && game.mod_version.trim() !== '';
        
        // Cheesetracker data
        const ctData = cheesetrackerData[game.id] || {};
        const totalChecks = ctData.totalChecks || game.cheesetracker_total_checks || 0;
        const completedChecks = ctData.completedChecks || game.cheesetracker_completed_checks || 0;
        const checkPercentage = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;
        const hasCheesetracker = settings.cheesetracker_url && totalChecks > 0;

        const links = [
            { url: game.apworld_link, icon: 'fa-globe', label: `Apworld${hasApworldVersion ? ` (v${game.apworld_version})` : ''}` },
            { url: game.mod_link, icon: 'fa-puzzle-piece', label: `Mod${hasModVersion ? ` (${game.mod_version === 'Core' ? '' : 'v'}${game.mod_version})` : ''}` },
            { url: game.mod_setup_guide_link, icon: 'fa-book', label: 'Setup Guide' },
            { url: game.tracker_link, icon: 'fa-map', label: 'Tracker' },
            { url: game.game_info_link, icon: 'fa-circle-info', label: 'Game Info' },
            { url: game.support_link, icon: 'fa-circle-question', label: 'Support' },
            { url: game.save_file_link, icon: 'fa-download', label: 'Save File', primary: true }
        ].filter(l => l.url && l.url.trim() !== '');

        const card = document.createElement('div');
        card.className = 'glass rounded-xl p-6 flex flex-col gap-4 transition-all hover:border-ap-accent/50';

        card.innerHTML = `
            <div class="game-card-header">
                ${hasCoverImage ? `
                    <div class="cover-art-container">
                        <img src="${game.logo}" alt="${game.name}"
                             class="cover-art-logo"
                             onerror="this.style.display='none'">
                    </div>
                ` : '<div class="cover-art-container"></div>'}

                <div class="game-card-title-time-row">
                    <div class="game-card-title">
                        <h2 class="text-xl font-bold text-white">${game.name}</h2>
                        <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${isClaimed ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}">
                            ${isClaimed ? `Playing: ${game.current_player}` : 'Available'}
                        </span>
                    </div>
                    <div class="game-card-time">
                        <div class="text-xs text-slate-400 uppercase">Total Time</div>
                        <div class="text-lg font-mono font-bold text-ap-accent">${formatTime(totalTimeMs)}</div>
                    </div>
                </div>
            </div>

            ${hasRules ? `
                <div class="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 border border-slate-700">
                    <span class="text-ap-accent font-semibold">Rules:</span> ${game.rules}
                </div>
            ` : ''}

            ${hasExtraInfo ? `
                <div class="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 border border-slate-700">
                    <span class="text-ap-accent font-semibold">Information:</span> ${game.extra_information}
                </div>
            ` : ''}

            ${hasCheesetracker ? `
                <div class="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-bold text-slate-400 uppercase">Cheesetracker Progress</span>
                        <span class="text-sm font-mono text-ap-accent">${completedChecks}/${totalChecks} (${checkPercentage}%)</span>
                    </div>
                    <div class="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                        <div class="bg-gradient-to-r from-green-500 to-green-400 h-full transition-all duration-500" style="width: ${checkPercentage}%"></div>
                    </div>
                </div>
            ` : ''}

            ${links.length > 0 ? `
                <div class="grid grid-cols-2 gap-2 text-sm">
                    ${links.map(link => renderLink(link.url, link.icon, link.label, link.primary)).join('')}
                </div>
            ` : ''}

            <div class="mt-auto">
                ${isMyClaim ? `
                    <button onclick="unclaimGame('${game.id}', event)" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i class="fa-solid fa-upload"></i> Mark as Done
                    </button>
                    <div class="text-center text-xs text-slate-400 mt-2">
                        Current session: <span class="font-mono text-white">${formatTime(currentSessionMs)}</span>
                    </div>
                ` : canClaim ? `
                    <button onclick="claimGame('${game.id}', event)" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i class="fa-solid fa-play"></i> Claim Game
                    </button>
                ` : `
                    <button disabled class="w-full bg-slate-700 text-slate-500 font-bold py-2 px-4 rounded-lg cursor-not-allowed flex items-center justify-center gap-2">
                        <i class="fa-solid fa-lock"></i> ${currentPlayer === '' ? 'Log In on Players Page' : 'Currently Unavailable'}
                    </button>
                `}
            </div>

            ${game.logs && game.logs.length > 0 ? `
                <div class="mt-4 border-t border-slate-700 pt-3">
                    <h3 class="text-xs font-bold text-slate-400 uppercase mb-2">Session Logs</h3>
                    <div class="max-h-32 overflow-y-auto scrollbar-hide space-y-1">
                        ${game.logs.slice().reverse().map(log => `
                            <div class="text-xs flex justify-between text-slate-300 bg-slate-800/50 p-2 rounded">
                                <span><span class="text-ap-accent">${log.player}</span></span>
                                <span>${formatTime(log.duration_ms)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
        container.appendChild(card);
    });
}

function renderLink(url, icon, label, isPrimary = false) {
    if (!url || url.trim() === '') return '';
    const bgClass = isPrimary
        ? 'bg-ap-accent/20 text-ap-accent border-ap-accent/30 hover:bg-ap-accent/30'
        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500';
    return `
        <a href="${url}" target="_blank" class="flex items-center gap-2 p-2 rounded border ${bgClass} transition-all">
            <i class="fa-solid ${icon}"></i>
            <span>${label}</span>
        </a>
    `;
}

// ==========================================
// ACTIONS
// ==========================================
async function claimGame(gameId, e) {
    if (!currentPlayer) return alert('Please log in from the Players page first.');
    if (!confirm(`Claim ${games.find(g => g.id === gameId).name} as ${currentPlayer}?`)) return;
    await updateGame(gameId, 'claim', e);
}

async function unclaimGame(gameId, e) {
    if (!confirm('Have you finished playing and uploaded your save file to Google Drive?\n\nOnce you mark it as done, the next player can start!')) return;
    await updateGame(gameId, 'complete', e);
}

async function updateGame(gameId, action, e) {
    if (!AUTH.isLoggedIn()) {
        alert('Please log in from the Players page first.');
        return;
    }

    const btn = e.target.closest('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/update-game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...AUTH.authHeader()
            },
            body: JSON.stringify({ gameId, action })
        });

        const data = await res.json();
        if (!res.ok) {
            if (res.status === 401) {
                AUTH.clearSession();
                alert('Your session expired. Please log in again on the Players page.');
                window.location.href = '/players.html';
                return;
            }
            throw new Error(data.error || 'Failed to update');
        }

        // OPTIMISTIC UI UPDATE
        const game = games.find(g => g.id === gameId);
        if (game) {
            if (action === 'claim') {
                game.current_player = currentPlayer;
                game.claimed_at = Date.now();
            } else if (action === 'complete') {
                const duration = Date.now() - game.claimed_at;
                game.total_time_ms += duration;
                game.logs.push({
                    player: currentPlayer,
                    start: game.claimed_at,
                    end: Date.now(),
                    duration_ms: duration
                });
                game.current_player = null;
                game.claimed_at = null;
                game.completed = true;
            }
        }

        updateCompletedGamesCount();
        renderGames();

    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// GLOBAL TIMER
// ==========================================
function updateGlobalTimer() {
    const timerEl = $('global-timer');
    const statusEl = $('timer-status');

    if (!settings.start_time || settings.start_time.trim() === '') {
        timerEl.textContent = '';
        statusEl.textContent = '';
        return;
    }

    const now = Date.now();
    const start = new Date(settings.start_time).getTime();
    const end = settings.end_time && settings.end_time.trim() !== '' ? new Date(settings.end_time).getTime() : null;

    if (now < start) {
        timerEl.textContent = formatTime(start - now);
        statusEl.textContent = 'Starts In';
        statusEl.className = 'text-xs text-yellow-400 uppercase tracking-widest';
    } else if (end === null || (now >= start && now <= end)) {
        timerEl.textContent = formatTime(now - start);
        statusEl.textContent = 'Event Live';
        statusEl.className = 'text-xs text-green-400 uppercase tracking-widest';
    } else {
        timerEl.textContent = formatTime(now - end);
        statusEl.textContent = 'Event Ended';
        statusEl.className = 'text-xs text-red-400 uppercase tracking-widest';
    }
}

// Initialize
setInterval(updateGlobalTimer, 1000);
setInterval(() => {
    if (games.some(g => g.current_player === currentPlayer)) {
        renderGames();
    }
}, 1000);

// Also periodically update completed games count in case data is refreshed
setInterval(updateCompletedGamesCount, 5000);

// Search functionality
const searchInput = $('games-search');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderGames();
    });
}

// Sort functionality
const sortSelect = $('games-sort');
if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
        gamesSortOption = e.target.value;
        renderGames();
    });
}

// Logout button (if present on this page)
const logoutBtn = $('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => AUTH.logout());
}

// Moderator status check and panel setup
let isModerator = false;
(async () => {
    if (AUTH.isLoggedIn()) {
        isModerator = await AUTH.checkModerator();
        console.log('Moderator status:', isModerator);
        
        // Show settings link for logged-in users
        const settingsLink = $('settings-nav-link-index');
        if (settingsLink) settingsLink.style.display = 'flex';
        
        // Add moderator button to header if user is a moderator
        if (isModerator) {
            const header = document.querySelector('header .max-w-7xl .flex.items-center.gap-3')?.parentElement;
            if (header) {
                const modBtn = document.createElement('button');
                modBtn.id = 'moderator-toggle-btn';
                modBtn.className = 'text-slate-400 hover:text-ap-accent transition-colors flex items-center gap-2 text-sm';
                modBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i><span class="text-sm">Moderator</span>';
                modBtn.onclick = openModeratorModal;
                header.appendChild(modBtn);
            }
        }
    }
})();

// Moderator modal functions
function openModeratorModal() {
    const modal = $('moderator-modal');
    const content = $('moderator-panel-content');
    
    if (!modal || !content) return;
    
    content.innerHTML = `
        <div class="space-y-6">
            <!-- Add Game Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4">Add New Game</h3>
                <form id="add-game-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" id="game-name" placeholder="Game Name *" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" required>
                    <input type="text" id="game-id" placeholder="Game ID (unique) *" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" required>
                    <input type="text" id="game-yaml-slot-name" placeholder="YAML Slot Name (for Cheesetracker)" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-logo" placeholder="Logo URL" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-apworld-link" placeholder="Apworld Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="game-apworld-version" placeholder="Apworld Version" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-mod-link" placeholder="Mod Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="game-mod-version" placeholder="Mod Version (or 'Core')" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-mod-setup-guide-link" placeholder="Mod Setup Guide Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-tracker-link" placeholder="Tracker Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-game-info-link" placeholder="Game Info Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-support-link" placeholder="Support Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-save-file-link" placeholder="Save File Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <textarea id="game-rules" placeholder="Rules" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2" rows="2"></textarea>
                    <textarea id="game-extra-information" placeholder="Extra Information" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2" rows="2"></textarea>
                    <button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg md:col-span-2">Add Game</button>
                </form>
            </div>
            
            <!-- Edit Game Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4">Edit Game</h3>
                <select id="edit-game-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-4">
                    <option value="">Select a game...</option>
                    ${games.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
                </select>
                <div id="edit-game-form-container" class="hidden grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" id="edit-game-name" placeholder="Game Name" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="edit-game-id" placeholder="Game ID" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" disabled>
                    <input type="text" id="edit-game-yaml-slot-name" placeholder="YAML Slot Name (for Cheesetracker)" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-logo" placeholder="Logo URL" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-apworld-link" placeholder="Apworld Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="edit-game-apworld-version" placeholder="Apworld Version" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-mod-link" placeholder="Mod Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="edit-game-mod-version" placeholder="Mod Version" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-mod-setup-guide-link" placeholder="Setup Guide Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-tracker-link" placeholder="Tracker Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-game-info-link" placeholder="Game Info Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-support-link" placeholder="Support Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-save-file-link" placeholder="Save File Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <textarea id="edit-game-rules" placeholder="Rules" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2" rows="2"></textarea>
                    <textarea id="edit-game-extra-information" placeholder="Extra Information" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2" rows="2"></textarea>
                    <button onclick="saveEditedGame()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg md:col-span-2">Save Changes</button>
                </div>
            </div>
            
            <!-- Edit Player Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4">Edit Player</h3>
                <select id="edit-player-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-4">
                    <option value="">Select a player...</option>
                    ${players.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                </select>
                <div id="edit-player-form-container" class="hidden space-y-4">
                    <input type="text" id="edit-player-new-name" placeholder="New Name (optional)" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                    <input type="url" id="edit-player-pfp" placeholder="Profile Picture URL" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                    <button onclick="saveEditedPlayer()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg w-full">Save Changes</button>
                </div>
            </div>
            
            <!-- Edit Logs Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4">Edit Game Logs</h3>
                <select id="edit-log-game-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-4">
                    <option value="">Select a game...</option>
                    ${games.map(g => `<option value="${g.id}">${g.name} (${g.logs?.length || 0} logs)</option>`).join('')}
                </select>
                <div id="edit-logs-container" class="hidden space-y-2 max-h-64 overflow-y-auto"></div>
            </div>
            
            <!-- Player Roles Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4">Player Roles Management</h3>
                <div class="space-y-4">
                    <div>
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">Add New Role</h4>
                        <div class="flex gap-2">
                            <input type="text" id="new-role-name" placeholder="Role Name" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white flex-1">
                            <input type="color" id="new-role-color" value="#ff0000" class="bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-2 h-10 w-12">
                            <button onclick="addNewRole()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Add Role</button>
                        </div>
                    </div>
                    <div>
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">Assign/Remove Roles</h4>
                        <select id="role-player-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-2">
                            <option value="">Select a player...</option>
                            ${players.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}
                        </select>
                        <select id="role-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-2">
                            <option value="">Select a role...</option>
                        </select>
                        <div class="flex gap-2">
                            <button onclick="assignRole('add')" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg flex-1">Assign Role</button>
                            <button onclick="assignRole('remove')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex-1">Remove Role</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Cheesetracker Settings Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4">Cheesetracker Integration</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-slate-300 mb-2">Cheesetracker URL</label>
                        <input type="url" id="cheesetracker-url-input" value="${settings.cheesetracker_url || ''}" placeholder="https://cheesetrackers.theincrediblewheelofchee.se/..." class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                        <p class="text-xs text-slate-400 mt-2">Enter the URL to your Cheesetracker page to enable automatic check tracking and progress display.</p>
                    </div>
                    <button onclick="updateCheesetrackerSettings()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg w-full">Save Cheesetracker Settings</button>
                </div>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    
    // Setup form handlers
    const addGameForm = $('add-game-form');
    if (addGameForm) {
        addGameForm.onsubmit = async (e) => {
            e.preventDefault();
            const gameData = {
                id: $('game-id').value.trim(),
                name: $('game-name').value.trim(),
                logo: $('game-logo').value.trim(),
                yaml_slot_name: $('game-yaml-slot-name').value.trim(),
                apworld_link: $('game-apworld-link').value.trim(),
                apworld_version: $('game-apworld-version').value.trim(),
                mod_link: $('game-mod-link').value.trim(),
                mod_version: $('game-mod-version').value.trim(),
                mod_setup_guide_link: $('game-mod-setup-guide-link').value.trim(),
                tracker_link: $('game-tracker-link').value.trim(),
                game_info_link: $('game-game-info-link').value.trim(),
                support_link: $('game-support-link').value.trim(),
                save_file_link: $('game-save-file-link').value.trim(),
                rules: $('game-rules').value.trim(),
                extra_information: $('game-extra-information').value.trim(),
                current_player: null,
                claimed_at: null,
                total_time_ms: 0,
                completed: false,
                logs: []
            };
            
            try {
                const res = await fetch('/api/moderator-actions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
                    body: JSON.stringify({ action: 'addGame', gameData })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                alert('Game added successfully!');
                addGameForm.reset();
                loadData();
            } catch (err) {
                alert('Error: ' + err.message);
            }
        };
    }
    
    const editGameSelect = $('edit-game-select');
    if (editGameSelect) {
        editGameSelect.onchange = () => {
            const gameId = editGameSelect.value;
            const container = $('edit-game-form-container');
            if (!gameId) {
                container.classList.add('hidden');
                return;
            }
            const game = games.find(g => g.id === gameId);
            if (!game) return;
            
            $('edit-game-name').value = game.name;
            $('edit-game-id').value = game.id;
            $('edit-game-yaml-slot-name').value = game.yaml_slot_name || '';
            $('edit-game-logo').value = game.logo || '';
            $('edit-game-apworld-link').value = game.apworld_link || '';
            $('edit-game-apworld-version').value = game.apworld_version || '';
            $('edit-game-mod-link').value = game.mod_link || '';
            $('edit-game-mod-version').value = game.mod_version || '';
            $('edit-game-mod-setup-guide-link').value = game.mod_setup_guide_link || '';
            $('edit-game-tracker-link').value = game.tracker_link || '';
            $('edit-game-game-info-link').value = game.game_info_link || '';
            $('edit-game-support-link').value = game.support_link || '';
            $('edit-game-save-file-link').value = game.save_file_link || '';
            $('edit-game-rules').value = game.rules || '';
            $('edit-game-extra-information').value = game.extra_information || '';
            container.classList.remove('hidden');
        };
    }
    
    const editPlayerSelect = $('edit-player-select');
    if (editPlayerSelect) {
        editPlayerSelect.onchange = () => {
            const playerName = editPlayerSelect.value;
            const container = $('edit-player-form-container');
            if (!playerName) {
                container.classList.add('hidden');
                return;
            }
            const player = players.find(p => p.name === playerName);
            if (!player) return;
            
            $('edit-player-new-name').value = '';
            $('edit-player-pfp').value = player.pfp_link || '';
            container.classList.remove('hidden');
        };
    }
    
    const editLogGameSelect = $('edit-log-game-select');
    if (editLogGameSelect) {
        editLogGameSelect.onchange = () => {
            const gameId = editLogGameSelect.value;
            const container = $('edit-logs-container');
            if (!gameId) {
                container.classList.add('hidden');
                return;
            }
            const game = games.find(g => g.id === gameId);
            if (!game || !game.logs || game.logs.length === 0) {
                container.innerHTML = '<p class="text-slate-400">No logs for this game.</p>';
                container.classList.remove('hidden');
                return;
            }
            
            container.innerHTML = game.logs.map((log, i) => `
                <div class="flex justify-between items-center bg-slate-800/50 p-2 rounded">
                    <span class="text-sm text-slate-300">${log.player} - ${formatTime(log.duration_ms)}</span>
                    <button onclick="removeLog('${gameId}', ${i})" class="text-red-400 hover:text-red-300">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `).join('');
            container.classList.remove('hidden');
        };
    }
}

function closeModeratorModal() {
    const modal = $('moderator-modal');
    if (modal) modal.classList.add('hidden');
}

async function saveEditedGame() {
    const gameId = $('edit-game-select').value;
    if (!gameId) return;
    
    const gameData = {
        name: $('edit-game-name').value.trim(),
        yaml_slot_name: $('edit-game-yaml-slot-name').value.trim(),
        logo: $('edit-game-logo').value.trim(),
        apworld_link: $('edit-game-apworld-link').value.trim(),
        apworld_version: $('edit-game-apworld-version').value.trim(),
        mod_link: $('edit-game-mod-link').value.trim(),
        mod_version: $('edit-game-mod-version').value.trim(),
        mod_setup_guide_link: $('edit-game-mod-setup-guide-link').value.trim(),
        tracker_link: $('edit-game-tracker-link').value.trim(),
        game_info_link: $('edit-game-game-info-link').value.trim(),
        support_link: $('edit-game-support-link').value.trim(),
        save_file_link: $('edit-game-save-file-link').value.trim(),
        rules: $('edit-game-rules').value.trim(),
        extra_information: $('edit-game-extra-information').value.trim()
    };
    
    try {
        const res = await fetch('/api/moderator-actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
            body: JSON.stringify({ action: 'updateGame', gameId, gameData })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert('Game updated successfully!');
        loadData();
        closeModeratorModal();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function saveEditedPlayer() {
    const playerName = $('edit-player-select').value;
    if (!playerName) return;
    
    const playerData = {
        name: playerName,
        newName: $('edit-player-new-name').value.trim() || undefined,
        pfp_link: $('edit-player-pfp').value.trim()
    };
    
    try {
        const res = await fetch('/api/moderator-actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
            body: JSON.stringify({ action: 'updatePlayer', playerData })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert('Player updated successfully!');
        loadData();
        closeModeratorModal();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function removeLog(gameId, logIndex) {
    if (!confirm('Are you sure you want to remove this log?')) return;
    
    try {
        const res = await fetch('/api/moderator-actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
            body: JSON.stringify({ 
                action: 'updateLog', 
                logData: { gameId, action: 'remove', index: logIndex } 
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert('Log removed successfully!');
        loadData();
        openModeratorModal(); // Refresh the modal
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

let availableRoles = [];

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

async function addNewRole() {
    const roleName = $('new-role-name').value.trim();
    const roleColor = $('new-role-color').value;
    
    if (!roleName) return alert('Please enter a role name');
    
    try {
        const res = await fetch('/api/moderator-actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
            body: JSON.stringify({ 
                action: 'addRole', 
                roleData: { name: roleName, color: roleColor } 
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert('Role added successfully!');
        $('new-role-name').value = '';
        loadRoles();
        openModeratorModal();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function assignRole(action) {
    const playerName = $('role-player-select').value;
    const roleName = $('role-select').value;
    
    if (!playerName) return alert('Please select a player');
    if (!roleName) return alert('Please select a role');
    
    try {
        const res = await fetch('/api/moderator-actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
            body: JSON.stringify({ 
                action: 'assignRole', 
                assignRoleData: { playerName, roleName, action } 
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert(`Role ${action === 'add' ? 'assigned' : 'removed'} successfully!`);
        loadData();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

// Load roles when moderator modal opens
const originalOpenModeratorModal = openModeratorModal;
openModeratorModal = async function() {
    await loadRoles();
    originalOpenModeratorModal();
    
    // Populate role select
    const roleSelect = $('role-select');
    if (roleSelect) {
        roleSelect.innerHTML = '<option value="">Select a role...</option>' + 
            availableRoles.map(r => `<option value="${r.name}">${r.name}</option>`).join('');
    }
};

async function updateCheesetrackerSettings() {
    const url = $('cheesetracker-url-input').value.trim();
    
    try {
        const res = await fetch('/api/moderator-actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
            body: JSON.stringify({
                action: 'updateSettings',
                settingsData: { cheesetracker_url: url }
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert('Cheesetracker settings saved successfully!');
        loadData();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

loadData();
setInterval(loadData, 10000);
