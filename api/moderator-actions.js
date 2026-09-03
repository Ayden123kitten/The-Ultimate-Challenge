import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
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

  // Helper to read file from GitHub or local
  const getRepoFile = async (filePath) => {
    if (useGitHub) {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
      const res = await fetch(apiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });
      if (!res.ok) throw new Error(`Failed to fetch ${filePath} from GitHub`);
      const fileData = await res.json();
      const content = Buffer.from(fileData.content, "base64").toString("utf-8");
      return { data: JSON.parse(content), sha: fileData.sha };
    } else {
      const localPath = path.resolve(process.cwd(), filePath);
      const content = await fs.readFile(localPath, "utf8");
      return { data: JSON.parse(content), sha: null };
    }
  };

  // Helper to write file to GitHub or local
  const putRepoFile = async (filePath, obj, sha, message) => {
    if (useGitHub) {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
      const body = {
        message: message || `Update ${filePath}`,
        content: Buffer.from(JSON.stringify(obj, null, 2)).toString("base64")
      };
      if (sha) body.sha = sha;
      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || `Failed to update ${filePath}`);
      }
      return true;
    } else {
      const localPath = path.resolve(process.cwd(), filePath);
      await fs.writeFile(localPath, JSON.stringify(obj, null, 2), "utf8");
      return true;
    }
  };

  try {
    const decoded = jwt.verify(authToken, jwtSecret);
    const playerName = decoded.name;

    // Load moderators data (from GitHub or local)
    const modFilePath = "data/moderators.json";
    let moderators = [];
    let admin = null;
    let userPermissions = {};
    let isAdmin = false;

    try {
      const { data: modData } = await getRepoFile(modFilePath);
      admin = modData.admin || null;
      moderators = modData.moderators || [];
      isAdmin = admin === playerName;
      const modRecord = moderators.find((m) => m.name === playerName);
      if (modRecord && modRecord.permissions)
        userPermissions = modRecord.permissions;
    } catch (e) {
      console.error("Failed to load moderators data:", e);
    }

    const isModerator =
      isAdmin || moderators.some((m) => m.name === playerName);

    if (!isModerator) {
      return res.status(403).json({ error: "Access denied. Moderators only." });
    }

    const hasPermission = (permission) =>
      isAdmin || userPermissions[permission] === true;

    const {
      action,
      gameId,
      gameData,
      playerData,
      logData,
      roleData,
      assignRoleData
    } = req.body;

    if (action === "addGame") {
      if (!hasPermission("manageGames"))
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageGames permission." });
      const gamesFilePath = "data/games.json";
      const { data: games, sha: gamesSha } = await getRepoFile(gamesFilePath);
      games.push(gameData);
      await putRepoFile(
        gamesFilePath,
        games,
        gamesSha,
        `Add game: ${gameData.name}`
      );
      return res.status(200).json({ message: "Game added successfully!" });
    }

    if (action === "updateGame") {
      if (!hasPermission("manageGames"))
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageGames permission." });
      const gamesFilePath = "data/games.json";
      const { data: games, sha: gamesSha } = await getRepoFile(gamesFilePath);
      const gameIndex = games.findIndex((g) => g.id === gameId);
      if (gameIndex === -1)
        return res.status(404).json({ error: "Game not found" });
      games[gameIndex] = { ...games[gameIndex], ...gameData };
      await putRepoFile(
        gamesFilePath,
        games,
        gamesSha,
        `Update game: ${gameData.name || gameId}`
      );
      return res.status(200).json({ message: "Game updated successfully!" });
    }

    if (action === "removeGame") {
      if (!hasPermission("manageGames"))
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageGames permission." });
      const gamesFilePath = "data/games.json";
      const { data: games, sha: gamesSha } = await getRepoFile(gamesFilePath);
      const gameIndex = games.findIndex((g) => g.id === gameId);
      if (gameIndex === -1)
        return res.status(404).json({ error: "Game not found" });
      const removed = games.splice(gameIndex, 1)[0];
      await putRepoFile(
        gamesFilePath,
        games,
        gamesSha,
        `Remove game: ${removed.name || gameId}`
      );
      return res.status(200).json({ message: "Game removed successfully!" });
    }

    if (action === "updatePlayer") {
      if (!hasPermission("managePlayers")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing managePlayers permission." });
      }
      const playersFilePath = "data/players.json";
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

      const playerIndex = players.findIndex((p) => p.name === playerData.name);
      if (playerIndex === -1) {
        return res.status(404).json({ error: "Player not found" });
      }

      if (playerData.newName) {
        players[playerIndex].name = playerData.newName;
      }
      if (playerData.pfp_link !== undefined) {
        players[playerIndex].pfp_link = playerData.pfp_link;
      }
      if (playerData.bio !== undefined) {
        players[playerIndex].bio = playerData.bio;
      }
      if (playerData.pronouns !== undefined) {
        players[playerIndex].pronouns = playerData.pronouns;
      }
      if (playerData.discord !== undefined) {
        players[playerIndex].discord = playerData.discord;
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
          message: `Update player: ${playerData.name}`,
          content: newPlayersContent,
          sha: playersFileData.sha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || "Failed to update player");
      }

      return res.status(200).json({ message: "Player updated successfully!" });
    }

    if (action === "updateLog") {
      if (!hasPermission("manageGames")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageGames permission." });
      }
      const gamesFilePath = "data/games.json";
      const gamesApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${gamesFilePath}?ref=${branch}`;

      // Update logs for a game
      const gamesFilePath = "data/games.json";
      const { data: games, sha: gamesSha } = await getRepoFile(gamesFilePath);
      const gameIndex = games.findIndex((g) => g.id === logData.gameId);
      if (gameIndex === -1)
        return res.status(404).json({ error: "Game not found" });
      if (!games[gameIndex].logs) games[gameIndex].logs = [];
      if (logData.action === "add") games[gameIndex].logs.push(logData.entry);
      else if (logData.action === "remove")
        games[gameIndex].logs = games[gameIndex].logs.filter(
          (_, i) => i !== logData.index
        );
      else if (logData.action === "update")
        games[gameIndex].logs[logData.index] = logData.entry;
      await putRepoFile(
        gamesFilePath,
        games,
        gamesSha,
        `Update log for game: ${games[gameIndex].name}`
      );
      return res.status(200).json({ message: "Log updated successfully!" });
    }

    if (action === "addRole") {
      if (!hasPermission("manageRoles")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageRoles permission." });
      }
      const rolesFilePath = "data/roles.json";
      const { data: roles, sha: rolesSha } = await getRepoFile(rolesFilePath);
      roles.roles = roles.roles || [];
      roles.roles.push(roleData);
      await putRepoFile(
        rolesFilePath,
        roles,
        rolesSha,
        `Add role: ${roleData.name}`
      );
      return res.status(200).json({ message: "Role added successfully!" });
    }

    if (action === "updateRole") {
      if (!hasPermission("manageRoles")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageRoles permission." });
      }
      const rolesFilePath = "data/roles.json";
      const { data: roles, sha: rolesSha } = await getRepoFile(rolesFilePath);
      const { originalName, roleData: newRoleData } = req.body;
      if (!originalName || !newRoleData || !newRoleData.name)
        return res.status(400).json({ error: "Missing role data" });
      const idx = (roles.roles || []).findIndex((r) => r.name === originalName);
      if (idx === -1) return res.status(404).json({ error: "Role not found" });
      if (
        newRoleData.name !== originalName &&
        (roles.roles || []).some((r) => r.name === newRoleData.name)
      )
        return res
          .status(400)
          .json({ error: "A role with that name already exists" });
      roles.roles[idx] = { ...roles.roles[idx], ...newRoleData };
      await putRepoFile(
        rolesFilePath,
        roles,
        rolesSha,
        `Update role: ${newRoleData.name}`
      );
      return res.status(200).json({ message: "Role updated successfully!" });
    }

    if (action === "deleteRole") {
      if (!hasPermission("manageRoles")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageRoles permission." });
      }

      const { roleName } = req.body;
      if (!roleName) return res.status(400).json({ error: "Missing roleName" });

      const rolesFilePath = "data/roles.json";
      const { data: roles, sha: rolesSha } = await getRepoFile(rolesFilePath);
      roles.roles = (roles.roles || []).filter((r) => r.name !== roleName);
      await putRepoFile(
        rolesFilePath,
        roles,
        rolesSha,
        `Delete role: ${roleName}`
      );

      // Also remove role references from players
      const playersFilePath = "data/players.json";
      const { data: players, sha: playersSha } =
        await getRepoFile(playersFilePath);
      const updatedPlayers = (players || []).map((pl) => ({
        ...pl,
        roles: (pl.roles || []).filter((r) => r !== roleName)
      }));
      await putRepoFile(
        playersFilePath,
        updatedPlayers,
        playersSha,
        `Remove role references: ${roleName}`
      );
      return res.status(200).json({ message: "Role deleted successfully!" });
    }

    if (action === "assignRole") {
      if (!hasPermission("manageRoles")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageRoles permission." });
      }
      const playersFilePath = "data/players.json";
      const { data: players, sha: playersSha } =
        await getRepoFile(playersFilePath);
      const idx = (players || []).findIndex(
        (p) => p.name === assignRoleData.playerName
      );
      if (idx === -1)
        return res.status(404).json({ error: "Player not found" });
      const updatedPlayers = players.slice();
      updatedPlayers[idx].roles = updatedPlayers[idx].roles || [];
      if (assignRoleData.action === "add") {
        if (!updatedPlayers[idx].roles.includes(assignRoleData.roleName))
          updatedPlayers[idx].roles.push(assignRoleData.roleName);
      } else if (assignRoleData.action === "remove") {
        updatedPlayers[idx].roles = updatedPlayers[idx].roles.filter(
          (r) => r !== assignRoleData.roleName
        );
      }
      await putRepoFile(
        playersFilePath,
        updatedPlayers,
        playersSha,
        `Assign role to player: ${assignRoleData.playerName}`
      );
      return res.status(200).json({ message: "Role assigned successfully!" });
    }

    if (action === "updateSettings") {
      if (!hasPermission("manageSettings")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageSettings permission." });
      }
      const settingsFilePath = "data/settings.json";
      const { data: settings, sha: settingsSha } =
        await getRepoFile(settingsFilePath);
      const merged = { ...settings, ...settingsData };
      await putRepoFile(
        settingsFilePath,
        merged,
        settingsSha,
        "Update settings"
      );
      return res
        .status(200)
        .json({ message: "Settings updated successfully!" });
    }

    if (action === "manageModerators") {
      // Only admin can manage moderators
      if (!isAdmin) {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { moderatorData } = req.body;
      const modFilePath = "data/moderators.json";
      const { data: modData, sha: modSha } = await getRepoFile(modFilePath);
      if (moderatorData.action === "add") {
        const existingMod = (modData.moderators || []).find(
          (m) => m.name === moderatorData.name
        );
        if (existingMod)
          return res.status(400).json({ error: "Moderator already exists" });
        modData.moderators = modData.moderators || [];
        modData.moderators.push({
          name: moderatorData.name,
          permissions: moderatorData.permissions || {
            manageModerators: false,
            manageGames: false,
            managePlayers: false,
            manageRoles: false,
            manageAwards: false,
            manageSettings: false
          }
        });
      } else if (moderatorData.action === "remove") {
        modData.moderators = (modData.moderators || []).filter(
          (m) => m.name !== moderatorData.name
        );
      } else if (moderatorData.action === "updatePermissions") {
        const modIndex = (modData.moderators || []).findIndex(
          (m) => m.name === moderatorData.name
        );
        if (modIndex === -1)
          return res.status(404).json({ error: "Moderator not found" });
        modData.moderators[modIndex].permissions = moderatorData.permissions;
      } else if (moderatorData.action === "setAdmin") {
        modData.admin = moderatorData.name;
      }
      await putRepoFile(modFilePath, modData, modSha, "Manage moderators");
      return res
        .status(200)
        .json({ message: "Moderators updated successfully!" });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (error) {
    console.error("Moderator API Error:", error);
    return res
      .status(500)
      .json({ error: "Internal server error: " + error.message });
  }
}
