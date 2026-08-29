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
        
        const [gamesRes, playersRes] = await Promise.all([
            fetch(`/api/get-games?t=${Date.now()}`),
            fetch(`${baseRawUrl}/players.json?t=${Date.now()}`)
        ]);

        if (!gamesRes.ok) throw new Error(`Games API: ${gamesRes.status}`);
        if (!playersRes.ok) throw new Error(`Players file: ${playersRes.status}`);

        games = await gamesRes.json();
        players = await playersRes.json();

        populatePlayerSelect();
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
// RENDERING
// ==========================================
function populatePlayerSelect() {
    const container = $('player-select-container');
    const currentNameEl = $('current-player-name');
    
    container.innerHTML = '';
    
    // Update current player display
    if (currentPlayer) {
        currentNameEl.textContent = currentPlayer;
    } else {
        currentNameEl.textContent = 'No player selected';
    }
    
    players.forEach(player => {
        const btn = document.createElement('button');
        const isSelected = player === currentPlayer;
        
        btn.className = `px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
            isSelected 
                ? 'bg-ap-accent text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
        }`;
        
        btn.innerHTML = `
            <i class="fa-solid ${isSelected ? 'fa-check-circle' : 'fa-user'}"></i>
            <span>${player}</span>
        `;
        
        btn.addEventListener('click', () => {
            currentPlayer = player;
            localStorage.setItem('ap_async_player', currentPlayer);
            populatePlayerSelect();
        });
        
        container.appendChild(btn);
    });
}

function renderPlayers() {
    const container = $('players-container');
    container.innerHTML = '';

    // Calculate stats for each player
    const playerStats = players.map(playerName => {
        const playerGames = games.filter(g => g.logs && g.logs.some(log => log.player === playerName));
        const currentGame = games.find(g => g.current_player === playerName);
        
        // Calculate total time across all games
        let totalTimeMs = 0;
        const gameHistory = [];

        games.forEach(game => {
            let gameTotalMs = 0;
            
            // Add time from completed sessions
            if (game.logs) {
                game.logs.forEach(log => {
                    if (log.player === playerName) {
                        gameTotalMs += log.duration_ms;
                        totalTimeMs += log.duration_ms;
                    }
                });
            }
            
            // Add current session time if player is currently playing this game
            if (currentGame && currentGame.id === game.id && game.claimed_at) {
                const currentSessionMs = Date.now() - game.claimed_at;
                gameTotalMs += currentSessionMs;
                totalTimeMs += currentSessionMs;
            }

            if (gameTotalMs > 0) {
                gameHistory.push({
                    gameName: game.name,
                    timeMs: gameTotalMs
                });
            }
        });

        // Sort game history by time played (descending)
        gameHistory.sort((a, b) => b.timeMs - a.timeMs);

        return {
            name: playerName,
            totalTimeMs,
            gamesPlayed: playerGames.length,
            currentGame: currentGame ? currentGame.name : null,
            gameHistory
        };
    });

    // Sort players by total time (descending)
    playerStats.sort((a, b) => b.totalTimeMs - a.totalTimeMs);

    playerStats.forEach(stat => {
        const card = document.createElement('div');
        card.className = 'glass rounded-xl p-6 flex flex-col gap-4';
        
        const hasCurrentGame = stat.currentGame !== null;
        
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-4">
                    <div class="w-16 h-16 rounded-full bg-ap-accent/20 flex items-center justify-center">
                        <i class="fa-solid fa-user text-2xl text-ap-accent"></i>
                    </div>
                    <div>
                        <h2 class="text-2xl font-bold text-white">${stat.name}</h2>
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

// Initialize
loadData();
setInterval(loadData, 10000);
