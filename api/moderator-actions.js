import jwt from "jsonwebtoken";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const jwtSecret = process.env.JWT_SECRET;

  if (!token || !owner || !repo || !jwtSecret) {
    return res
      .status(500)
      .json({ error: "Server configuration missing. Contact admin." });
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
    const modApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${modFilePath}?ref=${branch}`;

    const modRes = await fetch(modApiUrl, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });

    let moderators = [];
    let admin = null;
    let userPermissions = {};
    let isAdmin = false;
    if (modRes.ok) {
      const modFileData = await modRes.json();
      const modContent = Buffer.from(modFileData.content, "base64").toString(
        "utf-8"
      );
      const modData = JSON.parse(modContent);
      admin = modData.admin || null;
      moderators = modData.moderators || [];

      // Check if user is admin
      isAdmin = admin === playerName;

      // Find user's moderator record and get permissions
      const modRecord = moderators.find((m) => m.name === playerName);
      if (modRecord && modRecord.permissions) {
        userPermissions = modRecord.permissions;
      }
    }

    const isModerator =
      isAdmin || moderators.some((m) => m.name === playerName);

    if (!isModerator) {
      return res.status(403).json({ error: "Access denied. Moderators only." });
    }

    // Helper function to check permission
    const hasPermission = (permission) => {
      return isAdmin || userPermissions[permission] === true;
    };

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
      if (!hasPermission("manageGames")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageGames permission." });
      }
      const gamesFilePath = "data/games.json";
      const gamesApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${gamesFilePath}?ref=${branch}`;

      const gamesGetRes = await fetch(gamesApiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      if (!gamesGetRes.ok) throw new Error("Failed to fetch games data");

      const gamesFileData = await gamesGetRes.json();
      const gamesContent = Buffer.from(
        gamesFileData.content,
        "base64"
      ).toString("utf-8");
      let games = JSON.parse(gamesContent);

      games.push(gameData);

      const newGamesContent = Buffer.from(
        JSON.stringify(games, null, 2)
      ).toString("base64");

      const putRes = await fetch(gamesApiUrl, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Add game: ${gameData.name}`,
          content: newGamesContent,
          sha: gamesFileData.sha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || "Failed to add game");
      }

      return res.status(200).json({ message: "Game added successfully!" });
    }

    if (action === "updateGame") {
      if (!hasPermission("manageGames")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageGames permission." });
      }
      const gamesFilePath = "data/games.json";
      const gamesApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${gamesFilePath}?ref=${branch}`;

      // Before committing games change, also remove any Cheesetracker/player references
      // Fetch players file
      const playersFilePath = "data/players.json";
      const gamesGetRes = await fetch(gamesApiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      if (!gamesGetRes.ok) throw new Error("Failed to fetch games data");

      const gamesFileData = await gamesGetRes.json();
      const gamesContent = Buffer.from(
        gamesFileData.content,
        "base64"
      ).toString("utf-8");
      let games = JSON.parse(gamesContent);

      const gameIndex = games.findIndex((g) => g.id === gameId);
      if (gameIndex === -1) {
        return res.status(404).json({ error: "Game not found" });
      }

      games[gameIndex] = { ...games[gameIndex], ...gameData };

      const newGamesContent = Buffer.from(
        JSON.stringify(games, null, 2)
      ).toString("base64");

      const putRes = await fetch(gamesApiUrl, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Update game: ${gameData.name || gameId}`,
          content: newGamesContent,
          sha: gamesFileData.sha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || "Failed to update game");
      }

      return res.status(200).json({ message: "Game updated successfully!" });
    }

    if (action === "removeGame") {
      if (!hasPermission("manageGames")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageGames permission." });
      }
      const gamesFilePath = "data/games.json";
      const gamesApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${gamesFilePath}?ref=${branch}`;

      const gamesGetRes = await fetch(gamesApiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      if (!gamesGetRes.ok) throw new Error("Failed to fetch games data");

      const gamesFileData = await gamesGetRes.json();
      const gamesContent = Buffer.from(
        gamesFileData.content,
        "base64"
      ).toString("utf-8");
      let games = JSON.parse(gamesContent);

      const gameIndex = games.findIndex((g) => g.id === gameId);
      if (gameIndex === -1) {
        return res.status(404).json({ error: "Game not found" });
      }

      const removed = games.splice(gameIndex, 1)[0];

      const newGamesContent = Buffer.from(
        JSON.stringify(games, null, 2)
      ).toString("base64");
      const putRes = await fetch(gamesApiUrl, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Remove game: ${removed.name || gameId}`,
          content: newGamesContent,
          sha: gamesFileData.sha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || "Failed to remove game");
      }

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

      const gamesGetRes = await fetch(gamesApiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      if (!gamesGetRes.ok) throw new Error("Failed to fetch games data");

      const gamesFileData = await gamesGetRes.json();
      const gamesContent = Buffer.from(
        gamesFileData.content,
        "base64"
      ).toString("utf-8");
      let games = JSON.parse(gamesContent);

      const gameIndex = games.findIndex((g) => g.id === logData.gameId);
      if (gameIndex === -1) {
        return res.status(404).json({ error: "Game not found" });
      }

      if (!games[gameIndex].logs) {
        games[gameIndex].logs = [];
      }

      if (logData.action === "add") {
        games[gameIndex].logs.push(logData.entry);
      } else if (logData.action === "remove") {
        games[gameIndex].logs = games[gameIndex].logs.filter(
          (_, i) => i !== logData.index
        );
      } else if (logData.action === "update") {
        games[gameIndex].logs[logData.index] = logData.entry;
      }

      const newGamesContent = Buffer.from(
        JSON.stringify(games, null, 2)
      ).toString("base64");

      const putRes = await fetch(gamesApiUrl, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Update log for game: ${games[gameIndex].name}`,
          content: newGamesContent,
          sha: gamesFileData.sha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || "Failed to update log");
      }

      return res.status(200).json({ message: "Log updated successfully!" });
    }

    if (action === "addRole") {
      if (!hasPermission("manageRoles")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageRoles permission." });
      }
      const rolesFilePath = "data/roles.json";
      const rolesApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${rolesFilePath}?ref=${branch}`;

      const rolesGetRes = await fetch(rolesApiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      let roles = { roles: [] };
      let sha = null;
      if (rolesGetRes.ok) {
        const rolesFileData = await rolesGetRes.json();
        sha = rolesFileData.sha;
        const rolesContent = Buffer.from(
          rolesFileData.content,
          "base64"
        ).toString("utf-8");
        roles = JSON.parse(rolesContent);
      }

      roles.roles.push(roleData);

      const newRolesContent = Buffer.from(
        JSON.stringify(roles, null, 2)
      ).toString("base64");

      const putRes = await fetch(rolesApiUrl, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Add role: ${roleData.name}`,
          content: newRolesContent,
          sha: sha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || "Failed to add role");
      }

      return res.status(200).json({ message: "Role added successfully!" });
    }

    if (action === "assignRole") {
      if (!hasPermission("manageRoles")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageRoles permission." });
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

      const playerIndex = players.findIndex(
        (p) => p.name === assignRoleData.playerName
      );
      if (playerIndex === -1) {
        return res.status(404).json({ error: "Player not found" });
      }

      if (!players[playerIndex].roles) {
        players[playerIndex].roles = [];
      }

      if (assignRoleData.action === "add") {
        if (!players[playerIndex].roles.includes(assignRoleData.roleName)) {
          players[playerIndex].roles.push(assignRoleData.roleName);
        }
      } else if (assignRoleData.action === "remove") {
        players[playerIndex].roles = players[playerIndex].roles.filter(
          (r) => r !== assignRoleData.roleName
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
          message: `Assign role to player: ${assignRoleData.playerName}`,
          content: newPlayersContent,
          sha: playersFileData.sha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || "Failed to assign role");
      }

      return res.status(200).json({ message: "Role assigned successfully!" });
    }

    if (action === "updateSettings") {
      if (!hasPermission("manageSettings")) {
        return res
          .status(403)
          .json({ error: "Access denied. Missing manageSettings permission." });
      }
      const settingsFilePath = "data/settings.json";
      const settingsApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${settingsFilePath}?ref=${branch}`;

      const settingsGetRes = await fetch(settingsApiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      let settings = {};
      let sha = null;
      if (settingsGetRes.ok) {
        const settingsFileData = await settingsGetRes.json();
        sha = settingsFileData.sha;
        const settingsContent = Buffer.from(
          settingsFileData.content,
          "base64"
        ).toString("utf-8");
        settings = JSON.parse(settingsContent);
      }

      // Merge the new settings with existing settings
      settings = { ...settings, ...settingsData };

      const newSettingsContent = Buffer.from(
        JSON.stringify(settings, null, 2)
      ).toString("base64");

      const putRes = await fetch(settingsApiUrl, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Update settings`,
          content: newSettingsContent,
          sha: sha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || "Failed to update settings");
      }

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

      const modGetRes = await fetch(modApiUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });

      let modData = { admin: null, moderators: [] };
      let modSha = null;
      if (modGetRes.ok) {
        const modFileData = await modGetRes.json();
        modSha = modFileData.sha;
        const modContent = Buffer.from(modFileData.content, "base64").toString(
          "utf-8"
        );
        modData = JSON.parse(modContent);
      }

      if (moderatorData.action === "add") {
        // Check if moderator already exists
        const existingMod = modData.moderators.find(
          (m) => m.name === moderatorData.name
        );
        if (existingMod) {
          return res.status(400).json({ error: "Moderator already exists" });
        }
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
        modData.moderators = modData.moderators.filter(
          (m) => m.name !== moderatorData.name
        );
      } else if (moderatorData.action === "updatePermissions") {
        const modIndex = modData.moderators.findIndex(
          (m) => m.name === moderatorData.name
        );
        if (modIndex === -1) {
          return res.status(404).json({ error: "Moderator not found" });
        }
        modData.moderators[modIndex].permissions = moderatorData.permissions;
      } else if (moderatorData.action === "setAdmin") {
        modData.admin = moderatorData.name;
      }

      const newModContent = Buffer.from(
        JSON.stringify(modData, null, 2)
      ).toString("base64");

      const putRes = await fetch(modApiUrl, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Manage moderators`,
          content: newModContent,
          sha: modSha,
          branch: branch
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json();
        throw new Error(errData.message || "Failed to manage moderators");
      }

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
