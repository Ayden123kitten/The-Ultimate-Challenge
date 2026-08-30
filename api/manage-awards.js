import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';
    const jwtSecret = process.env.JWT_SECRET;

    if (!token || !owner || !repo || !jwtSecret) {
        return res.status(500).json({ error: 'Server configuration missing. Contact admin.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const authToken = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(authToken, jwtSecret);
        const playerName = decoded.name;

        // Check if user is a moderator and get their permissions
        const modFilePath = 'data/moderators.json';
        const modApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${modFilePath}?ref=${branch}`;

        const modRes = await fetch(modApiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let moderators = [];
        let admin = null;
        let userPermissions = {};
        let isAdmin = false;
        if (modRes.ok) {
            const modFileData = await modRes.json();
            const modContent = Buffer.from(modFileData.content, 'base64').toString('utf-8');
            const modData = JSON.parse(modContent);
            admin = modData.admin || null;
            moderators = modData.moderators || [];
            
            // Check if user is admin
            isAdmin = admin === playerName;
            
            // Find user's moderator record and get permissions
            const modRecord = moderators.find(m => m.name === playerName);
            if (modRecord && modRecord.permissions) {
                userPermissions = modRecord.permissions;
            }
        }

        const isModerator = isAdmin || moderators.some(m => m.name === playerName);

        if (!isModerator) {
            return res.status(403).json({ error: 'Access denied. Moderators only.' });
        }

        // Helper function to check permission
        const hasPermission = (permission) => {
            return isAdmin || userPermissions[permission] === true;
        };

        const { action, awardData, assignAwardData } = req.body;

        if (action === 'addAward') {
            if (!hasPermission('manageAwards')) {
                return res.status(403).json({ error: 'Access denied. Missing manageAwards permission.' });
            }
            const awardsFilePath = 'data/awards.json';
            const awardsApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${awardsFilePath}?ref=${branch}`;

            const awardsGetRes = await fetch(awardsApiUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            let awards = { awards: [] };
            let sha = null;
            if (awardsGetRes.ok) {
                const awardsFileData = await awardsGetRes.json();
                sha = awardsFileData.sha;
                const awardsContent = Buffer.from(awardsFileData.content, 'base64').toString('utf-8');
                awards = JSON.parse(awardsContent);
            }

            awards.awards.push(awardData);

            const newAwardsContent = Buffer.from(JSON.stringify(awards, null, 2)).toString('base64');
            
            const putRes = await fetch(awardsApiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Add award: ${awardData.name}`,
                    content: newAwardsContent,
                    sha: sha,
                    branch: branch
                })
            });

            if (!putRes.ok) {
                const errData = await putRes.json();
                throw new Error(errData.message || 'Failed to add award');
            }

            return res.status(200).json({ message: 'Award added successfully!' });
        }

        if (action === 'assignAward') {
            if (!hasPermission('manageAwards')) {
                return res.status(403).json({ error: 'Access denied. Missing manageAwards permission.' });
            }
            const playersFilePath = 'data/players.json';
            const playersApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${playersFilePath}?ref=${branch}`;

            const playersGetRes = await fetch(playersApiUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!playersGetRes.ok) throw new Error('Failed to fetch players data');

            const playersFileData = await playersGetRes.json();
            const playersContent = Buffer.from(playersFileData.content, 'base64').toString('utf-8');
            let players = JSON.parse(playersContent).map(p =>
                typeof p === 'string' ? { name: p, password_hash: null, pfp_link: '' } : p
            );

            const playerIndex = players.findIndex(p => p.name === assignAwardData.playerName);
            if (playerIndex === -1) {
                return res.status(404).json({ error: 'Player not found' });
            }

            if (!players[playerIndex].awards) {
                players[playerIndex].awards = [];
            }

            if (assignAwardData.action === 'add') {
                const awardExists = players[playerIndex].awards.some(a => a.name === assignAwardData.awardName);
                if (!awardExists) {
                    players[playerIndex].awards.push({
                        name: assignAwardData.awardName,
                        icon: assignAwardData.icon,
                        description: assignAwardData.description,
                        awardedAt: new Date().toISOString()
                    });
                }
            } else if (assignAwardData.action === 'remove') {
                players[playerIndex].awards = players[playerIndex].awards.filter(a => a.name !== assignAwardData.awardName);
            }

            const newPlayersContent = Buffer.from(JSON.stringify(players, null, 2)).toString('base64');
            
            const putRes = await fetch(playersApiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Assign award to player: ${assignAwardData.playerName}`,
                    content: newPlayersContent,
                    sha: playersFileData.sha,
                    branch: branch
                })
            });

            if (!putRes.ok) {
                const errData = await putRes.json();
                throw new Error(errData.message || 'Failed to assign award');
            }

            return res.status(200).json({ message: 'Award assigned successfully!' });
        }

        return res.status(400).json({ error: 'Invalid action' });

    } catch (error) {
        console.error('Awards API Error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
