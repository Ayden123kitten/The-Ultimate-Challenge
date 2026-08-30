export default async function handler(req, res) {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/games.json?ref=${branch}`;
    
    try {
        const getRes = await fetch(apiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!getRes.ok) throw new Error('Failed to fetch games from GitHub');

        const fileData = await getRes.json();
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        
        // Prevent Vercel from caching the response
        res.setHeader('Cache-Control', 's-maxage=0, stale-while-revalidate=0, no-store');
        return res.status(200).json(JSON.parse(content));
    } catch (error) {
        console.error('Get games error:', error);
        return res.status(500).json({ error: error.message });
    }
}
