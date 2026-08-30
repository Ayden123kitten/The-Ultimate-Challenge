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

async function savePlayers() {
    try {
        const response = await fetch('/api/update-game.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'players', data: players })
        });
        if (!response.ok) throw new Error(`Save failed: ${response.status}`);
        return true;
    } catch (err) {
        console.error('Failed to save players:', err);
        alert('Failed to save player data: ' + err.message);
        return false;
    }
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
        const playersData = await playersRes.json();
        
        // Handle both old format (array of strings) and new format (array of objects)
        players = playersData.map(p => {
            if (typeof p === 'string') {
                return { name: p, image: '' };
            }
            return { name: p.name, image: p.image || '' };
        });

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
let searchQuery = '';

function renderPlayers() {
    const container = $('players-container');
    container.innerHTML = '';

    // Update current player display in header
    const currentNameEl = $('current-player-name');
    if (currentNameEl) {
        currentNameEl.textContent = currentPlayer || 'No player selected';
    }

    // Calculate stats for each player
    const playerStats = players.map(playerObj => {
        const playerName = playerObj.name;
        const playerImage = playerObj.image || '';
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
            image: playerImage,
            totalTimeMs,
            gamesPlayed: playerGames.length,
            currentGame: currentGame ? currentGame.name : null,
            gameHistory
        };
    });

    // Sort players alphabetically by name
    playerStats.sort((a, b) => a.name.localeCompare(b.name));
    
    // Filter players based on search query
    let filteredStats = playerStats;
    if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        filteredStats = playerStats.filter(stat => 
            stat.name.toLowerCase().includes(query)
        );
    }

    filteredStats.forEach(stat => {
        const card = document.createElement('div');
        const isSelected = stat.name === currentPlayer;
        card.className = `glass rounded-xl p-6 flex flex-col gap-4 cursor-pointer transition-all ${isSelected ? 'border-2 border-ap-accent' : 'hover:border-ap-accent/50'}`;
        
        const hasCurrentGame = stat.currentGame !== null;
        const playerImage = stat.image && stat.image.trim() !== '' ? stat.image : null;
        
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-4">
                    <div class="w-16 h-16 rounded-full ${playerImage ? '' : 'bg-ap-accent/20'} flex items-center justify-center overflow-hidden relative group">
                        ${playerImage 
                            ? `<img src="${playerImage}" alt="${stat.name}" class="w-full h-full object-cover">`
                            : `<i class="fa-solid fa-user text-2xl text-ap-accent"></i>`
                        }
                        <button class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center" onclick="event.stopPropagation(); editPlayerImage('${stat.name}')">
                            <i class="fa-solid fa-camera text-white text-lg"></i>
                        </button>
                    </div>
                    <div>
                        <h2 class="text-2xl font-bold text-white">${stat.name} ${isSelected ? '<span class="text-xs text-ap-accent ml-2">(Selected)</span>' : ''}</h2>
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
        
        card.addEventListener('click', () => {
            currentPlayer = stat.name;
            localStorage.setItem('ap_async_player', currentPlayer);
            renderPlayers();
        });
        
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

// Edit player image function
window.editPlayerImage = async (playerName) => {
    const player = players.find(p => p.name === playerName);
    if (!player) return;
    
    const currentImage = player.image || '';
    const newImage = prompt('Enter image URL for ' + playerName + ':', currentImage);
    
    if (newImage !== null) {
        player.image = newImage.trim();
        await savePlayers();
        renderPlayers();
    }
};

// Initialize
loadData();
setInterval(loadData, 10000);
