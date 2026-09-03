import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const jwtSecret = process.env.JWT_SECRET || "dev_local_jwt_secret";
  const useGitHub = !!(token && owner && repo);
  if (!process.env.JWT_SECRET)
    console.warn("Warning: JWT_SECRET not set; using local dev secret");

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const authToken = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(authToken, jwtSecret);
    const playerName = decoded.name;

    const filePath = "data/moderators.json";

    let moderators = [];
    let admin = null;
    if (useGitHub) {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
      const getRes = await fetch(apiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });
      if (getRes.ok) {
        const fileData = await getRes.json();
        const content = Buffer.from(fileData.content, "base64").toString(
          "utf-8"
        );
        const data = JSON.parse(content);
        admin = data.admin || null;
        moderators = data.moderators || [];
      }
    } else {
      const localPath = path.resolve(process.cwd(), filePath);
      try {
        const content = await fs.readFile(localPath, "utf8");
        const data = JSON.parse(content);
        admin = data.admin || null;
        moderators = data.moderators || [];
      } catch (e) {
        console.error("Failed to read local moderators file:", e);
      }
    }

    const isAdmin = admin === playerName;
    if (!isAdmin) {
      return res.status(403).json({ error: "Access denied. Admin only." });
    }

    return res.status(200).json({ admin, moderators });
  } catch (error) {
    console.error("Get moderators error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
}
