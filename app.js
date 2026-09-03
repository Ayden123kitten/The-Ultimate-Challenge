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
let settings = {};
let cheesetrackerData = {};
// currentPlayer now comes from AUTH (requires signup/login), not a freely-typed name.
let currentPlayer = AUTH.getName();

const $ = (id) => document.getElementById(id);

function formatTime(ms) {
  if (!ms || ms < 0) return "0:00:00";
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
let editingAwardOriginal = null;

async function deleteAwardInline(awardName) {
  if (!confirm(`Delete award "${awardName}"? This will remove it from all players.`)) return;
  try {
    const res = await fetch('/api/manage-awards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
      body: JSON.stringify({ action: 'deleteAward', awardName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Failed to delete award');
    alert(data.message || 'Award deleted');
    await loadAwards();
    await loadData();
    openModeratorModal();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function loadCheesetrackerData() {
  if (!settings.cheesetracker_url) return;

  try {
    const response = await fetch(`/api/cheesetracker-data?t=${Date.now()}`);
    if (response.ok) {
      cheesetrackerData = await response.json();
    }
  } catch (error) {
    console.error("Failed to load Cheesetracker data:", error);
  }
}

// ==========================================
// DATA FETCHING
// ==========================================
async function loadData() {
  try {
    const baseRawUrl = `https://raw.githubusercontent.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/${CONFIG.BRANCH}/data`;

    const [gamesRes, playersRes, settingsRes] = await Promise.all([
      fetch(`/api/get-data?type=games&t=${Date.now()}`), // ✅ Fixed
      fetch(`/api/get-data?type=players&t=${Date.now()}`), // ✅ Fixed
      fetch(`${baseRawUrl}/settings.json?t=${Date.now()}`)
    ]);

    if (!gamesRes.ok) throw new Error(`Games API: ${gamesRes.status}`);
    if (!playersRes.ok) throw new Error(`Players API: ${playersRes.status}`);
    if (!settingsRes.ok)
      throw new Error(`Settings file: ${settingsRes.status}`);

    games = await gamesRes.json();
    // Ensure every game has a slot_count; default to 1 when missing
    games = games.map((g) => ({
      ...g,
      slot_count: g.slot_count !== undefined ? g.slot_count : 1
    }));
    players = await playersRes.json();
    settings = await settingsRes.json();

    // Load Cheesetracker data after settings are loaded
    await loadCheesetrackerData();

    populatePlayerSelect();
    updateCompletedGamesCount();
    renderGames();
    updateGlobalTimer();
  } catch (err) {
    console.error("Failed to load data:", err);
    $("games-container").innerHTML = `
            <div class="col-span-full text-center text-red-400 p-8">
                <i class="fa-solid fa-circle-exclamation text-4xl mb-4"></i>
                <p class="text-lg font-bold">Error loading games</p>
                <p class="text-sm mt-2">${err.message}</p>
                <p class="text-xs mt-4 text-slate-500">
                    Check that CONFIG in app.js has your correct GitHub username and repo name.
                </p>
            </div>`;
  }
}

function populatePlayerSelect() {
  const currentNameEl = $("current-player-name");

  if (currentNameEl) {
    currentNameEl.textContent = currentPlayer ? currentPlayer : "Not logged in";
  }

  const logoutBtn = $("logout-btn");
  if (logoutBtn) {
    logoutBtn.style.display = currentPlayer ? "inline-flex" : "none";
  }
}

function updateCompletedGamesCount() {
  const totalGames = games.length;
  // Count games as completed if either manually marked or Cheesetracker shows 100%
  const completedGames = games.filter((g) => {
    if (g.completed === true) return true;
    const ctData = cheesetrackerData[g.id] || {};
    const totalChecks = ctData.totalChecks || g.cheesetracker_total_checks || 0;
    const completedChecks =
      ctData.completedChecks || g.cheesetracker_completed_checks || 0;
    return totalChecks > 0 && completedChecks >= totalChecks;
  }).length;
  const countEl = $("total-games-count");
  if (countEl) {
    countEl.textContent = `${completedGames}/${totalGames}`;
  }
}

// ==========================================
// RENDERING
// ==========================================
let searchQuery = "";
let gamesSortOption = "az";
let gamesFilterOption = "all";

function renderGames() {
  const container = $("games-container");
  container.innerHTML = "";

  let filteredGames = [...games];

  // Apply filtering
  if (gamesFilterOption === "in-progress") {
    filteredGames = filteredGames.filter(
      (game) => game.current_player !== null
    );
  } else if (gamesFilterOption === "completed") {
    filteredGames = filteredGames.filter((game) => {
      if (game.completed === true) return true;
      const ctData = cheesetrackerData[game.id] || {};
      const totalChecks =
        ctData.totalChecks || game.cheesetracker_total_checks || 0;
      const completedChecks =
        ctData.completedChecks || game.cheesetracker_completed_checks || 0;
      return totalChecks > 0 && completedChecks >= totalChecks;
    });
  } else if (gamesFilterOption === "core") {
    filteredGames = filteredGames.filter(
      (game) => game.apworld_version === "Core"
    );
  } else if (gamesFilterOption === "custom") {
    filteredGames = filteredGames.filter(
      (game) => game.apworld_version && game.apworld_version !== "Core"
    );
  }

  let sortedGames = filteredGames;

  // Apply sorting
  if (gamesSortOption === "az") {
    sortedGames.sort((a, b) => a.name.localeCompare(b.name));
  } else if (gamesSortOption === "za") {
    sortedGames.sort((a, b) => b.name.localeCompare(a.name));
  } else if (gamesSortOption === "times-claimed") {
    sortedGames.sort((a, b) => {
      const aClaims = a.logs ? a.logs.length : 0;
      const bClaims = b.logs ? b.logs.length : 0;
      return bClaims - aClaims;
    });
  } else if (gamesSortOption === "unique-claims") {
    sortedGames.sort((a, b) => {
      const aPlayers = new Set(a.logs ? a.logs.map((log) => log.player) : []);
      const bPlayers = new Set(b.logs ? b.logs.map((log) => log.player) : []);
      return bPlayers.size - aPlayers.size;
    });
  } else if (gamesSortOption === "total-time") {
    sortedGames.sort((a, b) => b.total_time_ms - a.total_time_ms);
  }

  if (searchQuery.trim() !== "") {
    const query = searchQuery.toLowerCase();
    sortedGames = sortedGames.filter((game) =>
      game.name.toLowerCase().includes(query)
    );
  }

  sortedGames.forEach((game) => {
    const isClaimed = game.current_player !== null;
    const isMyClaim = isClaimed && game.current_player === currentPlayer;

    // Event start settings: if a start time is set and it's in the future,
    // players should not be able to claim games yet.
    const eventStartSet =
      settings.start_time && settings.start_time.trim() !== "";
    const eventNotStarted =
      eventStartSet && Date.now() < new Date(settings.start_time).getTime();

    const canClaim = !isClaimed && currentPlayer !== "" && !eventNotStarted;

    let currentSessionMs = 0;
    if (isClaimed && game.claimed_at) {
      currentSessionMs = Date.now() - game.claimed_at;
    }
    const totalTimeMs = game.total_time_ms + currentSessionMs;

    const hasRules = game.rules && game.rules.trim() !== "";
    const hasCoverImage = game.logo && game.logo.trim() !== "";
    const hasExtraInfo =
      game.extra_information && game.extra_information.trim() !== "";
    const hasApworldVersion =
      game.apworld_version && game.apworld_version.trim() !== "";
    const hasModVersion = game.mod_version && game.mod_version.trim() !== "";
    const showEventTime =
      settings.start_time && settings.start_time.trim() !== "";

    // Cheesetracker data
    const ctData = cheesetrackerData[game.id] || {};
    const totalChecks =
      ctData.totalChecks || game.cheesetracker_total_checks || 0;
    const completedChecks =
      ctData.completedChecks || game.cheesetracker_completed_checks || 0;
    const checkPercentage =
      totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;
    const hasCheesetracker = settings.cheesetracker_url && totalChecks > 0;

    const links = [
      {
        url: game.apworld_link,
        icon: "fa-globe",
        label: `Apworld${hasApworldVersion ? ` (${game.apworld_version === "Core" ? "Core" : "v" + game.apworld_version})` : ""}`
      },
      {
        url: game.mod_link,
        icon: "fa-puzzle-piece",
        label: `Mod${hasModVersion ? ` (${game.mod_version === "Core" ? "" : "v"}${game.mod_version})` : ""}`
      },
      { url: game.mod_setup_guide_link, icon: "fa-book", label: "Setup Guide" },
      { url: game.tracker_link, icon: "fa-map", label: "Tracker" },
      { url: game.game_info_link, icon: "fa-circle-info", label: "Game Info" },
      { url: game.support_link, icon: "fa-circle-question", label: "Support" },
      {
        url: game.save_file_link,
        icon: "fa-download",
        label: "Save File",
        primary: true
      }
    ].filter((l) => l.url && l.url.trim() !== "");

    const card = document.createElement("div");
    card.className =
      "glass rounded-xl p-6 flex flex-col gap-4 transition-all hover:border-ap-accent/50";

    // Slot display: show "No limit" when slot_count is 0; hide when slot_count is 1
    let slotHtml = "";
    if (game.slot_count === 0) {
      slotHtml = `<div class="text-xs text-slate-400 mt-2">No limit</div>`;
    } else if (game.slot_count > 1) {
      slotHtml = `<div class="text-xs text-slate-400 mt-2">${game.slot_count} slots</div>`;
    }

    // Add inline edit button for moderator
    const inlineEditButtonHtml =
      inlineEditMode && isModerator
        ? `
            <button onclick="openGameInlineEditor('${game.id}', event)" class="absolute top-3 right-3 p-2 rounded-lg bg-slate-700/80 hover:bg-ap-accent/80 text-slate-300 hover:text-white transition-all z-10" title="Edit Game">
                <i class="fa-solid fa-gear"></i>
            </button>
        `
        : "";

    card.innerHTML = `
            ${inlineEditButtonHtml}
            <div class="game-card-header">
                ${
                  hasCoverImage
                    ? `
                    <div class="cover-art-container">
                        <img src="${game.logo}" alt="${game.name}"
                             class="cover-art-logo"
                             onerror="this.style.display='none'">
                    </div>
                `
                    : '<div class="cover-art-container"></div>'
                }

                <div class="game-card-title-time-row">
                    <div class="game-card-title">
                        <h2 class="text-xl font-bold text-white">${game.name}</h2>
                        <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${isClaimed ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}">
                            ${isClaimed ? `Playing: ${game.current_player}` : "Available"}
                        </span>
                        ${slotHtml}
                    </div>
                    ${
                      showEventTime
                        ? `
                    <div class="game-card-time">
                        <div class="text-xs text-slate-400 uppercase">Total Time</div>
                        <div class="text-lg font-mono font-bold text-ap-accent">${formatTime(totalTimeMs)}</div>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>

            ${
              hasRules
                ? `
                <div class="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 border border-slate-700 overflow-hidden">
                    <span class="text-ap-accent font-semibold">Rules:</span> <span class="break-words overflow-wrap-anywhere">${game.rules}</span>
                </div>
            `
                : ""
            }

            ${
              hasExtraInfo
                ? `
                <div class="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 border border-slate-700 overflow-hidden">
                    <span class="text-ap-accent font-semibold">Information:</span> <span class="break-words overflow-wrap-anywhere">${game.extra_information}</span>
                </div>
            `
                : ""
            }

            ${
              hasCheesetracker
                ? `
                <div class="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-bold text-slate-400 uppercase">Cheesetracker Progress</span>
                        <span class="text-sm font-mono text-ap-accent">${completedChecks}/${totalChecks} (${checkPercentage}%)</span>
                    </div>
                    <div class="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                        <div class="bg-gradient-to-r from-green-500 to-green-400 h-full transition-all duration-500" style="width: ${checkPercentage}%"></div>
                    </div>
                </div>
            `
                : ""
            }

            ${
              links.length > 0
                document.getElementById("inline-new-award-name") || { value: "" }
                <div class="grid grid-cols-2 gap-2 text-sm min-w-0">
                    ${links.map((link) => renderLink(link.url, link.icon, link.label, link.primary)).join("")}
                document.getElementById("inline-new-award-icon") || { value: "" }
            `
                : ""
                document.getElementById("inline-new-award-desc") || { value: "" }

            <div class="mt-auto">
                alert("Award name is required");
                  isMyClaim
                    ? `
                    <button onclick="unclaimGame('${game.id}', event)" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i class="fa-solid fa-upload"></i> Mark as Done
                const payload = editingAwardOriginal
                  ? { action: "updateAward", originalName: editingAwardOriginal, awardData: { name, icon, description } }
                  : { action: "addAward", awardData: { name, icon, description } };
                    <div class="text-center text-xs text-slate-400 mt-2">
                        Current session: <span class="font-mono text-white">${formatTime(currentSessionMs)}</span>
                    </div>
                `
                  body: JSON.stringify(payload)
                      ? `
                    <button onclick="claimGame('${game.id}', event)" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i class="fa-solid fa-play"></i> Claim Game
                    </button>
                `
                      : `
                      <button disabled class="w-full bg-slate-700 text-slate-500 font-bold py-2 px-4 rounded-lg cursor-not-allowed flex items-center justify-center gap-2">
                        <i class="fa-solid fa-lock"></i> ${eventNotStarted ? "Event hasn't started" : currentPlayer === "" ? "Log In on Players Page" : "Currently Unavailable"}
                      </button>
                    `
                }
            </div>

            ${
              game.logs && game.logs.length > 0
                ? `
                <div class="mt-4 border-t border-slate-700 pt-3">
                    <h3 class="text-xs font-bold text-slate-400 uppercase mb-2">Session Logs</h3>
                    <div class="max-h-32 overflow-y-auto scrollbar-hide space-y-1">
                        ${game.logs
                          .slice()
                          .reverse()
                          .map(
                            (log) => `
                            <div class="text-xs flex justify-between text-slate-300 bg-slate-800/50 p-2 rounded min-w-0">
                                <span class="truncate max-w-[60%]"><span class="text-ap-accent">${log.player}</span></span>
                                <span class="font-mono flex-shrink-0">${formatTime(log.duration_ms)}</span>
                            </div>
                        `
                          )
                          .join("")}
                    </div>
                </div>
            `
                : ""
            }
        `;
    container.appendChild(card);
  });
}

function renderLink(url, icon, label, isPrimary = false) {
  if (!url || url.trim() === "") return "";
  const bgClass = isPrimary
    ? "bg-ap-accent/20 text-ap-accent border-ap-accent/30 hover:bg-ap-accent/30"
    : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white hover:border-slate-500";
  return `
        <a href="${url}" target="_blank" class="flex items-center gap-2 p-2 rounded border ${bgClass} transition-all min-w-0">
            <i class="fa-solid ${icon} flex-shrink-0"></i>
            <span class="truncate">${label}</span>
        </a>
    `;
}

// ==========================================
// ACTIONS
// ==========================================
async function claimGame(gameId, e) {
  if (!currentPlayer)
    return alert("Please log in from the Players page first.");
  if (
    !confirm(
      `Claim ${games.find((g) => g.id === gameId).name} as ${currentPlayer}?`
    )
  )
    return;
  await updateGame(gameId, "claim", e);
}

async function unclaimGame(gameId, e) {
  if (
    !confirm(
      "Have you finished playing and uploaded your save file to Google Drive?\n\nOnce you mark it as done, the next player can start!"
    )
  )
    return;
  await updateGame(gameId, "complete", e);
}

async function updateGame(gameId, action, e) {
  if (!AUTH.isLoggedIn()) {
    alert("Please log in from the Players page first.");
    return;
  }

  const btn = e.target.closest("button");
  const originalText = btn.innerHTML;
  btn.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
  btn.disabled = true;

  try {
    const res = await fetch("/api/update-game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...AUTH.authHeader()
      },
      body: JSON.stringify({ gameId, action })
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        AUTH.clearSession();
        alert("Your session expired. Please log in again on the Players page.");
        window.location.href = "/players.html";
        return;
      }
      throw new Error(data.error || "Failed to update");
    }

    // OPTIMISTIC UI UPDATE
    const game = games.find((g) => g.id === gameId);
    if (game) {
      if (action === "claim") {
        game.current_player = currentPlayer;
        game.claimed_at = Date.now();
      } else if (action === "complete") {
        const duration = Date.now() - game.claimed_at;
        game.total_time_ms += duration;
        game.logs.push({
          player: currentPlayer,
          start: game.claimed_at,
          end: Date.now(),
          duration_ms: duration
        });
        game.current_player = null;
        game.claimed_at = null;
        game.completed = true;
      }
    }

    updateCompletedGamesCount();
    renderGames();
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// ==========================================
// GLOBAL TIMER
// ==========================================
function updateGlobalTimer() {
  const timerEl = $("global-timer");
  const statusEl = $("timer-status");

  if (!settings.start_time || settings.start_time.trim() === "") {
    timerEl.textContent = "0:00:00";
    statusEl.textContent = "";
    // Add inline edit button for moderator
    addInlineEditButtonToTimer();
    return;
  }

  const now = Date.now();
  const start = new Date(settings.start_time).getTime();
  const end =
    settings.end_time && settings.end_time.trim() !== ""
      ? new Date(settings.end_time).getTime()
      : null;

  if (now < start) {
    timerEl.textContent = formatTime(start - now);
    statusEl.textContent = "Starts In";
    statusEl.className = "text-xs text-yellow-400 uppercase tracking-widest";
  } else if (end === null || (now >= start && now <= end)) {
    timerEl.textContent = formatTime(now - start);
    statusEl.textContent = "Event Live";
    statusEl.className = "text-xs text-green-400 uppercase tracking-widest";
  } else {
    timerEl.textContent = formatTime(now - end);
    statusEl.textContent = "Event Ended";
    statusEl.className = "text-xs text-red-400 uppercase tracking-widest";
  }

  // Add inline edit button for moderator
  addInlineEditButtonToTimer();
}

// Add inline edit button to the global timer
function addInlineEditButtonToTimer() {
  const timerContainer = document.querySelector("#global-timer").parentElement;
  if (!timerContainer) return;

  // Remove existing edit button
  const existingBtn = timerContainer.querySelector(".inline-edit-btn");
  if (existingBtn) existingBtn.remove();

  // Only add button if in inline edit mode and user is moderator
  if (!inlineEditMode || !isModerator) return;

  const editBtn = document.createElement("button");
  editBtn.className =
    "inline-edit-btn absolute top-2 right-2 p-1.5 rounded-lg bg-slate-700/80 hover:bg-ap-accent/80 text-slate-300 hover:text-white transition-all z-10";
  editBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
  editBtn.title = "Edit Event Timer Settings";
  editBtn.onclick = () => openEventTimerSettingsModal();
  timerContainer.style.position = "relative";
  timerContainer.appendChild(editBtn);
}

// Open event timer settings modal
function openEventTimerSettingsModal() {
  const modal = $("moderator-modal");
  const content = $("moderator-panel-content");

  if (!modal || !content) return;

  content.innerHTML = `
        <div class="space-y-6">
            <!-- Event Time Settings Section -->
        <div class="glass rounded-lg p-4">
          <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-clock text-ap-accent mr-2"></i>Event Timer Settings & Preview</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-semibold text-slate-300 mb-2">Event Start Time</label>
                  <input type="datetime-local" id="event-start-time-input" value="${settings.start_time || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                  <p class="text-xs text-slate-400 mt-2">Set when the event starts. Before this time, a countdown will be shown.</p>
                </div>
                <div>
                  <label class="block text-sm font-semibold text-slate-300 mb-2">Event End Time (optional)</label>
                  <input type="datetime-local" id="event-end-time-input" value="${settings.end_time || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                  <p class="text-xs text-slate-400 mt-2">Set when the event ends. Leave empty for an ongoing event.</p>
                </div>
                <div class="flex gap-2">
                  <button onclick="saveEventTimeSettings()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg flex-1">Save Settings</button>
                  <button onclick="closeModeratorModal()" class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg flex-1">Cancel</button>
                </div>
              </div>
            </div>
            <div>
              <h4 class="text-sm font-semibold text-slate-300 mb-3">Live Preview</h4>
              <div id="event-timer-preview" class="flex items-center gap-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <div class="text-center w-full">
                  <div id="preview-timer" class="text-2xl font-mono font-bold text-ap-accent">${formatTime(Date.now() - (settings.start_time ? new Date(settings.start_time).getTime() : 0))}</div>
                  <div id="preview-status" class="text-xs text-slate-400 uppercase">${settings.start_time ? "Event Live" : "Not Set"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
    `;

  modal.classList.remove("hidden");

  // Update preview on input change
  const startInput = $("event-start-time-input");
  const endInput = $("event-end-time-input");

  function updatePreview() {
    const previewContainer = $("event-timer-preview");
    const startTime = startInput.value;
    const endTime = endInput.value;

    // If no start time set, show placeholder
    if (!startTime) {
      if (previewContainer) {
        previewContainer.innerHTML = `<div class="text-center text-slate-400 text-sm">Start typing to see preview...</div>`;
      }
      return;
    }

    // Ensure the preview structure exists
    if (previewContainer) {
      previewContainer.innerHTML = `
        <div class="text-center">
          <div id="preview-timer" class="text-2xl font-mono font-bold text-ap-accent"></div>
          <div id="preview-status" class="text-xs text-slate-400 uppercase"></div>
        </div>
      `;
    }

    const previewTimer = $("preview-timer");
    const previewStatus = $("preview-status");

    const now = Date.now();
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : null;

    if (now < start) {
      previewTimer.textContent = formatTime(start - now);
      previewStatus.textContent = "Starts In";
      previewStatus.className = "text-xs text-yellow-400 uppercase";
    } else if (end === null || (now >= start && now <= end)) {
      previewTimer.textContent = formatTime(now - start);
      previewStatus.textContent = "Event Live";
      previewStatus.className = "text-xs text-green-400 uppercase";
    } else {
      previewTimer.textContent = formatTime(now - end);
      previewStatus.textContent = "Event Ended";
      previewStatus.className = "text-xs text-red-400 uppercase";
    }
  }

  startInput.addEventListener("change", updatePreview);
  endInput.addEventListener("change", updatePreview);
  updatePreview();
}

// Save event time settings
async function saveEventTimeSettings() {
  const startTime = $("event-start-time-input").value;
  const endTime = $("event-end-time-input").value;

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({
        action: "updateSettings",
        settingsData: {
          start_time: startTime,
          end_time: endTime
        }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Event timer settings updated successfully!");
    closeModeratorModal();
    loadData();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// Initialize
setInterval(updateGlobalTimer, 1000);
setInterval(() => {
  if (games.some((g) => g.current_player === currentPlayer)) {
    renderGames();
  }
}, 1000);

// Also periodically update completed games count in case data is refreshed
setInterval(updateCompletedGamesCount, 5000);

// Search functionality
const searchInput = $("games-search");
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderGames();
  });
}

// Sort functionality
const sortSelect = $("games-sort");
if (sortSelect) {
  sortSelect.addEventListener("change", (e) => {
    gamesSortOption = e.target.value;
    renderGames();
  });
}

// Filter functionality
const filterSelect = $("games-filter");
if (filterSelect) {
  filterSelect.addEventListener("change", (e) => {
    gamesFilterOption = e.target.value;
    renderGames();
  });
}

// Logout button (if present on this page)
const logoutBtn = $("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => AUTH.logout());
}

// Moderator status check and panel setup
let isModerator = false;
let isAdmin = false;
let inlineEditMode = false; // Track inline edit mode state

// Load inline edit mode preference from localStorage
try {
  const savedMode = localStorage.getItem("inlineEditMode");
  inlineEditMode = savedMode === "true";
} catch (e) {
  console.warn("Could not load inline edit mode preference:", e);
}

(async () => {
  if (AUTH.isLoggedIn()) {
    isModerator = await AUTH.checkModerator();
    isAdmin = await AUTH.checkAdmin();
    console.log("Moderator status:", isModerator);
    console.log("Admin status:", isAdmin);

    // Add moderator button to header if user is a moderator
    if (isModerator) {
      const navSection = $("nav-container");
      if (navSection) {
        const modBtn = document.createElement("button");
        modBtn.id = "moderator-toggle-btn";
        modBtn.className =
          "group flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all";
        modBtn.innerHTML =
          '<i class="fa-solid fa-shield-halved group-hover:text-ap-accent transition-colors"></i><span class="text-sm font-medium hidden xl:inline">Moderation</span>';
        modBtn.onclick = openModeratorModal;
        navSection.appendChild(modBtn);

        // Add inline edit mode toggle button
        const inlineEditBtn = document.createElement("button");
        inlineEditBtn.id = "inline-edit-toggle-btn";
        inlineEditBtn.className =
          "group flex items-center gap-2 px-3 py-2 rounded-lg transition-all " +
          (inlineEditMode
            ? "text-ap-accent bg-ap-accent/20"
            : "text-slate-400 hover:text-white hover:bg-slate-700/50");
        inlineEditBtn.innerHTML =
          '<i class="fa-solid fa-pen-to-square"></i><span class="text-sm font-medium hidden xl:inline">Inline Edit</span>';
        inlineEditBtn.onclick = toggleInlineEditMode;
        inlineEditBtn.title = "Toggle inline editing mode";
        navSection.appendChild(inlineEditBtn);
      }

      // Add to mobile menu as well
      const mobileModContainer = $("mobile-moderation-container");
      if (mobileModContainer) {
        const modBtnMobile = document.createElement("button");
        // Use the same mobile nav button classes as other pages for consistency
        modBtnMobile.className =
          "mobile-nav-link flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all";
        modBtnMobile.innerHTML =
          '<i class="fa-solid fa-shield-halved"></i><span class="text-sm">Moderation</span>';
        modBtnMobile.onclick = openModeratorModal;
        mobileModContainer.appendChild(modBtnMobile);

        const inlineEditBtnMobile = document.createElement("button");
        inlineEditBtnMobile.className =
          "mobile-nav-link flex items-center gap-2 px-3 py-2 rounded-lg transition-all " +
          (inlineEditMode
            ? "text-ap-accent bg-ap-accent/20"
            : "text-slate-400 hover:text-white hover:bg-slate-700/50");
        inlineEditBtnMobile.innerHTML =
          '<i class="fa-solid fa-pen-to-square"></i><span class="text-sm">Inline Edit</span>';
        inlineEditBtnMobile.onclick = toggleInlineEditMode;
        inlineEditBtnMobile.title = "Toggle inline editing mode";
        mobileModContainer.appendChild(inlineEditBtnMobile);
      }
    }
  }
})();

// Toggle inline edit mode
function toggleInlineEditMode() {
  inlineEditMode = !inlineEditMode;
  try {
    localStorage.setItem("inlineEditMode", inlineEditMode.toString());
  } catch (e) {
    console.warn("Could not save inline edit mode preference:", e);
  }

  // Update button appearance
  const btn = $("inline-edit-toggle-btn");
  if (btn) {
    btn.className =
      "group flex items-center gap-2 px-3 py-2 rounded-lg transition-all " +
      (inlineEditMode
        ? "text-ap-accent bg-ap-accent/20"
        : "text-slate-400 hover:text-white hover:bg-slate-700/50");
  }

  // Re-render components with inline edit buttons
  renderGames();
  updateGlobalTimer(); // This will add edit button to timer

  // If on players page, re-render players
  if (typeof renderPlayers === "function") {
    renderPlayers();
  }

  // If on leaderboard page, re-render leaderboard
  if (typeof renderLeaderboard === "function") {
    renderLeaderboard(currentTab || "games");
  }
}

// Moderator modal functions
async function openModeratorModal() {
  const modal = $("moderator-modal");
  const content = $("moderator-panel-content");

  if (!modal || !content) return;

  // Fetch current user's permissions
  let permissions = {
    manageModerators: false,
    manageGames: false,
    managePlayers: false,
    manageRoles: false,
    manageAwards: false,
    manageSettings: false
  };

  try {
    permissions = await AUTH.getPermissions();
  } catch (error) {
    console.error("Failed to fetch permissions:", error);
  }

  // Build HTML based on permissions
  let htmlContent = '<div class="space-y-6">';

  // ========== GAME MANAGEMENT SECTION ==========
  
  // Add Game Section (requires manageGames permission)
  if (permissions.manageGames) {
    htmlContent += `
            <!-- Add Game Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-plus text-green-400 mr-2"></i>Add New Game</h3>
                <form id="add-game-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" id="game-name" placeholder="Game Name *" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" required>
                    <input type="text" id="game-id" placeholder="Game ID (unique) *" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" required>
                    <input type="text" id="game-yaml-slot-name" placeholder="YAML Slot Name (for Cheesetracker)" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-logo" placeholder="Logo URL" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-apworld-link" placeholder="Apworld Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="game-apworld-version" placeholder="Apworld Version (or 'Core')" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-mod-link" placeholder="Mod Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="game-mod-version" placeholder="Mod Version" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-mod-setup-guide-link" placeholder="Setup Guide Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-tracker-link" placeholder="Tracker Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-support-link" placeholder="Support Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-save-file-link" placeholder="Save File Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="game-game-info-link" placeholder="Game Info Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="number" id="game-slot-count" placeholder="Slot Count (0 = no limit)" min="0" value="1" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <textarea id="game-rules" placeholder="Rules" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2" rows="2"></textarea>
                    <textarea id="game-extra-information" placeholder="Extra Information" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2" rows="2"></textarea>
                    <button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg md:col-span-2">Add Game</button>
                </form>
                <!-- Live Preview -->
                <div class="mt-6 pt-4 border-t border-slate-700">
                    <h4 class="text-sm font-semibold text-slate-300 mb-3">Live Preview</h4>
                    <div id="add-game-preview" class="glass rounded-xl p-6 flex flex-col gap-4 transition-all hover:border-ap-accent/50">
                        <div class="text-center text-slate-400 text-sm">Start typing to see preview...</div>
                    </div>
                </div>
            </div>`;
  }

  // Edit Game Section (requires manageGames permission)
  if (permissions.manageGames) {
    htmlContent += `
            <!-- Edit Game Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-pen-to-square text-ap-accent mr-2"></i>Edit Game</h3>
                <select id="edit-game-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-4">
                    <option value="">Select a game...</option>
                    ${games
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((g) => `<option value="${g.id}">${g.name}</option>`)
                      .join("")}
                </select>
                <div id="edit-game-form-container" class="hidden grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" id="edit-game-name" placeholder="Game Name" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="edit-game-id" placeholder="Game ID" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" disabled>
                    <input type="text" id="edit-game-yaml-slot-name" placeholder="YAML Slot Name (for Cheesetracker)" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-logo" placeholder="Logo URL" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-apworld-link" placeholder="Apworld Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="edit-game-apworld-version" placeholder="Apworld Version (or 'Core')" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-mod-link" placeholder="Mod Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="edit-game-mod-version" placeholder="Mod Version" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-mod-setup-guide-link" placeholder="Setup Guide Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-tracker-link" placeholder="Tracker Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-support-link" placeholder="Support Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-save-file-link" placeholder="Save File Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="edit-game-game-info-link" placeholder="Game Info Link" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="number" id="edit-game-slot-count" placeholder="Slot Count (0 = no limit)" min="0" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <textarea id="edit-game-rules" placeholder="Rules" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2" rows="2"></textarea>
                    <textarea id="edit-game-extra-information" placeholder="Extra Information" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2" rows="2"></textarea>
                    <button onclick="saveEditedGame()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg md:col-span-2">Save Changes</button>
                </div>
                <!-- Live Preview -->
                <div id="edit-game-preview-container" class="hidden mt-6 pt-4 border-t border-slate-700">
                    <h4 class="text-sm font-semibold text-slate-300 mb-3">Live Preview</h4>
                    <div id="edit-game-preview" class="glass rounded-xl p-6 flex flex-col gap-4 transition-all hover:border-ap-accent/50"></div>
                </div>
            </div>`;
  }

  // Remove Game Section (requires manageGames permission)
  if (permissions.manageGames) {
    htmlContent += `
            <!-- Remove Game Section -->
            <div class="glass rounded-lg p-4">
              <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-trash text-red-400 mr-2"></i>Remove Game</h3>
              <p class="text-sm text-slate-400 mb-3">Select a game to permanently remove it (this also deletes logs and Cheesetracker entries).</p>
              <select id="remove-game-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-4">
                <option value="">Select a game...</option>
                ${games
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((g) => `<option value="${g.id}">${g.name}</option>`)
                  .join("")}
              </select>
              <div class="flex gap-2">
                <button id="remove-game-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg w-full">Remove Game</button>
              </div>
            </div>`;
  }

  // Edit Player Section (requires managePlayers permission)
  if (permissions.managePlayers) {
    htmlContent += `
            <!-- Edit Player Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-user-pen text-ap-accent mr-2"></i>Edit Player</h3>
                <select id="edit-player-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-4">
                    <option value="">Select a player...</option>
                    ${players
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(
                        (p) => `<option value="${p.name}">${p.name}</option>`
                      )
                      .join("")}
                </select>
                <div id="edit-player-form-container" class="hidden space-y-4">
                    <input type="text" id="edit-player-new-name" placeholder="New Name (optional)" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                    <input type="url" id="edit-player-pfp" placeholder="Profile Picture URL" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                    <textarea id="edit-player-bio" placeholder="Bio" rows="3" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full"></textarea>
                    <input type="text" id="edit-player-pronouns" placeholder="Pronouns" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                    <input type="text" id="edit-player-discord" placeholder="Discord Username" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                    <button onclick="saveEditedPlayer()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg w-full">Save Changes</button>
                    <button onclick="deletePlayer()" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg w-full">Delete Player</button>
                </div>
                <!-- Live Preview -->
                <div id="edit-player-preview-container" class="hidden mt-6 pt-4 border-t border-slate-700">
                    <h4 class="text-sm font-semibold text-slate-300 mb-3">Live Preview</h4>
                    <div id="edit-player-preview" class="glass rounded-xl p-6 flex items-center gap-4"></div>
                </div>
            </div>`;
  }

  // Edit Logs Section (requires managePlayers permission)
  if (permissions.managePlayers) {
    htmlContent += `
            <!-- Edit Logs Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-list-check text-ap-accent mr-2"></i>Edit Game Logs</h3>
                <select id="edit-log-game-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-4">
                    <option value="">Select a game...</option>
                    ${games
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(
                        (g) =>
                          `<option value="${g.id}">${g.name} (${g.logs?.length || 0} logs)</option>`
                      )
                      .join("")}
                </select>
                <div id="edit-logs-container" class="hidden space-y-2 max-h-64 overflow-y-auto"></div>
            </div>`;
  }

  // Player Roles Section (requires manageRoles permission)
  if (permissions.manageRoles) {
    htmlContent += `
            <!-- Player Roles Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-shield text-purple-400 mr-2"></i>Manage Player Roles</h3>
                <div class="space-y-4">
                    <div>
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">Add New Role</h4>
                        <div class="flex gap-2">
                            <input type="text" id="new-role-name" placeholder="Role Name" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white flex-1">
                            <input type="color" id="new-role-color" value="#ff0000" class="bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-2 h-10 w-12">
                            <button onclick="addNewRole()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Add Role</button>
                        </div>
                        <!-- Live Preview -->
                        <div class="mt-3 pt-3 border-t border-slate-700">
                            <h5 class="text-xs font-semibold text-slate-400 mb-2">Live Preview</h5>
                            <div id="add-role-preview" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700">
                                <span class="text-sm text-slate-400">Start typing to see preview...</span>
                            </div>
                        </div>
                        <!-- Tabs: Create / Edit Roles -->
                        <div class="mt-3">
                          <div class="flex gap-2">
                            <button id="roles-tab-create" class="px-3 py-1 rounded bg-ap-accent text-slate-900 text-sm" onclick="switchRolesTab('create')">Create Role</button>
                            <button id="roles-tab-edit" class="px-3 py-1 rounded bg-slate-700 text-sm text-slate-300" onclick="switchRolesTab('edit')">Edit Roles</button>
                          </div>
                          <div id="roles-tab-content-create" class="mt-3"></div>
                          <div id="roles-tab-content-edit" class="mt-3 hidden">
                            <div id="roles-edit-list" class="space-y-2 max-h-44 overflow-y-auto"></div>
                          </div>
                        </div>
                    </div>
                    <div>
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">Assign/Remove Roles</h4>
                        <select id="role-player-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-2">
                            <option value="">Select a player...</option>
                            ${players
                              .slice()
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map(
                                (p) =>
                                  `<option value="${p.name}">${p.name}</option>`
                              )
                              .join("")}
                        </select>
                        <select id="role-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-2">
                            <option value="">Select a role...</option>
                        </select>
                        <div class="flex gap-2">
                            <button onclick="assignRole('add')" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg flex-1">Assign Role</button>
                            <button onclick="assignRole('remove')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex-1">Remove Role</button>
                        </div>
                    </div>
                </div>
            </div>`;
  }

  // Manage Awards Section (requires manageAwards permission)
  if (permissions.manageAwards) {
    htmlContent += `
            <!-- Manage Awards Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-trophy text-yellow-300 mr-2"></i>Manage Awards</h3>
                <div class="space-y-4">
                    <div>
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">Create New Award</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input type="text" id="award-name-input" placeholder="Award Name" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                            <input type="text" id="award-icon-input" placeholder="Icon (emoji or fa-*)" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                            <textarea id="award-description-input" placeholder="Description" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2" rows="2"></textarea>
                            <!-- Tabs: Create / Edit Awards -->
                            <div class="md:col-span-2 mt-3">
                              <div class="flex gap-2">
                                <button id="awards-tab-create" class="px-3 py-1 rounded bg-ap-accent text-slate-900 text-sm" onclick="switchAwardsTab('create')">Create Award</button>
                                <button id="awards-tab-edit" class="px-3 py-1 rounded bg-slate-700 text-sm text-slate-300" onclick="switchAwardsTab('edit')">Edit Awards</button>
                              </div>
                              <div id="awards-tab-content-create" class="mt-3"></div>
                              <div id="awards-tab-content-edit" class="mt-3 hidden">
                                <div id="awards-edit-list" class="space-y-2 max-h-44 overflow-y-auto"></div>
                              </div>
                            </div>
                        </div>
                        <div class="mt-4 p-4 glass rounded-lg">
                            <h5 class="text-xs font-semibold text-slate-400 mb-2">Live Preview</h5>
                            <div id="award-preview" class="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                                <span id="preview-icon" class="text-2xl w-8 text-center"></span>
                                <div>
                                    <div id="preview-name" class="font-bold text-white">Award Name</div>
                                    <div id="preview-description" class="text-xs text-slate-400">Description will appear here</div>
                                </div>
                            </div>
                        </div>
                        <button onclick="createAward()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg mt-4 w-full">Create Award</button>
                    </div>
                    <div class="border-t border-slate-700 pt-4">
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">Assign/Remove Award</h4>
                        <select id="award-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-2">
                            <option value="">Select an award...</option>
                        </select>
                        <select id="award-player-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-2">
                            <option value="">Select a player...</option>
                        </select>
                        <div class="flex gap-2">
                            <button onclick="assignAward('add')" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg flex-1">Give Award</button>
                            <button onclick="assignAward('remove')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex-1">Remove Award</button>
                        </div>
                    </div>
                </div>
            </div>`;
  }

  // Manage Moderators Section (requires manageModerators permission - inherently admin)
  if (permissions.manageModerators) {
    htmlContent += `
            <!-- Manage Moderators Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-shield-halved text-yellow-400 mr-2"></i>Manage Moderators</h3>
                <div class="space-y-4">
                    <div>
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">Add/Remove Moderator</h4>
                        <div class="flex gap-2 mb-2">
                            <select id="moderator-name-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white flex-1">
                                <option value="">Select a player...</option>
                                ${players
                                  .slice()
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map(
                                    (p) =>
                                      `<option value="${p.name}">${p.name}</option>`
                                  )
                                  .join("")}
                            </select>
                            <button onclick="manageModerator('add')" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Add Moderator</button>
                            <button onclick="manageModerator('remove')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Remove Moderator</button>
                        </div>
                    </div>
                    <div>
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">Set Admin</h4>
                        <div class="flex gap-2 mb-2">
                            <select id="admin-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white flex-1">
                                <option value="">Select a moderator...</option>
                            </select>
                            <button onclick="setAdmin()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg">Set as Admin</button>
                        </div>
                        <p class="text-xs text-slate-400">Warning: This will transfer admin privileges to the selected moderator. The current admin will remain as a regular moderator unless removed.</p>
                    </div>
                    <div>
                        <h4 class="text-sm font-semibold text-slate-300 mb-2">Edit Moderator Permissions</h4>
                        <select id="moderator-select" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full mb-2">
                            <option value="">Select a moderator...</option>
                        </select>
                        <div id="moderator-permissions-container" class="hidden space-y-2">
                            <label class="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" id="perm-manageModerators" class="rounded bg-slate-800 border-slate-700">
                                Manage Moderators
                            </label>
                            <label class="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" id="perm-manageGames" class="rounded bg-slate-800 border-slate-700">
                                Manage Games
                            </label>
                            <label class="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" id="perm-managePlayers" class="rounded bg-slate-800 border-slate-700">
                                Manage Players
                            </label>
                            <label class="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" id="perm-manageRoles" class="rounded bg-slate-800 border-slate-700">
                                Manage Roles
                            </label>
                            <label class="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" id="perm-manageAwards" class="rounded bg-slate-800 border-slate-700">
                                Manage Awards
                            </label>
                            <label class="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" id="perm-manageSettings" class="rounded bg-slate-800 border-slate-700">
                                Manage Settings
                            </label>
                            <button onclick="updateModeratorPermissions()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg w-full mt-2">Update Permissions</button>
                        </div>
                    </div>
                </div>
            </div>`;
  }

  // Cheesetracker Settings Section (requires manageSettings permission)
  if (permissions.manageSettings) {
    htmlContent += `
            <!-- Cheesetracker Settings Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-link text-orange-400 mr-2"></i>Cheesetracker Integration</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-slate-300 mb-2">Cheesetracker URL</label>
                        <input type="url" id="cheesetracker-url-input" value="${settings.cheesetracker_url || ""}" placeholder="https://cheesetrackers.theincrediblewheelofchee.se/..." class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                        <p class="text-xs text-slate-400 mt-2">Enter the URL to your Cheesetracker page to enable automatic check tracking and progress display.</p>
                    </div>
                    <button onclick="updateCheesetrackerSettings()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg w-full">Save Cheesetracker Settings</button>
                </div>
            </div>`;
  }

  // Event Time Settings Section (requires manageSettings permission)
  if (permissions.manageSettings) {
    htmlContent += `
            <!-- Event Time Settings Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-clock text-cyan-400 mr-2"></i>Event Time Settings</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-slate-300 mb-2">Event Start Time</label>
                        <input type="datetime-local" id="event-start-time-input" value="${settings.start_time || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                        <p class="text-xs text-slate-400 mt-2">Set when the event starts. Before this time, a countdown will be shown.</p>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-300 mb-2">Event End Time (optional)</label>
                        <input type="datetime-local" id="event-end-time-input" value="${settings.end_time || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                        <p class="text-xs text-slate-400 mt-2">Set when the event ends. Leave empty for an ongoing event.</p>
                    </div>
                    <button onclick="updateEventTimeSettings()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg w-full">Save Event Time Settings</button>
                </div>
            </div>`;
  }

  // Event Timer Preview (always show)
  htmlContent += `
            <!-- Live Preview -->
            <div class="glass rounded-lg p-4">
                <h4 class="text-sm font-semibold text-slate-300 mb-3">Live Preview</h4>
                <div id="event-timer-preview" class="flex items-center gap-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <div class="text-center">
                        <div id="preview-timer" class="text-2xl font-mono font-bold text-ap-accent">${formatTime(Date.now() - (settings.start_time ? new Date(settings.start_time).getTime() : 0))}</div>
                        <div id="preview-status" class="text-xs text-slate-400 uppercase">${settings.start_time ? "Event Live" : "Not Set"}</div>
                    </div>
                </div>
            </div>
        </div>`;

  content.innerHTML = htmlContent;

  modal.classList.remove("hidden");

  // Update preview on input change
  const startInput = $("event-start-time-input");
  const endInput = $("event-end-time-input");

  function updatePreview() {
    const previewTimer = $("preview-timer");
    const previewStatus = $("preview-status");

    const startTime = startInput.value;
    const endTime = endInput.value;

    if (!startTime) {
      previewTimer.textContent = "0:00:00";
      previewStatus.textContent = "Not Set";
      return;
    }

    const now = Date.now();
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : null;

    if (now < start) {
      previewTimer.textContent = formatTime(start - now);
      previewStatus.textContent = "Starts In";
      previewStatus.className = "text-xs text-yellow-400 uppercase";
    } else if (end === null || (now >= start && now <= end)) {
      previewTimer.textContent = formatTime(now - start);
      previewStatus.textContent = "Event Live";
      previewStatus.className = "text-xs text-green-400 uppercase";
    } else {
      previewTimer.textContent = formatTime(now - end);
      previewStatus.textContent = "Event Ended";
      previewStatus.className = "text-xs text-red-400 uppercase";
    }
  }

  startInput.addEventListener("change", updatePreview);
  endInput.addEventListener("change", updatePreview);
  updatePreview();

  // Setup form handlers
  const addGameForm = $("add-game-form");
  if (addGameForm) {
    addGameForm.onsubmit = async (e) => {
      e.preventDefault();
      const gameData = {
        id: $("game-id").value.trim(),
        name: $("game-name").value.trim(),
        logo: $("game-logo").value.trim(),
        yaml_slot_name: $("game-yaml-slot-name").value.trim(),
        slot_count: (function () {
          const v = parseInt($("game-slot-count").value, 10);
          return isNaN(v) ? 1 : v;
        })(),
        apworld_link: $("game-apworld-link").value.trim(),
        apworld_version: $("game-apworld-version").value.trim(),
        mod_link: $("game-mod-link").value.trim(),
        mod_version: $("game-mod-version").value.trim(),
        mod_setup_guide_link: $("game-mod-setup-guide-link").value.trim(),
        tracker_link: $("game-tracker-link").value.trim(),
        game_info_link: $("game-game-info-link").value.trim(),
        support_link: $("game-support-link").value.trim(),
        save_file_link: $("game-save-file-link").value.trim(),
        rules: $("game-rules").value.trim(),
        extra_information: $("game-extra-information").value.trim(),
        current_player: null,
        claimed_at: null,
        total_time_ms: 0,
        completed: false,
        logs: []
      };

      try {
        const res = await fetch("/api/moderator-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
          body: JSON.stringify({ action: "addGame", gameData })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert("Game added successfully!");
        addGameForm.reset();
        loadData();
      } catch (err) {
        alert("Error: " + err.message);
      }
    };
  }

  const editGameSelect = $("edit-game-select");
  if (editGameSelect) {
    editGameSelect.onchange = () => {
      const gameId = editGameSelect.value;
      const container = $("edit-game-form-container");
      if (!gameId) {
        container.classList.add("hidden");
        return;
      }
      const game = games.find((g) => g.id === gameId);
      if (!game) return;

      $("edit-game-name").value = game.name;
      $("edit-game-id").value = game.id;
      $("edit-game-yaml-slot-name").value = game.yaml_slot_name || "";
      $("edit-game-logo").value = game.logo || "";
      $("edit-game-apworld-link").value = game.apworld_link || "";
      $("edit-game-apworld-version").value = game.apworld_version || "";
      $("edit-game-mod-link").value = game.mod_link || "";
      $("edit-game-mod-version").value = game.mod_version || "";
      $("edit-game-mod-setup-guide-link").value =
        game.mod_setup_guide_link || "";
      $("edit-game-tracker-link").value = game.tracker_link || "";
      $("edit-game-game-info-link").value = game.game_info_link || "";
      $("edit-game-support-link").value = game.support_link || "";
      $("edit-game-save-file-link").value = game.save_file_link || "";
      $("edit-game-rules").value = game.rules || "";
      $("edit-game-extra-information").value = game.extra_information || "";
      container.classList.remove("hidden");
    };
  }

  // Remove Game handler for moderation panel
  const removeGameBtn = $("remove-game-btn");
  if (removeGameBtn) {
    removeGameBtn.addEventListener("click", async () => {
      const sel = $("remove-game-select");
      if (!sel) return;
      const gameIdToRemove = sel.value;
      if (!gameIdToRemove) return alert("Please select a game to remove.");
      if (
        !confirm(
          "Are you sure you want to permanently remove this game? This will also delete logs and Cheesetracker entries."
        )
      )
        return;

      try {
        const res = await fetch("/api/moderator-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
          body: JSON.stringify({ action: "removeGame", gameId: gameIdToRemove })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to remove game");
        alert("Game removed successfully!");
        loadData();
        closeModeratorModal();
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  }

  const editPlayerSelect = $("edit-player-select");
  if (editPlayerSelect) {
    editPlayerSelect.onchange = () => {
      const playerName = editPlayerSelect.value;
      const container = $("edit-player-form-container");
      if (!playerName) {
        container.classList.add("hidden");
        return;
      }
      const player = players.find((p) => p.name === playerName);
      if (!player) return;

      $("edit-player-new-name").value = "";
      $("edit-player-pfp").value = player.pfp_link || "";
      $("edit-player-bio").value = player.bio || "";
      $("edit-player-pronouns").value = player.pronouns || "";
      $("edit-player-discord").value = player.discord || "";
      container.classList.remove("hidden");
    };
  }

  const editLogGameSelect = $("edit-log-game-select");
  if (editLogGameSelect) {
    editLogGameSelect.onchange = () => {
      const gameId = editLogGameSelect.value;
      const container = $("edit-logs-container");
      if (!gameId) {
        container.classList.add("hidden");
        return;
      }
      const game = games.find((g) => g.id === gameId);
      if (!game || !game.logs || game.logs.length === 0) {
        container.innerHTML =
          '<p class="text-slate-400">No logs for this game.</p>';
        container.classList.remove("hidden");
        return;
      }

      container.innerHTML = game.logs
        .map(
          (log, i) => `
                <div class="flex justify-between items-center bg-slate-800/50 p-2 rounded">
                    <span class="text-sm text-slate-300">${log.player} - ${formatTime(log.duration_ms)}</span>
                    <button onclick="removeLog('${gameId}', ${i})" class="text-red-400 hover:text-red-300">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `
        )
        .join("");
      container.classList.remove("hidden");
    };
  }

  // ===== LIVE PREVIEW FUNCTIONALITY =====

  // Helper function to render game card preview
  function renderGameCardPreview(game, previewElement) {
    const hasCoverImage = game.logo && game.logo.trim() !== "";
    const hasRules = game.rules && game.rules.trim() !== "";
    const hasExtraInfo =
      game.extra_information && game.extra_information.trim() !== "";
    const hasApworldVersion =
      game.apworld_version && game.apworld_version.trim() !== "";
    const hasModVersion = game.mod_version && game.mod_version.trim() !== "";

    // If all major fields are empty, show placeholder
    const allEmpty =
      !(game.name && game.name.trim()) &&
      !hasCoverImage &&
      !game.apworld_link &&
      !game.mod_link &&
      !hasRules &&
      !hasExtraInfo;
    if (allEmpty) {
      previewElement.innerHTML = `<div class="text-center text-slate-400 text-sm">Start typing to see preview...</div>`;
      return;
    }

    const links = [
      {
        url: game.apworld_link,
        icon: "fa-globe",
        label: `Apworld${hasApworldVersion ? ` (${game.apworld_version === "Core" ? "Core" : "v" + game.apworld_version})` : ""}`
      },
      {
        url: game.mod_link,
        icon: "fa-puzzle-piece",
        label: `Mod${hasModVersion ? ` (${game.mod_version === "Core" ? "" : "v"}${game.mod_version})` : ""}`
      },
      { url: game.mod_setup_guide_link, icon: "fa-book", label: "Setup Guide" },
      { url: game.tracker_link, icon: "fa-map", label: "Tracker" },
      { url: game.game_info_link, icon: "fa-circle-info", label: "Game Info" },
      { url: game.support_link, icon: "fa-circle-question", label: "Support" },
      {
        url: game.save_file_link,
        icon: "fa-download",
        label: "Save File",
        primary: true
      }
    ].filter((l) => l.url && l.url.trim() !== "");

    previewElement.innerHTML = `
            <div class="game-card-header flex gap-4">
          <div class="glass rounded-lg p-4">
            <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-clock text-ap-accent mr-2"></i>Event Timer Settings & Preview</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div>
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-semibold text-slate-300 mb-2">Event Start Time</label>
                    <input type="datetime-local" id="event-start-time-input" value="${settings.start_time || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                    <p class="text-xs text-slate-400 mt-2">Set when the event starts. Before this time, a countdown will be shown.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-slate-300 mb-2">Event End Time (optional)</label>
                    <input type="datetime-local" id="event-end-time-input" value="${settings.end_time || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white w-full">
                    <p class="text-xs text-slate-400 mt-2">Set when the event ends. Leave empty for an ongoing event.</p>
                  </div>
                  <div class="flex gap-2">
                    <button onclick="saveEventTimeSettings()" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg flex-1">Save Settings</button>
                    <button onclick="closeModeratorModal()" class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg flex-1">Cancel</button>
                  </div>
                </div>
              </div>
              <div>
                <h4 class="text-sm font-semibold text-slate-300 mb-3">Live Preview</h4>
                <div id="event-timer-preview" class="flex items-center gap-4 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <div class="text-center w-full">
                    <div id="preview-timer" class="text-2xl font-mono font-bold text-ap-accent">${formatTime(Date.now() - (settings.start_time ? new Date(settings.start_time).getTime() : 0))}</div>
                    <div id="preview-status" class="text-xs text-slate-400 uppercase">${settings.start_time ? "Event Live" : "Not Set"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
              links.length > 0
                ? `
                <div class="grid grid-cols-2 gap-2 text-sm">
                    ${links
                      .map(
                        (link) => `
                        <a href="#" class="flex items-center gap-2 p-2 rounded border ${link.primary ? "bg-ap-accent/20 text-ap-accent border-ap-accent/30" : "bg-slate-800 text-slate-400 border-slate-700"}">
                            <i class="fa-solid ${link.icon}"></i>
                            <span class="truncate">${link.label}</span>
                        </a>
                    `
                      )
                      .join("")}
                </div>
            `
                : '<p class="text-sm text-slate-500 italic">No links added yet</p>'
            }
        `;
  }

  // Add Game Live Preview
  const addGameInputs = [
    "game-name",
    "game-id",
    "game-logo",
    "game-apworld-link",
    "game-apworld-version",
    "game-mod-link",
    "game-mod-version",
    "game-mod-setup-guide-link",
    "game-tracker-link",
    "game-game-info-link",
    "game-support-link",
    "game-save-file-link",
    "game-rules",
    "game-extra-information"
  ];
  addGameInputs.forEach((id) => {
    const input = $(id);
    if (input) {
      input.addEventListener("input", () => {
        const previewEl = $("add-game-preview");
        if (!previewEl) return;

        const gameData = {
          name: $("game-name").value.trim() || "Game Name",
          logo: $("game-logo").value.trim(),
          apworld_link: $("game-apworld-link").value.trim(),
          apworld_version: $("game-apworld-version").value.trim(),
          mod_link: $("game-mod-link").value.trim(),
          mod_version: $("game-mod-version").value.trim(),
          mod_setup_guide_link: $("game-mod-setup-guide-link").value.trim(),
          tracker_link: $("game-tracker-link").value.trim(),
          game_info_link: $("game-game-info-link").value.trim(),
          support_link: $("game-support-link").value.trim(),
          save_file_link: $("game-save-file-link").value.trim(),
          rules: $("game-rules").value.trim(),
          extra_information: $("game-extra-information").value.trim()
        };

        renderGameCardPreview(gameData, previewEl);
      });
    }
  });

  // Edit Game Live Preview
  const editGameInputs = [
    "edit-game-name",
    "edit-game-logo",
    "edit-game-apworld-link",
    "edit-game-apworld-version",
    "edit-game-mod-link",
    "edit-game-mod-version",
    "edit-game-mod-setup-guide-link",
    "edit-game-tracker-link",
    "edit-game-game-info-link",
    "edit-game-support-link",
    "edit-game-save-file-link",
    "edit-game-rules",
    "edit-game-extra-information"
  ];
  editGameInputs.forEach((id) => {
    const input = $(id);
    if (input) {
      input.addEventListener("input", () => {
        const previewContainer = $("edit-game-preview-container");
        const previewEl = $("edit-game-preview");
        if (!previewContainer || !previewEl) return;

        previewContainer.classList.remove("hidden");

        const gameData = {
          name: $("edit-game-name").value.trim() || "Game Name",
          logo: $("edit-game-logo").value.trim(),
          apworld_link: $("edit-game-apworld-link").value.trim(),
          apworld_version: $("edit-game-apworld-version").value.trim(),
          mod_link: $("edit-game-mod-link").value.trim(),
          mod_version: $("edit-game-mod-version").value.trim(),
          mod_setup_guide_link: $(
            "edit-game-mod-setup-guide-link"
          ).value.trim(),
          tracker_link: $("edit-game-tracker-link").value.trim(),
          game_info_link: $("edit-game-game-info-link").value.trim(),
          support_link: $("edit-game-support-link").value.trim(),
          save_file_link: $("edit-game-save-file-link").value.trim(),
          rules: $("edit-game-rules").value.trim(),
          extra_information: $("edit-game-extra-information").value.trim()
        };

        renderGameCardPreview(gameData, previewEl);
      });
    }
  });

  // Edit Player Live Preview
  const editPlayerInputs = [
    "edit-player-new-name",
    "edit-player-pfp",
    "edit-player-bio",
    "edit-player-pronouns",
    "edit-player-discord"
  ];
  editPlayerInputs.forEach((id) => {
    const input = $(id);
    if (input) {
      input.addEventListener("input", () => {
        const previewContainer = $("edit-player-preview-container");
        const previewEl = $("edit-player-preview");
        if (!previewContainer || !previewEl) return;

        previewContainer.classList.remove("hidden");

        const playerName = $("edit-player-select").value;
        const player = players.find((p) => p.name === playerName) || {};
        const displayName =
          $("edit-player-new-name").value.trim() ||
          player.name ||
          "Player Name";
        const pfpLink =
          $("edit-player-pfp").value.trim() || player.pfp_link || "";
        const bio = $("edit-player-bio").value.trim() || player.bio || "";
        const pronouns =
          $("edit-player-pronouns").value.trim() || player.pronouns || "";
        const discord =
          $("edit-player-discord").value.trim() || player.discord || "";

        const previewPlayer = {
          name: displayName,
          pfp_link: pfpLink,
          bio: bio,
          pronouns: pronouns,
          discord: discord,
          roles: player.roles || []
        };

        renderPlayerPreview(previewPlayer, "edit-player-preview");
      });
    }
  });

  // Add New Role Live Preview
  const newRoleNameInput = $("new-role-name");
  const newRoleColorInput = $("new-role-color");
  if (newRoleNameInput && newRoleColorInput) {
    newRoleNameInput.addEventListener("input", updateRolePreview);
    newRoleColorInput.addEventListener("input", updateRolePreview);
  }

  function updateRolePreview() {
    const previewEl = $("add-role-preview");
    if (!previewEl || !newRoleNameInput || !newRoleColorInput) return;
    const roleName = newRoleNameInput.value.trim();
    const roleColor = newRoleColorInput.value || "#ff0000";

    // If name is empty, show start-typing placeholder
    if (!roleName) {
      previewEl.style.color = "";
      previewEl.style.borderColor = "";
      previewEl.innerHTML = `<div class="text-center text-slate-400 text-sm">Start typing to see preview...</div>`;
      return;
    }

    previewEl.style.color = roleColor;
    previewEl.style.borderColor = roleColor + "40";
    previewEl.innerHTML = `<span class="text-sm">${roleName}</span>`;
  }
}

function closeModeratorModal() {
  const modal = $("moderator-modal");
  if (modal) modal.classList.add("hidden");
}

async function saveEditedGame() {
  const gameId = $("edit-game-select").value;
  if (!gameId) return;

  const gameData = {
    name: $("edit-game-name").value.trim(),
    yaml_slot_name: $("edit-game-yaml-slot-name").value.trim(),
    slot_count: (function () {
      const v = parseInt($("edit-game-slot-count").value, 10);
      return isNaN(v) ? 1 : v;
    })(),
    logo: $("edit-game-logo").value.trim(),
    apworld_link: $("edit-game-apworld-link").value.trim(),
    apworld_version: $("edit-game-apworld-version").value.trim(),
    mod_link: $("edit-game-mod-link").value.trim(),
    mod_version: $("edit-game-mod-version").value.trim(),
    mod_setup_guide_link: $("edit-game-mod-setup-guide-link").value.trim(),
    tracker_link: $("edit-game-tracker-link").value.trim(),
    game_info_link: $("edit-game-game-info-link").value.trim(),
    support_link: $("edit-game-support-link").value.trim(),
    save_file_link: $("edit-game-save-file-link").value.trim(),
    rules: $("edit-game-rules").value.trim(),
    extra_information: $("edit-game-extra-information").value.trim()
  };

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({ action: "updateGame", gameId, gameData })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Game updated successfully!");
    loadData();
    closeModeratorModal();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// Open inline editor for a specific game
function openGameInlineEditor(gameId, event) {
  if (event) event.stopPropagation();

  const game = games.find((g) => g.id === gameId);
  if (!game) return;

  const modal = $("moderator-modal");
  const content = $("moderator-panel-content");

  if (!modal || !content) return;

  content.innerHTML = `
        <div class="space-y-6">
            <!-- Edit Game Section -->
            <div class="glass rounded-lg p-4">
                <h3 class="text-lg font-bold text-white mb-4"><i class="fa-solid fa-gamepad text-ap-accent mr-2"></i>Edit Game: ${game.name}</h3>
                <div id="inline-edit-game-form-container" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" id="inline-edit-game-name" placeholder="Game Name" value="${game.name}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="inline-edit-game-id" placeholder="Game ID" value="${game.id}" disabled class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white opacity-50">
                    <input type="text" id="inline-edit-game-yaml-slot-name" placeholder="YAML Slot Name (for Cheesetracker)" value="${game.yaml_slot_name || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="inline-edit-game-logo" placeholder="Logo URL" value="${game.logo || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="inline-edit-game-apworld-link" placeholder="Apworld Link" value="${game.apworld_link || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="inline-edit-game-apworld-version" placeholder="Apworld Version (or 'Core')" value="${game.apworld_version || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="inline-edit-game-mod-link" placeholder="Mod Link" value="${game.mod_link || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="text" id="inline-edit-game-mod-version" placeholder="Mod Version" value="${game.mod_version || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="inline-edit-game-mod-setup-guide-link" placeholder="Setup Guide Link" value="${game.mod_setup_guide_link || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="inline-edit-game-tracker-link" placeholder="Tracker Link" value="${game.tracker_link || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="inline-edit-game-support-link" placeholder="Support Link" value="${game.support_link || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="inline-edit-game-save-file-link" placeholder="Save File Link" value="${game.save_file_link || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="url" id="inline-edit-game-game-info-link" placeholder="Game Info Link" value="${game.game_info_link || ""}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <input type="number" id="inline-edit-game-slot-count" placeholder="Slot Count (0 = no limit)" min="0" value="${game.slot_count || 1}" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white">
                    <textarea id="inline-edit-game-rules" placeholder="Rules" rows="2" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2">${game.rules || ""}</textarea>
                    <textarea id="inline-edit-game-extra-information" placeholder="Extra Information" rows="2" class="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white md:col-span-2">${game.extra_information || ""}</textarea>
                </div>
                <div class="flex gap-2 mt-4">
                  <button onclick="saveInlineEditedGame('${game.id}')" class="bg-ap-accent hover:bg-ap-accent/80 text-slate-900 font-bold py-2 px-4 rounded-lg">Save Changes</button>
                  <button onclick="deleteInlineGame('${game.id}')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Delete Game</button>
                  <button onclick="closeModeratorModal()" class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg">Cancel</button>
                </div>
            </div>
            
            <!-- Live Preview -->
            <div class="glass rounded-lg p-4">
                <h4 class="text-sm font-semibold text-slate-300 mb-3">Live Preview</h4>
                <div id="inline-edit-game-preview" class="glass rounded-xl p-6 flex flex-col gap-4 transition-all hover:border-ap-accent/50"></div>
            </div>
        </div>
    `;

  modal.classList.remove("hidden");

  // Setup live preview
  setupInlineGamePreview(game);
}

// Delete a game from inline editor
async function deleteInlineGame(gameId) {
  if (
    !confirm(
      "Are you sure you want to permanently remove this game? This cannot be undone."
    )
  )
    return;

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({ action: "removeGame", gameId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to remove game");
    alert("Game removed successfully!");
    closeModeratorModal();
    loadData();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// Setup live preview for game editing
function setupInlineGamePreview(originalGame) {
  const inputs = [
    "inline-edit-game-name",
    "inline-edit-game-yaml-slot-name",
    "inline-edit-game-slot-count",
    "inline-edit-game-logo",
    "inline-edit-game-apworld-link",
    "inline-edit-game-apworld-version",
    "inline-edit-game-mod-link",
    "inline-edit-game-mod-version",
    "inline-edit-game-mod-setup-guide-link",
    "inline-edit-game-tracker-link",
    "inline-edit-game-game-info-link",
    "inline-edit-game-support-link",
    "inline-edit-game-save-file-link",
    "inline-edit-game-rules",
    "inline-edit-game-extra-information"
  ];

  function updatePreview() {
    const previewGame = {
      ...originalGame,
      name: $("inline-edit-game-name").value || originalGame.name,
      yaml_slot_name: $("inline-edit-game-yaml-slot-name").value,
      slot_count: (function () {
        const v = parseInt($("inline-edit-game-slot-count").value, 10);
        return isNaN(v) ? 1 : v;
      })(),
      logo: $("inline-edit-game-logo").value,
      apworld_link: $("inline-edit-game-apworld-link").value,
      apworld_version: $("inline-edit-game-apworld-version").value,
      mod_link: $("inline-edit-game-mod-link").value,
      mod_version: $("inline-edit-game-mod-version").value,
      mod_setup_guide_link: $("inline-edit-game-mod-setup-guide-link").value,
      tracker_link: $("inline-edit-game-tracker-link").value,
      game_info_link: $("inline-edit-game-game-info-link").value,
      support_link: $("inline-edit-game-support-link").value,
      save_file_link: $("inline-edit-game-save-file-link").value,
      rules: $("inline-edit-game-rules").value,
      extra_information: $("inline-edit-game-extra-information").value
    };

    renderGamePreview(previewGame, "inline-edit-game-preview");
  }

  inputs.forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", updatePreview);
  });

  updatePreview();
}

// Render game preview
function renderGamePreview(game, containerId) {
  const container = $(containerId);
  if (!container) return;

  const hasCoverImage = game.logo && game.logo.trim() !== "";
  const hasRules = game.rules && game.rules.trim() !== "";
  const hasExtraInfo =
    game.extra_information && game.extra_information.trim() !== "";
  const hasApworldVersion =
    game.apworld_version && game.apworld_version.trim() !== "";
  const hasModVersion = game.mod_version && game.mod_version.trim() !== "";

  const links = [
    {
      url: game.apworld_link,
      icon: "fa-globe",
      label: `Apworld${hasApworldVersion ? ` (${game.apworld_version})` : ""}`
    },
    {
      url: game.mod_link,
      icon: "fa-puzzle-piece",
      label: `Mod${hasModVersion ? ` (${game.mod_version})` : ""}`
    },
    { url: game.mod_setup_guide_link, icon: "fa-book", label: "Setup Guide" },
    { url: game.tracker_link, icon: "fa-map", label: "Tracker" },
    { url: game.game_info_link, icon: "fa-circle-info", label: "Game Info" },
    { url: game.support_link, icon: "fa-circle-question", label: "Support" },
    {
      url: game.save_file_link,
      icon: "fa-download",
      label: "Save File",
      primary: true
    }
  ].filter((l) => l.url && l.url.trim() !== "");

  container.innerHTML = `
        <div class="game-card-header">
            ${
              hasCoverImage
                ? `
                <div class="cover-art-container">
                    <img src="${game.logo}" alt="${game.name}" class="cover-art-logo" onerror="this.style.display='none'">
                </div>
            `
                : '<div class="cover-art-container"></div>'
            }
            
            <div class="game-card-title-time-row">
                <div class="game-card-title">
                    <h2 class="text-xl font-bold text-white">${game.name}</h2>
                    <span class="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-500/20 text-green-400">Available</span>
                </div>
            </div>
        </div>
        
        ${
          hasRules
            ? `
            <div class="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 border border-slate-700 overflow-hidden">
                <span class="text-ap-accent font-semibold">Rules:</span> <span class="break-words overflow-wrap-anywhere">${game.rules}</span>
            </div>
        `
            : ""
        }
        
        ${
          hasExtraInfo
            ? `
            <div class="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 border border-slate-700 overflow-hidden">
                <span class="text-ap-accent font-semibold">Information:</span> <span class="break-words overflow-wrap-anywhere">${game.extra_information}</span>
            </div>
        `
            : ""
        }
        
        ${
          links.length > 0
            ? `
            <div class="grid grid-cols-2 gap-2 text-sm min-w-0">
                ${links.map((link) => renderLink(link.url, link.icon, link.label, link.primary)).join("")}
            </div>
        `
            : ""
        }
    `;
}

// Render player preview (same look as inline edit players preview)
function renderPlayerPreview(player, containerId) {
  const container = $(containerId);
  if (!container) return;

  // If all fields empty, show placeholder
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

  const avatar =
    player.pfp_link && player.pfp_link.trim() !== ""
      ? `<img src="${player.pfp_link}" alt="${player.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #38bdf8; background: #222;" onerror="this.src='data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23888\'><path d=\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\'/></svg>'">`
      : `<div style="width: 60px; height: 60px; border-radius: 50%; background: #38bdf8/0.2; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-user" style="font-size: 1.5rem; color: #38bdf8;"></i></div>`;

  const playerRoles = player && player.roles ? player.roles : [];

  let rolesHtml = "";
  if (playerRoles.length > 0) {
    rolesHtml =
      '<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 4px;">';
    playerRoles.forEach((roleName) => {
      const role = availableRoles.find((r) => r.name === roleName);
      if (role) {
        const roleColor = role.color;
        rolesHtml += `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; background-color: ${roleColor}33; color: ${roleColor}; border: 1px solid ${roleColor};"><span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: ${roleColor};"></span>${role.name}</span>`;
      }
    });
    rolesHtml += "</div>";
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%;">
      <div style="position: relative;">${avatar}</div>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; overflow: hidden;">
        <h3 style="margin: 0; font-size: 0.95rem; color: #e2e8f0; text-decoration: underline; text-underline-offset: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${player.name}</h3>
        ${rolesHtml}
        ${player.pronouns ? `<p style="margin: 0; font-size: 0.8rem; padding: 2px 10px; border-radius: 9999px; color: #38bdf8; border: 1px solid #38bdf838; background-color: #38bdf822;">${player.pronouns}</p>` : ""}
        ${player.bio ? `<p style="margin: 0; font-size: 0.75rem; color: #94a3b8; text-align: center; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; max-height: 40px; overflow-y: auto;">${player.bio}</p>` : ""}
        ${player.discord ? `<p style="margin: 0; font-size: 0.7rem; color: #5865F2;"><i class="fa-brands fa-discord" style="margin-right: 4px;"></i>${player.discord}</p>` : ""}
      </div>
    </div>
  `;
}

// Save inline edited game
async function saveInlineEditedGame(gameId) {
  const gameData = {
    name: $("inline-edit-game-name").value.trim(),
    yaml_slot_name: $("inline-edit-game-yaml-slot-name").value.trim(),
    slot_count: (function () {
      const v = parseInt($("inline-edit-game-slot-count").value, 10);
      return isNaN(v) ? 1 : v;
    })(),
    logo: $("inline-edit-game-logo").value.trim(),
    apworld_link: $("inline-edit-game-apworld-link").value.trim(),
    apworld_version: $("inline-edit-game-apworld-version").value.trim(),
    mod_link: $("inline-edit-game-mod-link").value.trim(),
    mod_version: $("inline-edit-game-mod-version").value.trim(),
    mod_setup_guide_link: $(
      "inline-edit-game-mod-setup-guide-link"
    ).value.trim(),
    tracker_link: $("inline-edit-game-tracker-link").value.trim(),
    game_info_link: $("inline-edit-game-game-info-link").value.trim(),
    support_link: $("inline-edit-game-support-link").value.trim(),
    save_file_link: $("inline-edit-game-save-file-link").value.trim(),
    rules: $("inline-edit-game-rules").value.trim(),
    extra_information: $("inline-edit-game-extra-information").value.trim()
  };

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({ action: "updateGame", gameId, gameData })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Game updated successfully!");
    closeModeratorModal();
    loadData();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function saveEditedPlayer() {
  const playerName = $("edit-player-select").value;
  if (!playerName) return;

  const playerData = {
    name: playerName,
    newName: $("edit-player-new-name").value.trim() || undefined,
    pfp_link: $("edit-player-pfp").value.trim(),
    bio: $("edit-player-bio").value.trim(),
    pronouns: $("edit-player-pronouns").value.trim(),
    discord: $("edit-player-discord").value.trim()
  };

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({ action: "updatePlayer", playerData })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Player updated successfully!");
    loadData();
    closeModeratorModal();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deletePlayer() {
  const playerName = $("edit-player-select").value;
  if (!playerName) return;

  if (
    !confirm(
      `Are you sure you want to delete player "${playerName}"? This action cannot be undone.`
    )
  ) {
    return;
  }

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({ action: "deletePlayer", playerName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Player deleted successfully!");
    loadData();
    closeModeratorModal();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function removeLog(gameId, logIndex) {
  if (!confirm("Are you sure you want to remove this log?")) return;

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({
        action: "updateLog",
        logData: { gameId, action: "remove", index: logIndex }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Log removed successfully!");
    loadData();
    openModeratorModal(); // Refresh the modal
  } catch (err) {
    alert("Error: " + err.message);
  }
}

let availableRoles = [];
let editingRoleOriginal = null;

async function loadRoles() {
  try {
    const res = await fetch(`/api/get-data?type=roles`);
    if (res.ok) {
      availableRoles = await res.json();
    }
  } catch (err) {
    console.error("Failed to load roles:", err);
  }
}

async function addNewRole() {
  const roleName = $("new-role-name").value.trim();
  const roleColor = $("new-role-color").value;

  if (!roleName) return alert("Please enter a role name");

  try {
    const payload = editingRoleOriginal
      ? { action: "updateRole", originalName: editingRoleOriginal, roleData: { name: roleName, color: roleColor } }
      : { action: "addRole", roleData: { name: roleName, color: roleColor } };

    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message);
    alert(editingRoleOriginal ? "Role updated successfully!" : "Role added successfully!");
    $("new-role-name").value = "";
    editingRoleOriginal = null;
    loadRoles();
    openModeratorModal();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// Delete role from inline modal
async function deleteRoleInline(roleName) {
  if (!confirm(`Delete role "${roleName}"? This will remove it from all players.`)) return;
  try {
    const res = await fetch('/api/moderator-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
      body: JSON.stringify({ action: 'deleteRole', roleName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Failed to delete role');
    alert(data.message || 'Role deleted');
    await loadRoles();
    openModeratorModal();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function assignRole(action) {
  const playerName = $("role-player-select").value;
  const roleName = $("role-select").value;

  if (!playerName) return alert("Please select a player");
  if (!roleName) return alert("Please select a role");

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({
        action: "assignRole",
        assignRoleData: { playerName, roleName, action }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert(`Role ${action === "add" ? "assigned" : "removed"} successfully!`);
    loadData();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// Load roles and awards when moderator modal opens
const originalOpenModeratorModal = openModeratorModal;
openModeratorModal = async function () {
  await Promise.all([loadRoles(), loadAwards()]);
  await originalOpenModeratorModal();

  // Populate role select
  const roleSelect = $("role-select");
  if (roleSelect) {
    roleSelect.innerHTML =
      '<option value="">Select a role...</option>' +
      availableRoles
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => `<option value="${r.name}">${r.name}</option>`)
        .join("");
  }

  // Populate award select
  populateAwardSelect();

  // Populate award player select
  const awardPlayerSelect = $("award-player-select");
  if (awardPlayerSelect && players.length > 0) {
    awardPlayerSelect.innerHTML =
      '<option value="">Select a player...</option>' +
      players
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => `<option value="${p.name}">${p.name}</option>`)
        .join("");
  }

  // Initialize award preview
  updateAwardPreview();
  attachAwardPreviewListeners();

  // Populate moderator select if admin
  if (isAdmin) {
    const modSelect = $("moderator-select");
    const adminSelect = $("admin-select");
    if (modSelect) {
      await populateModeratorSelect();

      // Add change listener for moderator select
      modSelect.addEventListener("change", async () => {
        const selectedMod = modSelect.value;
        const permsContainer = $("moderator-permissions-container");
        if (selectedMod && permsContainer) {
          permsContainer.classList.remove("hidden");
          // Load current permissions for this moderator
          await loadModeratorPermissions(selectedMod);
        } else if (permsContainer) {
          permsContainer.classList.add("hidden");
        }
      });
    }
    if (adminSelect) {
      await populateAdminSelect();
    }
  }
};

async function loadModeratorPermissions(moderatorName) {
  try {
    const res = await fetch("/api/get-moderators", {
      headers: AUTH.authHeader()
    });
    if (res.ok) {
      const data = await res.json();
      const mod = data.moderators.find((m) => m.name === moderatorName);
      if (mod && mod.permissions) {
        document.getElementById("perm-manageModerators").checked =
          mod.permissions.manageModerators || false;
        document.getElementById("perm-manageGames").checked =
          mod.permissions.manageGames || false;
        document.getElementById("perm-managePlayers").checked =
          mod.permissions.managePlayers || false;
        document.getElementById("perm-manageRoles").checked =
          mod.permissions.manageRoles || false;
        document.getElementById("perm-manageAwards").checked =
          mod.permissions.manageAwards || false;
        document.getElementById("perm-manageSettings").checked =
          mod.permissions.manageSettings || false;
      }
    }
  } catch (err) {
    console.error("Failed to load moderator permissions:", err);
  }
}

async function populateModeratorSelect() {
  try {
    const res = await fetch("/api/get-moderators", {
      headers: AUTH.authHeader()
    });
    if (res.ok) {
      const data = await res.json();
      const modSelect = $("moderator-select");
      if (modSelect) {
        modSelect.innerHTML =
          '<option value="">Select a moderator...</option>' +
          data.moderators
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((m) => `<option value="${m.name}">${m.name}</option>`)
            .join("");
      }
      const adminSelect = $("admin-select");
      if (adminSelect) {
        adminSelect.innerHTML =
          '<option value="">Select a moderator...</option>' +
          data.moderators
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((m) => `<option value="${m.name}">${m.name}</option>`)
            .join("");
      }
    }
  } catch (err) {
    console.error("Failed to load moderators:", err);
  }
}

async function populateAdminSelect() {
  try {
    const res = await fetch("/api/get-moderators", {
      headers: AUTH.authHeader()
    });
    if (res.ok) {
      const data = await res.json();
      const adminSelect = $("admin-select");
      if (adminSelect) {
        adminSelect.innerHTML =
          '<option value="">Select a moderator...</option>' +
          data.moderators
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((m) => `<option value="${m.name}">${m.name}</option>`)
            .join("");
      }
    }
  } catch (err) {
    console.error("Failed to load moderators:", err);
  }
}

async function manageModerator(action) {
  const name = $("moderator-name-select").value;

  if (!name) return alert("Please select a player");

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({
        action: "manageModerators",
        moderatorData: { name, action }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert(`Moderator ${action === "add" ? "added" : "removed"} successfully!`);
    $("moderator-name-select").value = "";
    openModeratorModal(); // Refresh the modal
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function updateModeratorPermissions() {
  const name = $("moderator-select").value;

  if (!name) return alert("Please select a moderator");

  const permissions = {
    manageModerators: document.getElementById("perm-manageModerators").checked,
    manageGames: document.getElementById("perm-manageGames").checked,
    managePlayers: document.getElementById("perm-managePlayers").checked,
    manageRoles: document.getElementById("perm-manageRoles").checked,
    manageAwards: document.getElementById("perm-manageAwards").checked,
    manageSettings: document.getElementById("perm-manageSettings").checked
  };

// Tab helpers for roles/awards in moderator modal
function switchRolesTab(tab) {
  const createBtn = $("roles-tab-create");
  const editBtn = $("roles-tab-edit");
  const createContent = $("roles-tab-content-create");
  const editContent = $("roles-tab-content-edit");
  if (!createBtn || !editBtn || !createContent || !editContent) return;
  if (tab === "create") {
    createBtn.classList.add("bg-ap-accent");
    createBtn.classList.remove("bg-slate-700", "text-slate-300");
    editBtn.classList.remove("bg-ap-accent");
    editBtn.classList.add("bg-slate-700", "text-slate-300");
    createContent.classList.remove("hidden");
    editContent.classList.add("hidden");
  } else {
    createBtn.classList.remove("bg-ap-accent");
    createBtn.classList.add("bg-slate-700", "text-slate-300");
    editBtn.classList.add("bg-ap-accent");
    editBtn.classList.remove("bg-slate-700", "text-slate-300");
    createContent.classList.add("hidden");
    editContent.classList.remove("hidden");
    populateRolesEditList();
  }
}

function switchAwardsTab(tab) {
  const createBtn = $("awards-tab-create");
  const editBtn = $("awards-tab-edit");
  const createContent = $("awards-tab-content-create");
  const editContent = $("awards-tab-content-edit");
  if (!createBtn || !editBtn || !createContent || !editContent) return;
  if (tab === "create") {
    createBtn.classList.add("bg-ap-accent");
    createBtn.classList.remove("bg-slate-700", "text-slate-300");
    editBtn.classList.remove("bg-ap-accent");
    editBtn.classList.add("bg-slate-700", "text-slate-300");
    createContent.classList.remove("hidden");
    editContent.classList.add("hidden");
  } else {
    createBtn.classList.remove("bg-ap-accent");
    createBtn.classList.add("bg-slate-700", "text-slate-300");
    editBtn.classList.add("bg-ap-accent");
    editBtn.classList.remove("bg-slate-700", "text-slate-300");
    createContent.classList.add("hidden");
    editContent.classList.remove("hidden");
    populateAwardsEditList();
  }
}

function populateRolesEditList() {
  const list = $("roles-edit-list");
  if (!list) return;
  list.innerHTML = "";
  if (!availableRoles || availableRoles.length === 0) {
    list.innerHTML = '<div class="text-slate-500">No roles defined.</div>';
    return;
  }
  availableRoles
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((r) => {
      const item = document.createElement("div");
      item.className = "flex items-center justify-between gap-2 bg-slate-800/40 p-2 rounded";
      item.innerHTML = `
        <div class="flex items-center gap-3">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${r.color}"></span>
          <div style="min-width:0;"><div style="color:#e2e8f0;font-weight:700;">${r.name}</div></div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm" onclick='prefillRoleForEdit(${JSON.stringify(r)})'>Edit</button>
          <button class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm" onclick='promptDeleteRole(${JSON.stringify(r.name)})'>Delete</button>
        </div>
      `;
      list.appendChild(item);
    });
}

function populateAwardsEditList() {
  const list = $("awards-edit-list");
  if (!list) return;
  list.innerHTML = "";
  if (!availableAwards || availableAwards.length === 0) {
    list.innerHTML = '<div class="text-slate-500">No awards defined.</div>';
    return;
  }
  availableAwards
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((a) => {
      const item = document.createElement("div");
      item.className = "flex items-center justify-between gap-2 bg-slate-800/40 p-2 rounded";
      const iconHtml = a.icon && a.icon.startsWith && a.icon.startsWith("fa-") ? `<i class="fa-solid ${a.icon}" style="color:${a.color};"></i>` : a.icon || "🏆";
      item.innerHTML = `
        <div class="flex items-center gap-3">
          ${iconHtml}
          <div style="min-width:0;"><div style="color:#e2e8f0;font-weight:700;">${a.name}</div><div style="color:#94a3b8;font-size:0.85rem;">${a.description || ''}</div></div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm" onclick='prefillAwardForEdit(${JSON.stringify(a)})'>Edit</button>
          <button class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm" onclick='promptDeleteAward(${JSON.stringify(a.name)})'>Delete</button>
        </div>
      `;
      list.appendChild(item);
    });
}

// Prefill helpers: copy selected item into create inputs for quick editing
function prefillRoleForEdit(role) {
  const nameInput = $("new-role-name");
  const colorInput = $("new-role-color");
  if (nameInput && colorInput) {
    nameInput.value = role.name;
    colorInput.value = role.color || "#ff0000";
    switchRolesTab("create");
    nameInput.focus();
    editingRoleOriginal = role.name;
  }
}

function prefillAwardForEdit(award) {
  const nameInput = $("award-name-input");
  const iconInput = $("award-icon-input");
  const descInput = $("award-description-input");
  if (nameInput && iconInput && descInput) {
    nameInput.value = award.name;
    iconInput.value = award.icon || "";
    descInput.value = award.description || "";
    switchAwardsTab("create");
    nameInput.focus();
    editingAwardOriginal = award.name;
  }
}

function promptDeleteRole(roleName) {
  // call API deletion
  if (!confirm(`Delete role "${roleName}"? This will remove it from all players.`)) return;
  deleteRoleInline(roleName);
}

function promptDeleteAward(awardName) {
  if (!confirm(`Delete award "${awardName}"? This will remove it from all players.`)) return;
  // call API deletion
  (async () => {
    try {
      const res = await fetch('/api/manage-awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH.authHeader() },
        body: JSON.stringify({ action: 'deleteAward', awardName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to delete award');
      alert(data.message || 'Award deleted');
      await loadAwards();
      await loadData();
      openModeratorModal();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  })();
}

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({
        action: "manageModerators",
        moderatorData: { name, action: "updatePermissions", permissions }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Permissions updated successfully!");
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function updateCheesetrackerSettings() {
  const url = $("cheesetracker-url-input").value.trim();

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({
        action: "updateSettings",
        settingsData: { cheesetracker_url: url }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Cheesetracker settings saved successfully!");
    loadData();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function updateEventTimeSettings() {
  const startTime = $("event-start-time-input").value;
  const endTime = $("event-end-time-input").value;

  try {
    const res = await fetch("/api/moderator-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({
        action: "updateSettings",
        settingsData: {
          start_time: startTime,
          end_time: endTime
        }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Event time settings saved successfully!");
    loadData();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

// Award management functions
let availableAwards = [];

async function loadAwards() {
  try {
    const res = await fetch("/api/manage-awards");
    if (res.ok) {
      const data = await res.json();
      availableAwards = data.awards || [];
    }
  } catch (err) {
    console.error("Failed to load awards:", err);
  }
}

async function createAward() {
  const name = $("award-name-input").value.trim();
  const icon = $("award-icon-input").value.trim();
  const description = $("award-description-input").value.trim();

  if (!name) return alert("Please enter an award name");

  try {
    const res = await fetch("/api/manage-awards", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({
        action: "addAward",
        awardData: { name, icon, description }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert("Award created successfully!");
    $("award-name-input").value = "";
    $("award-icon-input").value = "";
    $("award-description-input").value = "";
    updateAwardPreview();
    await loadAwards();
    populateAwardSelect();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

function updateAwardPreview() {
  const name = $("award-name-input")?.value.trim() || "";
  const icon = $("award-icon-input")?.value.trim() || "";
  const description = $("award-description-input")?.value.trim() || "";

  const previewContainer = $("award-preview");

  // If all fields are empty, show the placeholder message
  if (!name && !icon && !description) {
    if (previewContainer) {
      previewContainer.innerHTML = `<div class="text-center text-slate-400 text-sm">Start typing to see preview...</div>`;
    }
    return;
  }

  // Ensure preview structure exists
  if (previewContainer) {
    previewContainer.innerHTML = `
      <span id="preview-icon" class="text-2xl w-8 text-center"></span>
      <div>
        <div id="preview-name" class="font-bold text-white"></div>
        <div id="preview-description" class="text-xs text-slate-400"></div>
      </div>
    `;
  }

  const previewName = document.getElementById("preview-name");
  const previewIcon = document.getElementById("preview-icon");
  const previewDescription = document.getElementById("preview-description");

  if (previewName) previewName.textContent = name || "Award Name";

  // Render icon - check if it's a FontAwesome icon (starts with "fa-")
  if (previewIcon) {
    if (icon && icon.startsWith("fa-")) {
      // FontAwesome icon
      previewIcon.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    } else {
      // Emoji or plain text
      previewIcon.textContent = icon || "";
    }
  }

  if (previewDescription)
    previewDescription.textContent =
      description || "Description will appear here";
}

function attachAwardPreviewListeners() {
  const nameInput = $("award-name-input");
  const iconInput = $("award-icon-input");
  const descInput = $("award-description-input");

  if (nameInput) {
    nameInput.removeEventListener("input", updateAwardPreview);
    nameInput.addEventListener("input", updateAwardPreview);
  }
  if (iconInput) {
    iconInput.removeEventListener("input", updateAwardPreview);
    iconInput.addEventListener("input", updateAwardPreview);
  }
  if (descInput) {
    descInput.removeEventListener("input", updateAwardPreview);
    descInput.addEventListener("input", updateAwardPreview);
  }
}

function populateAwardSelect() {
  const awardSelect = $("award-select");
  if (awardSelect && availableAwards.length > 0) {
    awardSelect.innerHTML =
      '<option value="">Select an award...</option>' +
      availableAwards
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (a) =>
            `<option value="${a.name}" data-icon="${a.icon || ""}" data-description="${(a.description || "").replace(/"/g, "&quot;")}">${a.name}</option>`
        )
        .join("");
  }
}

async function assignAward(action) {
  const awardName = $("award-select").value;
  const playerName = $("award-player-select").value;

  if (!awardName) return alert("Please select an award");
  if (!playerName) return alert("Please select a player");

  const award = availableAwards.find((a) => a.name === awardName);
  if (!award) return alert("Award not found");

  try {
    const res = await fetch("/api/manage-awards", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH.authHeader() },
      body: JSON.stringify({
        action: "assignAward",
        assignAwardData: {
          playerName,
          awardName,
          icon: award.icon,
          description: award.description,
          action
        }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert(`Award ${action === "add" ? "given" : "removed"} successfully!`);
    loadData();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

loadData();
setInterval(loadData, 10000);
