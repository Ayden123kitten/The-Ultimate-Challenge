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
      card.innerHTML = `<div style="position: relative;">${av}${inlineEditMode && effMod ? `<button class="inline-edit-btn" style="position: absolute; top: -5px; right: -5px; background: #1e293b; border: 2px solid #38bdf8; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 20;" title="Edit Player"><i class="fa-solid fa-gear" style="color: #38bdf8;"></i></button>` : ""}${pRank ? `<div title="Leaderboard Position" style="position: absolute; bottom: -8px; right: -8px; background: rgba(17,24,39,0.95); border: 2px solid #0ea5e9; color: #0ea5e9; padding: 4px 6px; border-radius: 9999px; font-weight: 700; font-size: 0.75rem; z-index: 10;">#${pRank}</div>` : ""}</div>${mIcon ? `<div style="position: absolute; top: -5px; left: -5px; background: #1e293b; border: 2px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; z-index: 10;">${mIcon}</div>` : ""}<div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; overflow: hidden;"><h2 style="margin: 0; font-size: 0.95rem; color: #e2e8f0; cursor: pointer; text-decoration: underline; text-underline-offset: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${stat.name} ${isSel ? '<span style="font-size: 0.65rem; color: #38bdf8;">(You)</span>' : ""}</h2></div>`;
      if (inlineEditMode && effMod) {
        const eBtn = card.querySelector(".inline-edit-btn");
        if (eBtn)
          eBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPlayerInlineEditor(stat.name, e);
          });
      }
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
    content.appendChild(cBtn);
    content.appendChild(header);
    content.appendChild(sGrid);
    content.appendChild(hSec);
    modal.appendChild(content);
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

  async function openPlayerInlineEditor(playerName, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const player = players.find((p) => p.name === playerName);
    if (!player)
      return alert("Error: Could not find player data for " + playerName);
    if (!Array.isArray(availableAwards)) availableAwards = [];
    if (!Array.isArray(pageAvailableRoles)) pageAvailableRoles = [];
    let modal = document.getElementById("moderator-modal"),
      content = document.getElementById("moderator-panel-content");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "moderator-modal";
      modal.className =
        "fixed inset-0 bg-black/70 z-50 hidden flex items-center justify-center p-4";
      modal.onclick = function (e) {
        if (e.target.id === "moderator-modal") closeModeratorModal();
      };
      document.body.appendChild(modal);
      const panel = document.createElement("div");
      panel.className =
        "bg-slate-800 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto";
      panel.onclick = function (e) {
        e.stopPropagation();
      };
      const header = document.createElement("div");
      header.className = "flex justify-between items-center mb-4";
      header.innerHTML = `<h2 class="text-xl font-bold text-white">Moderation Panel</h2><button onclick="closeModeratorModal()" class="text-slate-400 hover:text-white text-2xl">&times;</button>`;
      panel.appendChild(header);
      content = document.createElement("div");
      content.id = "moderator-panel-content";
      panel.appendChild(content);
      modal.appendChild(panel);
    }
    content = document.getElementById("moderator-panel-content") || content;
    let permissions = { manageAwards: false, manageRoles: false };
    try {
      permissions = await AUTH.getPermissions();
    } catch (err) {}
    try {
      await loadRoles();
    } catch (e) {}

    let rolesHtml = "";
    if (pageAvailableRoles.length > 0) {
      rolesHtml =
        '<div class="space-y-2"><label class="text-sm font-semibold text-slate-300">Assign/Remove Roles</label>';
      pageAvailableRoles.forEach((r) => {
        const isC =
          player.roles && player.roles.includes(r.name) ? "checked" : "";
        rolesHtml += `<div class="flex items-center gap-2"><input type="checkbox" id="inline-role-${r.name}" ${isC} class="inline-edit-role-checkbox w-4 h-4 rounded cursor-pointer"><label for="inline-role-${r.name}" class="cursor-pointer flex items-center gap-2"><span style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:700; background-color:${r.color}33; color:${r.color}; border:1px solid ${r.color};"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background-color:${r.color};"></span><span style="color:inherit;">${r.name}</span></span></label></div>`;
      });
      rolesHtml += "</div>";
    }

    let createRoleHtml = "";
    if (permissions.manageRoles) {
      createRoleHtml = `<div class="mt-3"><label class="text-sm font-semibold text-slate-300">Create New Role</label><div class="mt-2 space-y-2"><div class="flex gap-2"><input type="text" id="inline-new-role-name" placeholder="Role Name" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white flex-1"><input type="color" id="inline-new-role-color" value="#ff0000" class="bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-2 h-10 w-12"><button onclick="addRoleInline(${JSON.stringify(player.name)})" id="inline-add-role-btn" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg whitespace-nowrap">Add Role</button></div></div><div class="mt-3"><h5 class="text-xs font-semibold text-slate-400 mb-2">Live Preview</h5><div id="inline-role-preview" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700"><span class="text-sm text-slate-400">Start typing to see preview...</span></div></div><div id="inline-roles-edit-list" class="space-y-2 max-h-44 overflow-y-auto mt-2"></div></div>`;
    }

    content.innerHTML = `<div class="space-y-6"><div class="glass rounded-lg p-4"><h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-user text-ap-accent mr-2"></i>Edit Player: ${player.name}</h3><div id="inline-edit-player-form-container" class="space-y-4"><input type="text" id="inline-edit-player-name" placeholder="Player Name" value="${player.name}" disabled class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full opacity-50"><input type="url" id="inline-edit-player-pfp" placeholder="Profile Picture URL" value="${player.pfp_link || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full"><textarea id="inline-edit-player-bio" placeholder="Bio" rows="3" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">${player.bio || ""}</textarea><input type="text" id="inline-edit-player-pronouns" placeholder="Pronouns" value="${player.pronouns || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full"><input type="text" id="inline-edit-player-discord" placeholder="Discord Username" value="${player.discord || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full"></div><div class="border-t border-slate-700 my-4"></div>${permissions.manageRoles || pageAvailableRoles.length > 0 ? `<div class="mt-4"><h4 class="text-sm font-semibold text-slate-300 mb-2">Manage Roles</h4></div>` : ""}${createRoleHtml ? `<div class="mt-4">${createRoleHtml}</div>` : ""}${rolesHtml ? `<div class="mt-4">${rolesHtml}</div>` : ""}${
      permissions.manageAwards
        ? `<div id="inline-awards-management" class="mt-4 border-t border-slate-700 pt-4"><div class="mt-4"><label class="text-sm font-semibold text-slate-300">Create New Award</label><div class="mt-2 space-y-3"><div class="grid grid-cols-1 md:grid-cols-2 gap-2"><input id="inline-new-award-name" type="text" placeholder="Award Name" class="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white"><input id="inline-new-award-icon" type="text" placeholder="Icon (emoji or fa-*)" class="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white"></div><textarea id="inline-new-award-desc" rows="2" placeholder="Description" class="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white w-full resize-y min-h-[3rem]"></textarea><div class="mt-3 glass rounded-lg p-3"><h5 class="text-xs font-semibold text-slate-400 mb-2">Live Preview</h5><div id="inline-award-preview" class="w-full p-2 rounded bg-slate-800/50 border border-slate-700 text-sm text-slate-400 flex items-center gap-3"><span id="inline-award-preview-icon" class="text-2xl w-8 text-center"></span><div><div id="inline-award-preview-name" class="font-bold text-white">Award Name</div><div id="inline-award-preview-desc" class="text-xs text-slate-400">Start typing to see preview...</div></div></div></div><div class="mt-2 flex gap-2"><button onclick="addNewAward(${JSON.stringify(player.name).replace(/'/g, "\\'")})" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg w-full">Create Award</button></div></div></div><h4 class="text-sm font-semibold text-slate-300 mb-2 mt-4">Manage Awards</h4><div id="inline-awards-list" class="mt-2 space-y-2">${(availableAwards || []).length > 0 ? (availableAwards || []).map((a) => `<div class="flex items-center justify-between gap-2 bg-slate-800/40 p-2 rounded"><div class="flex items-center gap-3">${a.icon && a.icon.startsWith("fa-") ? `<i class="fa-solid ${a.icon}" style="color: ${a.color || "#38bdf8"};"></i>` : `<span style="font-size:1.2rem;">${a.icon || "🏆"}</span>`}<div style="min-width:0;"><div style="color:#e2e8f0; font-weight:700;">${a.name}</div><div style="color:#94a3b8; font-size:0.85rem;">${a.description || ""}</div></div></div><div style="display:flex; gap:8px;"><button onclick="prefillAwardForEdit(${JSON.stringify(a).replace(/'/g, "\\'")})" class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm">Edit</button><button onclick="promptDeleteAward(${JSON.stringify(a.name).replace(/'/g, "\\'")})" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">Delete</button></div></div>`).join("") : '<div class="text-slate-500">No awards defined.</div>'}</div>${
            (availableAwards || []).length > 0
              ? `<div class="mt-4"><label class="text-sm font-semibold text-slate-300 block">Assign Awards (Checkboxes)</label><div class="mt-2 space-y-2">${(
                  availableAwards || []
                )
                  .map((award) => {
                    const hasA =
                      player.awards &&
                      player.awards.some((a) =>
                        typeof a === "string"
                          ? a === award.name
                          : a.name === award.name
                      );
                    const isC = hasA ? "checked" : "";
                    return `<div class="flex items-center gap-2"><input type="checkbox" id="inline-award-${award.name}" ${isC} class="inline-edit-award-checkbox w-4 h-4 rounded cursor-pointer"><label for="inline-award-${award.name}" class="cursor-pointer flex items-center gap-2">${award.icon && award.icon.startsWith("fa-") ? `<i class="fa-solid ${award.icon}" style="color: ${award.color || "#38bdf8"};"></i>` : `<span style="font-size:1.2rem;">${award.icon || "🏆"}</span>`}<span style="color: #e2e8f0; font-size: 0.875rem;">${award.name}</span></label></div>`;
                  })
                  .join("")}</div></div>`
              : ""
          }</div>`
        : ""
    }${permissions.manageAwards ? `<div class="mt-4 border-t border-slate-700 pt-4"><h4 class="text-sm font-semibold text-slate-300 mb-2">Assign/Remove Awards (Dropdown)</h4><select id="inline-award-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-2"><option value="">Select an award...</option>${(availableAwards || []).map((a) => `<option value='${JSON.stringify({ name: a.name, icon: a.icon || "", description: a.description || "" }).replace(/'/g, "\\'")}'>${a.icon ? (a.icon.startsWith("fa-") ? "" : a.icon + " ") : ""}${a.name}</option>`).join("")}</select><div class="flex gap-2"><button onclick="assignAwardInline('add', '${player.name}')" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg flex-1">Assign Award</button><button onclick="assignAwardInline('remove', '${player.name}')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex-1">Remove Award</button></div></div>` : ""}<div class="flex gap-2 mt-4"><button onclick="saveInlineEditedPlayer(${JSON.stringify(player.name)})" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg flex-1">Save Changes</button><button onclick="closeModeratorModal()" class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg flex-1">Cancel</button></div></div><div class="glass rounded-lg p-4"><h4 class="text-sm font-semibold text-slate-300 mb-3">Live Preview</h4><div id="inline-edit-player-preview" class="glass rounded-xl p-4 flex flex-col items-center gap-3"></div></div></div>`;
    modal.classList.remove("hidden");
    try {
      populateInlineRolesList(player.name);
    } catch (e) {}
    try {
      attachInlineRolePreviewListeners();
      attachInlineAwardPreviewListeners();
    } catch (e) {}
    setupInlinePlayerPreview(player);
  }

  function setupInlinePlayerPreview(originalPlayer) {
    const inputs = [
      "inline-edit-player-pfp",
      "inline-edit-player-bio",
      "inline-edit-player-pronouns",
      "inline-edit-player-discord"
    ];
    function updatePreview() {
      const sRoles = [];
      document
        .querySelectorAll(".inline-edit-role-checkbox:checked")
        .forEach((cb) => sRoles.push(cb.id.replace("inline-role-", "")));
      const pP = {
        ...originalPlayer,
        pfp_link: $("inline-edit-player-pfp").value || originalPlayer.pfp_link,
        bio: $("inline-edit-player-bio").value,
        pronouns: $("inline-edit-player-pronouns").value,
        discord: $("inline-edit-player-discord").value,
        roles: sRoles
      };
      renderPlayerPreview(pP, "inline-edit-player-preview");
    }
    inputs.forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", updatePreview);
    });
    document
      .querySelectorAll(".inline-edit-role-checkbox")
      .forEach((cb) => cb.addEventListener("change", updatePreview));
    document
      .querySelectorAll(".inline-edit-award-checkbox")
      .forEach((cb) => cb.addEventListener("change", updatePreview));
    updatePreview();
  }

  function renderPlayerPreview(player, containerId) {
    const container = $(containerId);
    if (!container) return;
    const allEmpty =
      !(player && player.name && player.name.trim()) &&
      !(player && player.pfp_link && player.pfp_link.trim()) &&
      !(player && player.bio && player.bio.trim()) &&
      !(player && player.pronouns && player.pronouns.trim()) &&
      !(player && player.discord && player.discord.trim());
    if (allEmpty) {
      container.innerHTML = `<div class="text-center text-slate-400 text-sm">Start typing to see preview...</div>`;
      return;
    }
    const av =
      player.pfp_link && player.pfp_link.trim() !== ""
        ? `<img src="${player.pfp_link}" alt="${player.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #38bdf8; background: #222;">`
        : `<div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(56,189,248,0.2); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-user" style="font-size: 1.5rem; color: #38bdf8;"></i></div>`;
    let nRH = `<h2 style="margin: 0; font-size: 1.25rem; color: #e2e8f0;">${player.name || "Player Name"}</h2>`;
    if (player.pronouns && player.pronouns.trim())
      nRH += `<span style="display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background-color: #38bdf822; color: #38bdf8; border: 1px solid #38bdf8; white-space: nowrap;">${player.pronouns}</span>`;
    let rH = "";
    const pRoles = player.roles || [];
    if (pRoles.length > 0) {
      rH =
        '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">';
      pRoles.forEach((rN) => {
        const r = pageAvailableRoles.find((r) => r.name === rN);
        if (r)
          rH += `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; background-color: ${r.color}33; color: ${r.color}; border: 1px solid ${r.color};"><span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${r.color};"></span>${r.name}</span>`;
      });
      rH += "</div>";
    }
    let aH = "";
    const pAwards = player.awards || [];
    if (pAwards.length > 0) {
      aH =
        '<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">';
      pAwards.forEach((aE) => {
        let aD = null;
        if (typeof aE === "string")
          aD = availableAwards.find((a) => a.name === aE) || { name: aE };
        else if (aE && typeof aE === "object") aD = aE;
        else aD = { name: String(aE) };
        const icon = aD.icon || "🏆";
        let iH = "";
        if (typeof icon === "string" && icon.startsWith("fa-"))
          iH = `<i class="fa-solid ${icon}" style="color:${aD.color || "#38bdf8"};"></i>`;
        else iH = icon;
        aH += `<span title="${aD.description || aD.name}" style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:9999px; background: rgba(255,255,255,0.03); color:#e2e8f0; font-size:0.85rem;"><span style="min-width:18px; display:inline-flex; align-items:center; justify-content:center;">${iH}</span><span style="color:#94a3b8; font-weight:600;">${aD.name}</span></span>`;
      });
      aH += "</div>";
    }
    let bH = "";
    if (player.bio && player.bio.trim())
      bH = `<div style="margin-top: 4px; overflow-wrap: anywhere; word-break: break-word;"><span style="color: #94a3b8; font-size: 0.9rem;">${player.bio}</span></div>`;
    let dH = "";
    if (player.discord && player.discord.trim())
      dH = `<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;"><i class="fa-brands fa-discord" style="color: #5865F2;"></i><span style="color: #5865F2; font-size: 0.9rem;">${player.discord}</span></div>`;
    container.innerHTML = `<div style="display: flex; align-items: center; gap: 20px; width: 100%;"><div style="flex-shrink: 0;">${av}</div><div style="display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;"><div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">${nRH}</div>${rH}${aH}${bH}${dH}</div></div>`;
  }

  async function saveInlineEditedPlayer(playerName) {
    const sRoles = [];
    document
      .querySelectorAll(".inline-edit-role-checkbox:checked")
      .forEach((cb) => sRoles.push(cb.id.replace("inline-role-", "")));
    const sAwards = [];
    document
      .querySelectorAll(".inline-edit-award-checkbox:checked")
      .forEach((cb) => sAwards.push(cb.id.replace("inline-award-", "")));
    const pData = {
      name: playerName,
      pfp_link: $("inline-edit-player-pfp").value.trim(),
      bio: $("inline-edit-player-bio").value.trim(),
      pronouns: $("inline-edit-player-pronouns").value.trim(),
      discord: $("inline-edit-player-discord").value.trim(),
      roles: sRoles,
      awards: sAwards
    };
    try {
      const res = await fetch("/api/moderator-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
        body: JSON.stringify({ action: "updatePlayer", playerData: pData })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      alert("Player updated successfully!");
      closeModeratorModal();
      loadData();
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function assignAwardToPlayer(
    action,
    playerName,
    awardName,
    icon = "",
    description = ""
  ) {
    try {
      const res = await fetch("/api/manage-awards", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
        body: JSON.stringify({
          action: "assignAward",
          assignAwardData: { playerName, awardName, action, icon, description }
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || d.message);
      alert(d.message || "Award updated");
      await loadData();
      openPlayerInlineEditor(playerName);
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function assignAwardInline(action, playerName) {
    const sEl = document.getElementById("inline-award-select");
    if (!sEl || !sEl.value) return alert("Please select an award");
    try {
      const aD = JSON.parse(sEl.value);
      await assignAwardToPlayer(
        action,
        playerName,
        aD.name,
        aD.icon,
        aD.description
      );
      sEl.value = "";
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  async function addNewAward(playerName) {
    const name = (
        document.getElementById("inline-new-award-name") || { value: "" }
      ).value.trim(),
      icon = (
        document.getElementById("inline-new-award-icon") || { value: "" }
      ).value.trim(),
      description = (
        document.getElementById("inline-new-award-desc") || { value: "" }
      ).value.trim();
    if (!name) return alert("Award name is required");
    try {
      const res = await fetch("/api/manage-awards", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
        body: JSON.stringify({
          action: "addAward",
          awardData: { name, icon, description }
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || d.message);
      alert(d.message || "Award added");
      await loadData();
      openPlayerInlineEditor(playerName);
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  let editingRoleOriginalInline = null;
  async function addRoleInline(currentPlayerName) {
    const rNEl = document.getElementById("inline-new-role-name") || {
        value: ""
      },
      rCEl = document.getElementById("inline-new-role-color") || {
        value: "#ff0000"
      };
    const rName = rNEl.value.trim(),
      rColor = rCEl.value || "#ff0000";
    if (!rName) return alert("Please enter a role name");
    try {
      const payload = editingRoleOriginalInline
        ? {
            action: "updateRole",
            originalName: editingRoleOriginalInline,
            roleData: { name: rName, color: rColor }
          }
        : { action: "addRole", roleData: { name: rName, color: rColor } };
      const res = await fetch("/api/moderator-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
        body: JSON.stringify(payload)
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || d.message);
      alert(
        d.message || (editingRoleOriginalInline ? "Role updated" : "Role added")
      );
      editingRoleOriginalInline = null;
      await loadRoles();
      populateInlineRolesList(currentPlayerName);
      openPlayerInlineEditor(currentPlayerName);
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  function populateInlineRolesList(currentPlayerName) {
    const list = document.getElementById("inline-roles-edit-list");
    if (!list) return;
    list.innerHTML = "";
    if (!pageAvailableRoles || pageAvailableRoles.length === 0) {
      list.innerHTML = '<div class="text-slate-500">No roles defined.</div>';
      return;
    }
    pageAvailableRoles
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((r) => {
        const item = document.createElement("div");
        item.className =
          "flex items-center justify-between gap-2 bg-slate-800/40 p-2 rounded";
        item.innerHTML = `<div class="flex items-center gap-3"><span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:12px;font-size:0.8rem;font-weight:700;background:${r.color}33;color:${r.color};border:1px solid ${r.color};"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${r.color};"></span><span style="color:inherit;">${r.name}</span></span></div><div style="display:flex;gap:8px;"><button class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm" onclick='prefillInlineRoleForEdit(${JSON.stringify(r)}, ${JSON.stringify(currentPlayerName)})'>Edit</button><button class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm" onclick='promptDeleteRoleInline(${JSON.stringify(r.name)}, ${JSON.stringify(currentPlayerName)})'>Delete</button></div>`;
        list.appendChild(item);
      });
  }

  function prefillInlineRoleForEdit(role, currentPlayerName) {
    const nI = document.getElementById("inline-new-role-name"),
      cI = document.getElementById("inline-new-role-color");
    if (nI && cI) {
      nI.value = role.name;
      cI.value = role.color || "#ff0000";
      nI.focus();
      editingRoleOriginalInline = role.name;
      const b = document.getElementById("inline-add-role-btn");
      if (b) b.textContent = "Save";
    }
  }

  function promptDeleteRoleInline(roleName, currentPlayerName) {
    if (
      confirm(
        `Delete role "${roleName}"? This will remove it from all players.`
      )
    )
      deleteRoleInlineFromPlayers(roleName, currentPlayerName);
  }

  async function deleteRoleInlineFromPlayers(roleName, currentPlayerName) {
    try {
      const res = await fetch("/api/moderator-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
        body: JSON.stringify({ action: "deleteRole", roleName })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || d.message);
      alert(d.message || "Role deleted");
      await loadRoles();
      populateInlineRolesList(currentPlayerName);
      openPlayerInlineEditor(currentPlayerName);
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  function updateInlineRolePreview() {
    const name = (
        document.getElementById("inline-new-role-name") || { value: "" }
      ).value.trim(),
      color =
        (
          document.getElementById("inline-new-role-color") || {
            value: "#ff0000"
          }
        ).value || "#ff0000";
    const preview = document.getElementById("inline-role-preview");
    if (!preview) return;
    if (!name) {
      preview.style.color = "";
      preview.style.borderColor = "";
      preview.innerHTML = `<div class="text-center text-slate-400 text-sm">Start typing to see preview...</div>`;
      return;
    }
    preview.style.color = "";
    preview.style.borderColor = "";
    preview.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 0.875rem; font-weight:700; background-color: ${color}33; color: ${color}; border: 1px solid ${color};"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span><span style="color:inherit;">${escapeHtml(name)}</span></span>`;
  }

  function attachInlineRolePreviewListeners() {
    const name = document.getElementById("inline-new-role-name"),
      color = document.getElementById("inline-new-role-color");
    if (name) {
      name.removeEventListener("input", updateInlineRolePreview);
      name.addEventListener("input", updateInlineRolePreview);
    }
    if (color) {
      color.removeEventListener("input", updateInlineRolePreview);
      color.addEventListener("input", updateInlineRolePreview);
    }
    updateInlineRolePreview();
  }

  function updateInlineAwardPreview() {
    const name = (
        document.getElementById("inline-new-award-name") || { value: "" }
      ).value.trim(),
      icon = (
        document.getElementById("inline-new-award-icon") || { value: "" }
      ).value.trim(),
      desc = (
        document.getElementById("inline-new-award-desc") || { value: "" }
      ).value.trim();
    const iEl = document.getElementById("inline-award-preview-icon"),
      nEl = document.getElementById("inline-award-preview-name"),
      dEl = document.getElementById("inline-award-preview-desc");
    if (!nEl || !iEl || !dEl) return;
    if (!name && !icon && !desc) {
      iEl.style.display = "none";
      nEl.style.display = "none";
      dEl.textContent = "Start typing to see preview...";
      return;
    }
    iEl.style.display = "";
    nEl.style.display = "";
    nEl.textContent = name || "Award Name";
    dEl.textContent = desc || "Start typing to see preview...";
    if (icon && icon.startsWith("fa-"))
      iEl.innerHTML = `<i class="fa-solid ${escapeHtml(icon)}"></i>`;
    else iEl.textContent = icon || "";
  }

  function attachInlineAwardPreviewListeners() {
    const name = document.getElementById("inline-new-award-name"),
      icon = document.getElementById("inline-new-award-icon"),
      desc = document.getElementById("inline-new-award-desc");
    if (name) {
      name.removeEventListener("input", updateInlineAwardPreview);
      name.addEventListener("input", updateInlineAwardPreview);
    }
    if (icon) {
      icon.removeEventListener("input", updateInlineAwardPreview);
      icon.addEventListener("input", updateInlineAwardPreview);
    }
    if (desc) {
      desc.removeEventListener("input", updateInlineAwardPreview);
      desc.addEventListener("input", updateInlineAwardPreview);
    }
    updateInlineAwardPreview();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function closeModeratorModal() {
    const modal = document.getElementById("moderator-modal");
    if (modal) modal.classList.add("hidden");
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadData();
  });

  try {
    window.openPlayerInlineEditor = openPlayerInlineEditor;
    window.saveInlineEditedPlayer = saveInlineEditedPlayer;
    window.closeModeratorModal = closeModeratorModal;
    window.assignAwardToPlayer = assignAwardToPlayer;
    window.assignAwardInline = assignAwardInline;
    window.addNewAward = addNewAward;
    window.addRoleInline = addRoleInline;
    window.prefillInlineRoleForEdit = prefillInlineRoleForEdit;
    window.promptDeleteRoleInline = promptDeleteRoleInline;
    window.deleteRoleInlineFromPlayers = deleteRoleInlineFromPlayers;
    window.populateInlineRolesList = populateInlineRolesList;
  } catch (e) {}
})();
