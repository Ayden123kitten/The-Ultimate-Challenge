(function () {
  const CONFIG = {
    GITHUB_OWNER: "Ayden123kitten",
    GITHUB_REPO: "The-Ultimate-Challenge",
    BRANCH: "main"
  };
  let games = [],
    players = [],
    pageAvailableRoles = [],
    availableAwards = [],
    moderatorRoles = {};
  let currentPlayer = AUTH.getName(),
    leaderboardPositions = {},
    currentAuthTab = "login",
    authPanelRendered = false,
    isModerator = false;
  const $ = (id) => document.getElementById(id);

  function formatTime(ms) {
    if (!ms || ms < 0) return "0:00:00";
    const s = Math.floor((ms / 1000) % 60),
      m = Math.floor((ms / 60000) % 60),
      h = Math.floor(ms / 3600000);
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  async function loadRoles() {
    try {
      const cached = localStorage.getItem("rolesCache");
      if (cached) {
        try {
          const p = JSON.parse(cached);
          pageAvailableRoles = Array.isArray(p) ? p : p.roles || [];
        } catch (e) {}
      }
      const res = await fetch(`/api/get-data?type=roles&t=${Date.now()}`);
      if (res.ok) {
        const d = await res.json();
        pageAvailableRoles = Array.isArray(d) ? d : d.roles || [];
        localStorage.setItem("rolesCache", JSON.stringify(pageAvailableRoles));
      }
    } catch (err) {
      console.error("Failed to load roles:", err);
    }
  }

  async function loadModeratorRoles() {
    try {
      const res = await fetch(`/api/get-data?type=moderators`);
      if (res.ok) moderatorRoles = await res.json();
    } catch (err) {
      console.error("Failed to load mods:", err);
    }
  }

  async function loadAwards() {
    try {
      // Use cached awards if available for faster UI population
      const cached = localStorage.getItem("awardsCache");
      if (cached) {
        try {
          availableAwards = JSON.parse(cached);
        } catch (e) {
          console.debug("Invalid awardsCache, ignoring", e);
        }
      }

      // Always refresh from server in case of updates
      const res = await fetch(`/api/get-data?type=awards&t=${Date.now()}`);
      if (res.ok) {
        const responseData = await res.json();
        // FIX: Extract the awards array from the response object safely
        availableAwards =
          responseData.awards ||
          (Array.isArray(responseData) ? responseData : []);

        try {
          localStorage.setItem("awardsCache", JSON.stringify(availableAwards));
        } catch (e) {
          console.debug("Could not cache awards:", e);
        }
      }
    } catch (err) {
      console.error("Failed to load awards:", err);
    }
  }

  function getModeratorIcon(n) {
    const r = moderatorRoles[n];
    if (r === "admin")
      return '<i class="fa-solid fa-crown text-yellow-400" title="Admin"></i>';
    if (r === "moderator")
      return '<i class="fa-solid fa-shield-halved text-blue-400" title="Moderator"></i>';
    return "";
  }

  async function loadData() {
    try {
      const [gRes, pRes] = await Promise.all([
        fetch(`/api/get-data?type=games&t=${Date.now()}`),
        fetch(`/api/get-data?type=players&t=${Date.now()}`)
      ]);
      if (!gRes.ok || !pRes.ok) throw new Error("API Error");
      games = await gRes.json();
      players = await pRes.json();
      await Promise.all([loadRoles(), loadModeratorRoles(), loadAwards()]);
      renderAuthPanel();
      renderPlayers();
    } catch (err) {
      console.error("Failed to load data:", err);
      $("players-container").innerHTML =
        `<div class="col-span-full text-center text-red-400 p-8"><p class="text-lg font-bold">Error loading player stats</p><p class="text-sm mt-2">${err.message}</p></div>`;
    }
  }

  function renderAuthPanel() {
    const panel = $("auth-panel");
    if (!panel) return;
    const cName = $("current-player-name");
    if (cName) cName.textContent = currentPlayer || "Not logged in";
    if (authPanelRendered && !AUTH.isLoggedIn()) return;
    authPanelRendered = true;
    if (AUTH.isLoggedIn()) {
      panel.innerHTML = `<div class="glass rounded-xl p-6 flex items-center justify-between"><div><div class="text-sm text-slate-400">Logged in as</div><div class="text-xl font-bold text-ap-accent">${currentPlayer}</div></div><button id="auth-logout-btn" class="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg">Log Out</button></div>`;
      $("auth-logout-btn").addEventListener("click", () => AUTH.logout());
      return;
    }
    panel.innerHTML = `<div class="glass rounded-xl p-6"><div class="flex gap-2 mb-4"><button id="tab-login" class="flex-1 py-2 rounded-lg font-semibold bg-ap-accent/20 text-ap-accent">Log In</button><button id="tab-signup" class="flex-1 py-2 rounded-lg font-semibold bg-slate-800 text-slate-400">Sign Up</button></div><form id="login-form" class="space-y-3"><input id="login-name" type="text" placeholder="Player name" class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"><div class="relative"><input id="login-password" type="password" placeholder="Password" class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"><button type="button" id="login-toggle-password" class="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"><i class="fa-solid fa-eye"></i></button></div><button type="submit" class="w-full bg-ap-accent/80 hover:bg-ap-accent text-white font-bold py-2 rounded-lg">Log In</button><p id="login-error" class="text-red-400 text-sm hidden"></p></form><form id="signup-form" class="space-y-3 hidden"><input id="signup-name" type="text" placeholder="Choose a player name" class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"><div class="relative"><input id="signup-password" type="password" placeholder="Password (6+ chars)" class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"><button type="button" id="signup-toggle-password" class="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"><i class="fa-solid fa-eye"></i></button></div><input id="signup-pfp" type="url" placeholder="Profile picture link (optional)" class="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white"><button type="submit" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg">Sign Up</button><p id="signup-error" class="text-red-400 text-sm hidden"></p></form></div>`;
    const lTab = $("tab-login"),
      sTab = $("tab-signup"),
      lForm = $("login-form"),
      sForm = $("signup-form");
    const setTab = (t) => {
      currentAuthTab = t;
      lTab.className = `flex-1 py-2 rounded-lg font-semibold ${t === "login" ? "bg-ap-accent/20 text-ap-accent" : "bg-slate-800 text-slate-400"}`;
      sTab.className = `flex-1 py-2 rounded-lg font-semibold ${t === "signup" ? "bg-ap-accent/20 text-ap-accent" : "bg-slate-800 text-slate-400"}`;
      lForm.classList.toggle("hidden", t !== "login");
      sForm.classList.toggle("hidden", t !== "signup");
    };
    lTab.onclick = () => setTab("login");
    sTab.onclick = () => setTab("signup");
    const togglePw = (btnId, inputId) => {
      const b = $(btnId),
        i = $(inputId);
      b.onclick = () => {
        i.type = i.type === "password" ? "text" : "password";
        b.querySelector("i").className =
          i.type === "password" ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
      };
    };
    togglePw("login-toggle-password", "login-password");
    togglePw("signup-toggle-password", "signup-password");
    lForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await AUTH.login(
          $("login-name").value.trim(),
          $("login-password").value
        );
        currentPlayer = AUTH.getName();
        await loadData();
      } catch (err) {
        $("login-error").textContent = err.message;
        $("login-error").classList.remove("hidden");
      }
    };
    sForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await AUTH.signup(
          $("signup-name").value.trim(),
          $("signup-password").value,
          $("signup-pfp").value.trim()
        );
        currentPlayer = AUTH.getName();
        await loadData();
      } catch (err) {
        $("signup-error").textContent = err.message;
        $("signup-error").classList.remove("hidden");
      }
    };
  }

  let searchQuery = "",
    playersSortOption = "az";
  function renderPlayers() {
    const inlineEditMode = localStorage.getItem("inlineEditMode") === "true",
      cachedMod = localStorage.getItem("isModerator") === "true",
      effMod = isModerator || cachedMod;
    const container = $("players-container");
    container.innerHTML = "";
    const pStats = players.map((p) => {
      const pGames = games.filter(
          (g) => g.logs && g.logs.some((l) => l.player === p.name)
        ),
        cGame = games.find((g) => g.current_player === p.name);
      let tMs = 0,
        gHist = [],
        tCl = 0;
      games.forEach((g) => {
        let gMs = 0,
          cC = 0;
        if (g.logs)
          g.logs.forEach((l) => {
            if (l.player === p.name) {
              gMs += l.duration_ms;
              tMs += l.duration_ms;
              cC++;
            }
          });
        if (cGame && cGame.id === g.id && g.claimed_at) {
          const sMs = Date.now() - g.claimed_at;
          gMs += sMs;
          tMs += sMs;
          cC++;
        }
        tCl += cC;
        if (gMs > 0) gHist.push({ gameName: g.name, timeMs: gMs });
      });
      gHist.sort((a, b) => b.timeMs - a.timeMs);
      return {
        name: p.name,
        pfpLink: p.pfp_link,
        totalTimeMs: tMs,
        gamesPlayed: pGames.length,
        currentGame: cGame ? cGame.name : null,
        gameHistory: gHist,
        totalClaims: tCl
      };
    });
    (function computePos() {
      const sR = pStats.map((s) => ({ ...s }));
      const w = { games: 0.3, time: 0.3, claims: 0.25, completion: 0.15 };
      sR.forEach((s) => {
        s.completionRate =
          games.length > 0 ? (s.gamesPlayed / games.length) * 100 : 0;
      });
      const mG = Math.max(...sR.map((s) => s.gamesPlayed), 1),
        mT = Math.max(...sR.map((s) => s.totalTimeMs), 1),
        mC = Math.max(...sR.map((s) => s.totalClaims), 1),
        mCo = Math.max(...sR.map((s) => s.completionRate), 0.0001);
      sR.forEach((s) => {
        s.combinedScore =
          (s.gamesPlayed / mG) * w.games +
          (s.totalTimeMs / mT) * w.time +
          (s.totalClaims / mC) * w.claims +
          (s.completionRate / mCo) * w.completion;
      });
      sR.sort((a, b) => b.combinedScore - a.combinedScore);
      leaderboardPositions = {};
      sR.forEach((s, i) => {
        leaderboardPositions[s.name] = i + 1;
      });
    })();
    // Apply sorting (with alphabetical tie-breaker)
    if (playersSortOption === "az") {
      playerStats.sort((a, b) => a.name.localeCompare(b.name));
    } else if (playersSortOption === "za") {
      playerStats.sort((a, b) => b.name.localeCompare(a.name));
    } else if (playersSortOption === "games-played") {
      playerStats.sort((a, b) => {
        if (b.gamesPlayed !== a.gamesPlayed)
          return b.gamesPlayed - a.gamesPlayed;
        return a.name.localeCompare(b.name);
      });
    } else if (playersSortOption === "total-time") {
      playerStats.sort((a, b) => {
        if (b.totalTimeMs !== a.totalTimeMs)
          return b.totalTimeMs - a.totalTimeMs;
        return a.name.localeCompare(b.name);
      });
    } else if (playersSortOption === "most-claims") {
      playerStats.sort((a, b) => {
        if (b.totalClaims !== a.totalClaims)
          return b.totalClaims - a.totalClaims;
        return a.name.localeCompare(b.name);
      });
    }
    let fStats = pStats;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      fStats = pStats.filter((s) => s.name.toLowerCase().includes(q));
    }
    fStats.forEach((stat) => {
      const card = document.createElement("div"),
        isSel = stat.name === currentPlayer;
      card.className = `glass rounded-xl p-4 transition-all cursor-pointer hover:shadow-lg ${isSel ? "border-2 border-ap-accent" : ""}`;
      card.style.cssText =
        "position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; aspect-ratio: 1; justify-content: center;";
      card.onmouseover = function () {
        this.style.transform = "translateY(-4px)";
        this.style.boxShadow = "0 8px 16px rgba(0,0,0,0.2)";
      };
      card.onmouseout = function () {
        this.style.transform = "translateY(0)";
        this.style.boxShadow = "none";
      };
      card.onclick = (e) => {
        if (!e.target.closest(".inline-edit-btn")) showPlayerModal(stat);
      };
      const av = stat.pfpLink
        ? `<img src="${stat.pfpLink}" alt="${stat.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #38bdf8; background: #222;">`
        : `<div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(56,189,248,0.2); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-user" style="font-size: 1.5rem; color: #38bdf8;"></i></div>`;
      const mIcon = getModeratorIcon(stat.name),
        pRank = leaderboardPositions[stat.name] || null;
      card.innerHTML = `<div style="position: relative;">${av}${pRank ? `<div title="Leaderboard Position" style="position: absolute; bottom: -8px; right: -8px; background: rgba(17,24,39,0.95); border: 2px solid #0ea5e9; color: #0ea5e9; padding: 4px 6px; border-radius: 9999px; font-weight: 700; font-size: 0.75rem; z-index: 10;">#${pRank}</div>` : ""}</div>${mIcon ? `<div style="position: absolute; top: -5px; left: -5px; background: #1e293b; border: 2px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; z-index: 10;">${mIcon}</div>` : ""}<div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; overflow: hidden;"><h2 style="margin: 0; font-size: 0.95rem; color: #e2e8f0; cursor: pointer; text-decoration: underline; text-underline-offset: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${stat.name} ${isSel ? '<span style="font-size: 0.65rem; color: #38bdf8;">(You)</span>' : ""}</h2></div>`;
      container.appendChild(card);
    });
    if (fStats.length === 0)
      container.innerHTML = `<div class="col-span-full text-center text-slate-500 py-20"><p>No players found</p></div>`;
  }
  // Show game info modal
  async function showGameInfoModal(gameName) {
    // Find the game in the games array
    const game = games.find((g) => g.name === gameName);
    if (!game) {
      alert("Game information not found");
      return;
    }

    // Remove existing modal if any
    const existing = document.getElementById("game-info-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "game-info-modal";
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.8);
        z-index: 2000;
        display: flex;
        justify-content: center;
        align-items: center;
        backdrop-filter: blur(4px);
        padding: 20px;
    `;

    const content = document.createElement("div");
    content.style.cssText = `
        background: rgba(30, 41, 59, 0.98);
        backdrop-filter: blur(10px);
        padding: 30px;
        border-radius: 16px;
        max-width: 700px;
        width: 100%;
        max-height: 90vh;
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
        z-index: 10;
    `;
    closeBtn.onclick = () => modal.remove();

    // Header with logo
    const header = document.createElement("div");
    header.style.cssText = `display: flex; align-items: flex-start; gap: 20px; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1);`;

    if (game.logo) {
      const logo = document.createElement("img");
      logo.src = game.logo;
      logo.alt = game.name;
      logo.style.cssText = `width: 80px; height: 80px; object-fit: contain; border-radius: 8px; background: rgba(255,255,255,0.05);`;
      logo.onerror = function () {
        this.style.display = "none";
      };
      header.appendChild(logo);
    }

    const titleDiv = document.createElement("div");
    titleDiv.style.cssText = `flex: 1;`;

    const h2 = document.createElement("h2");
    h2.textContent = game.name;
    h2.style.cssText = `margin: 0 0 10px 0; font-size: 1.8rem; color: #e2e8f0;`;

    const statusBadge = document.createElement("span");
    const isCompleted = game.completed === true;
    statusBadge.textContent = isCompleted ? "Completed" : "In Progress";
    statusBadge.style.cssText = `display: inline-block; padding: 4px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; ${isCompleted ? "background: #22c55e/20; color: #22c55e;" : "background: #38bdf8/20; color: #38bdf8;"}`;

    titleDiv.appendChild(h2);
    titleDiv.appendChild(statusBadge);
    header.appendChild(titleDiv);

    // Stats Grid
    const statsGrid = document.createElement("div");
    statsGrid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 25px;`;

    const totalTimeMs = game.total_time_ms || 0;
    const claimsCount = game.logs ? game.logs.length : 0;
    const uniquePlayers = game.logs
      ? new Set(game.logs.map((log) => log.player)).size
      : 0;

    const statBoxes = [
      { label: "Total Time", value: formatTime(totalTimeMs), icon: "fa-clock" },
      { label: "Total Claims", value: claimsCount, icon: "fa-clipboard-list" },
      { label: "Unique Players", value: uniquePlayers, icon: "fa-users" }
    ];

    if (game.slot_count > 0) {
      statBoxes.push({
        label: "Slot Count",
        value: game.slot_count,
        icon: "fa-layer-group"
      });
    }

    statBoxes.forEach((stat) => {
      const box = document.createElement("div");
      box.style.cssText = `background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;`;

      const icon = document.createElement("i");
      icon.className = `fa-solid ${stat.icon}`;
      icon.style.cssText = `font-size: 1.5rem; color: #38bdf8; margin-bottom: 8px;`;

      const val = document.createElement("div");
      val.style.cssText = `font-size: 1.3rem; font-weight: bold; color: #e2e8f0; margin-bottom: 4px;`;
      val.textContent = stat.value;

      const lbl = document.createElement("div");
      lbl.style.cssText = `font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;`;
      lbl.textContent = stat.label;

      box.appendChild(icon);
      box.appendChild(val);
      box.appendChild(lbl);
      statsGrid.appendChild(box);
    });

    // Version Info
    if (game.apworld_version || game.mod_version) {
      const versionSection = document.createElement("div");
      versionSection.style.cssText = `margin-bottom: 20px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 8px;`;

      const versionTitle = document.createElement("h3");
      versionTitle.textContent = "Versions";
      versionTitle.style.cssText = `font-size: 1rem; color: #e2e8f0; margin-bottom: 10px;`;

      const versionContent = document.createElement("div");
      versionContent.style.cssText = `display: flex; gap: 20px; flex-wrap: wrap;`;

      if (game.apworld_version) {
        const apworldDiv = document.createElement("div");
        apworldDiv.innerHTML = `<span style="color: #94a3b8;">Apworld:</span> <span style="color: #38bdf8; font-weight: 600;">${game.apworld_version}</span>`;
        versionContent.appendChild(apworldDiv);
      }

      if (game.mod_version) {
        const modDiv = document.createElement("div");
        modDiv.innerHTML = `<span style="color: #94a3b8;">Mod:</span> <span style="color: #38bdf8; font-weight: 600;">${game.mod_version}</span>`;
        versionContent.appendChild(modDiv);
      }

      versionSection.appendChild(versionTitle);
      versionSection.appendChild(versionContent);
      content.appendChild(versionSection);
    }

    // Rules
    if (game.rules && game.rules.trim() !== "") {
      const rulesSection = document.createElement("div");
      rulesSection.style.cssText = `margin-bottom: 20px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 8px;`;

      const rulesTitle = document.createElement("h3");
      rulesTitle.textContent = "Rules";
      rulesTitle.style.cssText = `font-size: 1rem; color: #e2e8f0; margin-bottom: 10px;`;

      const rulesText = document.createElement("div");
      rulesText.textContent = game.rules;
      rulesText.style.cssText = `color: #94a3b8; line-height: 1.6; overflow-wrap: anywhere; word-break: break-word;`;

      rulesSection.appendChild(rulesTitle);
      rulesSection.appendChild(rulesText);
      content.appendChild(rulesSection);
    }

    // Extra Information
    if (game.extra_information && game.extra_information.trim() !== "") {
      const infoSection = document.createElement("div");
      infoSection.style.cssText = `margin-bottom: 20px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 8px;`;

      const infoTitle = document.createElement("h3");
      infoTitle.textContent = "Additional Information";
      infoTitle.style.cssText = `font-size: 1rem; color: #e2e8f0; margin-bottom: 10px;`;

      const infoText = document.createElement("div");
      infoText.textContent = game.extra_information;
      infoText.style.cssText = `color: #94a3b8; line-height: 1.6; overflow-wrap: anywhere; word-break: break-word;`;

      infoSection.appendChild(infoTitle);
      infoSection.appendChild(infoText);
      content.appendChild(infoSection);
    }

    // Links Section
    const links = [
      { url: game.apworld_link, icon: "fa-globe", label: "Apworld Link" },
      { url: game.mod_link, icon: "fa-puzzle-piece", label: "Mod Link" },
      { url: game.mod_setup_guide_link, icon: "fa-book", label: "Setup Guide" },
      { url: game.tracker_link, icon: "fa-map", label: "Tracker" },
      { url: game.game_info_link, icon: "fa-circle-info", label: "Game Info" },
      { url: game.support_link, icon: "fa-circle-question", label: "Support" },
      { url: game.save_file_link, icon: "fa-download", label: "Save File" }
    ].filter((l) => l.url && l.url.trim() !== "");

    if (links.length > 0) {
      const linksSection = document.createElement("div");
      linksSection.style.cssText = `margin-bottom: 20px;`;

      const linksTitle = document.createElement("h3");
      linksTitle.textContent = "Links & Resources";
      linksTitle.style.cssText = `font-size: 1rem; color: #e2e8f0; margin-bottom: 15px;`;

      const linksGrid = document.createElement("div");
      linksGrid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;`;

      links.forEach((link) => {
        const linkBtn = document.createElement("a");
        linkBtn.href = link.url;
        linkBtn.target = "_blank";
        linkBtn.rel = "noopener noreferrer";
        linkBtn.style.cssText = `display: flex; align-items: center; gap: 10px; padding: 12px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; color: #38bdf8; text-decoration: none; transition: all 0.2s;`;
        linkBtn.onmouseover = function () {
          this.style.background = "rgba(56, 189, 248, 0.2)";
          this.style.transform = "translateY(-2px)";
        };
        linkBtn.onmouseout = function () {
          this.style.background = "rgba(56, 189, 248, 0.1)";
          this.style.transform = "translateY(0)";
        };

        const icon = document.createElement("i");
        icon.className = `fa-solid ${link.icon}`;
        icon.style.cssText = `font-size: 1.2rem;`;

        const labelText = document.createElement("span");
        labelText.textContent = link.label;
        labelText.style.cssText = `font-weight: 600;`;

        linkBtn.appendChild(icon);
        linkBtn.appendChild(labelText);
        linksGrid.appendChild(linkBtn);
      });

      linksSection.appendChild(linksTitle);
      linksSection.appendChild(linksGrid);
      content.appendChild(linksSection);
    }

    // Recent Activity (last 5 logs)
    if (game.logs && game.logs.length > 0) {
      const activitySection = document.createElement("div");
      activitySection.style.cssText = `margin-bottom: 20px;`;

      const activityTitle = document.createElement("h3");
      activityTitle.textContent = "Recent Activity";
      activityTitle.style.cssText = `font-size: 1rem; color: #e2e8f0; margin-bottom: 15px;`;

      const activityList = document.createElement("div");
      activityList.style.cssText = `display: flex; flex-direction: column; gap: 8px;`;

      const recentLogs = game.logs.slice(-5).reverse();
      recentLogs.forEach((log) => {
        const logItem = document.createElement("div");
        logItem.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 6px;`;

        const playerInfo = document.createElement("div");
        playerInfo.style.cssText = `display: flex; align-items: center; gap: 8px;`;

        const playerIcon = document.createElement("i");
        playerIcon.className = "fa-solid fa-user";
        playerIcon.style.cssText = `color: #38bdf8;`;

        const playerName = document.createElement("span");
        playerName.textContent = log.player;
        playerName.style.cssText = `color: #e2e8f0; font-weight: 600;`;

        playerInfo.appendChild(playerIcon);
        playerInfo.appendChild(playerName);

        const duration = document.createElement("span");
        duration.textContent = formatTime(log.duration_ms);
        duration.style.cssText = `color: #94a3b8; font-family: monospace; font-size: 0.9rem;`;

        logItem.appendChild(playerInfo);
        logItem.appendChild(duration);
        activityList.appendChild(logItem);
      });

      activitySection.appendChild(activityTitle);
      activitySection.appendChild(activityList);
      content.appendChild(activitySection);
    }

    content.appendChild(closeBtn);
    content.appendChild(header);
    content.appendChild(statsGrid);
    modal.appendChild(content);

    // Close on outside click
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
  }
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
    info.appendChild(nameRow);
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

    // Show leaderboard rank in header (aligned right)
    const rank = leaderboardPositions[stat.name] || null;
    if (rank) {
      const rankDiv = document.createElement("div");
      rankDiv.style.cssText = `margin-left: auto; display: flex; flex-direction: column; align-items: center; gap: 4px;`;
      const rankLabel = document.createElement("div");
      rankLabel.textContent = "Rank";
      rankLabel.style.cssText = `font-size: 0.75rem; color: #94a3b8;`;
      const rankValue = document.createElement("div");
      rankValue.textContent = `#${rank}`;
      rankValue.style.cssText = `font-size: 1.1rem; font-weight: 700; color: #38bdf8;`;
      rankDiv.appendChild(rankLabel);
      rankDiv.appendChild(rankValue);
      header.appendChild(rankDiv);
    }

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

      playerAwards.forEach((awardEntry) => {
        let awardData = null;
        if (typeof awardEntry === "string") {
          awardData = availableAwards.find((a) => a.name === awardEntry) || {
            name: awardEntry
          };
        } else if (awardEntry && typeof awardEntry === "object") {
          awardData = awardEntry;
        } else {
          awardData = { name: String(awardEntry) };
        }

        const awardItem = document.createElement("div");
        awardItem.style.cssText = `display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;`;

        let iconHtml = "";
        const icon = awardData.icon || "";
        if (icon && icon.startsWith && icon.startsWith("fa-")) {
          iconHtml = `<i class="fa-solid ${icon}" style="font-size: 1.5rem; color: #38bdf8; min-width: 24px;"></i>`;
        } else {
          iconHtml = `<span style="font-size: 1.5rem; min-width: 24px;">${icon || "🏆"}</span>`;
        }

        const awardInfo = document.createElement("div");
        awardInfo.style.cssText = `flex: 1; min-width: 0;`;

        const awardName = document.createElement("div");
        awardName.innerHTML = `${iconHtml} <strong style="color: #38bdf8;">${awardData.name}</strong>`;
        awardName.style.cssText = `display: flex; align-items: center; gap: 8px; margin-bottom: 4px;`;

        const awardDesc = document.createElement("div");
        awardDesc.textContent = awardData.description || "";
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
    statsGrid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin-bottom: 25px;`;

    const statBoxes = [
      { label: "Games Played", value: stat.gamesPlayed },
      { label: "Total Time", value: formatTime(stat.totalTimeMs) },
      { label: "Total Claims", value: stat.totalClaims }
    ];

    statBoxes.forEach((s) => {
      const box = document.createElement("div");
      box.style.cssText = `background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;`;
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
                cursor: pointer; transition: all 0.2s ease;
            `;

        // Add hover effect
        item.onmouseover = function () {
          this.style.background = "rgba(56, 189, 248, 0.1)";
          this.style.transform = "translateX(4px)";
        };
        item.onmouseout = function () {
          this.style.background = "rgba(255,255,255,0.03)";
          this.style.transform = "translateX(0)";
        };

        item.innerHTML = `
                <strong style="color: #e2e8f0;">${game.gameName}</strong>
                <span style="color: #38bdf8; font-weight: bold; font-family: monospace;">${formatTime(game.timeMs)}</span>
            `;

        // Make it clickable to show game info
        item.addEventListener("click", () => {
          showGameInfoModal(game.gameName);
        });

        historyList.appendChild(item);
      });
    } else {
      historyList.innerHTML =
        '<p style="color:#94a3b8; text-align:center;">No games played yet.</p>';
    }

    historySection.appendChild(historyTitle);
    historySection.appendChild(historyList);

    // --- APPEND ORDER ---
    content.appendChild(closeBtn);
    content.appendChild(header);
    if (awardsSection) {
      content.appendChild(awardsSection);
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

  const sInput = $("players-search");
  const sClearBtn = $("players-search-clear");
  if (sInput) {
    // Initial visibility check (in case of browser autofill/refresh)
    if (sClearBtn && sInput.value.trim() !== "") {
      sClearBtn.classList.remove("hidden");
    }

    sInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderPlayers();
      if (sClearBtn) {
        if (searchQuery.trim() !== "") {
          sClearBtn.classList.remove("hidden");
        } else {
          sClearBtn.classList.add("hidden");
        }
      }
    });

    if (sClearBtn) {
      sClearBtn.addEventListener("click", () => {
        sInput.value = "";
        searchQuery = "";
        sClearBtn.classList.add("hidden");
        sInput.dispatchEvent(new Event("input")); // Triggers renderPlayers()
        sInput.focus();
      });
    }
  }
  const sSort = $("players-sort");
  if (sSort)
    sSort.addEventListener("change", (e) => {
      playersSortOption = e.target.value;
      renderPlayers();
    });

  (async () => {
    if (AUTH.isLoggedIn()) {
      if (window.__moderatorStatusPromise)
        ({ isModerator } = await window.__moderatorStatusPromise);
      else isModerator = await AUTH.checkModerator();
      try {
        localStorage.setItem("isModerator", isModerator ? "true" : "false");
      } catch (e) {}
      try {
        renderPlayers();
      } catch (e) {}
    }
  })();

  loadData();
  setInterval(loadData, 10000);

  document.addEventListener("DOMContentLoaded", () => {
    loadData();
  });
})();
