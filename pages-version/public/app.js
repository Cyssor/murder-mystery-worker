
const state = {
  scripts: [],
  room: null,
  me: null,
  roomCode: localStorage.getItem("mm_room") || "",
  playerId: localStorage.getItem("mm_player") || "",
  selectedCount: localStorage.getItem("mm_player_count") || "7",
  timer: 120,
  timerHandle: null,
  error: ""
};

const app = document.querySelector("#app");
const previewParams = new URLSearchParams(location.search);
if (previewParams.get("room")) {
  state.roomCode = previewParams.get("room").toUpperCase();
  localStorage.setItem("mm_room", state.roomCode);
}
if (previewParams.get("player")) {
  state.playerId = previewParams.get("player");
  localStorage.setItem("mm_player", state.playerId);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "请求失败");
  return data;
}

function saveSession(data) {
  state.room = data.room;
  state.me = data.me;
  if (data.room?.code) {
    state.roomCode = data.room.code;
    localStorage.setItem("mm_room", data.room.code);
  }
  if (data.me?.id) {
    state.playerId = data.me.id;
    localStorage.setItem("mm_player", data.me.id);
  }
  render();
}

async function loadScripts() {
  const data = await api("/api/scripts");
  state.scripts = data.scripts;
  render();
  if (state.roomCode && state.playerId) refresh();
}

async function refresh() {
  if (!state.roomCode) return;
  try {
    const data = await api("/api/rooms/" + state.roomCode + "?playerId=" + encodeURIComponent(state.playerId || ""));
    saveSession(data);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function createRoom(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        nickname: form.get("nickname"),
        scriptId: form.get("scriptId"),
        playerCount: Number(form.get("playerCount"))
      })
    });
    saveSession(data);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function joinRoom(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const code = String(form.get("roomCode") || "").trim().toUpperCase();
  try {
    const data = await api("/api/rooms/" + code + "/join", {
      method: "POST",
      body: JSON.stringify({
        nickname: form.get("nickname"),
        playerId: state.playerId
      })
    });
    saveSession(data);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function postAction(action, extra = {}) {
  try {
    const data = await api("/api/rooms/" + state.room.code + "/" + action, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, ...extra })
    });
    saveSession(data);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

function resetLocal() {
  localStorage.removeItem("mm_room");
  localStorage.removeItem("mm_player");
  state.room = null;
  state.me = null;
  state.roomCode = "";
  state.playerId = "";
  state.error = "";
  render();
}

function startTimer() {
  clearInterval(state.timerHandle);
  state.timer = 120;
  state.timerHandle = setInterval(() => {
    state.timer = Math.max(0, state.timer - 1);
    const node = document.querySelector("[data-timer]");
    if (node) node.textContent = formatTimer(state.timer);
    if (state.timer === 0) clearInterval(state.timerHandle);
  }, 1000);
  render();
}

function formatTimer(seconds) {
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

function render() {
  app.innerHTML = state.room ? roomView() : homeView();
  bind();
}

function scriptCounts(script) {
  return script.playerCounts || [script.playerCount];
}

function homeView() {
  const counts = [...new Set(state.scripts.flatMap((script) => scriptCounts(script)).map(String))].sort((a, b) => Number(a) - Number(b));
  if (!counts.includes(state.selectedCount)) state.selectedCount = counts[0] || "7";
  const countOptions = counts.map((count) => "<option value=\\"" + count + "\\" " + (state.selectedCount === count ? "selected" : "") + ">" + count + "人</option>").join("");
  const filteredScripts = state.scripts.filter((script) => scriptCounts(script).map(String).includes(state.selectedCount));
  const scriptOptions = filteredScripts.map((script) => "<option value=\\"" + script.id + "\\">" + script.title + " · " + (script.difficulty || "") + " · " + script.duration + "</option>").join("");
  return `
    <section class="topbar">
      <div>
        <p class="eyebrow">4-7人无主持人</p>
        <h1>剧本杀自动房间</h1>
      </div>
      <span class="pill">Cloudflare Workers 原型</span>
    </section>
    ${state.error ? "<p class=\\"error\\">" + state.error + "</p>" : ""}
    <section class="grid two">
      <form class="panel" data-create>
        <h2>创建房间</h2>
        <label>游戏人数<select name="playerCount" data-count-filter required>${countOptions}</select></label>
        <label>选择剧本<select name="scriptId" required>${scriptOptions}</select></label>
        <label>你的昵称<input name="nickname" autocomplete="name" required placeholder="例如：阿明"></label>
        <button type="submit">创建并成为房主</button>
      </form>
      <form class="panel" data-join>
        <h2>加入房间</h2>
        <label>房间码<input name="roomCode" required placeholder="例如：AB12CD" value="${state.roomCode}"></label>
        <label>你的昵称<input name="nickname" autocomplete="name" required placeholder="微信群昵称即可"></label>
        <button type="submit">加入游戏</button>
      </form>
    </section>
    <section class="strip">
      <span>自动分配角色</span>
      <span>阶段解锁</span>
      <span>发言顺序</span>
      <span>搜证</span>
      <span>投票</span>
    </section>
  `;
}

function roomView() {
  const room = state.room;
  const me = state.me;
  const currentSpeaker = room.players[room.speakingIndex];
  const roleChoices = room.roles.map((role) => `<button data-vote="${role.id}" class="${me?.votedFor === role.id ? "selected" : ""}">${role.name}</button>`).join("");
  const locations = room.locations.map((location) => `<button data-investigate="${location.id}" ${me?.investigated?.length ? "disabled" : ""}>${location.name}</button>`).join("");
  const players = room.players.map((player) => `
    <li class="${currentSpeaker?.id === player.id ? "speaking" : ""}">
      <span>${player.order}. ${player.nickname}</span>
      <strong>${player.role ? player.role.name : "未分配"}</strong>
      ${player.isOwner ? "<em>房主</em>" : ""}
      ${player.ready ? "<em>已完成</em>" : ""}
    </li>`).join("");
  return `
    <section class="topbar">
      <div>
        <p class="eyebrow">${room.script.title}</p>
        <h1>房间 ${room.code}</h1>
        <p class="sub">${room.script.type} · ${room.script.difficulty || ""} · ${room.script.duration} · ${room.script.playerCount}人局</p>
      </div>
      <button class="ghost" data-reset>退出本机身份</button>
    </section>
    ${state.error ? "<p class=\\"error\\">" + state.error + "</p>" : ""}
    <section class="phase">
      <div>
        <p class="eyebrow">当前阶段</p>
        <h2>${room.phase.name}</h2>
        <p>${room.phase.instruction}</p>
        ${room.phaseAudio ? "<audio class=\\"phase-audio\\" controls autoplay src=\\"" + room.phaseAudio + "\\"></audio>" : ""}
      </div>
      <div class="actions">
        ${room.phaseIndex === 0 && me?.isOwner ? "<button data-action=\\"start\\">" + room.script.playerCount + "人到齐后开始</button>" : ""}
        ${me?.isOwner && room.phaseIndex > 0 && room.phaseIndex < 9 ? "<button data-action=\\"advance\\">进入下一阶段</button>" : ""}
        ${room.phaseIndex > 0 && room.phaseIndex < 9 ? "<button class=\\"secondary\\" data-action=\\"ready\\">我已完成本阶段</button>" : ""}
        <button class="secondary" data-refresh>刷新状态</button>
      </div>
    </section>
    ${room.phase.id === "lobby" && room.script.opening ? `
      <section class="panel wide">
        <h2>开场剧情</h2>
        <div class="private">${room.script.opening}</div>
        <p class="muted">玩家到齐后，房主点击开始。也可以先把这段剧情读给群里听。</p>
      </section>` : ""}
    <section class="grid three">
      <article class="panel">
        <h2>我的角色</h2>
        ${me?.role ? `
          <p class="role-name">${me.role.name}</p>
          <p>${me.role.publicIdentity}</p>
          <p class="muted">${me.role.fit}</p>
          ${me.role.privateText ? "<div class=\\"private\\">" + me.role.privateText + "</div>" : ""}
        ` : "<p class=\\"muted\\">等待开始后自动分配。</p>"}
      </article>
      <article class="panel">
        <h2>玩家与顺序</h2>
        <ol class="players">${players}</ol>
      </article>
      <article class="panel">
        <h2>发言计时</h2>
        <p class="speaker">${currentSpeaker ? currentSpeaker.nickname : "等待玩家"}</p>
        <p class="timer" data-timer>${formatTimer(state.timer)}</p>
        <button class="secondary" data-timer-start>开始 2 分钟</button>
        ${me?.isOwner ? "<button class=\\"secondary\\" data-action=\\"speech-next\\">下一位发言</button>" : ""}
      </article>
    </section>
    ${room.phase.id === "investigate" ? `
      <section class="panel wide">
        <h2>搜证地点</h2>
        <div class="button-grid">${locations}</div>
        <p class="muted">每名玩家本阶段只能选择一次。线索只会先显示给你自己。</p>
      </section>` : ""}
    ${room.phase.id === "clue1" ? publicClueView(room) : ""}
    ${room.phase.id === "vote" ? `
      <section class="panel wide">
        <h2>最终投票</h2>
        <div class="button-grid">${roleChoices}</div>
        <p class="muted">当前已投票：${room.voteProgress}/${room.players.length}</p>
      </section>` : ""}
    ${room.phase.id === "reveal" ? revealView(room) : ""}
  `;
}

function revealView(room) {
  const rows = room.roles.map((role) => `<li><span>${role.name}</span><strong>${room.votes[role.id] || 0} 票</strong></li>`).join("");
  return `
    <section class="panel wide">
      <h2>投票结果</h2>
      <ol class="players">${rows}</ol>
      <div class="private">${room.reveal}</div>
    </section>
  `;
}

function publicClueView(room) {
  const rows = room.publicClues.map((clue, index) => `<li><span>线索 ${index + 1}</span><strong>${clue}</strong></li>`).join("");
  return `
    <section class="panel wide">
      <h2>公共线索</h2>
      <ol class="players">${rows}</ol>
    </section>
  `;
}

function bind() {
  document.querySelector("[data-create]")?.addEventListener("submit", createRoom);
  document.querySelector("[data-join]")?.addEventListener("submit", joinRoom);
  document.querySelector("[data-reset]")?.addEventListener("click", resetLocal);
  document.querySelector("[data-refresh]")?.addEventListener("click", refresh);
  document.querySelector("[data-timer-start]")?.addEventListener("click", startTimer);
  document.querySelector("[data-count-filter]")?.addEventListener("change", (event) => {
    state.selectedCount = event.target.value;
    localStorage.setItem("mm_player_count", state.selectedCount);
    render();
  });
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => postAction(button.dataset.action));
  });
  document.querySelectorAll("[data-investigate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const data = await api("/api/rooms/" + state.room.code + "/investigate", {
        method: "POST",
        body: JSON.stringify({ playerId: state.playerId, locationId: button.dataset.investigate })
      });
      alert("你获得线索：" + data.foundClue.name + "\\n\\n" + data.foundClue.clue);
      saveSession(data);
    });
  });
  document.querySelectorAll("[data-vote]").forEach((button) => {
    button.addEventListener("click", () => postAction("vote", { targetRoleId: button.dataset.vote }));
  });
}

loadScripts();
setInterval(() => {
  if (document.visibilityState === "visible") refresh();
}, 15000);
