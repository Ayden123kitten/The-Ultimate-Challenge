export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token || !owner || !repo) {
        return res.status(500).json({ error: 'Server configuration missing. Contact admin.' });
    }

    // Handle players update
    if (req.body.type === 'players') {
        const { data: playersData } = req.body;
        const filePath = 'data/players.json';
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

        try {
            // 1. Fetch current file to get its SHA
            const getRes = await fetch(apiUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!getRes.ok) throw new Error('Failed to fetch current players data from GitHub');

            const fileData = await getRes.json();

            // 2. Commit updated file back to GitHub
            const newContent = Buffer.from(JSON.stringify(playersData, null, 2)).toString('base64');
            
            const putRes = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update player images',
                    content: newContent,
                    sha: fileData.sha,
                    branch: branch
                })
            });

            if (!putRes.ok) {
                const errData = await putRes.json();
                if (errData.message.includes('does not match')) {
                    return res.status(409).json({ error: 'Data was modified by someone else just now. Please refresh and try again.' });
                }
                throw new Error(errData.message || 'Failed to save to GitHub');
            }

            return res.status(200).json({ message: 'Player images updated successfully!' });

        } catch (error) {
            console.error('API Error:', error);
            return res.status(500).json({ error: 'Internal server error: ' + error.message });
        }
    }

    // Handle game updates
    const { gameId, action, playerName } = req.body;

    if (!gameId || !action || !playerName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const filePath = 'data/games.json';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

    try {
        // 1. Fetch current file to get its SHA and content
        const getRes = await fetch(apiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!getRes.ok) throw new Error('Failed to fetch current game data from GitHub');

        const fileData = await getRes.json();
        const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
        let games = JSON.parse(currentContent);

        const gameIndex = games.findIndex(g => g.id === gameId);
        if (gameIndex === -1) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const game = games[gameIndex];

        // 2. Validate and Apply Logic
        if (action === 'claim') {
            if (game.current_player) {
                return res.status(409).json({ error: 'Game is already claimed by someone else.' });
            }
            
            // Check if this player is already playing another game
            const playerAlreadyPlaying = games.find(g => g.current_player === playerName && g.id !== gameId);
            if (playerAlreadyPlaying) {
                return res.status(409).json({ error: 'You are already playing another game. Please unclaim it first.' });
            }
            
            game.current_player = playerName;
            game.claimed_at = Date.now();
        } 
        else if (action === 'unclaim') {
            if (game.current_player !== playerName) {
                return res.status(403).json({ error: 'You are not the current player of this game.' });
            }

            const duration = Date.now() - game.claimed_at;
            game.total_time_ms += duration;
            game.logs.push({
                player: playerName,
                start: game.claimed_at,
                end: Date.now(),
                duration_ms: duration
            });
            
            game.current_player = null;
            game.claimed_at = null;
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }

        // 3. Commit updated file back to GitHub
        const newContent = Buffer.from(JSON.stringify(games, null, 2)).toString('base64');
        
        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Async Update: ${action === 'claim' ? 'Claimed' : 'Unclaimed'} ${game.name} by ${playerName}`,
                content: newContent,
                sha: fileData.sha,
                branch: branch
            })
        });

        if (!putRes.ok) {
            const errData = await putRes.json();
            if (errData.message.includes('does not match')) {
                return res.status(409).json({ error: 'Data was modified by someone else just now. Please refresh and try again.' });
            }
            throw new Error(errData.message || 'Failed to save to GitHub');
        }

        return res.status(200).json({ 
            message: action === 'claim' ? 'Game claimed successfully!' : 'Game unclaimed and logged successfully!' 
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
