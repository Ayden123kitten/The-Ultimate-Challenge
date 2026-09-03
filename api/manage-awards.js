import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const jwtSecret = process.env.JWT_SECRET || "dev_local_jwt_secret";
  const useGitHub = !!(token && owner && repo);
  if (!process.env.JWT_SECRET)
    console.warn("Warning: JWT_SECRET not set; using local dev secret");

  // GET request - fetch awards (public read access)
  if (req.method === "GET") {
    try {
      const awardsFilePath = "data/awards.json";
      if (useGitHub) {
        const awardsApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${awardsFilePath}?ref=${branch}`;
        const getRes = await fetch(awardsApiUrl, {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json"
          }
        });

        let awards = { awards: [] };
        if (getRes.ok) {
          const fileData = await getRes.json();
          const content = Buffer.from(fileData.content, "base64").toString(
            "utf-8"
          );
          awards = JSON.parse(content);
        }

        return res.status(200).json(awards);
      } else {
        const localPath = path.resolve(process.cwd(), awardsFilePath);
        const content = await fs.readFile(localPath, "utf8");
        return res.status(200).json(JSON.parse(content));
      }
    } catch (error) {
      console.error("Get awards error:", error);
      return res.status(500).json({ error: "Failed to fetch awards" });
    }
  }

  // POST request - manage awards (requires authentication)
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const authToken = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(authToken, jwtSecret);
    const playerName = decoded.name;

    // Check if user is a moderator and get their permissions
    const modFilePath = "data/moderators.json";
    let moderators = [];
    let admin = null;
    let userPermissions = {};
    let isAdmin = false;

    if (useGitHub) {
      const modApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${modFilePath}?ref=${branch}`;
      const modRes = await fetch(modApiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      if (modRes.ok) {
        const modFileData = await modRes.json();
        const modContent = Buffer.from(modFileData.content, "base64").toString(
          "utf-8"
        );
        const modData = JSON.parse(modContent);
        admin = modData.admin || null;
        moderators = modData.moderators || [];
        isAdmin = admin === playerName;
        const modRecord = moderators.find((m) => m.name === playerName);
        if (modRecord && modRecord.permissions)
          userPermissions = modRecord.permissions;
      }
    } else {
      try {
        const localPath = path.resolve(process.cwd(), modFilePath);
        const content = await fs.readFile(localPath, "utf8");
        const modData = JSON.parse(content);
        admin = modData.admin || null;
        moderators = modData.moderators || [];
        isAdmin = admin === playerName;
        const modRecord = moderators.find((m) => m.name === playerName);
        if (modRecord && modRecord.permissions)
          userPermissions = modRecord.permissions;
      } catch (e) {
        console.error("Failed to read local moderators file:", e);
      }
    }

    const isModerator =
      isAdmin || moderators.some((m) => m.name === playerName);

    if (!isModerator) {
      return res.status(403).json({ error: "Access denied. Moderators only." });
    }

    const hasPermission = (permission) =>
      isAdmin || userPermissions[permission] === true;

    const { action, awardData, assignAwardData } = req.body;

    const awardsFilePath = "data/awards.json";
    const playersFilePath = "data/players.json";

    // Helper to read/write awards locally
    const readLocalJson = async (p) =>
      JSON.parse(await fs.readFile(path.resolve(process.cwd(), p), "utf8"));
    const writeLocalJson = async (p, obj) =>
      await fs.writeFile(
        path.resolve(process.cwd(), p),
        JSON.stringify(obj, null, 2),
        "utf8"
      );

    if (action === "addAward") {
      if (!hasPermission("manageAwards"))
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageAwards permission." });

      if (useGitHub) {
        const awardsApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${awardsFilePath}?ref=${branch}`;
        const awardsGetRes = await fetch(awardsApiUrl, {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json"
          }
        });
        let awards = { awards: [] };
        let sha = null;
        if (awardsGetRes.ok) {
          const awardsFileData = await awardsGetRes.json();
          sha = awardsFileData.sha;
          const awardsContent = Buffer.from(
            awardsFileData.content,
            "base64"
          ).toString("utf-8");
          awards = JSON.parse(awardsContent);
        }
        awards.awards.push(awardData);
        const newAwardsContent = Buffer.from(
          JSON.stringify(awards, null, 2)
        ).toString("base64");
        const putRes = await fetch(awardsApiUrl, {
          method: "PUT",
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: `Add award: ${awardData.name}`,
            content: newAwardsContent,
            sha: sha,
            branch: branch
          })
        });
        if (!putRes.ok) {
          const errData = await putRes.json();
          throw new Error(errData.message || "Failed to add award");
        }
      } else {
        const awards = await readLocalJson(awardsFilePath);
        awards.awards = awards.awards || [];
        awards.awards.push(awardData);
        await writeLocalJson(awardsFilePath, awards);
      }

      return res.status(200).json({ message: "Award added successfully!" });
    }

    if (action === "updateAward") {
      if (!hasPermission("manageAwards"))
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageAwards permission." });

      const { originalName, awardData: newAwardData } = req.body;
      if (!originalName || !newAwardData || !newAwardData.name)
        return res.status(400).json({ error: "Missing award data" });

      if (useGitHub) {
        const awardsApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${awardsFilePath}?ref=${branch}`;
        const awardsGetRes = await fetch(awardsApiUrl, {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json"
          }
        });
        let awards = { awards: [] };
        let sha = null;
        if (awardsGetRes.ok) {
          const awardsFileData = await awardsGetRes.json();
          sha = awardsFileData.sha;
          const awardsContent = Buffer.from(
            awardsFileData.content,
            "base64"
          ).toString("utf-8");
          awards = JSON.parse(awardsContent);
        }
        const idx = awards.awards.findIndex((a) => a.name === originalName);
        if (idx === -1)
          return res.status(404).json({ error: "Award not found" });
        if (
          newAwardData.name !== originalName &&
          awards.awards.some((a) => a.name === newAwardData.name)
        )
          return res
            .status(400)
            .json({ error: "An award with that name already exists" });
        awards.awards[idx] = { ...awards.awards[idx], ...newAwardData };
        const newAwardsContent = Buffer.from(
          JSON.stringify(awards, null, 2)
        ).toString("base64");
        const putRes = await fetch(awardsApiUrl, {
          method: "PUT",
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: `Update award: ${newAwardData.name}`,
            content: newAwardsContent,
            sha: sha,
            branch: branch
          })
        });
        if (!putRes.ok) {
          const errData = await putRes.json();
          throw new Error(errData.message || "Failed to update award");
        }
      } else {
        const awards = await readLocalJson(awardsFilePath);
        const idx = (awards.awards || []).findIndex(
          (a) => a.name === originalName
        );
        if (idx === -1)
          return res.status(404).json({ error: "Award not found" });
        if (
          newAwardData.name !== originalName &&
          (awards.awards || []).some((a) => a.name === newAwardData.name)
        )
          return res
            .status(400)
            .json({ error: "An award with that name already exists" });
        awards.awards[idx] = { ...awards.awards[idx], ...newAwardData };
        await writeLocalJson(awardsFilePath, awards);
      }

      return res.status(200).json({ message: "Award updated successfully!" });
    }

    if (action === "deleteAward") {
      if (!hasPermission("manageAwards"))
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageAwards permission." });
      const { awardName } = req.body;
      if (!awardName)
        return res.status(400).json({ error: "Missing awardName" });

      if (useGitHub) {
        const awardsApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${awardsFilePath}?ref=${branch}`;
        const awardsGetRes = await fetch(awardsApiUrl, {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json"
          }
        });
        let awards = { awards: [] };
        let sha = null;
        if (awardsGetRes.ok) {
          const awardsFileData = await awardsGetRes.json();
          sha = awardsFileData.sha;
          const awardsContent = Buffer.from(
            awardsFileData.content,
            "base64"
          ).toString("utf-8");
          awards = JSON.parse(awardsContent);
        }
        awards.awards = (awards.awards || []).filter(
          (a) => a.name !== awardName
        );
        const newAwardsContent = Buffer.from(
          JSON.stringify(awards, null, 2)
        ).toString("base64");
        const putRes = await fetch(awardsApiUrl, {
          method: "PUT",
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: `Delete award: ${awardName}`,
            content: newAwardsContent,
            sha: sha,
            branch: branch
          })
        });
        if (!putRes.ok) {
          const errData = await putRes.json();
          throw new Error(errData.message || "Failed to delete award");
        }
      } else {
        const awards = await readLocalJson(awardsFilePath);
        awards.awards = (awards.awards || []).filter(
          (a) => a.name !== awardName
        );
        await writeLocalJson(awardsFilePath, awards);
      }

      // Also remove award references from players
      if (useGitHub) {
        const playersApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${playersFilePath}?ref=${branch}`;
        const playersGetRes = await fetch(playersApiUrl, {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json"
          }
        });
        if (playersGetRes.ok) {
          const playersFileData = await playersGetRes.json();
          const playersContent = Buffer.from(
            playersFileData.content,
            "base64"
          ).toString("utf-8");
          let players = JSON.parse(playersContent).map((p) =>
            typeof p === "string" ? { name: p } : p
          );
          players = players.map((pl) => ({
            ...pl,
            awards: (pl.awards || []).filter((a) => a.name !== awardName)
          }));
          const newPlayersContent = Buffer.from(
            JSON.stringify(players, null, 2)
          ).toString("base64");
          await fetch(playersApiUrl, {
            method: "PUT",
            headers: {
              Authorization: `token ${token}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              message: `Remove award references: ${awardName}`,
              content: newPlayersContent,
              sha: playersFileData.sha,
              branch: branch
            })
          });
        }
      } else {
        const players = await readLocalJson(playersFilePath);
        const updated = (players || []).map((pl) => ({
          ...pl,
          awards: (pl.awards || []).filter((a) => a.name !== awardName)
        }));
        await writeLocalJson(playersFilePath, updated);
      }

      return res.status(200).json({ message: "Award deleted successfully!" });
    }

    if (action === "assignAward") {
      if (!hasPermission("manageAwards"))
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageAwards permission." });

      if (useGitHub) {
        const playersApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${playersFilePath}?ref=${branch}`;
        const playersGetRes = await fetch(playersApiUrl, {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json"
          }
        });
        if (!playersGetRes.ok) throw new Error("Failed to fetch players data");
        const playersFileData = await playersGetRes.json();
        const playersContent = Buffer.from(
          playersFileData.content,
          "base64"
        ).toString("utf-8");
        let players = JSON.parse(playersContent).map((p) =>
          typeof p === "string"
            ? { name: p, password_hash: null, pfp_link: "" }
            : p
        );
        const playerIndex = players.findIndex(
          (p) => p.name === assignAwardData.playerName
        );
        if (playerIndex === -1)
          return res.status(404).json({ error: "Player not found" });
        if (!players[playerIndex].awards) players[playerIndex].awards = [];
        if (assignAwardData.action === "add") {
          const awardExists = players[playerIndex].awards.some(
            (a) => a.name === assignAwardData.awardName
          );
          if (!awardExists)
            players[playerIndex].awards.push({
              name: assignAwardData.awardName,
              icon: assignAwardData.icon,
              description: assignAwardData.description,
              awardedAt: new Date().toISOString()
            });
        } else if (assignAwardData.action === "remove") {
          players[playerIndex].awards = players[playerIndex].awards.filter(
            (a) => a.name !== assignAwardData.awardName
          );
        }
        const newPlayersContent = Buffer.from(
          JSON.stringify(players, null, 2)
        ).toString("base64");
        const putRes = await fetch(playersApiUrl, {
          method: "PUT",
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: `Assign award to player: ${assignAwardData.playerName}`,
            content: newPlayersContent,
            sha: playersFileData.sha,
            branch: branch
          })
        });
        if (!putRes.ok) {
          const errData = await putRes.json();
          throw new Error(errData.message || "Failed to assign award");
        }
      } else {
        const players = await readLocalJson(playersFilePath);
        const idx = (players || []).findIndex(
          (p) => p.name === assignAwardData.playerName
        );
        if (idx === -1)
          return res.status(404).json({ error: "Player not found" });
        if (!players[idx].awards) players[idx].awards = [];
        if (assignAwardData.action === "add") {
          const awardExists = players[idx].awards.some(
            (a) => a.name === assignAwardData.awardName
          );
          if (!awardExists)
            players[idx].awards.push({
              name: assignAwardData.awardName,
              icon: assignAwardData.icon,
              description: assignAwardData.description,
              awardedAt: new Date().toISOString()
            });
        } else if (assignAwardData.action === "remove") {
          players[idx].awards = players[idx].awards.filter(
            (a) => a.name !== assignAwardData.awardName
          );
        }
        await writeLocalJson(playersFilePath, players);
      }

      return res.status(200).json({ message: "Award assigned successfully!" });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    console.error("Awards API Error:", error);
    return res
      .status(500)
      .json({ error: "Internal server error: " + error.message });
  }
}
