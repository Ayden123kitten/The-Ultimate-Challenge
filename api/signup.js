import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    // Set JSON content type for all responses
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, password, pfpLink } = req.body;
    if (!name || !password) {
        return res.status(400).json({ error: 'Name and password are required.' });
    }

    // Validate password - must be at least 6 characters
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    // Validate name - only allow alphanumeric characters, spaces, underscores, and hyphens
    const nameRegex = /^[a-zA-Z0-9 _-]+$/;
    if (!nameRegex.test(name.trim())) {
        return res.status(400).json({ error: 'Name can only contain letters, numbers, spaces, underscores, and hyphens.' });
    }

    // Validate password - only allow printable ASCII characters to avoid encoding issues
    const passwordRegex = /^[\x20-\x7E]+$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: 'Password contains invalid characters. Please use only standard keyboard characters.' });
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
        let players = JSON.parse(currentContent).map(p =>
            typeof p === 'string' ? { name: p, password_hash: null, pfp_link: '' } : p
        );

        const existingPlayer = players.find(p => p.name.toLowerCase() === name.trim().toLowerCase());

        if (existingPlayer) {
            if (existingPlayer.password_hash) {
                return res.status(409).json({ error: 'This name is already taken. Please choose a different name.' });
            } else {
                // Legacy player without password - claim the account
                const password_hash = await bcrypt.hash(password, 10);
                existingPlayer.password_hash = password_hash;
                existingPlayer.pfp_link = pfpLink || '';
            }
        } else {
            // New player - create account
            const password_hash = await bcrypt.hash(password, 10);
            players.push({ name: name.trim(), password_hash, pfp_link: pfpLink || '' });
        }

        // Update the file on GitHub
        const newContent = JSON.stringify(players, null, 2);
        const updateRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: Buffer.from(newContent).toString('base64'),
                message: `Update players.json - signup: ${name.trim()}`,
                sha: fileData.sha,
                branch: branch
            })
        });

        if (!updateRes.ok) {
            const errData = await updateRes.json();
            throw new Error(`Failed to update players on GitHub: ${errData.message || updateRes.statusText}`);
        }

        const sessionToken = jwt.sign({ name: name.trim() }, jwtSecret, { expiresIn: '30d' });
        return res.status(200).json({ message: 'Signed up successfully', name: name.trim(), token: sessionToken });
    } catch (error) {
        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
