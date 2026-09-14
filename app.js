const teamCount = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 }
};

const missionTeamSizes = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5]
};

const trackerStorageKey = "avalon-game-tracker-v1";

const roles = {
  merlin: {
    key: "merlin",
    name: "梅林",
    team: "good",
    description: "你知道大部分邪惡陣營玩家，但看不到莫德雷德。"
  },
  percival: {
    key: "percival",
    name: "派西維爾",
    team: "good",
    description: "你會看見梅林與莫甘娜，但不知道誰是誰。"
  },
  loyal: {
    key: "loyal",
    name: "忠臣",
    team: "good",
    description: "你沒有額外資訊。請幫助正義陣營完成任務。"
  },
  assassin: {
    key: "assassin",
    name: "刺客",
    team: "evil",
    description: "若正義陣營完成三次任務，你可以刺殺梅林。"
  },
  morgana: {
    key: "morgana",
    name: "莫甘娜",
    team: "evil",
    description: "你會在派西維爾眼中偽裝成梅林。"
  },
  mordred: {
    key: "mordred",
    name: "莫德雷德",
    team: "evil",
    description: "梅林無法看見你。"
  },
  oberon: {
    key: "oberon",
    name: "奧伯倫",
    team: "evil",
    description: "你不知道其他邪惡陣營，其他邪惡陣營也不知道你。"
  },
  minion: {
    key: "minion",
    name: "爪牙",
    team: "evil",
    description: "你屬於邪惡陣營。"
  }
};

let state = {
  playerCount: 7,
  selected: new Set(["merlin", "assassin", "percival", "morgana"]),
  players: [],
  gameRoles: [],
  revealIndex: 0,
  showingRole: false,
  nightSteps: [],
  nightIndex: 0,
  autoPlaying: false,
  autoPlayTimer: null,
  currentUtterance: null,
  voiceName: "",
  isPaused: false,
  pendingAction: null,
  wakeLock: null,
  tracker: null,
  editingRecordIndex: null,
  editDraft: null
};

function goTo(id) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);
}

function changePlayerCount(delta) {
  const next = state.playerCount + delta;
  if (next < 5 || next > 10) return;
  state.playerCount = next;
  renderSetup();
}

function renderSetup() {
  document.getElementById("playerCountText").textContent = `${state.playerCount} 人`;

  const counts = teamCount[state.playerCount];
  document.getElementById("teamSummary").textContent =
    `正義 ${counts.good} 人 / 邪惡 ${counts.evil} 人`;

  const container = document.getElementById("roleList");

  const renderRoleItem = key => {
    const role = roles[key];
    const checked = state.selected.has(key) ? "checked" : "";
    return `
      <label class="role-item role-choice">
        <input type="checkbox" ${checked} onchange="toggleRole('${key}', this.checked)" />
        <div class="role-meta">
          <strong>${role.name}</strong>
          <small>${role.description}</small>
        </div>
      </label>
    `;
  };

  container.innerHTML = `
    <section class="role-section good-section">
      <div class="role-section-title"><span>🛡️ 正義聯盟</span><small>${counts.good} 人</small></div>
      ${renderRoleItem("merlin")}
      ${renderRoleItem("percival")}
    </section>
    <section class="role-section evil-section">
      <div class="role-section-title"><span>⚔️ 邪惡陣營</span><small>${counts.evil} 人</small></div>
      ${renderRoleItem("assassin")}
      ${["morgana", "mordred", "oberon"].map(key => renderRoleItem(key)).join("")}
    </section>
  `;
}

function toggleRole(key, checked) {
  if (checked) state.selected.add(key);
  else state.selected.delete(key);
}

function buildRoles() {
  const counts = teamCount[state.playerCount];
  const good = [];
  const evil = [];

  for (const key of state.selected) {
    const role = roles[key];
    if (role.team === "good") good.push(role);
    else evil.push(role);
  }

  if (good.length > counts.good || evil.length > counts.evil) {
    alert("特殊角色太多，超過這個人數的陣營名額。");
    return null;
  }

  while (good.length < counts.good) good.push(roles.loyal);
  while (evil.length < counts.evil) evil.push(roles.minion);

  return [...good, ...evil];
}

function getRoleWarnings(roleList) {
  const keys = new Set(roleList.map(role => role.key));
  const warnings = [];

  if (!keys.has("merlin")) warnings.push("未選擇梅林");
  if (!keys.has("assassin")) warnings.push("未選擇刺客");
  if (keys.has("percival") && !keys.has("morgana")) {
    warnings.push("派西維爾未搭配莫甘娜");
  }
  if (keys.has("morgana") && !keys.has("percival")) {
    warnings.push("莫甘娜未搭配派西維爾");
  }

  return warnings;
}

function confirmRoleWarnings(roleList) {
  const warnings = getRoleWarnings(roleList);
  if (warnings.length === 0) return true;
  return window.confirm(
    `角色組合提醒\n\n觸發提醒：${warnings.join("、")}\n\n仍要繼續嗎？`
  );
}

function startNarratorOnly() {
  const roleList = buildRoles();
  if (!roleList || !confirmRoleWarnings(roleList)) return;

  state.players = [];
  state.gameRoles = [...roleList];
  clearTrackerState();
  buildNightSteps();
  goTo("night");
  renderNight();
}

function summarizeRoles(roleList) {
  const summary = new Map();
  for (const role of roleList) {
    summary.set(role.name, (summary.get(role.name) || 0) + 1);
  }
  return [...summary.entries()].map(([name, count]) => ({ name, count }));
}

function renderConfirmationTeam(title, icon, roleList, teamClass) {
  const items = summarizeRoles(roleList).map(({ name, count }) => `
    <li><span>${name}</span>${count > 1 ? `<strong>× ${count}</strong>` : ""}</li>
  `).join("");

  return `
    <section class="confirmation-team ${teamClass}">
      <h3>${icon} ${title}<small>${roleList.length} 人</small></h3>
      <ul>${items}</ul>
    </section>
  `;
}

function showRoleConfirmation() {
  const roleList = buildRoles();
  if (!roleList || !confirmRoleWarnings(roleList)) return;

  const goodRoles = roleList.filter(role => role.team === "good");
  const evilRoles = roleList.filter(role => role.team === "evil");
  document.getElementById("roleConfirmation").innerHTML =
    renderConfirmationTeam("正義聯盟", "🛡️", goodRoles, "confirmation-good") +
    renderConfirmationTeam("邪惡陣營", "⚔️", evilRoles, "confirmation-evil");
  goTo("confirm");
}

function buildNameInputs() {
  if (!buildRoles()) return;

  const container = document.getElementById("nameInputs");
  container.innerHTML = "";

  for (let i = 0; i < state.playerCount; i++) {
    const input = document.createElement("input");
    input.className = "name-input";
    input.id = `playerName${i}`;
    input.value = `玩家 ${i + 1}`;
    input.placeholder = `玩家 ${i + 1}`;
    container.appendChild(input);
  }

  goTo("names");
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function startGame() {
  const roleList = buildRoles();
  if (!roleList) return;
  state.gameRoles = [...roleList];
  clearTrackerState();

  const names = [];
  for (let i = 0; i < state.playerCount; i++) {
    const raw = document.getElementById(`playerName${i}`).value.trim();
    names.push(raw || `玩家 ${i + 1}`);
  }

  const shuffled = shuffle([...roleList]);

  state.players = names.map((name, index) => ({
    name,
    role: shuffled[index]
  }));

  state.revealIndex = 0;
  state.showingRole = false;
  renderReveal();
  goTo("reveal");
}

function renderReveal() {
  const player = state.players[state.revealIndex];
  const container = document.getElementById("revealContent");

  if (!state.showingRole) {
    container.innerHTML = `
      <p>${state.revealIndex + 1} / ${state.players.length}</p>
      <div class="big-name">${player.name}</div>
      <p>請確認其他人看不到螢幕</p>
      <button class="primary" onclick="showRole()">查看我的身分</button>
    `;
    return;
  }

  const teamText = player.role.team === "good" ? "正義陣營" : "邪惡陣營";
  const teamClass = player.role.team === "good" ? "team-good" : "team-evil";

  container.innerHTML = `
    <p>${player.name}</p>
    <div class="role-name">${player.role.name}</div>
    <div class="${teamClass}">${teamText}</div>
    <p>${player.role.description}</p>
    <button class="primary" onclick="nextReveal()">
      ${state.revealIndex === state.players.length - 1 ? "所有人查看完畢" : "我知道了"}
    </button>
  `;
}

function showRole() {
  state.showingRole = true;
  renderReveal();
}

function nextReveal() {
  if (state.revealIndex < state.players.length - 1) {
    state.revealIndex++;
    state.showingRole = false;
    renderReveal();
    return;
  }

  buildNightSteps();
  goTo("night");
  renderNight();
}

function buildNightSteps() {
  const activeRoles = state.gameRoles.length
    ? state.gameRoles
    : state.players.map(player => player.role);
  const keys = new Set(activeRoles.map(role => role.key));
  const steps = ["所有人請閉上眼睛。"];

  // Evil recognition
  const visibleEvil = activeRoles.filter(
    role => role.team === "evil" && role.key !== "oberon"
  );
  if (visibleEvil.length >= 2) {
    const evilGroup = keys.has("oberon")
      ? "除了奧伯倫以外的邪惡陣營"
      : "邪惡陣營";
    steps.push(`${evilGroup}請睜開眼睛，互相確認身分。`);
    steps.push(`${evilGroup}請閉上眼睛。`);
  }

  // Merlin
  if (keys.has("merlin")) {
    const merlinVisibleEvil = activeRoles.filter(
      role => role.team === "evil" && role.key !== "mordred"
    );
    if (merlinVisibleEvil.length > 0) {
      const visibleEvilGroup = keys.has("mordred")
        ? "除了莫德雷德以外的邪惡陣營"
        : "邪惡陣營";
      steps.push(`${visibleEvilGroup}請豎起拇指。`);
      steps.push("梅林請睜開眼睛，確認你所看見的邪惡陣營。");
      steps.push("梅林請閉上眼睛。");
      steps.push(`${visibleEvilGroup}請收回拇指。`);
    }
  }

  // Percival
  if (keys.has("percival")) {
    const percivalTargets = [];
    if (keys.has("merlin")) percivalTargets.push("梅林");
    if (keys.has("morgana")) percivalTargets.push("莫甘娜");

    if (percivalTargets.length > 0) {
      const targetNames = percivalTargets.join("與");
      steps.push(`${targetNames}請豎起拇指。`);
      steps.push("派西維爾請睜開眼睛，確認你看見的玩家。");
      steps.push("派西維爾請閉上眼睛。");
      steps.push(`${targetNames}請收回拇指。`);
    }
  }

  steps.push("所有人請睜開眼睛。遊戲開始。");

  state.nightSteps = steps;
  state.nightIndex = 0;
}

function renderNight() {
  const step = state.nightSteps[state.nightIndex];
  document.getElementById("nightStepText").textContent = step;

  const progress =
    ((state.nightIndex + 1) / state.nightSteps.length) * 100;
  document.getElementById("nightProgress").style.width = `${progress}%`;
  updateNightControls();
}

function speakCurrentStep() {
  if (!("speechSynthesis" in window)) {
    alert("你的瀏覽器不支援文字轉語音。");
    return;
  }

  stopNightPlayback();
  const utterance = createNightUtterance(state.nightSteps[state.nightIndex]);
  speechSynthesis.speak(utterance);
}

function scoreVoice(voice) {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;
  if (lang === "zh-tw") score += 100;
  else if (lang.startsWith("zh")) score += 50;
  if (name.includes("natural") || name.includes("online")) score += 30;
  if (name.includes("yating") || name.includes("雅婷")) score += 1000;
  if (/hsiaochen|hsiaoyu|yun[- ]?jhe|hanhan|國語|台灣/.test(name)) score += 20;
  if (!voice.localService) score += 5;
  return score;
}

function getChineseVoices() {
  return speechSynthesis.getVoices()
    .filter(voice => voice.lang.toLowerCase().startsWith("zh"))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

function loadVoiceOptions() {
  if (!("speechSynthesis" in window)) return;
  const select = document.getElementById("voiceSelect");
  if (!select) return;

  const voices = getChineseVoices();
  select.innerHTML = "";

  if (voices.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "使用瀏覽器預設中文語音";
    select.appendChild(option);
    state.voiceName = "";
    return;
  }

  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name}（${voice.lang}）`;
    select.appendChild(option);
  }

  const preferred = voices.find(voice => voice.name === state.voiceName)
    || voices.find(voice => /yating|雅婷/i.test(voice.name))
    || voices[0];
  state.voiceName = preferred.name;
  select.value = state.voiceName;
}

function saveVoicePreference() {
  const select = document.getElementById("voiceSelect");
  state.voiceName = select ? select.value : "";
}

function createNightUtterance(text, isCountdown = false) {
  const utterance = new SpeechSynthesisUtterance(text);
  const selectedVoice = getChineseVoices().find(voice => voice.name === state.voiceName);
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.lang = selectedVoice ? selectedVoice.lang : "zh-TW";
  utterance.rate = isCountdown ? 0.78 : 0.82;
  utterance.pitch = 1.02;
  return utterance;
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || state.wakeLock) return;
  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
    });
  } catch (_) {
    state.wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!state.wakeLock) return;
  const lock = state.wakeLock;
  state.wakeLock = null;
  try {
    await lock.release();
  } catch (_) {
    // The browser may already have released it.
  }
}

function updateNightControls() {
  const playButton = document.getElementById("playAllButton");
  const pauseButton = document.getElementById("pauseResumeButton");
  const stopButton = document.getElementById("stopAllButton");
  if (!playButton || !pauseButton || !stopButton) return;
  playButton.disabled = state.autoPlaying;
  playButton.textContent = state.autoPlaying ? "播放中…" : "▶ 從頭播放";
  pauseButton.disabled = !state.autoPlaying;
  pauseButton.textContent = state.isPaused ? "▶ 繼續" : "⏸ 暫停";
  stopButton.disabled = !state.autoPlaying;
}

function scheduleAutoAction(action, delay) {
  state.pendingAction = action;
  if (state.isPaused) return;

  state.autoPlayTimer = window.setTimeout(() => {
    state.autoPlayTimer = null;
    if (state.isPaused) return;
    const nextAction = state.pendingAction;
    state.pendingAction = null;
    if (nextAction) nextAction();
  }, delay);
}

function toggleNightPause() {
  if (!state.autoPlaying) return;

  if (state.isPaused) {
    state.isPaused = false;
    requestWakeLock();
    if (speechSynthesis.paused) speechSynthesis.resume();
    if (state.pendingAction && !speechSynthesis.speaking) {
      const nextAction = state.pendingAction;
      state.pendingAction = null;
      nextAction();
    }
  } else {
    state.isPaused = true;
    if (state.autoPlayTimer !== null) {
      window.clearTimeout(state.autoPlayTimer);
      state.autoPlayTimer = null;
    }
    if (speechSynthesis.speaking) speechSynthesis.pause();
    releaseWakeLock();
  }

  updateNightControls();
}

function stepNeedsCountdown(step) {
  return step.includes("確認") || step.includes("互相");
}

function setNightCountdown(number) {
  const countdown = document.getElementById("nightCountdown");
  if (!countdown) return;
  countdown.textContent = number ? `${number}` : "";
  countdown.classList.toggle("visible", Boolean(number));
}

function playAllNightSteps() {
  if (!("speechSynthesis" in window)) {
    alert("你的瀏覽器不支援文字轉語音。");
    return;
  }
  stopNightPlayback();
  state.nightIndex = 0;
  state.autoPlaying = true;
  state.isPaused = false;
  state.pendingAction = null;
  requestWakeLock();
  setNightCountdown(null);
  renderNight();
  speakNextNightStep();
}

function speakNextNightStep() {
  if (!state.autoPlaying || state.isPaused) return;
  setNightCountdown(null);
  renderNight();
  const step = state.nightSteps[state.nightIndex];
  const utterance = createNightUtterance(step);
  state.currentUtterance = utterance;

  utterance.onend = () => {
    if (!state.autoPlaying) return;
    const continueFlow = () => {
      if (stepNeedsCountdown(step)) startSpokenCountdown(5);
      else scheduleNightAdvance(500);
    };
    if (state.isPaused) state.pendingAction = continueFlow;
    else continueFlow();
  };

  utterance.onerror = () => {
    state.autoPlaying = false;
    state.currentUtterance = null;
    updateNightControls();
  };
  speechSynthesis.speak(utterance);
}

function startSpokenCountdown(number) {
  if (!state.autoPlaying || state.isPaused) return;
  const spokenNumbers = { 5: "五", 4: "四", 3: "三", 2: "二", 1: "一" };
  setNightCountdown(number);

  const utterance = createNightUtterance(spokenNumbers[number], true);
  state.currentUtterance = utterance;
  utterance.onend = () => {
    if (!state.autoPlaying) return;
    scheduleAutoAction(() => {
      if (number > 1) startSpokenCountdown(number - 1);
      else {
        setNightCountdown(null);
        advanceNightAutomatically();
      }
    }, 450);
  };
  utterance.onerror = () => stopNightPlayback();
  speechSynthesis.speak(utterance);
}

function scheduleNightAdvance(delay) {
  scheduleAutoAction(advanceNightAutomatically, delay);
}

function advanceNightAutomatically() {
  if (!state.autoPlaying) return;
  if (state.nightIndex >= state.nightSteps.length - 1) {
    state.autoPlaying = false;
    state.currentUtterance = null;
    setNightCountdown(null);
    releaseWakeLock();
    updateNightControls();
    return;
  }
  state.nightIndex++;
  speakNextNightStep();
}

function stopNightPlayback() {
  if (state.autoPlayTimer !== null) {
    window.clearTimeout(state.autoPlayTimer);
    state.autoPlayTimer = null;
  }
  state.autoPlaying = false;
  state.isPaused = false;
  state.pendingAction = null;
  state.currentUtterance = null;
  setNightCountdown(null);
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  releaseWakeLock();
  updateNightControls();
}

function nextNightStep() {
  stopNightPlayback();
  if (state.nightIndex < state.nightSteps.length - 1) {
    state.nightIndex++;
    renderNight();
  }
}

function prevNightStep() {
  stopNightPlayback();
  if (state.nightIndex > 0) {
    state.nightIndex--;
    renderNight();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createTrackerState(names, initialLeaderIndex = 0) {
  const activeRoleKeys = new Set(state.gameRoles.map(role => role.key));
  return {
    version: 1,
    playerCount: names.length,
    players: [...names],
    missionNumber: 1,
    proposalNumber: 1,
    initialLeaderIndex,
    leaderIndex: initialLeaderIndex,
    selectedTeam: [],
    votes: createDefaultVotes(names.length),
    history: [],
    missionResults: [],
    awaitingMissionResult: false,
    approvedTeamIndexes: [],
    missionFailCount: 0,
    awaitingAssassination: false,
    assassinationResult: null,
    usesAssassination: activeRoleKeys.has("merlin") && activeRoleKeys.has("assassin"),
    gameEnded: false,
    endReason: "",
    victoryTeam: ""
  };
}

function createDefaultVotes(playerCount, vote = "reject") {
  const votes = {};
  for (let i = 0; i < playerCount; i++) votes[i] = vote;
  return votes;
}

function saveTrackerState() {
  if (!state.tracker) return;
  try {
    localStorage.setItem(trackerStorageKey, JSON.stringify(state.tracker));
  } catch (_) {
    // 瀏覽器若禁止儲存，仍可在本次開啟期間使用。
  }
  updateResumeTrackerButton();
}

function loadTrackerState() {
  try {
    const saved = JSON.parse(localStorage.getItem(trackerStorageKey));
    if (!saved || saved.version !== 1 || !Array.isArray(saved.players)) return null;
    if (saved.players.length < 5 || saved.players.length > 10) return null;
    saved.initialLeaderIndex = Number.isInteger(saved.initialLeaderIndex)
      ? saved.initialLeaderIndex
      : (saved.history[0]?.leaderIndex ?? saved.leaderIndex ?? 0);
    saved.gameEnded = Boolean(saved.gameEnded);
    saved.endReason = saved.endReason || "";
    saved.victoryTeam = saved.victoryTeam || "";
    saved.missionResults = Array.isArray(saved.missionResults) ? saved.missionResults : [];
    saved.awaitingMissionResult = Boolean(saved.awaitingMissionResult);
    saved.approvedTeamIndexes = Array.isArray(saved.approvedTeamIndexes)
      ? saved.approvedTeamIndexes
      : [];
    saved.missionFailCount = Number.isInteger(saved.missionFailCount)
      ? saved.missionFailCount
      : 0;
    saved.awaitingAssassination = Boolean(saved.awaitingAssassination);
    saved.assassinationResult = saved.assassinationResult ?? null;
    saved.usesAssassination = saved.usesAssassination ?? true;
    saved.votes = saved.votes || {};
    const fifthRejectionIndex = saved.history.findIndex(
      record => !record.passed && record.proposalNumber >= 5
    );
    if (fifthRejectionIndex >= 0) {
      const terminalRecord = saved.history[fifthRejectionIndex];
      saved.history = saved.history.slice(0, fifthRejectionIndex + 1);
      saved.missionNumber = terminalRecord.missionNumber;
      saved.proposalNumber = 5;
      saved.leaderIndex = (terminalRecord.leaderIndex + 1) % saved.players.length;
      saved.gameEnded = true;
      saved.victoryTeam = "evil";
      saved.endReason = `第 ${terminalRecord.missionNumber} 任務連續五次提案遭否決，邪惡陣營獲勝。`;
    }
    const completedMissions = new Set(saved.missionResults.map(result => result.missionNumber));
    const missingMissionResult = saved.history.find(
      record => record.passed && !completedMissions.has(record.missionNumber)
    );
    if (missingMissionResult && !saved.gameEnded) {
      saved.history = saved.history.filter(
        record => record.missionNumber <= missingMissionResult.missionNumber
      );
      saved.missionNumber = missingMissionResult.missionNumber;
      saved.awaitingMissionResult = true;
      saved.approvedTeamIndexes = [...missingMissionResult.teamIndexes];
      saved.missionFailCount = 0;
      saved.leaderIndex = (missingMissionResult.leaderIndex + 1) % saved.players.length;
    }
    if (!saved.gameEnded && saved.missionNumber <= 5 && Object.keys(saved.votes).length === 0) {
      saved.votes = createDefaultVotes(saved.players.length);
    }
    return saved;
  } catch (_) {
    return null;
  }
}

function clearTrackerState() {
  state.tracker = null;
  try {
    localStorage.removeItem(trackerStorageKey);
  } catch (_) {
    // Ignore unavailable storage.
  }
  updateResumeTrackerButton();
}

function updateResumeTrackerButton() {
  const button = document.getElementById("resumeTrackerButton");
  if (!button) return;
  let hasSavedTracker = Boolean(state.tracker);
  if (!hasSavedTracker) {
    try {
      hasSavedTracker = Boolean(localStorage.getItem(trackerStorageKey));
    } catch (_) {
      hasSavedTracker = false;
    }
  }
  button.classList.toggle("hidden", !hasSavedTracker);
}

function resumeSavedTracker() {
  const saved = state.tracker || loadTrackerState();
  if (!saved) {
    alert("找不到可繼續的遊戲紀錄。");
    updateResumeTrackerButton();
    return;
  }
  state.tracker = saved;
  state.playerCount = saved.playerCount;
  renderTracker();
  goTo("tracker");
}

function openGameTracker() {
  stopNightPlayback();

  if (state.tracker) {
    renderTracker();
    goTo("tracker");
    return;
  }

  const assignedNames = state.players.map(player => player.name);
  buildTrackerNameInputs(assignedNames);
}

function buildTrackerNameInputs(prefillNames = []) {
  const container = document.getElementById("trackerNameInputs");
  container.innerHTML = "";

  for (let i = 0; i < state.playerCount; i++) {
    const input = document.createElement("input");
    input.className = "name-input";
    input.id = `trackerPlayerName${i}`;
    input.value = prefillNames[i] || `玩家 ${i + 1}`;
    input.placeholder = `玩家 ${i + 1}`;
    input.addEventListener("input", updateInitialLeaderOptions);
    container.appendChild(input);
  }
  updateInitialLeaderOptions();
  goTo("trackerNames");
}

function updateInitialLeaderOptions() {
  const select = document.getElementById("initialLeaderSelect");
  if (!select) return;
  const previousValue = select.value || "0";
  const options = [];
  for (let i = 0; i < state.playerCount; i++) {
    const input = document.getElementById(`trackerPlayerName${i}`);
    const name = input && input.value.trim() ? input.value.trim() : `玩家 ${i + 1}`;
    options.push(`<option value="${i}">${escapeHtml(name)}</option>`);
  }
  select.innerHTML = options.join("");
  select.value = previousValue;
  if (select.selectedIndex < 0) select.value = "0";
}

function startTrackerFromNames() {
  const names = [];
  for (let i = 0; i < state.playerCount; i++) {
    const input = document.getElementById(`trackerPlayerName${i}`);
    const raw = input ? input.value.trim() : "";
    names.push(raw || `玩家 ${i + 1}`);
  }

  if (new Set(names).size !== names.length) {
    alert("玩家名字不能重複，否則紀錄會無法辨識。");
    return;
  }

  const leaderSelect = document.getElementById("initialLeaderSelect");
  const initialLeaderIndex = leaderSelect ? Number(leaderSelect.value) : 0;
  state.tracker = createTrackerState(names, initialLeaderIndex);
  saveTrackerState();
  renderTracker();
  goTo("tracker");
}

function getCurrentTeamSize() {
  if (!state.tracker || state.tracker.missionNumber > 5) return 0;
  return missionTeamSizes[state.tracker.playerCount][state.tracker.missionNumber - 1];
}

function toggleTeamMember(index) {
  if (!state.tracker) return;
  const selected = new Set(state.tracker.selectedTeam);
  if (selected.has(index)) {
    selected.delete(index);
  } else {
    const required = getCurrentTeamSize();
    if (selected.size >= required) {
      alert(`本次任務只能選擇 ${required} 位玩家。`);
      return;
    }
    selected.add(index);
  }
  state.tracker.selectedTeam = [...selected].sort((a, b) => a - b);
  saveTrackerState();
  renderTracker();
}

function setPlayerVote(index, vote) {
  if (!state.tracker) return;
  state.tracker.votes[index] = vote;
  saveTrackerState();
  renderTracker();
}

function setAllVotes(vote) {
  if (!state.tracker) return;
  state.tracker.votes = createDefaultVotes(state.tracker.players.length, vote);
  saveTrackerState();
  renderTracker();
}

function renderTracker() {
  const tracker = state.tracker;
  if (!tracker) return;

  const finished = tracker.missionNumber > 5 || tracker.gameEnded;
  let roundTitle = `第 ${tracker.missionNumber} 任務・第 ${tracker.proposalNumber} 次提案`;
  if (tracker.awaitingMissionResult) roundTitle = `第 ${tracker.missionNumber} 任務・執行結果`;
  if (tracker.awaitingAssassination) roundTitle = "最終階段・刺殺梅林";
  if (finished) roundTitle = tracker.gameEnded ? "遊戲結束" : "五個任務提案已完成";
  document.getElementById("trackerRoundTitle").textContent = roundTitle;

  const requirement = document.getElementById("trackerTeamRequirement");
  let requirementText = `需要 ${getCurrentTeamSize()} 人`;
  if (tracker.awaitingMissionResult) requirementText = "等待任務結果";
  if (tracker.awaitingAssassination) requirementText = "決定勝負";
  if (finished) requirementText = "紀錄完成";
  requirement.textContent = requirementText;

  document.getElementById("trackerEditor").classList.toggle(
    "hidden",
    finished || tracker.awaitingMissionResult || tracker.awaitingAssassination
  );
  document.getElementById("missionResultPanel").classList.toggle(
    "hidden",
    finished || !tracker.awaitingMissionResult
  );
  document.getElementById("assassinationPanel").classList.toggle(
    "hidden",
    finished || !tracker.awaitingAssassination
  );
  const finishedPanel = document.getElementById("trackerFinished");
  finishedPanel.classList.toggle("hidden", !finished);
  if (finished) {
    finishedPanel.innerHTML = `
      <div class="finish-icon ${tracker.victoryTeam === "evil" ? "evil-finish" : ""}">${tracker.victoryTeam === "evil" ? "⚔" : "✓"}</div>
      <h3>${tracker.gameEnded ? escapeHtml(tracker.endReason) : "五個任務的組隊提案都已記錄"}</h3>
      <p class="hint">你可以在下方查看每次隊長、隊伍與投票結果。</p>
    `;
  } else if (tracker.awaitingMissionResult) {
    renderMissionResultPanel();
  } else if (!tracker.awaitingAssassination) {
    renderTrackerEditor();
  }
  renderMissionProgress();
  renderMissionHistory();
  renderProposalHistory();
}

function renderMissionProgress() {
  const tracker = state.tracker;
  if (!tracker) return;
  const results = new Map(tracker.missionResults.map(result => [result.missionNumber, result]));
  document.getElementById("missionProgress").innerHTML = missionTeamSizes[tracker.playerCount]
    .map((teamSize, index) => {
      const missionNumber = index + 1;
      const result = results.get(missionNumber);
      let statusClass = "pending";
      let statusText = "未開始";
      if (result) {
        statusClass = result.succeeded ? "success" : "failure";
        statusText = result.succeeded ? "成功" : "失敗";
      } else if (!tracker.gameEnded && missionNumber === tracker.missionNumber) {
        statusClass = "current";
        statusText = tracker.awaitingMissionResult ? "執行中" : "提案中";
      }
      return `
        <div class="mission-node ${statusClass}">
          <strong>${missionNumber}</strong>
          <span>${statusText}</span>
          <small>${teamSize} 人</small>
        </div>
      `;
    }).join("");
}

function getMissionFailureThreshold(missionNumber = state.tracker?.missionNumber) {
  const tracker = state.tracker;
  return tracker && tracker.playerCount >= 7 && missionNumber === 4 ? 2 : 1;
}

function renderMissionResultPanel() {
  const tracker = state.tracker;
  if (!tracker) return;
  const teamNames = tracker.approvedTeamIndexes.map(index => tracker.players[index]);
  const teamSize = tracker.approvedTeamIndexes.length;
  const threshold = getMissionFailureThreshold();
  const succeeded = tracker.missionFailCount < threshold;
  document.getElementById("missionResultTitle").textContent = `第 ${tracker.missionNumber} 任務`;
  document.getElementById("missionTeamNames").textContent = `出任務玩家：${teamNames.join("、")}`;
  document.getElementById("missionFailCount").textContent = tracker.missionFailCount;
  document.getElementById("missionRuleHint").textContent = threshold === 2
    ? "7～10 人局的第 4 任務需要至少 2 張失敗票才會失敗。"
    : "本次任務只要出現 1 張失敗票就會失敗。";
  document.getElementById("missionLiveResult").innerHTML = `
    <span>成功票 ${teamSize - tracker.missionFailCount}</span>
    <strong class="${succeeded ? "mission-success-text" : "mission-failure-text"}">
      ${succeeded ? "任務成功" : "任務失敗"}
    </strong>
  `;
}

function changeMissionFailCount(delta) {
  const tracker = state.tracker;
  if (!tracker || !tracker.awaitingMissionResult) return;
  const next = tracker.missionFailCount + delta;
  if (next < 0 || next > tracker.approvedTeamIndexes.length) return;
  tracker.missionFailCount = next;
  saveTrackerState();
  renderMissionResultPanel();
}

function confirmMissionResult() {
  const tracker = state.tracker;
  if (!tracker || !tracker.awaitingMissionResult) return;
  const failVotes = tracker.missionFailCount;
  const succeeded = failVotes < getMissionFailureThreshold();
  tracker.missionResults.push({
    missionNumber: tracker.missionNumber,
    teamIndexes: [...tracker.approvedTeamIndexes],
    successVotes: tracker.approvedTeamIndexes.length - failVotes,
    failVotes,
    succeeded
  });
  tracker.awaitingMissionResult = false;
  tracker.approvedTeamIndexes = [];
  tracker.missionFailCount = 0;

  const successes = tracker.missionResults.filter(result => result.succeeded).length;
  const failures = tracker.missionResults.filter(result => !result.succeeded).length;
  if (failures >= 3) {
    tracker.gameEnded = true;
    tracker.victoryTeam = "evil";
    tracker.endReason = "邪惡陣營造成三次任務失敗，邪惡陣營獲勝。";
  } else if (successes >= 3) {
    if (tracker.usesAssassination) {
      tracker.awaitingAssassination = true;
    } else {
      tracker.gameEnded = true;
      tracker.victoryTeam = "good";
      tracker.endReason = "正義陣營完成三次任務，正義陣營獲勝。";
    }
  } else {
    tracker.missionNumber++;
    tracker.proposalNumber = 1;
    tracker.votes = createDefaultVotes(tracker.players.length);
  }
  saveTrackerState();
  renderTracker();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function confirmAssassination(succeeded) {
  const tracker = state.tracker;
  if (!tracker || !tracker.awaitingAssassination) return;
  tracker.assassinationResult = succeeded;
  tracker.awaitingAssassination = false;
  tracker.gameEnded = true;
  tracker.victoryTeam = succeeded ? "evil" : "good";
  tracker.endReason = succeeded
    ? "刺客成功刺中梅林，邪惡陣營獲勝。"
    : "刺客刺殺失敗，正義陣營獲勝。";
  saveTrackerState();
  renderTracker();
}

function renderTrackerEditor() {
  const tracker = state.tracker;
  const names = tracker.players;
  const required = getCurrentTeamSize();
  const selectedTeam = new Set(tracker.selectedTeam);

  document.getElementById("currentLeaderName").textContent = names[tracker.leaderIndex];

  document.getElementById("teamSelectionCount").textContent =
    `已選 ${selectedTeam.size} / ${required} 人`;
  document.getElementById("teamMemberChoices").innerHTML = names.map((name, index) => `
    <button class="player-choice ${selectedTeam.has(index) ? "selected" : ""}"
      onclick="toggleTeamMember(${index})">${escapeHtml(name)}</button>
  `).join("");

  document.getElementById("voteChoices").innerHTML = names.map((name, index) => {
    const vote = tracker.votes[index];
    return `
      <div class="vote-row">
        <strong>${escapeHtml(name)}</strong>
        <div class="vote-buttons">
          <button class="vote-button approve ${vote === "approve" ? "selected" : ""}"
            onclick="setPlayerVote(${index}, 'approve')">同意</button>
          <button class="vote-button reject ${vote === "reject" ? "selected" : ""}"
            onclick="setPlayerVote(${index}, 'reject')">反對</button>
        </div>
      </div>
    `;
  }).join("");

  const votes = Object.values(tracker.votes);
  const approveCount = votes.filter(vote => vote === "approve").length;
  const rejectCount = votes.filter(vote => vote === "reject").length;
  document.getElementById("liveVoteSummary").innerHTML = `
    <span class="approve-text">同意 ${approveCount}</span>
    <span class="reject-text">反對 ${rejectCount}</span>
    <small>已記錄 ${votes.length} / ${names.length} 人</small>
  `;
}

function confirmProposal() {
  const tracker = state.tracker;
  if (!tracker) return;
  const required = getCurrentTeamSize();

  if (tracker.selectedTeam.length !== required) {
    alert(`請選滿 ${required} 位出任務玩家。`);
    return;
  }

  if (Object.keys(tracker.votes).length !== tracker.players.length) {
    alert("請記錄每一位玩家的同意或反對票。");
    return;
  }

  const approveIndexes = [];
  const rejectIndexes = [];
  tracker.players.forEach((_, index) => {
    if (tracker.votes[index] === "approve") approveIndexes.push(index);
    else rejectIndexes.push(index);
  });
  const passed = approveIndexes.length > tracker.players.length / 2;

  tracker.history.push({
    missionNumber: tracker.missionNumber,
    proposalNumber: tracker.proposalNumber,
    leaderIndex: tracker.leaderIndex,
    teamIndexes: [...tracker.selectedTeam],
    approveIndexes,
    rejectIndexes,
    passed
  });

  tracker.leaderIndex = (tracker.leaderIndex + 1) % tracker.players.length;
  if (passed) {
    tracker.awaitingMissionResult = true;
    tracker.approvedTeamIndexes = [...tracker.selectedTeam];
    tracker.missionFailCount = 0;
  } else if (tracker.proposalNumber >= 5) {
    tracker.gameEnded = true;
    tracker.victoryTeam = "evil";
    tracker.endReason = `第 ${tracker.missionNumber} 任務連續五次提案遭否決，邪惡陣營獲勝。`;
  } else {
    tracker.proposalNumber++;
  }
  tracker.selectedTeam = [];
  tracker.votes = createDefaultVotes(tracker.players.length);
  saveTrackerState();
  renderTracker();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProposalHistory() {
  const tracker = state.tracker;
  const container = document.getElementById("proposalHistory");
  if (!tracker || tracker.history.length === 0) {
    container.innerHTML = '<p class="empty-history">尚未記錄任何提案。</p>';
    return;
  }

  const grouped = new Map();
  tracker.history.forEach((record, index) => {
    if (!grouped.has(record.missionNumber)) grouped.set(record.missionNumber, []);
    grouped.get(record.missionNumber).push({ record, index });
  });

  const namesFrom = indexes => indexes
    .map(index => escapeHtml(tracker.players[index]))
    .join("、");

  container.innerHTML = [...grouped.entries()].map(([missionNumber, entries]) => `
    <section class="mission-history-group">
      <h4>第 ${missionNumber} 任務</h4>
      <div class="history-table-scroll">
        <table class="history-table">
          <thead>
            <tr>
              <th>提案</th>
              <th>隊長</th>
              <th>出任務玩家</th>
              <th>同意</th>
              <th>反對</th>
              <th>結果</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(({ record, index }) => `
              <tr>
                <td>第 ${record.proposalNumber} 次</td>
                <td>${escapeHtml(tracker.players[record.leaderIndex])}</td>
                <td>${namesFrom(record.teamIndexes)}</td>
                <td class="approve-cell">${namesFrom(record.approveIndexes)}</td>
                <td class="reject-cell">${namesFrom(record.rejectIndexes)}</td>
                <td><span class="result-pill ${record.passed ? "passed" : "rejected"}">${record.passed ? "通過" : "否決"}</span></td>
                <td><button class="table-edit-button" onclick="openProposalEditor(${index})">修改</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `).join("");
}

function renderMissionHistory() {
  const tracker = state.tracker;
  const container = document.getElementById("missionHistory");
  if (!tracker || tracker.missionResults.length === 0) {
    container.innerHTML = '<p class="empty-history">尚未記錄任何任務結果。</p>';
    return;
  }

  const namesFrom = indexes => indexes
    .map(index => escapeHtml(tracker.players[index]))
    .join("、");
  container.innerHTML = `
    <div class="history-table-scroll">
      <table class="history-table mission-results-table">
        <thead>
          <tr>
            <th>任務</th>
            <th>出任務玩家</th>
            <th>成功票</th>
            <th>失敗票</th>
            <th>結果</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${tracker.missionResults.map((result, index) => `
            <tr>
              <td>第 ${result.missionNumber} 任務</td>
              <td>${namesFrom(result.teamIndexes)}</td>
              <td class="approve-cell">${result.successVotes}</td>
              <td class="reject-cell">${result.failVotes}</td>
              <td><span class="result-pill ${result.succeeded ? "passed" : "rejected"}">${result.succeeded ? "成功" : "失敗"}</span></td>
              <td><button class="table-edit-button" onclick="editMissionResult(${index})">修改</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function editMissionResult(index) {
  const tracker = state.tracker;
  const result = tracker?.missionResults[index];
  if (!tracker || !result) return;
  const maxFails = result.teamIndexes.length;
  const input = window.prompt(
    `修改第 ${result.missionNumber} 任務的失敗票數（0～${maxFails}）`,
    String(result.failVotes)
  );
  if (input === null) return;
  const failVotes = Number(input);
  if (!Number.isInteger(failVotes) || failVotes < 0 || failVotes > maxFails) {
    alert(`請輸入 0～${maxFails} 的整數。`);
    return;
  }

  const succeeded = failVotes < getMissionFailureThreshold(result.missionNumber);
  const hasLaterProgress = index < tracker.missionResults.length - 1
    || tracker.history.some(record => record.missionNumber > result.missionNumber);
  if (hasLaterProgress) {
    const confirmed = window.confirm("修改這次任務結果會清除後續任務與提案紀錄。仍要繼續嗎？");
    if (!confirmed) return;
  }

  tracker.missionResults[index] = {
    ...result,
    successVotes: maxFails - failVotes,
    failVotes,
    succeeded
  };
  if (hasLaterProgress) {
    tracker.missionResults = tracker.missionResults.slice(0, index + 1);
    tracker.history = tracker.history.filter(
      record => record.missionNumber <= result.missionNumber
    );
  }
  tracker.assassinationResult = null;
  recalculateTrackerPosition();
  saveTrackerState();
  renderTracker();
}

function openProposalEditor(index) {
  const tracker = state.tracker;
  const record = tracker?.history[index];
  if (!record) return;

  const votes = {};
  record.approveIndexes.forEach(playerIndex => { votes[playerIndex] = "approve"; });
  record.rejectIndexes.forEach(playerIndex => { votes[playerIndex] = "reject"; });
  state.editingRecordIndex = index;
  state.editDraft = {
    teamIndexes: [...record.teamIndexes],
    votes
  };
  renderProposalEditor();
  document.getElementById("editProposalModal").classList.remove("hidden");
}

function renderProposalEditor() {
  const tracker = state.tracker;
  const record = tracker?.history[state.editingRecordIndex];
  const draft = state.editDraft;
  if (!tracker || !record || !draft) return;

  const required = missionTeamSizes[tracker.playerCount][record.missionNumber - 1];
  const selected = new Set(draft.teamIndexes);
  document.getElementById("editProposalTitle").textContent =
    `修改第 ${record.missionNumber} 任務・第 ${record.proposalNumber} 次提案`;
  document.getElementById("editProposalLeader").textContent =
    `隊長：${tracker.players[record.leaderIndex]}`;
  document.getElementById("editTeamSelectionCount").textContent =
    `已選 ${selected.size} / ${required} 人`;
  document.getElementById("editTeamChoices").innerHTML = tracker.players.map((name, index) => `
    <button class="player-choice ${selected.has(index) ? "selected" : ""}"
      onclick="toggleEditTeamMember(${index})">${escapeHtml(name)}</button>
  `).join("");
  document.getElementById("editVoteChoices").innerHTML = tracker.players.map((name, index) => {
    const vote = draft.votes[index];
    return `
      <div class="vote-row">
        <strong>${escapeHtml(name)}</strong>
        <div class="vote-buttons">
          <button class="vote-button approve ${vote === "approve" ? "selected" : ""}"
            onclick="setEditVote(${index}, 'approve')">同意</button>
          <button class="vote-button reject ${vote === "reject" ? "selected" : ""}"
            onclick="setEditVote(${index}, 'reject')">反對</button>
        </div>
      </div>
    `;
  }).join("");
}

function toggleEditTeamMember(index) {
  const tracker = state.tracker;
  const record = tracker?.history[state.editingRecordIndex];
  const draft = state.editDraft;
  if (!tracker || !record || !draft) return;
  const required = missionTeamSizes[tracker.playerCount][record.missionNumber - 1];
  const selected = new Set(draft.teamIndexes);
  if (selected.has(index)) selected.delete(index);
  else {
    if (selected.size >= required) {
      alert(`本次任務只能選擇 ${required} 位玩家。`);
      return;
    }
    selected.add(index);
  }
  draft.teamIndexes = [...selected].sort((a, b) => a - b);
  renderProposalEditor();
}

function setEditVote(index, vote) {
  if (!state.editDraft) return;
  state.editDraft.votes[index] = vote;
  renderProposalEditor();
}

function setAllEditVotes(vote) {
  if (!state.tracker || !state.editDraft) return;
  state.editDraft.votes = createDefaultVotes(state.tracker.players.length, vote);
  renderProposalEditor();
}

function closeProposalEditor() {
  document.getElementById("editProposalModal").classList.add("hidden");
  state.editingRecordIndex = null;
  state.editDraft = null;
}

function recalculateTrackerPosition() {
  const tracker = state.tracker;
  if (!tracker) return;
  tracker.gameEnded = false;
  tracker.endReason = "";
  tracker.victoryTeam = "";
  tracker.awaitingMissionResult = false;
  tracker.awaitingAssassination = false;
  tracker.approvedTeamIndexes = [];
  tracker.missionFailCount = 0;

  const successes = tracker.missionResults.filter(result => result.succeeded).length;
  const failures = tracker.missionResults.filter(result => !result.succeeded).length;
  if (failures >= 3) {
    tracker.gameEnded = true;
    tracker.victoryTeam = "evil";
    tracker.endReason = "邪惡陣營造成三次任務失敗，邪惡陣營獲勝。";
  } else if (successes >= 3) {
    if (tracker.usesAssassination && tracker.assassinationResult === null) {
      tracker.awaitingAssassination = true;
    } else {
      const evilWon = tracker.usesAssassination && tracker.assassinationResult === true;
      tracker.gameEnded = true;
      tracker.victoryTeam = evilWon ? "evil" : "good";
      tracker.endReason = evilWon
        ? "刺客成功刺中梅林，邪惡陣營獲勝。"
        : (tracker.usesAssassination
          ? "刺客刺殺失敗，正義陣營獲勝。"
          : "正義陣營完成三次任務，正義陣營獲勝。");
    }
  }

  const lastProposal = tracker.history[tracker.history.length - 1];
  tracker.leaderIndex = lastProposal
    ? (lastProposal.leaderIndex + 1) % tracker.players.length
    : tracker.initialLeaderIndex;

  if (!tracker.gameEnded && !tracker.awaitingAssassination) {
    const completedMissions = new Set(tracker.missionResults.map(result => result.missionNumber));
    const pendingPassed = tracker.history.find(
      record => record.passed && !completedMissions.has(record.missionNumber)
    );
    if (pendingPassed) {
      tracker.missionNumber = pendingPassed.missionNumber;
      tracker.proposalNumber = pendingPassed.proposalNumber;
      tracker.awaitingMissionResult = true;
      tracker.approvedTeamIndexes = [...pendingPassed.teamIndexes];
    } else {
      tracker.missionNumber = tracker.missionResults.length
        ? Math.max(...tracker.missionResults.map(result => result.missionNumber)) + 1
        : 1;
      const currentRecords = tracker.history.filter(
        record => record.missionNumber === tracker.missionNumber
      );
      const lastCurrent = currentRecords[currentRecords.length - 1];
      if (lastCurrent && !lastCurrent.passed && lastCurrent.proposalNumber >= 5) {
        tracker.proposalNumber = 5;
        tracker.gameEnded = true;
        tracker.victoryTeam = "evil";
        tracker.endReason = `第 ${lastCurrent.missionNumber} 任務連續五次提案遭否決，邪惡陣營獲勝。`;
      } else {
        tracker.proposalNumber = lastCurrent ? lastCurrent.proposalNumber + 1 : 1;
      }
    }
  }
  tracker.selectedTeam = [];
  tracker.votes = createDefaultVotes(tracker.players.length);
}

function saveProposalEdit() {
  const tracker = state.tracker;
  const index = state.editingRecordIndex;
  const record = tracker?.history[index];
  const draft = state.editDraft;
  if (!tracker || !record || !draft) return;
  const required = missionTeamSizes[tracker.playerCount][record.missionNumber - 1];
  if (draft.teamIndexes.length !== required) {
    alert(`請選滿 ${required} 位出任務玩家。`);
    return;
  }

  const approveIndexes = [];
  const rejectIndexes = [];
  tracker.players.forEach((_, playerIndex) => {
    if (draft.votes[playerIndex] === "approve") approveIndexes.push(playerIndex);
    else rejectIndexes.push(playerIndex);
  });
  const passed = approveIndexes.length > tracker.players.length / 2;
  const resultChanged = passed !== record.passed;
  const affectsRecordedMission = tracker.missionResults.some(
    result => result.missionNumber >= record.missionNumber
  );
  const affectsLaterHistory = index < tracker.history.length - 1;
  if (resultChanged && (affectsLaterHistory || affectsRecordedMission)) {
    const confirmed = window.confirm("修改後的通過／否決結果不同，這筆之後的紀錄將會清除。仍要儲存嗎？");
    if (!confirmed) return;
  }

  tracker.history[index] = {
    ...record,
    teamIndexes: [...draft.teamIndexes],
    approveIndexes,
    rejectIndexes,
    passed
  };
  if (resultChanged) {
    tracker.history = tracker.history.slice(0, index + 1);
    tracker.missionResults = tracker.missionResults.filter(
      result => result.missionNumber < record.missionNumber
    );
    tracker.assassinationResult = null;
  } else if (passed) {
    const missionResult = tracker.missionResults.find(
      result => result.missionNumber === record.missionNumber
    );
    if (missionResult) missionResult.teamIndexes = [...draft.teamIndexes];
  }
  recalculateTrackerPosition();
  saveTrackerState();
  closeProposalEditor();
  renderTracker();
}

function resetTracker() {
  if (!state.tracker) return;
  if (!window.confirm("確定要清除目前所有遊戲紀錄嗎？")) return;
  clearTrackerState();
  buildTrackerNameInputs();
}

function restartGame() {
  if (state.tracker && state.tracker.history.length > 0) {
    const shouldRestart = window.confirm("重新開局會清除目前的遊戲紀錄，確定要繼續嗎？");
    if (!shouldRestart) return;
  }
  stopNightPlayback();
  clearTrackerState();
  state.players = [];
  state.gameRoles = [];
  state.revealIndex = 0;
  state.showingRole = false;
  state.nightSteps = [];
  state.nightIndex = 0;
  goTo("setup");
  renderSetup();
}

renderSetup();
updateResumeTrackerButton();

if ("speechSynthesis" in window) {
  loadVoiceOptions();
  if (typeof speechSynthesis.addEventListener === "function") {
    speechSynthesis.addEventListener("voiceschanged", loadVoiceOptions);
  } else {
    speechSynthesis.onvoiceschanged = loadVoiceOptions;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.autoPlaying && !state.isPaused) {
    requestWakeLock();
  }
});
