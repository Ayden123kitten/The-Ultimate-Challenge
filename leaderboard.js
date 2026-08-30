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
let currentPlayer = AUTH.getName();
let currentSortType = 'games'; // 'games', 'time', 'claims', 'completion'

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

        renderLeaderboard();
        updateCurrentPlayerDisplay();
    } catch (err) {
        console.error('Failed to load data:', err);
        $('leaderboard-body').innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-20 text-center text-red-400">
                    <i class="fa-solid fa-circle-exclamation text-4xl mb-4"></i>
                    <p class="text-lg font-bold">Error loading leaderboard</p>
                    <p class="text-sm mt-2">${err.message}</p>
                </td>
            </tr>`;
    }
}

function updateCurrentPlayerDisplay() {
    const currentNameEl = $('current-player-name');
    if (currentNameEl) currentNameEl.textContent = currentPlayer || 'Not logged in';

    // Show settings link for logged-in users
    const settingsLink = $('settings-nav-link');
    if (settingsLink && AUTH.isLoggedIn()) {
        settingsLink.style.display = 'flex';
    }
}

// ==========================================
// CALCULATE PLAYER STATS
// ==========================================
function calculatePlayerStats() {
    const playerStats = players.map(p => {
        const playerName = p.name;
        const playerGames = games.filter(g => g.logs && g.logs.some(log => log.player === playerName));
        
        let totalTimeMs = 0;
        let totalClaims = 0;
        const gameHistory = [];

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

            // Add current session time if player is currently playing this game
            if (game.current_player === playerName && game.claimed_at) {
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

        const gamesPlayed = playerGames.length;
        const avgTimePerGame = gamesPlayed > 0 ? totalTimeMs / gamesPlayed : 0;
        const completionRate = games.length > 0 ? (gamesPlayed / games.length) * 100 : 0;

        return {
            name: playerName,
            pfpLink: p.pfp_link,
            totalTimeMs,
            gamesPlayed,
            totalClaims,
            avgTimePerGame,
            completionRate,
            gameHistory
        };
    });

    return playerStats;
}

// ==========================================
// RENDER LEADERBOARD
// ==========================================
function renderLeaderboard() {
    const container = $('leaderboard-body');
    const topCardsContainer = $('top-players-cards');
    
    const playerStats = calculatePlayerStats();

    // Sort based on current sort type
    if (currentSortType === 'games') {
        playerStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    } else if (currentSortType === 'time') {
        playerStats.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
    } else if (currentSortType === 'claims') {
        playerStats.sort((a, b) => b.totalClaims - a.totalClaims);
    } else if (currentSortType === 'completion') {
        playerStats.sort((a, b) => b.completionRate - a.completionRate);
    }

    // Update header text
    const headerTexts = {
        games: 'Games Played',
        time: 'Total Time',
        claims: 'Total Claims',
        completion: 'Completion Rate'
    };
    $('metric-header').textContent = headerTexts[currentSortType];

    // Render table rows
    container.innerHTML = '';
    
    if (playerStats.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-20 text-center text-slate-500">
                    <i class="fa-solid fa-users-slash text-4xl mb-4"></i>
                    <p>No players found</p>
                </td>
            </tr>`;
        return;
    }

    playerStats.forEach((stat, index) => {
        const rank = index + 1;
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-800/30 transition-colors';
        
        // Add special styling for top 3
        if (rank <= 3) {
            row.classList.add(`rank-${rank}`);
        }

        // Rank badge
        let rankBadge = '';
        if (rank === 1) rankBadge = '<span class="text-2xl">🥇</span>';
        else if (rank === 2) rankBadge = '<span class="text-2xl">🥈</span>';
        else if (rank === 3) rankBadge = '<span class="text-2xl">🥉</span>';
        else rankBadge = `<span class="text-slate-400 font-bold">#${rank}</span>`;

        // Player avatar and name
        const avatar = stat.pfpLink
            ? `<img src="${stat.pfpLink}" alt="${stat.name}" class="w-10 h-10 rounded-full object-cover border-2 border-slate-600" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
            : '';
        const fallbackAvatar = `<div class="w-10 h-10 rounded-full bg-ap-accent/20 flex items-center justify-center" style="${stat.pfpLink ? 'display:none;' : ''}"><i class="fa-solid fa-user text-ap-accent"></i></div>`;

        // Metric value based on sort type
        let metricValue = '';
        if (currentSortType === 'games') {
            metricValue = `<span class="text-lg font-bold text-ap-accent">${stat.gamesPlayed}</span>`;
        } else if (currentSortType === 'time') {
            metricValue = `<span class="text-lg font-bold text-ap-accent">${formatTime(stat.totalTimeMs)}</span>`;
        } else if (currentSortType === 'claims') {
            metricValue = `<span class="text-lg font-bold text-ap-accent">${stat.totalClaims}</span>`;
        } else if (currentSortType === 'completion') {
            metricValue = `<span class="text-lg font-bold text-ap-accent">${stat.completionRate.toFixed(1)}%</span>`;
        }

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                ${rankBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-3">
                    ${avatar}${fallbackAvatar}
                    <span class="font-semibold text-white">${stat.name}</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
                ${metricValue}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right hidden md:table-cell">
                <span class="text-slate-300">${formatTime(stat.avgTimePerGame)}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right hidden lg:table-cell">
                <span class="text-slate-300">${formatTime(stat.totalTimeMs)}</span>
            </td>
        `;

        container.appendChild(row);
    });

    // Render top 3 cards for mobile/tablet view
    renderTopCards(playerStats.slice(0, 3));
}

// ==========================================
// RENDER TOP CARDS
// ==========================================
function renderTopCards(top3) {
    const container = $('top-players-cards');
    container.innerHTML = '';

    if (top3.length === 0) return;

    const cardTitles = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place'];
    const borderColors = ['border-yellow-500', 'border-gray-400', 'border-orange-600'];

    top3.forEach((stat, index) => {
        if (!stat) return;

        const card = document.createElement('div');
        card.className = `glass rounded-xl p-6 ${borderColors[index]} border-t-4`;

        const avatar = stat.pfpLink
            ? `<img src="${stat.pfpLink}" alt="${stat.name}" class="w-20 h-20 rounded-full object-cover border-4 border-slate-600" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
            : '';
        const fallbackAvatar = `<div class="w-20 h-20 rounded-full bg-ap-accent/20 flex items-center justify-center mx-auto" style="${stat.pfpLink ? 'display:none;' : ''}"><i class="fa-solid fa-user text-3xl text-ap-accent"></i></div>`;

        card.innerHTML = `
            <div class="text-center">
                <div class="text-lg font-bold text-white mb-4">${cardTitles[index]}</div>
                <div class="mb-4">
                    ${avatar}${fallbackAvatar}
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${stat.name}</h3>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-slate-800/50 rounded-lg p-2">
                        <div class="text-xs text-slate-400">Games</div>
                        <div class="text-lg font-bold text-ap-accent">${stat.gamesPlayed}</div>
                    </div>
                    <div class="bg-slate-800/50 rounded-lg p-2">
                        <div class="text-xs text-slate-400">Time</div>
                        <div class="text-sm font-bold text-ap-accent">${formatTime(stat.totalTimeMs)}</div>
                    </div>
                    <div class="bg-slate-800/50 rounded-lg p-2">
                        <div class="text-xs text-slate-400">Claims</div>
                        <div class="text-lg font-bold text-ap-accent">${stat.totalClaims}</div>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

// ==========================================
// TAB SWITCHING
// ==========================================
function setupTabListeners() {
    const tabs = {
        'tab-games': 'games',
        'tab-time': 'time',
        'tab-claims': 'claims',
        'tab-completion': 'completion'
    };

    Object.entries(tabs).forEach(([tabId, sortType]) => {
        const tab = $(tabId);
        if (tab) {
            tab.addEventListener('click', () => {
                // Update active tab styling
                document.querySelectorAll('.ranking-tab').forEach(t => {
                    t.className = 'ranking-tab flex-1 md:flex-none px-6 py-3 rounded-lg font-semibold bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500 transition-all';
                });
                tab.className = 'ranking-tab flex-1 md:flex-none px-6 py-3 rounded-lg font-semibold bg-ap-accent/20 text-ap-accent border border-ap-accent/30 transition-all';

                // Update sort type and re-render
                currentSortType = sortType;
                renderLeaderboard();
            });
        }
    });
}

// ==========================================
// INITIALIZE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setupTabListeners();
    loadData();
    
    // Refresh data every 10 seconds
    setInterval(loadData, 10000);
});
