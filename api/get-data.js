import fs from "fs/promises";
import path from "path";

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";

  // Parse query params from URL for Vercel Edge compatibility
  const url = new URL(req.url, "http://localhost");
  const type = url.searchParams.get("type");

  // Map data types to file paths
  const fileMap = {
    games: "data/games.json",
    players: "data/players.json",
    roles: "data/roles.json",
    moderators: "data/moderators.json",
    awards: "data/awards.json",
    settings: "data/settings.json"
  };

  if (!type || !fileMap[type]) {
    return res
      .status(400)
      .json({
        error:
          "Invalid or missing data type. Supported: games, players, roles, moderators, awards, settings"
      });
  }

  const filePath = fileMap[type];
  const useGitHub = !!(token && owner && repo);
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

  try {
    let data;

    if (useGitHub) {
      const getRes = await fetch(apiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      if (!getRes.ok) throw new Error(`Failed to fetch ${type} from GitHub`);

      const fileData = await getRes.json();
      const content = Buffer.from(fileData.content, "base64").toString("utf-8");
      data = JSON.parse(content);
    } else {
      // Fallback to local data files when GitHub env vars are not configured
      const localPath = path.resolve(process.cwd(), filePath);
      const content = await fs.readFile(localPath, "utf8");
      data = JSON.parse(content);
    }

    // Special handling for players - sanitize to hide password_hash
    if (type === "players") {
      data = data.map((p) =>
        typeof p === "string"
          ? { name: p, pfp_link: "", has_password: false }
          : p
      );
      data = data.map((p) => ({
        name: p.name,
        pfp_link: p.pfp_link || "",
        has_password: !!p.password_hash,
        bio: p.bio || "",
        pronouns: p.pronouns || "",
        discord: p.discord || "",
        website: p.website || "",
        roles: p.roles || []
      }));
    }

    // Special handling for moderators - return role map
    if (type === "moderators") {
      const admin = data.admin || null;
      const moderators = data.moderators || [];
      const roleMap = {};
      if (admin) {
        roleMap[admin] = "admin";
      }
      moderators.forEach((mod) => {
        if (mod.name !== admin) {
          roleMap[mod.name] = "moderator";
        }
      });
      data = roleMap;
    }

    // Special handling for roles - extract roles array
    if (type === "roles") {
      data = data.roles || [];
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=0, stale-while-revalidate=0, no-store"
    );
    return res.status(200).json(data);
  } catch (error) {
    console.error(`Get ${type} error:`, error);
    return res.status(500).json({ error: error.message });
  }
}
