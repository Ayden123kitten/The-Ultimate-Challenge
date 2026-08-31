import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';
    const jwtSecret = process.env.JWT_SECRET;

    if (!token || !owner || !repo) {
        return res.status(500).json({ error: 'Server configuration missing. Contact admin.' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const authToken = authHeader.split(' ')[1];

    if (!jwtSecret) {
        return res.status(500).json({ error: 'Server configuration missing. Contact admin.' });
    }

    let username;
    try {
        const decoded = jwt.verify(authToken, jwtSecret);
        username = decoded.name;
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const { data } = req.body;

    if (!data) {
        return res.status(400).json({ error: 'Data is required' });
    }

    const filePath = 'data/players.json';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

    try {
        const getRes = await fetch(apiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!getRes.ok) throw new Error('Failed to fetch players from GitHub');

        const fileData = await getRes.json();
        const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
        let players = JSON.parse(currentContent).map(p =>
            typeof p === 'string' ? { name: p, password_hash: null, pfp_link: '' } : p
        );

        const playerIndex = players.findIndex(p => p.name === username);
        if (playerIndex === -1) {
            return res.status(404).json({ error: 'Player not found' });
        }

        // Update allowed fields
        const allowedFields = ['pfp_link', 'bio', 'pronouns', 'discord'];
        allowedFields.forEach(field => {
            if (data[field] !== undefined) {
                players[playerIndex][field] = data[field];
            }
        });

        const newContent = Buffer.from(JSON.stringify(players, null, 2)).toString('base64');

        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Update profile: ${username}`,
                content: newContent,
                sha: fileData.sha,
                branch: branch
            })
        });

        if (!putRes.ok) {
            const errData = await putRes.json();
            throw new Error(errData.message || 'Failed to update profile');
        }

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ error: 'Failed to update profile: ' + err.message });
    }
}
