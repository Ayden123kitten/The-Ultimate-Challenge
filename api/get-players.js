export default async function handler(req, res) {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/players.json?ref=${branch}`;

    try {
        const getRes = await fetch(apiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!getRes.ok) throw new Error('Failed to fetch players from GitHub');

        const fileData = await getRes.json();
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        let players = JSON.parse(content);

        // Support legacy format (plain array of name strings) while data migrates
        players = players.map(p => (typeof p === 'string' ? { name: p, pfp_link: '', has_password: false } : p));

        // CRITICAL: never send password_hash to the client. This file is what
        // players.js/app.js should fetch instead of players.json directly.
        const sanitized = players.map(p => ({
            name: p.name,
            pfp_link: p.pfp_link || '',
            has_password: !!p.password_hash
        }));

        res.setHeader('Cache-Control', 's-maxage=0, stale-while-revalidate=0, no-store');
        return res.status(200).json(sanitized);
    } catch (error) {
        console.error('Get players error:', error);
        return res.status(500).json({ error: error.message });
    }
}
