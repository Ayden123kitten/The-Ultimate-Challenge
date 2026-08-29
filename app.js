// ==========================================
// CONFIGURATION: EDIT THESE VALUES
// ==========================================
const CONFIG = {
    GITHUB_OWNER: 'YOUR_GITHUB_USERNAME', // Replace with your GitHub username
    GITHUB_REPO: 'YOUR_REPO_NAME',        // Replace with your repository name
    BRANCH: 'main'                        // Change to 'master' if your repo uses master
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
            fetch(`${baseRawUrl}/games.json?t=${Date.now()}`),
            fetch(`${baseRawUrl}/players.json?t=${Date.now()}`),
            fetch(`${baseRawUrl}/settings.json?t=${Date.now()}`)
        ]);

        games = await gamesRes.json();
        players = await playersRes.json();
        settings = await settingsRes.json();

        populatePlayerSelect();
        renderGames();
        updateGlobalTimer();
    } catch (err) {
        console.error('Failed to load data:', err);
        $('games-container').innerHTML = `<div class="col-span-full text-center text-red-400">Error loading data. Check console and CONFIG settings.</div>`;
    }
}

function populatePlayerSelect() {
    const select = $('player-select');
    select.innerHTML = '<option value="">Select Player...</option>';
    players.forEach(player => {
        const option = document.createElement('option');
        option.value = player;
        option.textContent = player;
        if (player === currentPlayer) option.selected = true;
        select.appendChild(option);
    });
    
    select.addEventListener('change', (e) => {
        currentPlayer = e.target.value;
        localStorage.setItem('ap_async_player', currentPlayer);
        renderGames();
    });
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

        // Conditional rendering checks
        const hasRules = game.rules && game.rules.trim() !== '';
        const links = [
            { url: game.apworld_link, icon: 'fa-globe', label: 'APWorld' },
            { url: game.mod_link, icon: 'fa-puzzle-piece', label: 'Mod' },
            { url: game.mod_setup_guide_link, icon: 'fa-book', label: 'Setup Guide' },
            { url: game.tracker_link, icon: 'fa-map', label: 'Tracker' },
            { url: game.support_thread_link, icon: 'fa-comments', label: 'Support' },
            { url: game.save_file_link, icon: 'fa-download', label: 'Save File', primary: true }
        ].filter(l => l.url && l.url.trim() !== '');

        const card = document.createElement('div');
        card.className = 'glass rounded-xl p-6 flex flex-col gap-4 transition-all hover:border-ap-accent/50';
        
        card.innerHTML = `
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
                    <button onclick="releaseGame('${game.id}')" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i class="fa-solid fa-flag-checkered"></i> Mark as Done & Release
                    </button>
                    <div class="text-center text-xs text-slate-400 mt-2">
                        Current session: <span class="font-mono text-white">${formatTime(currentSessionMs)}</span>
                    </div>
                ` : canClaim ? `
                    <button onclick="claimGame('${game.id}')" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i class="fa-solid fa-play"></i> Claim Game
                    </button>
                ` : `
                    <button disabled class="w-full bg-slate-700 text-slate-500 font-bold py-2 px-4 rounded-lg cursor-not-allowed flex items-center justify-center gap-2">
                        <i class="fa-solid fa-lock"></i> ${currentPlayer === '' ? 'Select Player Above' : 'Currently Unavailable'}
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
async function claimGame(gameId) {
    if (!currentPlayer) return alert('Please select your name first.');
    if (!confirm(`Claim ${games.find(g => g.id === gameId).name} as ${currentPlayer}?`)) return;
    await updateGame(gameId, 'claim');
}

async function releaseGame(gameId) {
    if (!confirm('Mark this game as done and release it for the next player?')) return;
    await updateGame(gameId, 'release');
}

async function updateGame(gameId, action) {
    const btn = event.target.closest('button'); // Safely get the button element
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
        
        alert(data.message);
        await loadData();
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
    const end = new Date(settings.end_time).getTime();
    
    const timerEl = $('global-timer');
    const statusEl = $('timer-status');

    if (now < start) {
        timerEl.textContent = formatTime(start - now);
        statusEl.textContent = 'Starts In';
        statusEl.className = 'text-xs text-yellow-400 uppercase tracking-widest';
    } else if (now >= start && now <= end) {
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
