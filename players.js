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
    if (playersSortOption === "az")
      pStats.sort((a, b) => a.name.localeCompare(b.name));
    else if (playersSortOption === "za")
      pStats.sort((a, b) => b.name.localeCompare(a.name));
    else if (playersSortOption === "games-played")
      pStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    else if (playersSortOption === "total-time")
      pStats.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
    else if (playersSortOption === "most-claims")
      pStats.sort((a, b) => b.totalClaims - a.totalClaims);
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

  function showPlayerModal(stat) {
    const ex = document.getElementById("player-detail-modal");
    if (ex) ex.remove();
    const modal = document.createElement("div");
    modal.id = "player-detail-modal";
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); z-index: 1000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(4px);`;
    const content = document.createElement("div");
    content.style.cssText = `background: rgba(30, 41, 59, 0.98); backdrop-filter: blur(10px); padding: 30px; border-radius: 16px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; position: relative; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5);`;
    const cBtn = document.createElement("button");
    cBtn.innerHTML = "&times;";
    cBtn.style.cssText = `position: absolute; top: 15px; right: 20px; background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer;`;
    cBtn.onclick = () => modal.remove();
    const header = document.createElement("div");
    header.style.cssText = `display: flex; align-items: center; gap: 20px; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 20px;`;
    const av = stat.pfpLink
      ? `<img src="${stat.pfpLink}" alt="${stat.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #38bdf8; background: #222;">`
      : `<div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(56,189,248,0.2); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-user" style="font-size: 1.5rem; color: #38bdf8;"></i></div>`;
    const info = document.createElement("div");
    info.style.cssText = `display: flex; flex-direction: column; gap: 4px;`;
    const nRow = document.createElement("div");
    nRow.style.cssText = `display: flex; align-items: center; gap: 8px; flex-wrap: wrap;`;
    const h2 = document.createElement("h2");
    h2.textContent = stat.name;
    h2.style.cssText = `margin: 0; font-size: 1.25rem; color: #e2e8f0;`;
    const pObj = players.find((p) => p.name === stat.name),
      pPronouns = pObj && pObj.pronouns ? pObj.pronouns.trim() : "";
    if (pPronouns) {
      const b = document.createElement("span");
      b.textContent = pPronouns;
      b.style.cssText = `display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background-color: #38bdf822; color: #38bdf8; border: 1px solid #38bdf8;`;
      nRow.appendChild(h2);
      nRow.appendChild(b);
    } else {
      nRow.appendChild(h2);
    }
    const pRoles = pObj && pObj.roles ? pObj.roles : [],
      mRoles = document.createElement("div");
    mRoles.style.cssText = `display: flex; flex-wrap: wrap; gap: 6px;`;
    pRoles.forEach((rN) => {
      const r = pageAvailableRoles.find((r) => r.name === rN);
      if (r) {
        const b = document.createElement("span");
        b.textContent = r.name;
        b.style.cssText = `display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; background-color: ${r.color}33; color: ${r.color}; border: 1px solid ${r.color};`;
        const d = document.createElement("span");
        d.style.cssText = `display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${r.color};`;
        b.prepend(d);
        mRoles.appendChild(b);
      }
    });
    info.appendChild(nRow);
    if (mRoles.children.length > 0) info.appendChild(mRoles);

    // AWARDS RENDERING LOGIC
    const pAwardsC = pObj && pObj.awards ? pObj.awards : [];
    if (pAwardsC.length > 0) {
      const bRow = document.createElement("div");
      bRow.style.cssText = `display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;`;
      pAwardsC.forEach((aE) => {
        let aD = null;
        if (typeof aE === "string")
          aD = availableAwards.find((a) => a.name === aE) || { name: aE };
        else if (aE && typeof aE === "object") aD = aE;
        else aD = { name: String(aE) };
        const badge = document.createElement("span");
        badge.title = aD.description || aD.name;
        badge.style.cssText = `display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:9999px; background: rgba(255,255,255,0.03); color:#e2e8f0; font-size:0.85rem;`;
        const iSpan = document.createElement("span");
        iSpan.style.cssText = `min-width:18px; display:inline-flex; align-items:center; justify-content:center;`;
        const icon = aD.icon || "🏆";
        if (typeof icon === "string" && icon.startsWith("fa-"))
          iSpan.innerHTML = `<i class="fa-solid ${icon}" style="color:${aD.color || "#38bdf8"};"></i>`;
        else iSpan.textContent = icon;
        const nSpan = document.createElement("span");
        nSpan.textContent = aD.name;
        nSpan.style.cssText = `color:#94a3b8; font-weight:600;`;
        badge.appendChild(iSpan);
        badge.appendChild(nSpan);
        bRow.appendChild(badge);
      });
      info.appendChild(bRow);
    }

    const pBio = pObj && pObj.bio ? pObj.bio.trim() : "";
    if (pBio) {
      const bD = document.createElement("div");
      bD.style.cssText = `margin-top: 4px; overflow-wrap: anywhere; word-break: break-word;`;
      const bT = document.createElement("span");
      bT.textContent = pBio;
      bT.style.cssText = `color: #94a3b8; font-size: 0.9rem;`;
      bD.appendChild(bT);
      info.appendChild(bD);
    }
    const pDisc = pObj && pObj.discord ? pObj.discord.trim() : "";
    if (pDisc) {
      const dD = document.createElement("div");
      dD.style.cssText = `display: flex; align-items: center; gap: 6px; margin-top: 4px;`;
      const dI = document.createElement("i");
      dI.className = "fa-brands fa-discord";
      dI.style.cssText = `color: #5865F2;`;
      const dT = document.createElement("span");
      dT.textContent = pDisc;
      dT.style.cssText = `color: #5865F2; font-size: 0.9rem;`;
      dD.appendChild(dI);
      dD.appendChild(dT);
      info.appendChild(dD);
    }
    header.innerHTML = av;
    header.appendChild(info);
    const rank = leaderboardPositions[stat.name] || null;
    if (rank) {
      const rD = document.createElement("div");
      rD.style.cssText = `margin-left: auto; display: flex; flex-direction: column; align-items: center; gap: 4px;`;
      const rL = document.createElement("div");
      rL.textContent = "Rank";
      rL.style.cssText = `font-size: 0.75rem; color: #94a3b8;`;
      const rV = document.createElement("div");
      rV.textContent = `#${rank}`;
      rV.style.cssText = `font-size: 1.1rem; font-weight: 700; color: #38bdf8;`;
      rD.appendChild(rL);
      rD.appendChild(rV);
      header.appendChild(rD);
    }

    const sGrid = document.createElement("div");
    sGrid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin-bottom: 25px;`;
    [
      { l: "Games Played", v: stat.gamesPlayed },
      { l: "Total Time", v: formatTime(stat.totalTimeMs) },
      { l: "Total Claims", v: stat.totalClaims }
    ].forEach((s) => {
      const b = document.createElement("div");
      b.style.cssText = `background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;`;
      const v = document.createElement("div");
      v.style.cssText = `font-size: 1.5rem; font-weight: bold; color: #38bdf8;`;
      v.textContent = s.v;
      const l = document.createElement("div");
      l.style.cssText = `font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; margin-top: 5px;`;
      l.textContent = s.l;
      b.appendChild(v);
      b.appendChild(l);
      sGrid.appendChild(b);
    });

    const hSec = document.createElement("div");
    hSec.style.cssText = `margin-top: 20px;`;
    const hTit = document.createElement("h3");
    hTit.textContent = "Games Played";
    hTit.style.cssText = `border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 15px;`;
    const hList = document.createElement("div");
    hList.style.cssText = `display: flex; flex-direction: column; gap: 10px;`;
    if (stat.gameHistory.length > 0) {
      stat.gameHistory.forEach((g) => {
        const i = document.createElement("div");
        i.style.cssText = `background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; border-left: 3px solid #38bdf8; font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center;`;
        i.innerHTML = `<strong style="color: #e2e8f0;">${g.gameName}</strong><span style="color: #38bdf8; font-weight: bold; font-family: monospace;">${formatTime(g.timeMs)}</span>`;
        hList.appendChild(i);
      });
    } else {
      hList.innerHTML = `<p style="color:#94a3b8; text-align:center;">No games played yet.</p>`;
    }
    hSec.appendChild(hTit);
    hSec.appendChild(hList);
    // --- UPDATED APPEND ORDER ---
    content.appendChild(cBtn);
    content.appendChild(header);
    if (awardsSection) {
      content.appendChild(awardsSection); // Moved to be directly under the main profile header
    }
    content.appendChild(sGrid);
    content.appendChild(hSec);
    
    modal.appendChild(content);

    // Close on outside click
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
  }

  const sInput = $("players-search");
  if (sInput)
    sInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderPlayers();
    });
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
