import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    // Set JSON content type for all responses
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, password } = req.body;
    if (!name || !password) {
        return res.status(400).json({ error: 'Name and password are required.' });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';
    const jwtSecret = process.env.JWT_SECRET;

    if (!token || !owner || !repo || !jwtSecret) {
        return res.status(500).json({ error: 'Server configuration missing. Contact admin.' });
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
        const players = JSON.parse(currentContent).map(p =>
            typeof p === 'string' ? { name: p, password_hash: null, pfp_link: '' } : p
        );

        const player = players.find(p => p.name.toLowerCase() === name.trim().toLowerCase());

        if (!player) {
            return res.status(401).json({ error: 'No account found with that name. Sign up first.' });
        }

        if (!player.password_hash) {
            // Legacy player from before passwords existed, with no account claimed yet.
            return res.status(409).json({
                error: 'This name exists but has no password set yet. Use the Sign Up form with this exact name to claim it.'
            });
        }

        const valid = await bcrypt.compare(password, player.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }

        const sessionToken = jwt.sign({ name: player.name }, jwtSecret, { expiresIn: '30d' });
        return res.status(200).json({ message: 'Logged in', name: player.name, token: sessionToken });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
