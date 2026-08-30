import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const playersFile = path.join(dataDir, 'players.json');

export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { username, data } = req.body;

    if (!username || !data) {
        return res.status(400).json({ error: 'Username and data are required' });
    }

    try {
        let players = JSON.parse(fs.readFileSync(playersFile, 'utf8'));
        
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

        fs.writeFileSync(playersFile, JSON.stringify(players, null, 2));
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
}
