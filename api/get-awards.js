export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token || !owner || !repo) {
        return res.status(500).json({ error: 'Server configuration missing. Contact admin.' });
    }

    try {
        const awardsFilePath = 'data/awards.json';
        const awardsApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${awardsFilePath}?ref=${branch}`;

        const getRes = await fetch(awardsApiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let awards = { awards: [] };
        if (getRes.ok) {
            const fileData = await getRes.json();
            const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
            awards = JSON.parse(content);
        }

        return res.status(200).json(awards);
    } catch (error) {
        console.error('Get awards error:', error);
        return res.status(500).json({ error: 'Failed to fetch awards' });
    }
}
