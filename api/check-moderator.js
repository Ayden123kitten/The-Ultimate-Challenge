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

        const filePath = 'data/moderators.json';
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

        const getRes = await fetch(apiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let moderators = [];
        if (getRes.ok) {
            const fileData = await getRes.json();
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            moderators = JSON.parse(content).moderators || [];
        }

        const isModerator = moderators.some(m => m.name === playerName);

        return res.status(200).json({ isModerator });
    } catch (error) {
        console.error('Check moderator error:', error);
        return res.status(401).json({ error: 'Invalid token' });
    }
}
