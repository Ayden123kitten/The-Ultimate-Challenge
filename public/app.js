let currentUser = null;
let settings = { start_time: '0', end_time: '0' };
let timerInterval;

// --- API Helpers ---
async function api(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    return res.json();
}

// --- Auth ---
async function checkAuth() {
    const data = await api('/api/me');
    currentUser = data.user;
    updateAuthUI();
}

function updateAuthUI() {
    const authBtns = document.getElementById('auth-buttons');
    const userMenu = document.getElementById('user-menu');
    const settingsBtn = document.getElementById('settings-btn');
    
    if (currentUser) {
        authBtns.classList.add('hidden');
        userMenu.classList.remove('hidden');
        document.getElementById('username-display').textContent = currentUser.username;
        if (currentUser.is_admin) settingsBtn.classList.remove('hidden');
        else settingsBtn.classList.add('hidden');
    } else {
        authBtns.classList.remove('hidden');
        userMenu.classList.add('hidden');
    }
}

async function login() {
    const username = document.getElementById('login-user').value;
    const password = document.getElementById('login-pass').value;
    const res = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (res.error) return alert(res.error);
    closeModals();
    await checkAuth();
    loadGames();
}

async function register() {
    const username = document.getElementById('reg-user').value;
    const password = document.getElementById('reg-pass').value;
    const res = await api('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (res.error) return alert(res.error);
    closeModals();
    await checkAuth();
    loadGames();
}

async function logout() {
    await api('/api/logout', { method: 'POST' });
    currentUser = null;
    updateAuthUI();
    showHome();
}

// --- UI Navigation ---
function showHome() {
    document.getElementById('home-view').classList.remove('hidden');
    document.getElementById('game-view').classList.add('hidden');
    loadGames();
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }

// --- Timer ---
async function loadSettings() {
    settings = await api('/api/settings');
    document.getElementById('set-start').value = settings.start_time !== '0' ? new Date(parseInt(settings.start_time)).toISOString().slice(0, 16) : '';
    document.getElementById('set-end').value = settings.end_time !== '0' ? new Date(parseInt(settings.end_time)).toISOString().slice(0, 16) : '';
    startTimer();
}

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        const start = parseInt(settings.start_time);
        const end = parseInt(settings.end_time);
        
        let displayTime = 0;
        if (now < start) {
            displayTime = 0;
        } else if (end > 0 && now > end) {
            displayTime = end - start;
        } else {
            displayTime = now - start;
        }
        
        document.getElementById('global-timer').textContent = formatTime(displayTime);
    }, 1000);
}

function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

async function saveSettings() {
    const start = document.getElementById('set-start').value ? new Date(document.getElementById('set-start').value).getTime() : 0;
    const end = document.getElementById('set-end').value ? new Date(document.getElementById('set-end').value).getTime() : 0;
    
    await api('/api/settings', { method: 'POST', body: JSON.stringify({ start_time: start.toString(), end_time: end.toString() }) });
    closeModals();
    loadSettings();
}

// --- Games ---
async function loadGames() {
    const games = await api('/api/games');
    const grid = document.getElementById('games-grid');
    grid.innerHTML = '';
    
    games.forEach(game => {
        const isLocked = game.status === 'locked';
        const card = document.createElement('div');
        card.className = 'game-card bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg cursor-pointer flex flex-col justify-between';
        card.onclick = () => showGame(game.slug);
        
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-start mb-2">
                    <h3 class="text-xl font-bold">${game.name}</h3>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${isLocked ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}">
                        ${isLocked ? 'In Progress' : 'Available'}
                    </span>
                </div>
                <p class="text-gray-400 text-sm mb-4 line-clamp-3">${game.rules || 'No rules specified.'}</p>
            </div>
            <div class="text-sm text-gray-500">
                ${isLocked ? `Playing: <span class="text-indigo-400 font-medium">${game.current_user_id ? 'User #' + game.current_user_id : 'Unknown'}</span>` : 'Ready to play'}
            </div>
        `;
        grid.appendChild(card);
    });
}

async function showGame(slug) {
    document.getElementById('home-view').classList.add('hidden');
    const view = document.getElementById('game-view');
    view.classList.remove('hidden');
    view.innerHTML = '<p class="text-center text-gray-500">Loading...</p>';
    
    const game = await api(`/api/game/${slug}`);
    const isPlayingThis = currentUser && currentUser.current_game_slug === slug;
    const isPlayingOther = currentUser && currentUser.current_game_slug && currentUser.current_game_slug !== slug;
    const isLocked = game.status === 'locked';

    let actionBtn = '';
    if (!currentUser) {
        actionBtn = `<p class="text-yellow-400">Login to play this game.</p>`;
    } else if (isPlayingThis) {
        actionBtn = `
            <div class="bg-gray-900 p-4 rounded-lg border border-indigo-500">
                <h4 class="font-bold text-indigo-400 mb-2">You are currently playing this game!</h4>
                <p class="text-sm text-gray-400 mb-3">Upload your save file and mark as done when you finish your session.</p>
                <form id="release-form" class="flex items-center space-x-3">
                    <input type="file" name="savefile" class="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                    <button type="submit" class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium">Finish Session</button>
                </form>
            </div>
        `;
    } else if (isPlayingOther) {
        actionBtn = `<p class="text-red-400">You are currently playing another game. Finish it first.</p>`;
    } else if (isLocked) {
        actionBtn = `<p class="text-gray-400">This game is currently locked by another player.</p>`;
    } else {
        actionBtn = `<button onclick="claimGame('${slug}')" class="px-6 py-3 bg-primary hover:bg-secondary rounded-lg font-bold text-lg shadow-lg">Claim & Start Playing</button>`;
    }

    let saveFileSection = '';
    if (game.current_save_filename) {
        saveFileSection = `
            <div class="mb-6">
                <h4 class="font-bold mb-2">Current Save File</h4>
                <a href="/uploads/${game.current_save_filename}" download class="inline-flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download Latest Save
                </a>
            </div>
        `;
    }

    let linksHtml = '';
    if (game.links) {
        linksHtml = '<div class="grid grid-cols-2 gap-3 mb-6">';
        for (const [key, url] of Object.entries(game.links)) {
            if(url) {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                linksHtml += `<a href="${url}" target="_blank" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-center">${label}</a>`;
            }
        }
        linksHtml += '</div>';
    }

    let logsHtml = game.logs.length > 0 ? game.logs.map(l => `
        <tr class="border-b border-gray-700">
            <td class="py-2 px-4">${l.username}</td>
            <td class="py-2 px-4">${new Date(l.started_at).toLocaleString()}</td>
            <td class="py-2 px-4">${formatTime(l.duration_seconds * 1000)}</td>
        </tr>
    `).join('') : '<tr><td colspan="3" class="py-4 text-center text-gray-500">No logs yet.</td></tr>';

    view.innerHTML = `
        <button onclick="showHome()" class="mb-4 text-gray-400 hover:text-white flex items-center">
            <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            Back to Games
        </button>
        
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg mb-6">
            <div class="flex justify-between items-start mb-4">
                <h2 class="text-3xl font-bold">${game.name}</h2>
                <span class="px-3 py-1 text-sm font-semibold rounded-full ${isLocked ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}">
                    ${isLocked ? `Locked by ${game.current_user}` : 'Available'}
                </span>
            </div>
            
            <div class="mb-6">
                <h4 class="font-bold mb-2">In-Game Rules</h4>
                <p class="text-gray-300 whitespace-pre-wrap bg-gray-900 p-4 rounded-lg border border-gray-700">${game.rules || 'No specific rules.'}</p>
            </div>

            ${linksHtml}
            ${saveFileSection}
            
            <div class="border-t border-gray-700 pt-6">
                ${actionBtn}
            </div>
        </div>

        <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-lg">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold">Play Logs</h3>
                <span class="text-sm text-gray-400">Total Time: <span class="text-indigo-400 font-mono">${formatTime(game.total_time_seconds * 1000)}</span></span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-gray-900 text-gray-400">
                        <tr>
                            <th class="py-2 px-4">Player</th>
                            <th class="py-2 px-4">Started</th>
                            <th class="py-2 px-4">Duration</th>
                        </tr>
                    </thead>
                    <tbody>${logsHtml}</tbody>
                </table>
            </div>
        </div>
    `;

    const releaseForm = document.getElementById('release-form');
    if (releaseForm) {
        releaseForm.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(releaseForm);
            formData.append('started_at', Date.now()); // Fallback for duration calc
            
            const res = await fetch(`/api/game/${slug}/release`, {
                method: 'POST',
                body: formData
            }).then(r => r.json());
            
            if (res.error) return alert(res.error);
            await checkAuth();
            showGame(slug);
        };
    }
}

async function claimGame(slug) {
    const res = await api(`/api/game/${slug}/claim`, { method: 'POST' });
    if (res.error) return alert(res.error);
    await checkAuth();
    showGame(slug);
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadSettings();
    await loadGames();
});
