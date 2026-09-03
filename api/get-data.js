export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || "Ayden123kitten";
  const repo = process.env.GITHUB_REPO || "The-Ultimate-Challenge";
  const branch = process.env.GITHUB_BRANCH || "main";

  // Parse query params from URL for Vercel Edge compatibility
  const url = new URL(req.url, "http://localhost");
  const type = url.searchParams.get("type");

  // Map data types to file paths
  const fileMap = {
    games: "data/games.json",
    players: "data/players.json",
    roles: "data/roles.json",
    moderators: "data/moderators.json"
  };

  if (!type || !fileMap[type]) {
    return res
      .status(400)
      .json({
        error:
          "Invalid or missing data type. Supported: games, players, roles, moderators"
      });
  }

  const filePath = fileMap[type];
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

  try {
    const headers = {
      Accept: "application/vnd.github.v3+json"
    };
    if (token) {
      headers["Authorization"] = `token ${token}`;
    }

    let getRes = await fetch(apiUrl, { headers });

    // Fall back to unauthenticated GitHub requests when no token is configured.
    if (!getRes.ok && token) {
      getRes = await fetch(apiUrl, {
        headers: {
          Accept: "application/vnd.github.v3+json"
        }
      });
    }

    let data;

    if (getRes.ok) {
      const fileData = await getRes.json();
      const content = Buffer.from(fileData.content, "base64").toString("utf-8");
      data = JSON.parse(content);
    } else {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const localPath = path.join(process.cwd(), filePath);

      if (!fs.existsSync(localPath)) {
        throw new Error(
          `Failed to fetch ${type} from GitHub and no local fallback file exists at ${localPath}`
        );
      }

      const localContent = fs.readFileSync(localPath, "utf8");
      data = JSON.parse(localContent);
    }

    // Special handling for players - sanitize to hide password_hash
    if (type === "players") {
      // Support legacy format (plain array of name strings) while data migrates
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
