(function () {
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
  let pageAvailableRoles = []; // [{ name, color }]
  let currentPlayer = AUTH.getName();

  // View & Sorting state
  let currentView = "all-time"; // 'all-time', 'monthly', 'history'
  let selectedHistoryMonth = "";
  let currentSortColumn = "games"; // 'rank', 'player', 'games', 'avgTime', 'totalTime'
  let sortDirection = "desc"; // 'asc' or 'desc'

  const $ = (id) => document.getElementById(id);

  function getCurrentMonthYear() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function getMonthYear(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function getAvailableMonths() {
    const months = new Set();
    games.forEach((game) => {
      if (game.logs) {
        game.logs.forEach((log) => {
          if (log.end || log.start)
            months.add(getMonthYear(log.end || log.start));
        });
      }
      if (game.current_player && game.claimed_at) {
        months.add(getMonthYear(game.claimed_at));
      }
    });
    return Array.from(months).sort().reverse(); // Newest first
  }

  function toggleSort(column) {
    if (currentSortColumn === column) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      currentSortColumn = column;
      sortDirection = "desc"; // Default to descending for new columns
    }
    updateSortIndicators();
    renderLeaderboard();
  }

  function updateSortIndicators() {
    const columns = ["rank", "player", "games", "avgTime", "totalTime"];
    columns.forEach((col) => {
      const th = $(`sort-${col}`);
      if (th) {
        const icon = th.querySelector("i");
        if (currentSortColumn === col) {
          icon.className =
            sortDirection === "asc"
              ? "fa-solid fa-sort-up ml-1 text-ap-accent"
              : "fa-solid fa-sort-down ml-1 text-ap-accent";
          th.classList.add("text-ap-accent");
        } else {
          icon.className = "fa-solid fa-sort ml-1 text-slate-500";
          th.classList.remove("text-ap-accent");
        }
      }
    });
  }
  function setupSortListeners() {
    const columns = ["rank", "player", "games", "avgTime", "totalTime"];
    columns.forEach((col) => {
      const th = $(`sort-${col}`);
      if (th) {
        th.addEventListener("click", () => toggleSort(col));
      }
    });
    updateSortIndicators(); // Set initial icon state
  }
  function formatTime(ms) {
    if (!ms || ms < 0) return "0:00:00";
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  async function loadRoles() {
    try {
      const res = await fetch(`/api/get-data?type=roles&t=${Date.now()}`);
      if (res.ok) {
        pageAvailableRoles = await res.json();
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
    const targetMonth =
      currentView === "history"
        ? selectedHistoryMonth
        : currentView === "monthly"
          ? getCurrentMonthYear()
          : null;
    const viewType = currentView;
    const now = Date.now();

    const playerStats = players.map((p) => {
      const playerName = p.name;
      let totalTimeMs = 0;
      let totalClaims = 0;
      const gamesPlayedSet = new Set();
      const gameHistory = [];

      games.forEach((game) => {
        let gameTotalMs = 0;
        let claimCount = 0;

        if (game.logs) {
          game.logs.forEach((log) => {
            if (log.player === playerName) {
              const logMonth = getMonthYear(log.end || log.start);
              if (viewType === "all-time" || logMonth === targetMonth) {
                gameTotalMs += log.duration_ms;
                totalTimeMs += log.duration_ms;
                claimCount++;
                gamesPlayedSet.add(game.id);
              }
            }
          });
        }

        // Add current session time if it started in the target period
        if (game.current_player === playerName && game.claimed_at) {
          const claimMonth = getMonthYear(game.claimed_at);
          if (viewType === "all-time" || claimMonth === targetMonth) {
            const currentSessionMs = now - game.claimed_at;
            gameTotalMs += currentSessionMs;
            totalTimeMs += currentSessionMs;
            claimCount++;
            gamesPlayedSet.add(game.id);
          }
        }

        totalClaims += claimCount;
        if (gameTotalMs > 0)
          gameHistory.push({ gameName: game.name, timeMs: gameTotalMs });
      });

      const gamesPlayed = gamesPlayedSet.size;
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

    // Filter out players with 0 activity for monthly/history views to keep it clean
    if (viewType !== "all-time") {
      return playerStats.filter(
        (s) => s.totalTimeMs > 0 || s.gamesPlayed > 0 || s.totalClaims > 0
      );
    }
    return playerStats;
  }

  // ==========================================
  // RENDER LEADERBOARD
  // ==========================================
  function renderLeaderboard() {
    const container = $("leaderboard-body");
    const topCardsContainer = $("top-players-cards");

    const playerStats = calculatePlayerStats();
    // Compute combined score across metrics and sort by it
    // Weights: games 30%, time 30%, claims 25%, completion 15%
    const weights = { games: 0.3, time: 0.3, claims: 0.25, completion: 0.15 };
    const maxGames = Math.max(...playerStats.map((s) => s.gamesPlayed), 1);
    const maxTime = Math.max(...playerStats.map((s) => s.totalTimeMs), 1);
    const maxClaims = Math.max(...playerStats.map((s) => s.totalClaims), 1);
    const maxCompletion = Math.max(
      ...playerStats.map((s) => s.completionRate),
      0.0001
    );

    playerStats.forEach((s) => {
      const ng = s.gamesPlayed / maxGames;
      const nt = s.totalTimeMs / maxTime;
      const nc = s.totalClaims / maxClaims;
      const ncomp = s.completionRate / (maxCompletion || 100);
      s.combinedScore =
        ng * weights.games +
        nt * weights.time +
        nc * weights.claims +
        ncomp * weights.completion;
    });

    // Apply column sorting (with alphabetical tie-breaker)
    playerStats.sort((a, b) => {
      let valA, valB;
      switch (currentSortColumn) {
        case "rank":
          return (
            b.combinedScore - a.combinedScore || a.name.localeCompare(b.name)
          );
        case "player":
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          return sortDirection === "asc"
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        case "games":
          valA = a.gamesPlayed;
          valB = b.gamesPlayed;
          break;
        case "avgTime":
          valA = a.avgTimePerGame;
          valB = b.avgTimePerGame;
          break;
        case "totalTime":
          valA = a.totalTimeMs;
          valB = b.totalTimeMs;
          break;
        default:
          valA = a.combinedScore;
          valB = b.combinedScore;
      }

      let result = 0;
      if (valA < valB) result = sortDirection === "asc" ? -1 : 1;
      else if (valA > valB) result = sortDirection === "asc" ? 1 : -1;

      // Secondary sort by name if values are equal
      if (result === 0) {
        return a.name.localeCompare(b.name);
      }
      return result;
    });

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
        rankBadge =
          '<i class="fa-solid fa-trophy text-yellow-400 text-2xl"></i>';
      else if (rank === 2)
        rankBadge = '<i class="fa-solid fa-medal text-gray-400 text-2xl"></i>';
      else if (rank === 3)
        rankBadge =
          '<i class="fa-solid fa-medal text-orange-600 text-2xl"></i>';
      else rankBadge = `<span class="text-slate-400 font-bold">#${rank}</span>`;

      // Player avatar and name
      const avatar = stat.pfpLink
        ? `<img src="${stat.pfpLink}" alt="${stat.name}" class="w-10 h-10 rounded-full object-cover border-2 border-slate-600" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
        : "";
      const fallbackAvatar = `<div class="w-10 h-10 rounded-full bg-ap-accent/20 flex items-center justify-center" style="${stat.pfpLink ? "display:none;" : ""}"><i class="fa-solid fa-user text-ap-accent"></i></div>`;

      // Metric value now shows the consolidated score as percent
      const metricValue = `<span class="text-lg font-bold text-ap-accent">${(
        stat.combinedScore * 100
      ).toFixed(1)}%</span>`;

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
    const tabAllTime = $("tab-all-time");
    const tabMonthly = $("tab-monthly");
    const tabHistory = $("tab-history");
    const historyContainer = $("history-selector-container");
    const historySelect = $("history-month-select");

    function setActiveTab(activeTab) {
      [tabAllTime, tabMonthly, tabHistory].forEach((tab) => {
        if (tab)
          tab.className =
            "ranking-tab flex-1 sm:flex-none px-6 py-2 rounded-md font-semibold text-slate-400 hover:text-white transition-all";
      });
      if (activeTab)
        activeTab.className =
          "ranking-tab flex-1 sm:flex-none px-6 py-2 rounded-md font-semibold bg-ap-accent/20 text-ap-accent transition-all";
    }

    if (tabAllTime)
      tabAllTime.addEventListener("click", () => {
        currentView = "all-time";
        setActiveTab(tabAllTime);
        if (historyContainer) historyContainer.classList.add("hidden");
        renderLeaderboard();
      });

    if (tabMonthly)
      tabMonthly.addEventListener("click", () => {
        currentView = "monthly";
        setActiveTab(tabMonthly);
        if (historyContainer) historyContainer.classList.add("hidden");
        renderLeaderboard();
      });

    if (tabHistory)
      tabHistory.addEventListener("click", () => {
        currentView = "history";
        setActiveTab(tabHistory);
        if (historyContainer) historyContainer.classList.remove("hidden");
        populateHistorySelector();
        renderLeaderboard();
      });

    if (historySelect)
      historySelect.addEventListener("change", (e) => {
        selectedHistoryMonth = e.target.value;
        renderLeaderboard();
      });
  }

  function populateHistorySelector() {
    const select = $("history-month-select");
    if (!select) return;
    select.innerHTML = "";
    const months = getAvailableMonths();
    const currentMonth = getCurrentMonthYear();

    if (months.length === 0) {
      const opt = document.createElement("option");
      opt.value = currentMonth;
      opt.textContent = "No history available";
      select.appendChild(opt);
      return;
    }

    months.forEach((month) => {
      const opt = document.createElement("option");
      opt.value = month;
      const [year, mon] = month.split("-");
      const monthName = new Date(year, mon - 1).toLocaleString("default", {
        month: "long",
        year: "numeric"
      });
      opt.textContent =
        month === currentMonth ? `${monthName} (Current)` : monthName;
      select.appendChild(opt);
    });

    const pastMonths = months.filter((m) => m !== currentMonth);
    selectedHistoryMonth = pastMonths.length > 0 ? pastMonths[0] : currentMonth;
    select.value = selectedHistoryMonth;
  }

  function toggleSort(column) {
    if (currentSortColumn === column) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      currentSortColumn = column;
      sortDirection = "desc";
    }
    updateSortIndicators();
    renderLeaderboard();
  }

  function updateSortIndicators() {
    ["rank", "player", "games", "avgTime", "totalTime"].forEach((col) => {
      const th = $(`sort-${col}`);
      if (th) {
        const icon = th.querySelector("i");
        if (currentSortColumn === col) {
          icon.className =
            sortDirection === "asc"
              ? "fa-solid fa-sort-up ml-1 text-ap-accent"
              : "fa-solid fa-sort-down ml-1 text-ap-accent";
          th.classList.add("text-ap-accent");
        } else {
          icon.className = "fa-solid fa-sort ml-1 text-slate-500";
          th.classList.remove("text-ap-accent");
        }
      }
    });
  }

  function setupSortListeners() {
    ["rank", "player", "games", "avgTime", "totalTime"].forEach((col) => {
      const th = $(`sort-${col}`);
      if (th) th.addEventListener("click", () => toggleSort(col));
    });
    updateSortIndicators();
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
      ? `<img src="${stat.pfpLink}" alt="${stat.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #38bdf8; background: #222;" onerror="this.src='data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23888\'><path d=\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\'/></svg>\'">`
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
      const role = pageAvailableRoles.find((r) => r.name === roleName);
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
    // Awards Section
    const playerAwards = playerObj && playerObj.awards ? playerObj.awards : [];
    let awardsSection = null;

    if (playerAwards.length > 0) {
      awardsSection = document.createElement("div");
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
          iconHtml = `<i class="fa-solid ${award.icon}" style="font-size: 1.5rem; color: #38bdf8; min-width: 24px;"></i>`;
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

    // --- UPDATED APPEND ORDER ---
    content.appendChild(closeBtn);
    content.appendChild(header);
    if (awardsSection) {
      content.appendChild(awardsSection); // Now appended directly under the main profile header
    }
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
    setupSortListeners();
    loadData();

    // Refresh data every 10 seconds
    setInterval(loadData, 10000);

    // Add moderation button to header/nav if user is a moderator
    (async () => {
      try {
        if (AUTH.isLoggedIn()) {
          const isModerator = await AUTH.checkModerator();
          // Moderation button is provided globally in `app.js`; avoid adding a duplicate here.
        }
      } catch (e) {
        console.warn("Could not add moderation button:", e);
      }
    })();
  });
})();
