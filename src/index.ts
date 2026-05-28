import { DurableObject } from "cloudflare:workers";

type ScriptId = "rainy-manor" | "snow-sanatorium" | "seventh-letter";

interface Role {
  id: string;
  name: string;
  publicIdentity: string;
  fit: string;
  privateByPhase: Record<string, string>;
}

interface ScriptPack {
  id: ScriptId;
  title: string;
  type: string;
  duration: string;
  roles: Role[];
  locations: { id: string; name: string; clue: string }[];
}

interface Player {
  id: string;
  nickname: string;
  roleId: string | null;
  joinedAt: number;
  isOwner: boolean;
  readyPhase: number | null;
}

interface RoomState {
  code: string;
  scriptId: ScriptId;
  createdAt: number;
  phaseIndex: number;
  speakingIndex: number;
  players: Player[];
  votes: Record<string, string>;
  investigations: Record<string, string[]>;
  assignmentLocked: boolean;
}

interface Env {
  ROOMS: DurableObjectNamespace<GameRoomV2>;
}

const PHASES = [
  { id: "lobby", name: "等待加入", instruction: "7 名玩家加入后，房主点击开始。开始后系统会随机分配角色。" },
  { id: "role", name: "角色阅读", instruction: "阅读你的公开身份和个人开局信息。不要展示自己的手机页面。" },
  { id: "intro", name: "第一轮自我介绍", instruction: "按系统顺序发言，每人用第一人称介绍自己的公开身份与案发前状态。" },
  { id: "clue1", name: "第一批公共线索", instruction: "阅读公共线索。你可以在微信群中讨论，也可以选择暂时隐瞒自己的判断。" },
  { id: "discuss1", name: "第一轮自由讨论", instruction: "围绕时间线、动机、现场矛盾自由讨论。建议 20 到 30 分钟。" },
  { id: "act2", name: "第二幕个人信息", instruction: "系统解锁第二幕个人信息。只阅读自己的内容，不要全文转发。" },
  { id: "investigate", name: "搜证阶段", instruction: "每名玩家可选择一个地点搜证。拿到线索后自行决定是否公开。" },
  { id: "speech2", name: "第二轮集中发言", instruction: "按顺序陈述自己目前怀疑的人、理由，以及愿意公开的线索。" },
  { id: "vote", name: "最终投票", instruction: "投出你认为的凶手。所有人投完后进入复盘。" },
  { id: "reveal", name: "真相复盘", instruction: "投票结束。这里用于公布最终真相、证据闭环和玩家投票结果。" }
] as const;

const SCRIPTS: Record<ScriptId, ScriptPack> = {
  "rainy-manor": {
    id: "rainy-manor",
    title: "雨夜庄园",
    type: "本格推理 / 家族恩怨 / 身份反转 / 遗嘱争夺",
    duration: "3.5-5 小时",
    roles: [
      role("a1", "林子轩", "林家长子", "适合敢发言、能扛嫌疑的玩家"),
      role("a2", "苏婉", "林子轩之妻", "适合会演、会周旋的玩家"),
      role("a3", "林雨薇", "林家女儿", "适合情绪表达强、代入感好的玩家"),
      role("a4", "王福", "林家老管家", "适合稳重、愿意记时间线的玩家"),
      role("a5", "李志强", "私人医生", "适合理性、喜欢分析证据的玩家"),
      role("a6", "陈浩", "家族律师", "适合逻辑强、会隐藏信息的玩家"),
      role("a7", "小兰", "林家女仆", "适合安静型、后期能爆发的玩家")
    ],
    locations: [
      clue("study", "书房", "书房现场线索位：在这里填入书房相关线索。"),
      clue("corridor", "西侧走廊", "走廊线索位：在这里填入脚步、门缝、地毯等线索。"),
      clue("fusebox", "保险丝箱", "保险丝箱线索位：在这里填入停电相关线索。"),
      clue("suwans-room", "苏婉房间", "苏婉房间线索位：在这里填入红鲱鱼线索。"),
      clue("maids-room", "女仆房", "女仆房线索位：在这里填入身份线索。"),
      clue("medicine-case", "医生药箱", "药箱线索位：在这里填入死因/死亡时间线索。"),
      clue("lawyer-bag", "律师公文包", "公文包线索位：在这里填入遗嘱线索。")
    ]
  },
  "snow-sanatorium": {
    id: "snow-sanatorium",
    title: "雪夜疗养院",
    type: "本格推理 / 医疗秘密 / 旧案复仇 / 伪装身份",
    duration: "4-5 小时",
    roles: [
      role("b1", "沈墨", "院长之子", "适合主动发言、利益动机明显的玩家"),
      role("b2", "许曼青", "院长现任妻子", "适合会演感情线、能拉扯关系的玩家"),
      role("b3", "周启明", "副院长", "适合逻辑型、能处理复杂旧事线的玩家"),
      role("b4", "叶澜", "护士长", "适合稳重、能掌握关键信息的玩家"),
      role("b5", "顾辰", "病人家属", "适合正义感强、喜欢追查真相的玩家"),
      role("b6", "白晓", "年轻护士", "适合低调、细节型、后期反转感强的玩家"),
      role("b7", "陆远", "药剂师", "适合喜欢证据线、药物线的玩家")
    ],
    locations: [
      clue("office", "院长办公室", "办公室线索位：在这里填入针孔、药片、现场状态。"),
      clue("pharmacy", "药房", "药房线索位：在这里填入药物登记与缺失药剂。"),
      clue("old-ward", "旧病区", "旧病区线索位：在这里填入十年前旧案信息。"),
      clue("archive", "病历档案室", "档案线索位：在这里填入病历篡改证据。"),
      clue("nurse-station", "护士站", "护士站线索位：在这里填入值班表和护理习惯。"),
      clue("guest-room", "家属休息室", "家属线索位：在这里填入调查资料。"),
      clue("snow-path", "雪地通道", "雪地线索位：在这里填入行动路线。")
    ]
  },
  "seventh-letter": {
    id: "seventh-letter",
    title: "海上第七封信",
    type: "游轮密室 / 遗产争夺 / 失踪旧案 / 双重身份",
    duration: "4-5.5 小时",
    roles: [
      role("c1", "秦越", "死者养子", "适合承压能力强、能处理继承线的玩家"),
      role("c2", "方岚", "死者前妻", "适合成熟型、会谈判和情绪输出的玩家"),
      role("c3", "唐修", "死者编辑", "适合文艺型、会隐藏小秘密的玩家"),
      role("c4", "贺明", "游轮船长", "适合稳重、能控场或装镇定的玩家"),
      role("c5", "宋知夏", "年轻作家", "适合表达欲强、冲突感强的玩家"),
      role("c6", "林珂", "私人助理", "适合观察细节、会处理信息差的玩家"),
      role("c7", "乔安", "游轮钢琴师", "适合神秘感强、低调但会演的玩家")
    ],
    locations: [
      clue("private-study", "私人书房", "书房线索位：在这里填入密室现场和刀具线索。"),
      clue("broadcast-room", "广播室", "广播线索位：在这里填入录音设备线索。"),
      clue("vent", "通风口", "通风口线索位：在这里填入细线和机关线索。"),
      clue("ballroom", "宴会厅", "宴会厅线索位：在这里填入不在场证明。"),
      clue("captain-room", "船长室", "船长室线索位：在这里填入航线与监控死角。"),
      clue("fireplace", "壁炉", "壁炉线索位：在这里填入第七封信残片。"),
      clue("manuscript", "手稿箱", "手稿线索位：在这里填入旧案证据。")
    ]
  }
};

function role(id: string, name: string, publicIdentity: string, fit: string): Role {
  return {
    id,
    name,
    publicIdentity,
    fit,
    privateByPhase: {
      role: "开局个人剧本占位：这里填入该角色只在开局可见的信息。",
      act2: "第二幕个人剧本占位：这里填入中段解锁的信息。",
      reveal: "复盘占位：这里填入该角色结局相关说明。"
    }
  };
}

function clue(id: string, name: string, clueText: string) {
  return { id, name, clue: clueText };
}

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...init.headers
    }
  });
}

function textResponse(body: string, contentType: string) {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store"
    }
  });
}

function badRequest(message: string, status = 400) {
  return json({ error: message }, { status });
}

function randomToken(bytes = 8) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swapIndex = random[0] % (index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export class GameRoomV2 extends DurableObject<Env> {
  async create(code: string, scriptId: ScriptId, nickname: string) {
    const existing = await this.ctx.storage.get<RoomState>("state");
    if (existing) return this.snapshot(existing, existing.players[0]?.id);
    const state: RoomState = {
      code,
      scriptId,
      createdAt: Date.now(),
      phaseIndex: 0,
      speakingIndex: 0,
      players: [{
        id: randomToken(12),
        nickname,
        roleId: null,
        joinedAt: Date.now(),
        isOwner: true,
        readyPhase: null
      }],
      votes: {},
      investigations: {},
      assignmentLocked: false
    };
    await this.ctx.storage.put("state", state);
    return this.snapshot(state, state.players[0].id);
  }

  async join(nickname: string, playerId?: string) {
    const state = await this.requireState();
    const returning = playerId ? state.players.find((player) => player.id === playerId) : null;
    if (returning) {
      returning.nickname = nickname || returning.nickname;
      await this.save(state);
      return this.snapshot(state, returning.id);
    }
    if (state.assignmentLocked) throw new Error("房间已经开始，不能再加入新玩家。");
    if (state.players.length >= 7) throw new Error("房间已满。");
    const player: Player = {
      id: randomToken(12),
      nickname,
      roleId: null,
      joinedAt: Date.now(),
      isOwner: state.players.length === 0,
      readyPhase: null
    };
    state.players.push(player);
    if (state.players.length === 7) this.assignRoles(state);
    await this.save(state);
    return this.snapshot(state, player.id);
  }

  async start(playerId: string) {
    const state = await this.requireState();
    this.requireOwner(state, playerId);
    if (state.players.length !== 7) throw new Error("需要 7 名玩家到齐后才能开始。");
    this.assignRoles(state);
    state.phaseIndex = Math.max(state.phaseIndex, 1);
    await this.save(state);
    return this.snapshot(state, playerId);
  }

  async advance(playerId: string) {
    const state = await this.requireState();
    this.requireOwner(state, playerId);
    if (!state.assignmentLocked) throw new Error("请先开始游戏并分配角色。");
    state.phaseIndex = Math.min(PHASES.length - 1, state.phaseIndex + 1);
    state.speakingIndex = 0;
    state.players = state.players.map((player) => ({ ...player, readyPhase: null }));
    await this.save(state);
    return this.snapshot(state, playerId);
  }

  async ready(playerId: string) {
    const state = await this.requireState();
    const player = this.requirePlayer(state, playerId);
    player.readyPhase = state.phaseIndex;
    if (state.players.length === 7 && state.players.every((candidate) => candidate.readyPhase === state.phaseIndex)) {
      state.phaseIndex = Math.min(PHASES.length - 1, state.phaseIndex + 1);
      state.speakingIndex = 0;
      state.players = state.players.map((candidate) => ({ ...candidate, readyPhase: null }));
    }
    await this.save(state);
    return this.snapshot(state, playerId);
  }

  async speechNext(playerId: string) {
    const state = await this.requireState();
    this.requireOwner(state, playerId);
    state.speakingIndex = Math.min(state.players.length - 1, state.speakingIndex + 1);
    await this.save(state);
    return this.snapshot(state, playerId);
  }

  async investigate(playerId: string, locationId: string) {
    const state = await this.requireState();
    this.requirePlayer(state, playerId);
    if (PHASES[state.phaseIndex]?.id !== "investigate") throw new Error("当前不是搜证阶段。");
    const used = state.investigations[playerId] ?? [];
    if (used.length >= 1) throw new Error("本阶段每人只能搜证一次。");
    const script = SCRIPTS[state.scriptId];
    const location = script.locations.find((item) => item.id === locationId);
    if (!location) throw new Error("未知搜证地点。");
    state.investigations[playerId] = [...used, locationId];
    await this.save(state);
    return { ...this.snapshot(state, playerId), foundClue: location };
  }

  async vote(playerId: string, targetRoleId: string) {
    const state = await this.requireState();
    this.requirePlayer(state, playerId);
    if (PHASES[state.phaseIndex]?.id !== "vote") throw new Error("当前不是投票阶段。");
    const script = SCRIPTS[state.scriptId];
    if (!script.roles.some((roleItem) => roleItem.id === targetRoleId)) throw new Error("未知投票对象。");
    state.votes[playerId] = targetRoleId;
    await this.save(state);
    return this.snapshot(state, playerId);
  }

  async get(playerId?: string) {
    const state = await this.requireState();
    return this.snapshot(state, playerId);
  }

  private assignRoles(state: RoomState) {
    if (state.assignmentLocked) return;
    const roles = shuffle(SCRIPTS[state.scriptId].roles.map((item) => item.id));
    state.players = state.players.map((player, index) => ({ ...player, roleId: roles[index] ?? null }));
    state.assignmentLocked = true;
  }

  private async requireState() {
    const state = await this.ctx.storage.get<RoomState>("state");
    if (!state) throw new Error("房间不存在。");
    return state;
  }

  private async save(state: RoomState) {
    await this.ctx.storage.put("state", state);
  }

  private requirePlayer(state: RoomState, playerId: string) {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new Error("未找到当前玩家，请重新加入房间。");
    return player;
  }

  private requireOwner(state: RoomState, playerId: string) {
    const player = this.requirePlayer(state, playerId);
    if (!player.isOwner) throw new Error("只有房主可以推进流程。房主不会看到任何额外真相，只负责点下一步。");
  }

  private snapshot(state: RoomState, playerId?: string) {
    const script = SCRIPTS[state.scriptId];
    const phase = PHASES[state.phaseIndex];
    const me = playerId ? state.players.find((player) => player.id === playerId) : null;
    const myRole = me?.roleId ? script.roles.find((roleItem) => roleItem.id === me.roleId) ?? null : null;
    const visibleRole = myRole ? {
      id: myRole.id,
      name: myRole.name,
      publicIdentity: myRole.publicIdentity,
      fit: myRole.fit,
      privateText: myRole.privateByPhase[phase.id] ?? ""
    } : null;
    const voteCounts = Object.values(state.votes).reduce<Record<string, number>>((acc, roleId) => {
      acc[roleId] = (acc[roleId] ?? 0) + 1;
      return acc;
    }, {});
    return {
      room: {
        code: state.code,
        script: {
          id: script.id,
          title: script.title,
          type: script.type,
          duration: script.duration
        },
        phaseIndex: state.phaseIndex,
        phase,
        speakingIndex: state.speakingIndex,
        assignmentLocked: state.assignmentLocked,
        players: state.players.map((player, index) => ({
          id: player.id,
          nickname: player.nickname,
          isOwner: player.isOwner,
          ready: player.readyPhase === state.phaseIndex,
          order: index + 1,
          role: player.roleId && state.assignmentLocked ? publicRole(script, player.roleId) : null
        })),
        roles: script.roles.map((roleItem) => publicRole(script, roleItem.id)),
        locations: phase.id === "investigate" ? script.locations.map(({ id, name }) => ({ id, name })) : [],
        votes: phase.id === "reveal" ? voteCounts : {},
        voteProgress: Object.keys(state.votes).length
      },
      me: me ? {
        id: me.id,
        nickname: me.nickname,
        isOwner: me.isOwner,
        role: visibleRole,
        investigated: state.investigations[me.id] ?? [],
        votedFor: state.votes[me.id] ?? null
      } : null
    };
  }
}

export class GameRoom extends GameRoomV2 {}

function publicRole(script: ScriptPack, roleId: string) {
  const roleItem = script.roles.find((candidate) => candidate.id === roleId);
  return roleItem ? {
    id: roleItem.id,
    name: roleItem.name,
    publicIdentity: roleItem.publicIdentity
  } : null;
}

async function parseJson<T extends Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return await request.json<T>();
  } catch {
    throw new Error("请求内容不是有效 JSON。");
  }
}

function normalizeScriptId(value: unknown): ScriptId {
  if (value === "rainy-manor" || value === "snow-sanatorium" || value === "seventh-letter") return value;
  throw new Error("未知剧本。");
}

function getRoomStub(env: Env, code: string) {
  return env.ROOMS.getByName(code.toUpperCase());
}

async function handleApi(request: Request, env: Env, url: URL) {
  try {
    const parts = url.pathname.split("/").filter(Boolean);
    if (request.method === "GET" && url.pathname === "/api/scripts") {
      return json({
        scripts: Object.values(SCRIPTS).map((script) => ({
          id: script.id,
          title: script.title,
          type: script.type,
          duration: script.duration,
          roles: script.roles.map((roleItem) => publicRole(script, roleItem.id))
        }))
      });
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const body = await parseJson(request);
      const nickname = String(body.nickname ?? "").trim();
      if (!nickname) return badRequest("请输入昵称。");
      const scriptId = normalizeScriptId(body.scriptId);
      const code = roomCode();
      const stub = getRoomStub(env, code);
      return json(await stub.create(code, scriptId, nickname));
    }

    if (parts[0] === "api" && parts[1] === "rooms" && parts[2]) {
      const code = parts[2].toUpperCase();
      const action = parts[3] ?? "";
      const stub = getRoomStub(env, code);
      if (request.method === "GET" && !action) {
        return json(await stub.get(url.searchParams.get("playerId") ?? undefined));
      }
      const body = request.method === "POST" ? await parseJson(request) : {};
      const playerId = String(body.playerId ?? "");
      if (request.method === "POST" && action === "join") {
        const nickname = String(body.nickname ?? "").trim();
        if (!nickname) return badRequest("请输入昵称。");
        return json(await stub.join(nickname, playerId || undefined));
      }
      if (!playerId) return badRequest("缺少玩家身份。");
      if (request.method === "POST" && action === "start") return json(await stub.start(playerId));
      if (request.method === "POST" && action === "advance") return json(await stub.advance(playerId));
      if (request.method === "POST" && action === "ready") return json(await stub.ready(playerId));
      if (request.method === "POST" && action === "speech-next") return json(await stub.speechNext(playerId));
      if (request.method === "POST" && action === "investigate") return json(await stub.investigate(playerId, String(body.locationId ?? "")));
      if (request.method === "POST" && action === "vote") return json(await stub.vote(playerId, String(body.targetRoleId ?? "")));
    }
    return badRequest("接口不存在。", 404);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "请求失败。");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    if (url.pathname === "/app.js") return textResponse(APP_JS, "application/javascript; charset=utf-8");
    if (url.pathname === "/styles.css") return textResponse(STYLES, "text/css; charset=utf-8");
    return textResponse(HTML, "text/html; charset=utf-8");
  }
};

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>无主持人剧本杀房间</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main id="app" class="shell"></main>
  <script type="module" src="/app.js"></script>
</body>
</html>`;

const APP_JS = `
const state = {
  scripts: [],
  room: null,
  me: null,
  roomCode: localStorage.getItem("mm_room") || "",
  playerId: localStorage.getItem("mm_player") || "",
  timer: 120,
  timerHandle: null,
  error: ""
};

const app = document.querySelector("#app");

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
        scriptId: form.get("scriptId")
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

function homeView() {
  const scriptOptions = state.scripts.map((script) => "<option value=\\"" + script.id + "\\">" + script.title + " · " + script.duration + "</option>").join("");
  return \`
    <section class="topbar">
      <div>
        <p class="eyebrow">7人无主持人</p>
        <h1>剧本杀自动房间</h1>
      </div>
      <span class="pill">Cloudflare Workers 原型</span>
    </section>
    \${state.error ? "<p class=\\"error\\">" + state.error + "</p>" : ""}
    <section class="grid two">
      <form class="panel" data-create>
        <h2>创建房间</h2>
        <label>选择剧本<select name="scriptId" required>\${scriptOptions}</select></label>
        <label>你的昵称<input name="nickname" autocomplete="name" required placeholder="例如：阿明"></label>
        <button type="submit">创建并成为房主</button>
      </form>
      <form class="panel" data-join>
        <h2>加入房间</h2>
        <label>房间码<input name="roomCode" required placeholder="例如：AB12CD" value="\${state.roomCode}"></label>
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
  \`;
}

function roomView() {
  const room = state.room;
  const me = state.me;
  const currentSpeaker = room.players[room.speakingIndex];
  const roleChoices = room.roles.map((role) => \`<button data-vote="\${role.id}" class="\${me?.votedFor === role.id ? "selected" : ""}">\${role.name}</button>\`).join("");
  const locations = room.locations.map((location) => \`<button data-investigate="\${location.id}" \${me?.investigated?.length ? "disabled" : ""}>\${location.name}</button>\`).join("");
  const players = room.players.map((player) => \`
    <li class="\${currentSpeaker?.id === player.id ? "speaking" : ""}">
      <span>\${player.order}. \${player.nickname}</span>
      <strong>\${player.role ? player.role.name : "未分配"}</strong>
      \${player.isOwner ? "<em>房主</em>" : ""}
      \${player.ready ? "<em>已完成</em>" : ""}
    </li>\`).join("");
  return \`
    <section class="topbar">
      <div>
        <p class="eyebrow">\${room.script.title}</p>
        <h1>房间 \${room.code}</h1>
        <p class="sub">\${room.script.type} · \${room.script.duration}</p>
      </div>
      <button class="ghost" data-reset>退出本机身份</button>
    </section>
    \${state.error ? "<p class=\\"error\\">" + state.error + "</p>" : ""}
    <section class="phase">
      <div>
        <p class="eyebrow">当前阶段</p>
        <h2>\${room.phase.name}</h2>
        <p>\${room.phase.instruction}</p>
      </div>
      <div class="actions">
        \${room.phaseIndex === 0 && me?.isOwner ? "<button data-action=\\"start\\">7人到齐后开始</button>" : ""}
        \${me?.isOwner && room.phaseIndex > 0 && room.phaseIndex < 9 ? "<button data-action=\\"advance\\">进入下一阶段</button>" : ""}
        \${room.phaseIndex > 0 && room.phaseIndex < 9 ? "<button class=\\"secondary\\" data-action=\\"ready\\">我已完成本阶段</button>" : ""}
        <button class="secondary" data-refresh>刷新状态</button>
      </div>
    </section>
    <section class="grid three">
      <article class="panel">
        <h2>我的角色</h2>
        \${me?.role ? \`
          <p class="role-name">\${me.role.name}</p>
          <p>\${me.role.publicIdentity}</p>
          <p class="muted">\${me.role.fit}</p>
          \${me.role.privateText ? "<div class=\\"private\\">" + me.role.privateText + "</div>" : ""}
        \` : "<p class=\\"muted\\">等待开始后自动分配。</p>"}
      </article>
      <article class="panel">
        <h2>玩家与顺序</h2>
        <ol class="players">\${players}</ol>
      </article>
      <article class="panel">
        <h2>发言计时</h2>
        <p class="speaker">\${currentSpeaker ? currentSpeaker.nickname : "等待玩家"}</p>
        <p class="timer" data-timer>\${formatTimer(state.timer)}</p>
        <button class="secondary" data-timer-start>开始 2 分钟</button>
        \${me?.isOwner ? "<button class=\\"secondary\\" data-action=\\"speech-next\\">下一位发言</button>" : ""}
      </article>
    </section>
    \${room.phase.id === "investigate" ? \`
      <section class="panel wide">
        <h2>搜证地点</h2>
        <div class="button-grid">\${locations}</div>
        <p class="muted">每名玩家本阶段只能选择一次。线索只会先显示给你自己。</p>
      </section>\` : ""}
    \${room.phase.id === "vote" ? \`
      <section class="panel wide">
        <h2>最终投票</h2>
        <div class="button-grid">\${roleChoices}</div>
        <p class="muted">当前已投票：\${room.voteProgress}/\${room.players.length}</p>
      </section>\` : ""}
    \${room.phase.id === "reveal" ? revealView(room) : ""}
  \`;
}

function revealView(room) {
  const rows = room.roles.map((role) => \`<li><span>\${role.name}</span><strong>\${room.votes[role.id] || 0} 票</strong></li>\`).join("");
  return \`
    <section class="panel wide">
      <h2>投票结果</h2>
      <ol class="players">\${rows}</ol>
      <div class="private">复盘真相占位：后续把每套剧本的最终证据闭环填入这里，只有进入复盘阶段才显示。</div>
    </section>
  \`;
}

function bind() {
  document.querySelector("[data-create]")?.addEventListener("submit", createRoom);
  document.querySelector("[data-join]")?.addEventListener("submit", joinRoom);
  document.querySelector("[data-reset]")?.addEventListener("click", resetLocal);
  document.querySelector("[data-refresh]")?.addEventListener("click", refresh);
  document.querySelector("[data-timer-start]")?.addEventListener("click", startTimer);
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
setInterval(refresh, 5000);
`;

const STYLES = `
:root {
  color-scheme: dark;
  --bg: #101113;
  --panel: #1a1d20;
  --panel-2: #22262a;
  --text: #f3f0e8;
  --muted: #a9b0ad;
  --line: #353b3f;
  --accent: #e15f45;
  --accent-2: #5fa889;
  --warning: #f2c14e;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
button, input, select { font: inherit; }
.shell {
  width: min(1180px, calc(100vw - 28px));
  margin: 0 auto;
  padding: 28px 0 42px;
}
.topbar, .phase {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}
h1, h2, p { margin: 0; }
h1 { font-size: 34px; line-height: 1.12; }
h2 { font-size: 20px; margin-bottom: 14px; }
.sub, .muted { color: var(--muted); line-height: 1.65; }
.eyebrow {
  color: var(--accent-2);
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}
.pill {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 8px 12px;
  color: var(--muted);
  white-space: nowrap;
}
.grid {
  display: grid;
  gap: 16px;
}
.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.three { grid-template-columns: 1.05fr 1.1fr 0.85fr; }
.panel, .phase {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 18px;
}
.wide { margin-top: 16px; }
label {
  display: block;
  color: var(--muted);
  margin-top: 14px;
}
input, select {
  width: 100%;
  margin-top: 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #0f1112;
  color: var(--text);
  padding: 12px 12px;
}
button {
  border: 0;
  border-radius: 7px;
  background: var(--accent);
  color: white;
  padding: 11px 14px;
  font-weight: 700;
  cursor: pointer;
  min-height: 42px;
}
button:disabled {
  opacity: .45;
  cursor: not-allowed;
}
.secondary, .ghost {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--line);
}
.selected {
  outline: 2px solid var(--warning);
}
form button { width: 100%; margin-top: 18px; }
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}
.strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}
.strip span {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 9px 12px;
  color: var(--muted);
}
.role-name, .speaker, .timer {
  font-size: 30px;
  font-weight: 800;
  margin-bottom: 8px;
}
.timer {
  color: var(--warning);
  font-variant-numeric: tabular-nums;
}
.private {
  margin-top: 14px;
  padding: 14px;
  background: #111416;
  border: 1px dashed var(--line);
  border-radius: 7px;
  line-height: 1.7;
}
.players {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}
.players li {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 9px 10px;
  background: #121517;
  border: 1px solid var(--line);
  border-radius: 7px;
}
.players em {
  color: var(--accent-2);
  font-style: normal;
  font-size: 12px;
}
.speaking {
  outline: 2px solid var(--accent-2);
}
.button-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.error {
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 7px;
  border: 1px solid rgba(225, 95, 69, .45);
  background: rgba(225, 95, 69, .14);
}
@media (max-width: 860px) {
  .topbar, .phase { align-items: stretch; flex-direction: column; }
  .two, .three, .button-grid { grid-template-columns: 1fr; }
  h1 { font-size: 28px; }
  .actions { justify-content: stretch; }
  .actions button, .ghost { width: 100%; }
}
`;
