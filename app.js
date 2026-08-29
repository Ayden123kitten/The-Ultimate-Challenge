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
let currentPlayer = localStorage.getItem('ap_async_player') || '';

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
        const baseRawUrl = `https://raw.githubusercontent.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/${CONFIG.BRANCH}/data`;
        
        const [gamesRes, playersRes, settingsRes] = await Promise.all([
            fetch(`/api/get-games?t=${Date.now()}`), // Use API to bypass raw CDN cache
            fetch(`${baseRawUrl}/players.json?t=${Date.now()}`),
            fetch(`${baseRawUrl}/settings.json?t=${Date.now()}`)
        ]);

        if (!gamesRes.ok) throw new Error(`Games API: ${gamesRes.status}`);
        if (!playersRes.ok) throw new Error(`Players file: ${playersRes.status}`);
        if (!settingsRes.ok) throw new Error(`Settings file: ${settingsRes.status}`);

        games = await gamesRes.json();
        players = await playersRes.json();
        settings = await settingsRes.json();

        populatePlayerSelect();
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
    
    // Update current player display on both pages (if element exists)
    if (currentNameEl) {
        if (currentPlayer) {
            currentNameEl.textContent = currentPlayer;
        } else {
            currentNameEl.textContent = 'No player selected';
        }
    }
}

// ==========================================
// RENDERING
// ==========================================
function renderGames() {
    const container = $('games-container');
    container.innerHTML = '';

    const sortedGames = [...games].sort((a, b) => a.name.localeCompare(b.name));

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
        const hasCoverImage = game.cover_image && game.cover_image.trim() !== '';
        
        const links = [
            { url: game.apworld_link, icon: 'fa-globe', label: 'APWorld' },
            { url: game.mod_link, icon: 'fa-puzzle-piece', label: 'Mod' },
            { url: game.mod_setup_guide_link, icon: 'fa-book', label: 'Setup Guide' },
            { url: game.tracker_link, icon: 'fa-map', label: 'Tracker' },
            { url: game.game_info_link, icon: 'fa-circle-info', label: 'Game Info' },
            { url: game.support_link, icon: 'fa-circle-question', label: 'Support' },
            { url: game.save_file_link, icon: 'fa-download', label: 'Save File', primary: true }
        ].filter(l => l.url && l.url.trim() !== '');

        const card = document.createElement('div');
        card.className = 'glass rounded-xl p-6 flex flex-col gap-4 transition-all hover:border-ap-accent/50';
        
        card.innerHTML = `
            ${hasCoverImage ? `
                <div class="relative w-full h-48 rounded-lg overflow-hidden mb-2">
                    <img src="${game.cover_image}" alt="${game.name}" 
                         class="w-full h-full object-cover"
                         onerror="this.parentElement.style.display='none'">
                </div>
            ` : ''}
            
            <div class="flex justify-between items-start">
                <div>
                    <h2 class="text-xl font-bold text-white">${game.name}</h2>
                    <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${isClaimed ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}">
                        ${isClaimed ? `Playing: ${game.current_player}` : 'Available'}
                    </span>
                </div>
                <div class="text-right">
                    <div class="text-xs text-slate-400 uppercase">Total Time</div>
                    <div class="text-lg font-mono font-bold text-ap-accent">${formatTime(totalTimeMs)}</div>
                </div>
            </div>

            ${hasRules ? `
                <div class="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 border border-slate-700">
                    <span class="text-ap-accent font-semibold">Rules:</span> ${game.rules}
                </div>
            ` : ''}

            ${links.length > 0 ? `
                <div class="grid grid-cols-2 gap-2 text-sm">
                    ${links.map(link => renderLink(link.url, link.icon, link.label, link.primary)).join('')}
                </div>
            ` : ''}

            <div class="mt-2">
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
                        <i class="fa-solid fa-lock"></i> ${currentPlayer === '' ? 'Select Player on Players Page' : 'Currently Unavailable'}
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
    if (!currentPlayer) return alert('Please select your name from the Players page first.');
    if (!confirm(`Claim ${games.find(g => g.id === gameId).name} as ${currentPlayer}?`)) return;
    await updateGame(gameId, 'claim', e);
}

async function unclaimGame(gameId, e) {
    if (!confirm('Have you finished playing and uploaded your save file to Google Drive?\n\nOnce you mark it as done, the next player can start!')) return;
    await updateGame(gameId, 'unclaim', e);
}

async function updateGame(gameId, action, e) {
    const btn = e.target.closest('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/update-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, action, playerName: currentPlayer })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update');
        
        // OPTIMISTIC UI UPDATE: Instantly update local state so the UI changes immediately
        const game = games.find(g => g.id === gameId);
        if (game) {
            if (action === 'claim') {
                game.current_player = currentPlayer;
                game.claimed_at = Date.now();
            } else if (action === 'unclaim') {
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
            }
        }
        
        renderGames(); // Instantly reflect changes in the UI
        
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
    const now = Date.now();
    const start = new Date(settings.start_time).getTime();
    const end = settings.end_time && settings.end_time.trim() !== '' ? new Date(settings.end_time).getTime() : null;
    
    const timerEl = $('global-timer');
    const statusEl = $('timer-status');

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

loadData();
setInterval(loadData, 10000);
