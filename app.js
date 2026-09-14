const teamCount = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 }
};

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
  wakeLock: null
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

function restartGame() {
  stopNightPlayback();
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
