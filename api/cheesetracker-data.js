import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

export async function GET() {
    try {
        const gamesPath = path.join(dataDir, 'games.json');
        const gamesData = await readFile(gamesPath, 'utf-8');
        const games = JSON.parse(gamesData);
        
        // Build Cheesetracker data object keyed by game ID
        const cheesetrackerData = {};
        games.forEach(game => {
            cheesetrackerData[game.id] = {
                totalChecks: game.cheesetracker_total_checks || 0,
                completedChecks: game.cheesetracker_completed_checks || 0,
                percentage: game.cheesetracker_total_checks > 0 
                    ? Math.round((game.cheesetracker_completed_checks / game.cheesetracker_total_checks) * 100) 
                    : 0
            };
        });
        
        return new Response(JSON.stringify(cheesetrackerData));
    } catch (error) {
        console.error('Error fetching Cheesetracker data:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch Cheesetracker data' }), { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { gameId, completedChecks, totalChecks, playerId, checksGained, sessionChecks } = body;
        
        if (!gameId) {
            return new Response(JSON.stringify({ error: 'Game ID required' }), { status: 400 });
        }
        
        const gamesPath = path.join(dataDir, 'games.json');
        const gamesData = await readFile(gamesPath, 'utf-8');
        const games = JSON.parse(gamesData);
        
        const gameIndex = games.findIndex(g => g.id === gameId);
        if (gameIndex === -1) {
            return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404 });
        }
        
        // Update game's Cheesetracker data
        if (totalChecks !== undefined) {
            games[gameIndex].cheesetracker_total_checks = totalChecks;
        }
        if (completedChecks !== undefined) {
            games[gameIndex].cheesetracker_completed_checks = completedChecks;
        }
        
        // Auto-complete game if all checks are done
        if (totalChecks > 0 && completedChecks >= totalChecks) {
            games[gameIndex].completed = true;
        }
        
        // If checks were gained by a player, update their profile and logs
        if (playerId && checksGained > 0) {
            const playersPath = path.join(dataDir, 'players.json');
            const playersData = await readFile(playersPath, 'utf-8');
            const players = JSON.parse(playersData);
            
            const playerIndex = players.findIndex(p => p.username === playerId);
            if (playerIndex !== -1) {
                // Add checks to player's total
                if (!players[playerIndex].total_checks) {
                    players[playerIndex].total_checks = 0;
                }
                players[playerIndex].total_checks += checksGained;
                
                // Add to player's game-specific checks
                if (!players[playerIndex].game_checks) {
                    players[playerIndex].game_checks = {};
                }
                if (!players[playerIndex].game_checks[gameId]) {
                    players[playerIndex].game_checks[gameId] = 0;
                }
                players[playerIndex].game_checks[gameId] += checksGained;
                
                await writeFile(playersPath, JSON.stringify(players, null, 2));
            }
        }
        
        // Add session checks to game logs if provided
        if (sessionChecks > 0 && playerId) {
            if (!games[gameIndex].logs) {
                games[gameIndex].logs = [];
            }
            games[gameIndex].logs.push({
                player: playerId,
                duration_ms: 0,
                checks_gained: sessionChecks,
                timestamp: Date.now()
            });
        }
        
        await writeFile(gamesPath, JSON.stringify(games, null, 2));
        
        return new Response(JSON.stringify({ success: true }));
    } catch (error) {
        console.error('Error updating Cheesetracker data:', error);
        return new Response(JSON.stringify({ error: 'Failed to update Cheesetracker data' }), { status: 500 });
    }
}
