export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token || !owner || !repo) {
        return res.status(500).json({ error: 'Server configuration missing. Contact admin.' });
    }

    try {
        const rolesFilePath = 'data/roles.json';
        const rolesApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${rolesFilePath}?ref=${branch}`;

        const rolesRes = await fetch(rolesApiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let roles = { roles: [] };
        if (rolesRes.ok) {
            const rolesFileData = await rolesRes.json();
            const rolesContent = Buffer.from(rolesFileData.content, 'base64').toString('utf-8');
            roles = JSON.parse(rolesContent);
        }

        return res.status(200).json(roles.roles || []);
    } catch (error) {
        console.error('Get Roles API Error:', error);
        return res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
}
