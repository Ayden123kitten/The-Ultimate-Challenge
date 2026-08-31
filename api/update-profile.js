import bcrypt from 'bcryptjs';
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

        // Handle name change
        if (data.new_name) {
            const newName = data.new_name.trim();
            
            // Validate name - only allow alphanumeric characters, spaces, underscores, and hyphens
            const nameRegex = /^[a-zA-Z0-9 _-]+$/;
            if (!nameRegex.test(newName)) {
                return res.status(400).json({ error: 'Name can only contain letters, numbers, spaces, underscores, and hyphens.' });
            }
            
            // Check if name already exists
            const existingPlayer = players.find(p => p.name.toLowerCase() === newName.toLowerCase());
            if (existingPlayer && existingPlayer.name !== username) {
                return res.status(409).json({ error: 'This name is already taken. Please choose a different name.' });
            }
            
            // Update the player's name
            players[playerIndex].name = newName;
        }

        // Handle password change
        if (data.current_password && data.new_password) {
            const player = players[playerIndex];
            
            // Verify current password
            if (!player.password_hash) {
                return res.status(400).json({ error: 'Account does not have a password set.' });
            }
            
            const validPassword = await bcrypt.compare(data.current_password, player.password_hash);
            if (!validPassword) {
                return res.status(401).json({ error: 'Current password is incorrect.' });
            }
            
            // Validate new password
            if (data.new_password.length < 6) {
                return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
            }
            
            // Validate password - only allow printable ASCII characters
            const passwordRegex = /^[\x20-\x7E]+$/;
            if (!passwordRegex.test(data.new_password)) {
                return res.status(400).json({ error: 'Password contains invalid characters. Please use only standard keyboard characters.' });
            }
            
            // Hash and update password
            const newPasswordHash = await bcrypt.hash(data.new_password, 10);
            players[playerIndex].password_hash = newPasswordHash;
        }

        // Update allowed profile fields
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
