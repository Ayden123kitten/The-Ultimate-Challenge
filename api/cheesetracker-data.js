export default async function handler(req, res) {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token || !owner || !repo) {
        return res.status(500).json({ error: 'Server configuration missing. Contact admin.' });
    }

    if (req.method === 'GET') {
        try {
            const filePath = 'data/games.json';
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

            const getRes = await fetch(apiUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!getRes.ok) throw new Error('Failed to fetch games from GitHub');

            const fileData = await getRes.json();
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            const games = JSON.parse(content);

            // Build Cheesetracker data object keyed by game ID
            const cheesetrackerData = {};
            games.forEach(game => {
                cheesetrackerData[game.id] = {
                    totalChecks: game.cheesetracker_total_checks || 0,
                    completedChecks: game.cheesetracker_completed_checks || 0,
                    percentage: game.cheesetracker_total_checks > 0
                        ? Math.round((game.cheesetracker_completed_checks / game.cheesetracker_total_checks) * 100)
                        : 0,
                    yamlSlotName: game.yaml_slot_name || ''
                };
            });

            return res.status(200).json(cheesetrackerData);
        } catch (error) {
            console.error('Error fetching Cheesetracker data:', error);
            return res.status(500).json({ error: 'Failed to fetch Cheesetracker data' });
        }
    }

    if (req.method === 'POST') {
        try {
            const body = req.body;
            const { gameId, completedChecks, totalChecks, playerId, checksGained, sessionChecks } = body;

            if (!gameId) {
                return res.status(400).json({ error: 'Game ID required' });
            }

            // Fetch current games data
            const filePath = 'data/games.json';
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

            const getRes = await fetch(apiUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!getRes.ok) throw new Error('Failed to fetch games from GitHub');

            const fileData = await getRes.json();
            let games = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));

            const gameIndex = games.findIndex(g => g.id === gameId);
            if (gameIndex === -1) {
                return res.status(404).json({ error: 'Game not found' });
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
                const playersPath = 'data/players.json';
                const playersApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${playersPath}?ref=${branch}`;

                const playersGetRes = await fetch(playersApiUrl, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (playersGetRes.ok) {
                    const playersFileData = await playersGetRes.json();
                    let players = JSON.parse(Buffer.from(playersFileData.content, 'base64').toString('utf-8'));

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

                        // Update players file
                        const updatePlayersRes = await fetch(playersApiUrl, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `token ${token}`,
                                'Accept': 'application/vnd.github.v3+json',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                message: 'Update player checks',
                                content: Buffer.from(JSON.stringify(players, null, 2)).toString('base64'),
                                sha: playersFileData.sha
                            })
                        });

                        if (!updatePlayersRes.ok) {
                            console.error('Failed to update players file:', updatePlayersRes.status);
                        }
                    }
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

            // Update games file on GitHub
            const updateRes = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update Cheesetracker data',
                    content: Buffer.from(JSON.stringify(games, null, 2)).toString('base64'),
                    sha: fileData.sha
                })
            });

            if (!updateRes.ok) {
                throw new Error('Failed to update games file on GitHub');
            }

            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Error updating Cheesetracker data:', error);
            return res.status(500).json({ error: 'Failed to update Cheesetracker data' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
