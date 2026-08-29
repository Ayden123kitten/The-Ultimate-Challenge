// ==========================================
// CONFIGURATION: EDIT THESE VALUES
// ==========================================
const CONFIG = {
    GITHUB_OWNER: 'Ayden123kitten', // Replace with your GitHub username
    GITHUB_REPO: 'The-Ultimate-Challenge',        // Replace with your repository name
    BRANCH: 'main'                       // Change to 'master' if your repo uses master
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
                    <button onclick="unclaimGame('${game.id}')" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i class="fa-solid fa-upload"></i> Mark as Done
                    </button>
                    <div class="text-center text-xs text-slate-400 mt-2">
                        Current session: <span class="font-mono text-white">${formatTime(currentSessionMs)}</span>
                    </div>
                ` : canClaim ? `
                   
