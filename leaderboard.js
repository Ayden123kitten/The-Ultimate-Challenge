// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
  GITHUB_OWNER: "Ayden123kitten",
  GITHUB_REPO: "The-Ultimate-Challenge",
  BRANCH: "main"
};

// ==========================================
// STATE & UTILS
// ==========================================
let games = [];
let players = [];
let availableRoles = []; // [{ name, color }]
let currentPlayer = AUTH.getName();
let currentSortType = "games"; // 'games', 'time', 'claims', 'completion'

const $ = (id) => document.getElementById(id);

function formatTime(ms) {
  if (!ms || ms < 0) return "000000:00:00";
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `${hours.toString().padStart(6, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

async function loadRoles() {
  try {
    const res = await fetch(`/api/get-data?type=roles&t=${Date.now()}`);
    if (res.ok) {
      availableRoles = await res.json();
    }
  } catch (err) {
    console.error("Failed to load roles:", err);
  }
}

// ==========================================
// DATA FETCHING
// ==========================================
async function loadData() {
  try {
    const [gamesRes, playersRes] = await Promise.all([
      fetch(`/api/get-data?type=games&t=${Date.now()}`),
      fetch(`/api/get-data?type=players&t=${Date.now()}`)
    ]);

    if (!gamesRes.ok) throw new Error(`Games API: ${gamesRes.status}`);
    if (!playersRes.ok) throw new Error(`Players API: ${playersRes.status}`);

    games = await gamesRes.json();
    players = await playersRes.json();

    renderLeaderboard();
    updateCurrentPlayerDisplay();
  } catch (err) {
    console.error("Failed to load data:", err);
    $("leaderboard-body").innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-20 text-center text-red-400">
                    <i class="fa-solid fa-circle-exclamation text-4xl mb-4"></i>
                    <p class="text-lg font-bold">Error loading leaderboard</p>
                    <p class="text-sm mt-2">${err.message}</p>
                </td>
            </tr>`;
  }
}

function updateCurrentPlayerDisplay() {
  const currentNameEl = $("current-player-name");
  if (currentNameEl)
    currentNameEl.textContent = currentPlayer || "Not logged in";
}

// ==========================================
// CALCULATE PLAYER STATS
// ==========================================
function calculatePlayerStats() {
  const playerStats = players.map((p) => {
    const playerName = p.name;
    const playerGames = games.filter(
      (g) => g.logs && g.logs.some((log) => log.player === playerName)
    );

    let totalTimeMs = 0;
    let totalClaims = 0;
    const gameHistory = [];

    games.forEach((game) => {
      let gameTotalMs = 0;
      let claimCount = 0;

      if (game.logs) {
        game.logs.forEach((log) => {
          if (log.player === playerName) {
            gameTotalMs += log.duration_ms;
            totalTimeMs += log.duration_ms;
            claimCount++;
          }
        });
      }

      // Add current session time if player is currently playing this game
      if (game.current_player === playerName && game.claimed_at) {
        const currentSessionMs = Date.now() - game.claimed_at;
        gameTotalMs += currentSessionMs;
        totalTimeMs += currentSessionMs;
        claimCount++;
      }

      totalClaims += claimCount;

      if (gameTotalMs > 0) {
        gameHistory.push({ gameName: game.name, timeMs: gameTotalMs });
      }
    });

    const gamesPlayed = playerGames.length;
    const avgTimePerGame = gamesPlayed > 0 ? totalTimeMs / gamesPlayed : 0;
    const completionRate =
      games.length > 0 ? (gamesPlayed / games.length) * 100 : 0;

    return {
      name: playerName,
      pfpLink: p.pfp_link,
      totalTimeMs,
      gamesPlayed,
      totalClaims,
      avgTimePerGame,
      completionRate,
      gameHistory
    };
  });

  return playerStats;
}

// ==========================================
// RENDER LEADERBOARD
// ==========================================
function renderLeaderboard() {
  const container = $("leaderboard-body");
  const topCardsContainer = $("top-players-cards");

  const playerStats = calculatePlayerStats();

  // Sort based on current sort type
  if (currentSortType === "games") {
    playerStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
  } else if (currentSortType === "time") {
    playerStats.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
  } else if (currentSortType === "claims") {
    playerStats.sort((a, b) => b.totalClaims - a.totalClaims);
  } else if (currentSortType === "completion") {
    playerStats.sort((a, b) => b.completionRate - a.completionRate);
  }

  // Update header text
  const headerTexts = {
    games: "Games Played",
    time: "Total Time",
    claims: "Total Claims",
    completion: "Completion Rate"
  };
  $("metric-header").textContent = headerTexts[currentSortType];

  // Render table rows
  container.innerHTML = "";

  if (playerStats.length === 0) {
    container.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-20 text-center text-slate-500">
                    <i class="fa-solid fa-users-slash text-4xl mb-4"></i>
                    <p>No players found</p>
                </td>
            </tr>`;
    return;
  }

  playerStats.forEach((stat, index) => {
    const rank = index + 1;
    const row = document.createElement("tr");
    row.className = "hover:bg-slate-800/30 transition-colors cursor-pointer";

    // Add special styling for top 3
    if (rank <= 3) {
      row.classList.add(`rank-${rank}`);
    }

    // Rank badge
    let rankBadge = "";
    if (rank === 1)
      rankBadge = '<i class="fa-solid fa-trophy text-yellow-400 text-2xl"></i>';
    else if (rank === 2)
      rankBadge = '<i class="fa-solid fa-medal text-gray-400 text-2xl"></i>';
    else if (rank === 3)
      rankBadge = '<i class="fa-solid fa-medal text-orange-600 text-2xl"></i>';
    else rankBadge = `<span class="text-slate-400 font-bold">#${rank}</span>`;

    // Player avatar and name
    const avatar = stat.pfpLink
      ? `<img src="${stat.pfpLink}" alt="${stat.name}" class="w-10 h-10 rounded-full object-cover border-2 border-slate-600" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
      : "";
    const fallbackAvatar = `<div class="w-10 h-10 rounded-full bg-ap-accent/20 flex items-center justify-center" style="${stat.pfpLink ? "display:none;" : ""}"><i class="fa-solid fa-user text-ap-accent"></i></div>`;

    // Metric value based on sort type
    let metricValue = "";
    if (currentSortType === "games") {
      metricValue = `<span class="text-lg font-bold text-ap-accent">${stat.gamesPlayed}</span>`;
    } else if (currentSortType === "time") {
      metricValue = `<span class="text-lg font-bold text-ap-accent">${formatTime(stat.totalTimeMs)}</span>`;
    } else if (currentSortType === "claims") {
      metricValue = `<span class="text-lg font-bold text-ap-accent">${stat.totalClaims}</span>`;
    } else if (currentSortType === "completion") {
      metricValue = `<span class="text-lg font-bold text-ap-accent">${stat.completionRate.toFixed(1)}%</span>`;
    }

    row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap col-rank">
                ${rankBadge}
            </td>
            <td class="px-6 py-4 whitespace-nowrap col-player">
                <div class="flex items-center gap-3">
                    ${avatar}${fallbackAvatar}
                    <span class="font-semibold text-white">${stat.name}</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center col-metric">
                ${metricValue}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center hidden md:table-cell col-avg-time">
                <span class="text-slate-300">${formatTime(stat.avgTimePerGame)}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-center hidden lg:table-cell col-total-time">
                <span class="text-slate-300">${formatTime(stat.totalTimeMs)}</span>
            </td>
        `;

    row.addEventListener("click", () => showPlayerModal(stat));

    container.appendChild(row);
  });

  // Render top 3 cards for mobile/tablet view
  renderTopCards(playerStats.slice(0, 3));
}

// ==========================================
// RENDER TOP CARDS
// ==========================================
function renderTopCards(top3) {
  const container = $("top-players-cards");
  container.innerHTML = "";

  if (top3.length === 0) return;

  const cardTitles = [
    '<i class="fa-solid fa-trophy text-yellow-400 mr-2"></i>1st Place',
    '<i class="fa-solid fa-medal text-gray-400 mr-2"></i>2nd Place',
    '<i class="fa-solid fa-medal text-orange-600 mr-2"></i>3rd Place'
  ];
  const borderColors = [
    "border-yellow-500",
    "border-gray-400",
    "border-orange-600"
  ];

  top3.forEach((stat, index) => {
    if (!stat) return;

    const card = document.createElement("div");
    card.className = `glass rounded-xl p-6 ${borderColors[index]} border-t-4`;

    const avatar = stat.pfpLink
      ? `<img src="${stat.pfpLink}" alt="${stat.name}" class="w-20 h-20 rounded-full object-cover border-4 border-slate-600 mx-auto" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
      : "";
    const fallbackAvatar = `<div class="w-20 h-20 rounded-full bg-ap-accent/20 flex items-center justify-center mx-auto" style="${stat.pfpLink ? "display:none;" : ""}"><i class="fa-solid fa-user text-3xl text-ap-accent"></i></div>`;

    card.innerHTML = `
            <div class="text-center">
                <div class="text-lg font-bold text-white mb-4">${cardTitles[index]}</div>
                <div class="mb-4 flex justify-center">
                    ${avatar}${fallbackAvatar}
                </div>
                <h3 class="text-xl font-bold text-white mb-2">${stat.name}</h3>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-slate-800/50 rounded-lg p-2">
                        <div class="text-xs text-slate-400">Games</div>
                        <div class="text-lg font-bold text-ap-accent">${stat.gamesPlayed}</div>
                    </div>
                    <div class="bg-slate-800/50 rounded-lg p-2">
                        <div class="text-xs text-slate-400">Time</div>
                        <div class="text-sm font-bold text-ap-accent">${formatTime(stat.totalTimeMs)}</div>
                    </div>
                    <div class="bg-slate-800/50 rounded-lg p-2">
                        <div class="text-xs text-slate-400">Claims</div>
                        <div class="text-lg font-bold text-ap-accent">${stat.totalClaims}</div>
                    </div>
                </div>
            </div>
        `;

    container.appendChild(card);
  });
}

// ==========================================
// TAB SWITCHING
// ==========================================
function setupTabListeners() {
  const tabs = {
    "tab-games": "games",
    "tab-time": "time",
    "tab-claims": "claims",
    "tab-completion": "completion"
  };

  Object.entries(tabs).forEach(([tabId, sortType]) => {
    const tab = $(tabId);
    if (tab) {
      tab.addEventListener("click", () => {
        // Update active tab styling
        document.querySelectorAll(".ranking-tab").forEach((t) => {
          t.className =
            "ranking-tab flex-1 md:flex-none px-6 py-3 rounded-lg font-semibold bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500 transition-all";
        });
        tab.className =
          "ranking-tab flex-1 md:flex-none px-6 py-3 rounded-lg font-semibold bg-ap-accent/20 text-ap-accent border border-ap-accent/30 transition-all";

        // Update sort type and re-render
        currentSortType = sortType;
        renderLeaderboard();
      });
    }
  });
}

// ==========================================
// PLAYER MODAL
// ==========================================
function showPlayerModal(stat) {
  // Remove existing modal if any
  const existing = document.getElementById("player-detail-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "player-detail-modal";
  modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.4);
        z-index: 1000;
        display: flex;
        justify-content: center;
        align-items: center;
        backdrop-filter: blur(4px);
    `;

  const content = document.createElement("div");
  content.style.cssText = `
        background: rgba(30, 41, 59, 0.98);
        backdrop-filter: blur(10px);
        padding: 30px;
        border-radius: 16px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    `;

  // Close Button
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "&times;";
  closeBtn.style.cssText = `
        position: absolute;
        top: 15px; right: 20px;
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 1.5rem;
        cursor: pointer;
        line-height: 1;
    `;
  closeBtn.onclick = () => modal.remove();

  // Header
  const header = document.createElement("div");
  header.style.cssText = `display: flex; align-items: center; gap: 20px; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 20px;`;

  const avatar = stat.pfpLink
    ? `<img src="${stat.pfpLink}" alt="${stat.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #38bdf8;">`
    : `<div style="width: 60px; height: 60px; border-radius: 50%; background: #38bdf8/0.2; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-user" style="font-size: 1.5rem; color: #38bdf8;"></i></div>`;

  const info = document.createElement("div");
  info.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;

  // Name row with pronouns badge
  const nameRow = document.createElement("div");
  nameRow.style.cssText = `display: flex; align-items: center; gap: 8px; flex-wrap: wrap;`;

  const h2 = document.createElement("h2");
  h2.textContent = stat.name;
  h2.style.margin = "0";
  h2.style.fontSize = "1.25rem";
  h2.style.color = "#e2e8f0";

  // Pronouns badge
  const playerObj = players.find((p) => p.name === stat.name);
  const playerPronouns =
    playerObj && playerObj.pronouns ? playerObj.pronouns.trim() : "";
  if (playerPronouns) {
    const pronounsBadge = document.createElement("span");
    pronounsBadge.textContent = playerPronouns;
    pronounsBadge.style.cssText = `display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background-color: #38bdf822; color: #38bdf8; border: 1px solid #38bdf8; white-space: nowrap;`;
    nameRow.appendChild(h2);
    nameRow.appendChild(pronounsBadge);
  } else {
    nameRow.appendChild(h2);
  }

  // Roles in modal
  const playerRoles = playerObj && playerObj.roles ? playerObj.roles : [];
  const modalRoles = document.createElement("div");
  modalRoles.style.cssText = `display: flex; flex-wrap: wrap; gap: 6px;`;
  playerRoles.forEach((roleName) => {
    const role = availableRoles.find((r) => r.name === roleName);
    if (role) {
      const badge = document.createElement("span");
      badge.textContent = role.name;
      badge.style.cssText = `
                display: inline-flex; align-items: center; gap: 4px;
                padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold;
                background-color: ${role.color}33; color: ${role.color}; border: 1px solid ${role.color};
            `;
      const dot = document.createElement("span");
      dot.style.cssText = `display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${role.color};`;
      badge.prepend(dot);
      modalRoles.appendChild(badge);
    }
  });

  info.appendChild(nameRow);
  if (modalRoles.children.length > 0) {
    info.appendChild(modalRoles);
  }

  // Bio under name
  const playerBio = playerObj && playerObj.bio ? playerObj.bio.trim() : "";
  if (playerBio) {
    const bioDiv = document.createElement("div");
    bioDiv.style.cssText = `margin-top: 4px; overflow-wrap: anywhere; word-break: break-word;`;
    const bioText = document.createElement("span");
    bioText.textContent = playerBio;
    bioText.style.cssText = `color: #94a3b8; overflow-wrap: anywhere; word-break: break-word; font-size: 0.9rem;`;
    bioDiv.appendChild(bioText);
    info.appendChild(bioDiv);
  }

  // Discord username under bio
  const playerDiscord =
    playerObj && playerObj.discord ? playerObj.discord.trim() : "";
  if (playerDiscord) {
    const discordDiv = document.createElement("div");
    discordDiv.style.cssText = `display: flex; align-items: center; gap: 6px; margin-top: 4px;`;
    const discordIcon = document.createElement("i");
    discordIcon.className = "fa-brands fa-discord";
    discordIcon.style.cssText = `color: #5865F2;`;
    const discordText = document.createElement("span");
    discordText.textContent = playerDiscord;
    discordText.style.cssText = `color: #5865F2; overflow-wrap: anywhere; word-break: break-word; font-size: 0.9rem;`;
    discordDiv.appendChild(discordIcon);
    discordDiv.appendChild(discordText);
    info.appendChild(discordDiv);
  }

  header.innerHTML = avatar;
  header.appendChild(info);

  // Awards Section
  const playerAwards = playerObj && playerObj.awards ? playerObj.awards : [];

  if (playerAwards.length > 0) {
    const awardsSection = document.createElement("div");
    awardsSection.style.cssText = `margin-bottom: 25px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 8px;`;
    const awardsTitle = document.createElement("h3");
    awardsTitle.textContent = "Awards";
    awardsTitle.style.cssText = `border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 15px; font-size: 1.2rem; color: #e2e8f0;`;
    awardsSection.appendChild(awardsTitle);

    const awardsList = document.createElement("div");
    awardsList.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;

    playerAwards.forEach((award) => {
      const awardItem = document.createElement("div");
      awardItem.style.cssText = `
                display: flex; align-items: center; gap: 12px;
                background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;
            `;

      // Render icon - check if it's a FontAwesome class or emoji
      let iconHtml = "";
      if (award.icon && award.icon.startsWith("fa-")) {
        iconHtml = `<i class="${award.icon}" style="font-size: 1.5rem; color: #38bdf8; min-width: 24px;"></i>`;
      } else {
        iconHtml = `<span style="font-size: 1.5rem; min-width: 24px;">${award.icon || "🏆"}</span>`;
      }

      const awardInfo = document.createElement("div");
      awardInfo.style.cssText = `flex: 1; min-width: 0;`;

      const awardName = document.createElement("div");
      awardName.innerHTML = `${iconHtml} <strong style="color: #38bdf8;">${award.name}</strong>`;
      awardName.style.cssText = `display: flex; align-items: center; gap: 8px; margin-bottom: 4px;`;

      const awardDesc = document.createElement("div");
      awardDesc.textContent = award.description || "";
      awardDesc.style.cssText = `font-size: 0.85rem; color: #94a3b8; overflow-wrap: anywhere; word-break: break-word;`;

      awardInfo.appendChild(awardName);
      awardInfo.appendChild(awardDesc);
      awardItem.appendChild(awardInfo);
      awardsList.appendChild(awardItem);
    });

    awardsSection.appendChild(awardsList);
    content.appendChild(awardsSection);
  }

  // Stats Grid
  const statsGrid = document.createElement("div");
  statsGrid.style.cssText = `
        display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin-bottom: 25px;
    `;

  const statBoxes = [
    { label: "Games Played", value: stat.gamesPlayed },
    { label: "Total Time", value: formatTime(stat.totalTimeMs) },
    { label: "Total Claims", value: stat.totalClaims }
  ];

  statBoxes.forEach((s) => {
    const box = document.createElement("div");
    box.style.cssText = `
            background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;
        `;
    const val = document.createElement("div");
    val.style.cssText = `font-size: 1.5rem; font-weight: bold; color: #38bdf8;`;
    val.textContent = s.value;
    const lbl = document.createElement("div");
    lbl.style.cssText = `font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; margin-top: 5px;`;
    lbl.textContent = s.label;
    box.appendChild(val);
    box.appendChild(lbl);
    statsGrid.appendChild(box);
  });

  // Game History Section
  const historySection = document.createElement("div");
  historySection.style.cssText = `margin-top: 20px;`;
  const historyTitle = document.createElement("h3");
  historyTitle.textContent = "Games Played";
  historyTitle.style.cssText = `border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 15px;`;

  const historyList = document.createElement("div");
  historyList.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;

  if (stat.gameHistory.length > 0) {
    stat.gameHistory.forEach((game) => {
      const item = document.createElement("div");
      item.style.cssText = `
                background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; 
                border-left: 3px solid #38bdf8; font-size: 0.9rem;
                display: flex; justify-content: space-between; align-items: center;
            `;
      item.innerHTML = `
                <strong style="color: #e2e8f0;">${game.gameName}</strong>
                <span style="color: #38bdf8; font-weight: bold; font-family: monospace;">${formatTime(game.timeMs)}</span>
            `;
      historyList.appendChild(item);
    });
  } else {
    historyList.innerHTML =
      '<p style="color:#94a3b8; text-align:center;">No games played yet.</p>';
  }

  historySection.appendChild(historyTitle);
  historySection.appendChild(historyList);

  content.appendChild(closeBtn);
  content.appendChild(header);
  content.appendChild(statsGrid);
  content.appendChild(historySection);
  modal.appendChild(content);

  // Close on outside click
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  document.body.appendChild(modal);
}

// ==========================================
// INITIALIZE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  loadRoles();
  setupTabListeners();
  loadData();

  // Refresh data every 10 seconds
  setInterval(loadData, 10000);
});
