export default async function handler(req, res) {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token || !owner || !repo) {
        return res.status(500).json({ error: 'Server configuration missing. Contact admin.' });
    }

    try {
        const filePath = 'data/moderators.json';
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

        const getRes = await fetch(apiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let admin = null;
        let moderators = [];
        if (getRes.ok) {
            const fileData = await getRes.json();
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            const data = JSON.parse(content);
            admin = data.admin || null;
            moderators = data.moderators || [];
        }

        // Build a map of player names to their roles
        const roleMap = {};
        
        // Add admin
        if (admin) {
            roleMap[admin] = 'admin';
        }
        
        // Add moderators (excluding admin if they're also in the list)
        moderators.forEach(mod => {
            if (mod.name !== admin) {
                roleMap[mod.name] = 'moderator';
            }
        });

        res.setHeader('Cache-Control', 's-maxage=0, stale-while-revalidate=0, no-store');
        return res.status(200).json(roleMap);
    } catch (error) {
        console.error('Get moderator roles error:', error);
        return res.status(500).json({ error: error.message });
    }
}
