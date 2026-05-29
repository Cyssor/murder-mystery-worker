import { DurableObject } from "cloudflare:workers";

type ScriptId = string;

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
  difficulty: string;
  playerCount: number;
  playerCounts?: number[];
  roles: Role[];
  locations: { id: string; name: string; clue: string }[];
  publicClues: string[];
  reveal: string;
  phaseAudio?: Record<string, string>;
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
  playerCount?: number;
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
  { id: "lobby", name: "等待加入", instruction: "玩家到齐后，房主点击开始。开始后系统会随机分配角色。" },
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
    difficulty: "★★★☆☆",
    playerCount: 7,
    roles: [
      role("a1", "林子轩", "林家长子", "适合敢发言、能扛嫌疑的玩家", {
        role: "你是林致远的长子。公司资金链断裂，你急需遗产或父亲的资金支持。晚餐后你情绪很差，因为父亲当众宣布明天要修改遗嘱。案发前你曾在9:05到9:15进入书房向父亲要钱，被他拒绝并斥责无能。你愤怒离开。你知道自己会成为第一嫌疑人，所以发言时要尽量解释债务压力，但不要主动说出争吵细节，除非被追问。",
        act2: "你回忆起苏婉曾多次催你向外借钱，并暗示只要父亲去世，你们就能翻身。你确实借了高利贷，但你没有杀人。你离开书房后喝了酒，后来意识有些模糊。你可以承认你和父亲吵过，但要强调你离开时父亲还活着。",
        reveal: "你是强嫌疑人之一。你的债务和争吵制造了动机，但你离开书房的时间早于真正死亡节点。"
      }),
      role("a2", "苏婉", "林子轩之妻", "适合会演、会周旋的玩家", {
        role: "你是林子轩的妻子。你一直希望丈夫继承林家财产，因为你们已经被债务压得喘不过气。案发停电时，你并没有一直在房间。你偷偷去过书房，想找遗嘱草稿。你发现林致远已经倒在血泊中，但你没有呼救，而是先翻找抽屉。你的袖口沾了血，耳环也可能掉在现场。你必须隐瞒自己进过书房。",
        act2: "你和律师陈浩有暧昧关系，他知道不少遗嘱信息。你房间里有高利贷借据复印件。你可以把嫌疑引向林子轩、陈浩或遗嘱争夺，但一旦别人拿出血迹和耳环，你只能承认自己接触过尸体，强调当时林致远已经死了。",
        reveal: "你是最大红鲱鱼。你的证据证明你去过书房、接触过尸体、有利益动机，但不能证明你杀人。"
      }),
      role("a3", "林雨薇", "林家女儿", "适合情绪表达强、代入感好的玩家", {
        role: "你是林致远的女儿。父亲一直控制你的人生，甚至逼你处理掉不被家族接受的感情和孩子。晚餐时他说要修改遗嘱，你怀疑自己会被取消继承权。你对父亲有怨，但更多是想离开这个家。案发时你情绪崩溃，不想让别人知道自己的私事。",
        act2: "你曾计划离家，但没有杀父。你可以提供家族内部矛盾，也可以指出父亲今晚召集所有人并非单纯谈遗嘱。你对小兰的来历有一点疑惑：父亲最近似乎对某个旧人和孩子很敏感。",
        reveal: "你承担情感动机线。你的怨恨真实存在，但缺少关键作案时间和现场证据。"
      }),
      role("a4", "王福", "林家老管家", "适合稳重、愿意记时间线的玩家", {
        role: "你是林家的老管家。你挪用过账款，因为儿子治病急需钱。林致远已经发现账目异常，你担心被赶走。9:20停电后，你去保险丝箱附近修电。9:28到9:35之间你一直在处理保险丝。你听到西侧走廊有脚步声，但没有看清是谁。",
        act2: "你确实有挪款秘密，但不是为了自己挥霍。你可以证明电力在9:35恢复。你还注意到保险丝箱附近有不正常痕迹，像是有人故意拉断过。你需要把大家拉回时间线，不要只看动机。",
        reveal: "你是时间证人。你的修电时间能帮助玩家判断停电期间谁有行动机会。"
      }),
      role("a5", "李志强", "私人医生", "适合理性、喜欢分析证据的玩家", {
        role: "你是林致远的私人医生。你隐瞒过他的真实病情，也曾私下开过镇静药，因此害怕被怀疑下药。案发后你检查尸体，发现胸口裁纸刀是直接死因，但死亡时间可能比众人以为的更早。",
        act2: "你判断林致远死亡时间更接近9:20，而不是9:35之后。苏婉如果9:23之后才到书房，她可能接触过尸体，但未必是刺杀者。你也可以说明现场不像药物致死，镇静药线只是干扰。",
        reveal: "你是死因和死亡时间证人。你的判断是排除苏婉直接杀人的关键。"
      }),
      role("a6", "陈浩", "家族律师", "适合逻辑强、会隐藏信息的玩家", {
        role: "你是林家的律师。8:40到9:00你与林致远单独谈遗嘱修改。他准备把大部分财产转入慈善基金，只给子女少量固定资产。你还听见他提到当年的女人和她的孩子不能再影响林家。你与苏婉有暧昧关系，这会让你很危险。",
        act2: "你知道林致远正在查一个可能存在的私生女。你不愿主动公开和苏婉的关系，但如果遗嘱线被讨论，你可以透露慈善基金和旧人孩子的信息。你不是凶手，但你的隐瞒会让你看起来像操控遗嘱的人。",
        reveal: "你是遗嘱线与身份线桥梁。你知道的信息能把推理从遗产争夺引向私生女复仇。"
      }),
      role("a7", "小兰", "林家女仆", "适合安静型、后期能爆发的玩家", {
        role: "你是林家的女仆。你来庄园并不只是工作。你母亲曾被林致远抛弃，临终前留下信和半枚旧项链。今晚你听见林致远提到当年的女人和孩子，情绪失控。9:16到9:19你进入书房，要求他承认你的身份。他羞辱你和你的母亲。你必须隐藏自己的真实身份。",
        act2: "你熟悉庄园，也知道保险丝箱位置。你身上有半枚旧项链，另一半可能与林致远有关。你要表现得低调，不要主动引导大家查女仆房、旧照片、项链和保险丝箱。若被问到停电时在哪，你可以说自己在厨房或仆人区。",
        reveal: "你是真凶。你的身份动机、作案时间、保险丝行为、现场布料和旧项链构成完整闭环。"
      })
    ],
    locations: [
      clue("study", "书房", "书房地毯边发现一枚女士耳环，抽屉有被翻动痕迹。林致远手中攥着一小块类似女仆围裙的布料。"),
      clue("corridor", "西侧走廊", "停电期间有人从书房方向快速离开。走廊地毯边缘有一小段被勾断的浅色线头。"),
      clue("fusebox", "保险丝箱", "保险丝箱上有细小血迹或手印，像是拉闸的人手上曾经沾血。"),
      clue("suwans-room", "苏婉房间", "房间内有高利贷借据复印件，抽屉里还有她与陈浩的暧昧信件。"),
      clue("maids-room", "女仆房", "小兰物品中有半枚旧项链和一封母亲留下的旧信，信中提到林家旧事。"),
      clue("medicine-case", "医生药箱", "镇静药数量对不上，但医生判断死因并非药物。死亡时间更接近9:20。"),
      clue("lawyer-bag", "律师公文包", "遗嘱草稿显示林致远准备把大部分财产转入慈善基金，并提到一个旧人和孩子。")
    ],
    publicClues: [
      "8:00晚餐时，林致远宣布明天正式修改遗嘱，所有人今晚留在庄园。",
      "9:20庄园停电，9:35电力恢复，9:38书房方向传来惊呼。",
      "死者胸口插着桌上的裁纸刀，书房门半开。"
    ],
    reveal: "真凶是小兰。苏婉的血迹和耳环只能证明她在9:23之后去过书房、接触过尸体并翻找遗嘱；医生判断死亡时间更接近9:20。小兰在9:16到9:20与林致远对质，因私生女身份和母亲旧怨刺杀死者，随后拉断保险丝制造混乱。保险丝箱血迹、女仆围裙布料、裙角线头、旧照片和半枚项链共同形成闭环。"
  },
  "snow-sanatorium": {
    id: "snow-sanatorium",
    title: "雪夜疗养院",
    type: "本格推理 / 医疗秘密 / 旧案复仇 / 伪装身份",
    duration: "4-5 小时",
    difficulty: "★★★★☆",
    playerCount: 7,
    roles: [
      role("b1", "沈墨", "院长之子", "适合主动发言、利益动机明显的玩家", {
        role: "你是院长沈敬山的儿子。你表面上即将继承疗养院股份，但实际上你偷偷变卖过疗养院资产，害怕父亲发现后取消你的继承安排。今晚父亲要关闭旧病区、清理旧病历，你觉得他还有别的计划。你有动机，但你不想让别人知道资产问题。",
        act2: "你知道父亲近年来身体不好，也知道他经常吃心脏药。案发后现场像心梗，但你对父亲办公室的反锁状态很在意。你可以质疑许曼青和周启明的关系，也可以把火力引向药剂师陆远。",
        reveal: "你是继承线嫌疑人。你有经济动机，但无法解释颈部针孔和毒素接触方式。"
      }),
      role("b2", "许曼青", "院长现任妻子", "适合会演感情线、能拉扯关系的玩家", {
        role: "你是沈敬山的现任妻子。你担心他离婚后让你净身出户。你与副院长周启明关系暧昧，今晚你确实动过沈敬山的心脏药。你希望别人相信这是药物或心梗问题，但你不能暴露自己换药的行为。",
        act2: "你换过心脏药，但那不是致命原因。你知道沈敬山最近要辞退叶澜，还要清理十年前的旧病历。你可以承认婚姻矛盾，但要避免别人把你和周启明绑定成共谋。",
        reveal: "你是药物线红鲱鱼。你确实动过药，也有利益动机，但死者没有真正吞下心脏药，死因是颈部细针毒素。"
      }),
      role("b3", "周启明", "副院长", "适合逻辑型、能处理复杂旧事线的玩家", {
        role: "你是白桦疗养院副院长。你和沈敬山争权多年，也曾参与过十年前病历篡改。今晚你担心旧档案被清理后，所有责任会被推到你身上。案发时你在处理旧档案，不在办公室附近。",
        act2: "你和许曼青有私情。你知道十年前某个普通病人的死亡被疗养院包装成自然事故。叶澜也知道一部分真相。你不是凶手，但你会因为销毁档案显得非常可疑。",
        reveal: "你是旧案桥梁和争权嫌疑人。你的行为解释了档案线，但不能解释直接接触死者颈部的机会。"
      }),
      role("b4", "叶澜", "护士长", "适合稳重、能掌握关键信息的玩家", {
        role: "你是护士长。沈敬山准备辞退你，并可能让你背十年前医疗事故的锅。你知道旧病历里有被改过的记录，也知道沈敬山晚上常让护士按摩颈部缓解旧伤。",
        act2: "你可以提供关键护理习惯：不是所有人都能自然接近沈敬山颈部，护士身份最方便。你参与过旧案隐瞒，但这些年一直良心不安。你要判断年轻护士白晓为何特别关注旧病区。",
        reveal: "你是旧案证人。你掌握按摩习惯和病历篡改信息，是锁定作案方式的关键。"
      }),
      role("b5", "顾辰", "病人家属", "适合正义感强、喜欢追查真相的玩家", {
        role: "你是病人家属。你的母亲死于疗养院旧事故，你一直怀疑沈敬山隐瞒真相。你来到这里并非单纯探病，而是为了调查旧案。你有复仇动机，但你并没有杀人。",
        act2: "你查到十年前病历中有涂改痕迹，一个死者女儿的名字被遮住。你可以推动大家追查旧病历，但注意：真正凶手可能和你一样关注旧案，却比你更接近医疗现场。",
        reveal: "你是正义调查线。你的动机强，但你缺少护士式接近机会和毒素操作证据。"
      }),
      role("b6", "白晓", "年轻护士", "适合低调、细节型、后期反转感强的玩家", {
        role: "你是年轻护士。你在疗养院受过沈敬山羞辱和压榨，但这不是你真正留下来的原因。你的母亲是十年前旧事故中的死者。你进入疗养院，是为了找到旧病历并复仇。你必须隐藏真实身份。",
        act2: "你知道沈敬山有颈椎旧伤，晚上常让护士帮他按摩。案发当晚9:35你借送热水进入办公室，假装按摩，用袖口藏着的细针将神经毒素刺入他颈部。毒素不会立刻致死，能制造死亡时间误导。你要把怀疑引向陆远的药房毒素和许曼青的心脏药。",
        reveal: "你是真凶。你利用护士身份、按摩习惯和毒素延迟发作制造心梗假象。旧病历、吊坠照片、手套腐蚀痕迹和颈部针孔共同指向你。"
      }),
      role("b7", "陆远", "药剂师", "适合喜欢证据线、药物线的玩家", {
        role: "你是药剂师。你被沈敬山发现偷药，因此非常害怕案发后被查。药房确实有毒素少了一支，登记本也被人改过。你偷的是镇痛药，不是杀人的毒素。",
        act2: "你知道毒素需要专业使用，且不会像普通口服药那样立刻被发现。你可以指出心脏药不是关键，但别人很可能先怀疑你。你要努力证明毒素不等于你使用毒素。",
        reveal: "你是药物线强嫌疑人。你能解释毒素来源，但不能解释谁能接近死者颈部完成注射。"
      })
    ],
    locations: [
      clue("office", "院长办公室", "死者颈部有一个极细小针孔，桌边地毯上有一滴透明药液，心脏药片在手边但没有真正吞下。"),
      clue("pharmacy", "药房", "药房毒素少了一支，登记本被人改过；镇痛药数量也异常。"),
      clue("old-ward", "旧病区", "十年前旧病区曾发生医疗事故，普通病人死亡后记录被改写。"),
      clue("archive", "病历档案室", "旧病历中死者女儿姓名被涂黑，部分责任记录被篡改。"),
      clue("nurse-station", "护士站", "值班表显示白晓熟悉沈敬山夜间按摩习惯，叶澜也知道这个习惯。"),
      clue("guest-room", "家属休息室", "顾辰带来旧案调查资料，资料指向十年前死者家属一直在寻找真相。"),
      clue("snow-path", "雪地通道", "暴雪封山，无人能离开疗养院。案发前后没有外来脚印。")
    ],
    publicClues: [
      "暴雪封山，白桦疗养院与外界失联。",
      "晚上10:00，沈敬山被发现死在办公室，现场像心梗。",
      "尸检发现死者颈部有极细小针孔，真正死因与毒素有关。"
    ],
    reveal: "真凶是白晓。她是十年前死亡病人的女儿，进入疗养院是为了寻找旧病历并复仇。9:35她借送热水进入办公室，利用护士身份和按摩习惯接近死者颈部，用细针注入神经毒素。死者短时间内还能行动，因此拿心脏药自救，制造心梗和死亡时间误导。"
  },
  "seventh-letter": {
    id: "seventh-letter",
    title: "海上第七封信",
    type: "游轮密室 / 遗产争夺 / 失踪旧案 / 双重身份",
    duration: "4-5.5 小时",
    difficulty: "★★★★☆",
    playerCount: 7,
    roles: [
      role("c1", "秦越", "死者养子", "适合承压能力强、能处理继承线的玩家", {
        role: "你是秦柏川的养子。你一直以继承人身份生活，但你知道自己的收养手续并不完整。晚宴上他说第七封信会改变所有人的命运，你担心信里写着会让你失去继承权的内容。",
        act2: "桌上的六封信揭露了许多人的秘密，但第七封信不见了。你最害怕别人追问你的合法继承身份。你可以怀疑方岚或宋知夏，但要注意广播遗言是否真的来自死者临终。",
        reveal: "你是遗产线强嫌疑人。你的继承危机真实存在，但死亡时间提前后，你缺少关键离场机会。"
      }),
      role("c2", "方岚", "死者前妻", "适合成熟型、会谈判和情绪输出的玩家", {
        role: "你是秦柏川前妻。你想拿回共同财产，也隐瞒过一个孩子的旧事。秦柏川包下游轮并宣布第七封信时，你意识到他可能要公开过去。你有动机，但你没有杀人。",
        act2: "你知道秦柏川十五年前毁掉过一位无名女作家。你可以谈财产，也可以谈旧事，但要谨慎，因为你的隐瞒会让你显得像第七封信的核心人物。",
        reveal: "你承担旧关系和财产线。你知道部分旧事，却不是拿走第七封信的人。"
      }),
      role("c3", "唐修", "死者编辑", "适合文艺型、会隐藏小秘密的玩家", {
        role: "你是秦柏川的编辑。你被他压榨多年，也偷过他的手稿。你知道他靠包装和掠夺作家成名。今晚他在六封信中揭露大家秘密，让你非常不安。",
        act2: "你偷过手稿，但不是第七封信。你可以提供出版圈旧闻：十五年前有一位女作家作品被秦柏川拿走，之后自杀。你要避免别人把偷手稿和杀人直接联系起来。",
        reveal: "你是手稿线证人。你的秘密指向秦柏川旧罪，但你不是复仇者。"
      }),
      role("c4", "贺明", "游轮船长", "适合稳重、能控场或装镇定的玩家", {
        role: "你是游轮船长。秦柏川掌握你的走私证据，可能利用第七封信威胁你。案发前你负责航线调整，游轮监控短暂出现死角。你需要解释自己为什么调整航线。",
        act2: "你知道案发时海况复杂，但监控死角确实给凶手提供了操作空间。你可以证明船外无人潜入，所有嫌疑都在船上。你要小心别人把密室和航线问题都推给你。",
        reveal: "你是密室环境和监控死角嫌疑人。你创造了条件，但不是进入书房杀人的人。"
      }),
      role("c5", "宋知夏", "年轻作家", "适合表达欲强、冲突感强的玩家", {
        role: "你是年轻作家。你与秦柏川有版权纠纷，认为他剽窃你的作品。你曾公开说过他该死，因此案发后你会非常显眼。你恨他，但你的纠纷是近期事件。",
        act2: "你可以指出秦柏川的剽窃并非第一次。十五年前的旧案比你的纠纷更深。你要证明自己在广播响起前后没有进入私人书房。",
        reveal: "你是近期剽窃纠纷红鲱鱼。真正仇恨来自十五年前旧案，而不是你的近期作品。"
      }),
      role("c6", "林珂", "私人助理", "适合观察细节、会处理信息差的玩家", {
        role: "你是秦柏川的私人助理。你掌握他的录音设备，也帮他整理过录音素材。案发时广播里传来秦柏川的声音，你知道这套设备可以预设播放，但你不想被怀疑制造遗言。",
        act2: "你可以确认11:00广播不一定是实时广播。广播室设备有预设播放记录。你没有杀人，但你的设备知识会让你成为关键嫌疑人。你要引导大家区分录音能力和实际作案机会。",
        reveal: "你是录音误导线桥梁。你证明广播遗言可能是预设录音，从而把死亡时间提前到10:35到10:45。"
      }),
      role("c7", "乔安", "游轮钢琴师", "适合神秘感强、低调但会演的玩家", {
        role: "你是游轮钢琴师。你身份神秘，真正目的不是演奏。十五年前被秦柏川毁掉的女作家是你的姐姐。你登船是为了找回姐姐的原始手稿，并逼秦柏川承认罪行。你必须隐藏自己与旧案的关系。",
        act2: "10:35你借送乐谱进入私人书房，拿出姐姐手稿质问秦柏川。他承认剽窃并嘲讽死人不会说话。你用书桌上的拆信刀刺杀他。之后你用细线布置伪密室，设置11:00录音广播，并拿走写有你真实身份的第七封信。你要声称自己一直在宴会厅弹琴。",
        reveal: "你是真凶。你利用录音误导死亡时间，用细线制造伪密室，并拿走第七封信隐藏身份。钢琴曲中断、手指划伤、鱼线痕迹和第七封信残片共同指向你。"
      })
    ],
    locations: [
      clue("private-study", "私人书房", "房门内侧插销有细线摩擦痕迹，桌上的拆信刀少量血迹被擦过。"),
      clue("broadcast-room", "广播室", "设备显示11:00播放的是预设录音，不是实时广播。录音素材来自秦柏川旧录音。"),
      clue("vent", "通风口", "通风口边缘发现一小段透明鱼线，位置能连接门缝方向。"),
      clue("ballroom", "宴会厅", "乔安的钢琴曲中断过约3分钟，但她声称自己一直在弹。"),
      clue("captain-room", "船长室", "航线调整造成短暂监控死角，但没有证据显示外人登船。"),
      clue("fireplace", "壁炉", "第七封信被烧毁一半，残留纸角上还能看到“她妹妹”三个字。"),
      clue("manuscript", "手稿箱", "秦柏川旧手稿封面上有一位无名女作家的笔迹，与十五年前旧案有关。")
    ],
    publicClues: [
      "晚宴时秦柏川宣布第二天公开第七封信，这封信会改变所有人的命运。",
      "11:00广播里传来秦柏川的声音，众人随后发现私人书房反锁，秦柏川胸口中刀。",
      "桌上有六封已经拆开的信，唯独第七封信不见了。"
    ],
    reveal: "真凶是乔安。所谓广播遗言是预设录音，不是秦柏川临死前实时发声。真正死亡时间在10:40左右。乔安10:35借送乐谱进入书房，用拆信刀杀死秦柏川，随后用细线制造伪密室，设置11:00录音，并拿走第七封信隐藏自己是十五年前女作家妹妹的身份。"
  }
  ,
  "fog-inn": simpleScript({
    id: "fog-inn",
    title: "雾中民宿",
    type: "民宿封闭空间 / 旧案复仇 / 伪装自杀",
    duration: "2.5-3.5 小时",
    difficulty: "★★★☆☆",
    playerCount: 5,
    playerCounts: [4, 5, 6],
    roles: [
      ["d1", "周棠", "自由摄影师", "周眠妹妹，复仇者。她模仿赵屿的户外绳结伪装自杀。"],
      ["d2", "许知微", "民宿老板", "想保护民宿声誉，曾参与隐瞒十年前事故。"],
      ["d3", "林砚", "旅行作家", "为新书调查民宿旧案；4人局承接赵屿的绳结嫌疑。"],
      ["d4", "孟晚", "心理咨询师", "曾治疗旧案幸存者，知道十年前事故创伤。"],
      ["d5", "赵屿", "户外教练", "会打绳结，被真凶嫁祸的强红鲱鱼。"],
      ["d6", "沈弋", "实习店员", "负责前台与监控，发现硬盘被动过但怕追责隐瞒。"]
    ],
    locations: [
      ["attic", "阁楼", "死者颈部勒痕偏低，椅子无承重压痕，像死后摆放。"],
      ["tool-room", "工具间", "少了一段登山绳，绳结像户外结但收尾方向错误。"],
      ["camera-bag", "摄影包", "肩带金属刮痕与死者指甲缝中的黑色纤维吻合。"],
      ["archive", "旧案资料", "十年前周眠坠亡案被写成意外，旧地块明天将被转让。"]
    ],
    publicClues: [
      "蒋衡手提包里有旧地块转让合同，签约日期就是明天。",
      "十年前事故剪报：女孩周眠在民宿后山坠亡，记录被写成意外。",
      "阁楼梁上的绳结像户外结，但收尾方向错误，像是模仿。",
      "周棠相机里有赵屿绳结照片特写，拍摄时间在案发前。",
      "周棠钱包夹层有周眠小时候合照，背面写着“姐姐”。"
    ],
    reveal: "真凶是周棠。蒋衡真正死于21:10左右的勒杀。周棠利用赵屿社交账号学来的绳结伪装成户外绳结，又用备用手机在21:14播放脚步声，制造死者仍活动的假象。"
  }),
  "last-metro": simpleScript({
    id: "last-metro",
    title: "最后一班地铁",
    type: "地铁末班车 / 过敏杀人 / 监控断点 / 快节奏推理",
    duration: "2-3 小时",
    difficulty: "★★★☆☆",
    playerCount: 4,
    playerCounts: [4, 5],
    roles: [
      ["e1", "纪然", "前私人助理", "姐姐因韩启明职场霸凌自杀，知道他的咖啡习惯和坚果过敏。"],
      ["e2", "白洛", "广告公司前员工", "作品被韩启明抢走并开除，旧怨很深。"],
      ["e3", "陈司", "地铁司机", "曾因韩启明投诉被处分，被监控黑屏拖入嫌疑。"],
      ["e4", "许曼", "急救医生", "曾被韩启明撤资导致项目失败，能判断过敏死因。"],
      ["e5", "顾南", "地铁安检员", "证明案发前有人翻过死者背包，但因私自离岗前期隐瞒。"]
    ],
    locations: [
      ["carriage", "末班车厢", "韩启明喉头水肿，符合严重过敏性休克。"],
      ["bag", "死者背包", "背包夹层空了，原本应放肾上腺素笔。"],
      ["coffee", "咖啡杯", "杯口有微量坚果油残留。"],
      ["platform", "站台监控", "纪然曾接过韩启明咖啡杯约4秒。"]
    ],
    publicClues: [
      "韩启明手机里有给白洛的威胁短信。",
      "车厢监控黑屏22秒，但黑屏前韩启明已经开始抓喉咙。",
      "咖啡杯口有微量坚果油残留。",
      "垃圾桶中发现被折断的肾上腺素笔外壳。",
      "纪然手机搜索记录：“坚果油接触过敏多久发作”。"
    ],
    reveal: "真凶是纪然。真正作案点不在监控黑屏期间，而是在23:24站台短暂接过咖啡杯时。她将坚果油涂在杯口，并提前偷走急救针，利用黑屏制造死亡时间误导。"
  }),
  "silent-auction": simpleScript({
    id: "silent-auction",
    title: "无声拍卖会",
    type: "拍卖会 / 古董赝品 / 熄灯杀人 / 家族旧物",
    duration: "3-4 小时",
    difficulty: "★★★★☆",
    playerCount: 6,
    playerCounts: [5, 6],
    roles: [
      ["f1", "何砚", "古董修复师", "何家后人，本想追回祖传玉印。"],
      ["f2", "顾行舟", "收藏家", "想低价收购玉印，收到匿名短信称玉印不真。"],
      ["f3", "方白", "古董鉴定师", "帮陆承安出过假鉴定。"],
      ["f4", "陆宁", "死者女儿", "想阻止父亲再婚和转移财产，制造过熄灯。"],
      ["f5", "秦越", "陆家旧保姆之子", "认为母亲被陆承安害死。"],
      ["f6", "苏明岚", "调查记者", "调查陆承安倒卖文物；5人局可删除并入顾行舟。"]
    ],
    locations: [
      ["display", "展柜", "玻璃没有外部暴力破坏痕迹，玉印可能是熄灯中被拿走。"],
      ["switch", "电闸", "电闸旁有陆宁高跟鞋鞋印，说明熄灯由她制造。"],
      ["paper-bin", "碎纸篓", "买家信息残片上有“海港仓”字样。"],
      ["workbox", "修复箱", "镇纸上有修复用松香粉，何砚工作箱中也有同类粉末。"]
    ],
    publicClues: [
      "玉印印面边缘有新刻痕，像近期做旧。",
      "方白鉴定报告中“传世包浆”用词与实物不符。",
      "电闸旁有陆宁高跟鞋鞋印。",
      "何家旧谱记载：真玉印底部有“砚”字暗记，而展柜玉印没有。",
      "陆承安死前攥着一小片修复手套碎片。"
    ],
    reveal: "真凶是何砚。她发现展柜玉印是赝品后逼问陆承安，陆承安承认真品早已被私卖并撕毁唯一买家线索。何砚失控用镇纸杀人，再拿走赝品制造盗窃杀人表象。"
  }),
  "birthday-live": simpleScript({
    id: "birthday-live",
    title: "生日直播间",
    type: "直播事故 / 录播延迟 / 食物过敏 / 网络舆论",
    duration: "2.5-3.5 小时",
    difficulty: "★★★☆☆",
    playerCount: 5,
    playerCounts: [4, 5, 6],
    roles: [
      ["g1", "夏予", "化妆师", "被唐梨长期压榨，背过抄袭黑锅，掌握过敏禁忌。"],
      ["g2", "沈乔", "品牌方代表", "害怕唐梨毁约造成巨额损失。"],
      ["g3", "路星野", "前男友", "被唐梨营销分手人设。"],
      ["g4", "姜禾", "闺蜜兼合伙人", "知道唐梨黑料，股权分成将被削弱；4人局承接直播后台信息。"],
      ["g5", "白榆", "直播导演", "操控直播延迟和切片，是时间误导红鲱鱼。"],
      ["g6", "阿景", "运营助理", "负责切换直播画面，知道10分钟延迟但因偷懒隐瞒。"]
    ],
    locations: [
      ["makeup-room", "化妆间", "唐梨倒在镜前，嘴唇红肿，符合严重过敏。"],
      ["lip-gloss", "唇釉", "刷头检出芒果提取物残留。"],
      ["live-console", "直播后台", "21:00画面为延迟垫片，不是实时画面。"],
      ["contract", "商务合同", "唐梨拒绝口播将导致品牌方巨额损失。"]
    ],
    publicClues: [
      "唐梨准备发声明，把早年抄袭争议全部推给夏予。",
      "法医初步判断死因为严重过敏性休克。",
      "唐梨禁忌表写明：严重芒果过敏，禁止接触芒果提取物。",
      "蛋糕和饮料均未检出芒果成分。",
      "夏予化妆箱中有一支拆封芒果精华小样。"
    ],
    reveal: "真凶是夏予。唐梨真正死亡在21:08前后，21:00直播画面是延迟垫片。夏予利用补妆机会把芒果精华混入唇釉，能同时解释死因、过敏源和死亡时间误导。"
  }),
  "misty-manor": simpleScript({
    id: "misty-manor",
    title: "迷雾庄园命案",
    type: "豪门遗产纠纷 / 伪密室 / 情人共犯",
    duration: "70-100 分钟",
    difficulty: "★★★☆☆",
    playerCount: 5,
    playerCounts: [4, 5, 6],
    roles: [
      ["h1", "维克多", "老庄主长子", "欠下赌债，急需遗产，伪造过旧遗嘱草稿。"],
      ["h2", "伊莎贝拉", "老庄主二女儿", "曾被父亲拆散恋情，偷藏过父亲信件。"],
      ["h3", "莉莉安", "年轻遗孀", "与管家有私情，计划偷遗嘱，最终杀死亨利。"],
      ["h4", "阿尔弗雷德", "老管家", "挪用资金被发现，与莉莉安相爱，案后帮她伪造密室。"],
      ["h5", "霍华德", "生意老友", "与死者有分成纠纷，掌握遗嘱将调整的消息。"],
      ["h6", "塞巴斯蒂安", "私生子", "手里有死者承认身份的信，推动遗嘱线。"]
    ],
    locations: [
      ["study", "书房", "死者胸口插着拆信刀，书房门窗看似从内部反锁。"],
      ["fireplace", "壁炉", "有一份烧毁一半的遗嘱文件。"],
      ["drawer", "管家抽屉", "发现一段弯曲细铁丝，可用于伪造反锁。"],
      ["wine", "红酒杯", "红酒中含安眠药，剂量不足以致死。"]
    ],
    publicClues: [
      "死者右手紧握一枚女士胸针，胸针有被强行扯断的痕迹。",
      "内侧门栓有划痕，像是从门外用细线或铁丝操作过。",
      "阿尔弗雷德袖口有壁炉灰，尽管他否认接近壁炉。",
      "莉莉安与阿尔弗雷德的信件写着：“过了今晚，我们就自由了。”",
      "死因是胸口刺伤，安眠药只是让死者短暂眩晕。"
    ],
    reveal: "真凶是莉莉安，阿尔弗雷德是包庇者。莉莉安先用安眠药让亨利眩晕，偷遗嘱时被发现后用拆信刀杀人；阿尔弗雷德帮助烧毁遗嘱、擦拭现场，并用细铁丝伪造密室。"
  }),
  "storm-train": simpleScript({
    id: "storm-train",
    title: "暴雨列车的午夜",
    type: "列车谋杀 / 旧案复仇 / 身份隐藏 / 伪密室",
    duration: "80-110 分钟",
    difficulty: "★★★★☆",
    playerCount: 5,
    playerCounts: [4, 5, 6],
    roles: [
      ["i1", "林小禾", "年轻记者", "调查八年前溺亡案，掌握王启明涉案录音线索。"],
      ["i2", "苏晚", "神秘女子", "八年前溺亡案死者的女儿，确实进过7号包厢。"],
      ["i3", "老周", "退休警察", "当年收钱把旧案定性为意外，是旧案知情者。"],
      ["i5", "小美", "列车员", "姐姐因王富商旧案被害，利用乘务员权限作案。"],
      ["i4", "阿杰", "富商秘书", "偷取公司文件被发现，掌握洗钱/事故证据。"],
      ["i6", "大刘", "列车厨师", "看见小美借走餐夹但不敢说。"]
    ],
    locations: [
      ["cabin7", "7号包厢", "门挂着安全链，表面像密室。"],
      ["necklace", "珍珠项链", "项链断裂后被缠在死者脖子上，但不是真正凶器。"],
      ["berth", "卧铺安全束带", "真正凶器是卧铺安全束带。"],
      ["service-card", "乘务员备用卡", "小美能用备用卡进入包厢。"]
    ],
    publicClues: [
      "23:20苏晚进入7号包厢质问旧案，与死者拉扯后离开；死者当时仍活着。",
      "23:30老周看到小美进入7号包厢，但因旧案愧疚没有声张。",
      "死者脖子上的珍珠项链并非真正凶器。",
      "安全链可用餐夹从门外拨上，伪造密室。",
      "小美23:55假装巡逻发现尸体。"
    ],
    reveal: "真凶是列车员小美。她23:35用乘务员备用卡进入7号包厢，以安全检查为由接近王启明，用卧铺安全束带勒死他，再用断裂珍珠项链嫁祸苏晚，并用餐夹从门外拨上安全链。"
  })
};

function role(id: string, name: string, publicIdentity: string, fit: string, privateByPhase?: Record<string, string>): Role {
  return {
    id,
    name,
    publicIdentity,
    fit,
    privateByPhase: privateByPhase ?? {
      role: "开局个人剧本占位：这里填入该角色只在开局可见的信息。",
      act2: "第二幕个人剧本占位：这里填入中段解锁的信息。",
      reveal: "复盘占位：这里填入该角色结局相关说明。"
    }
  };
}

function clue(id: string, name: string, clueText: string) {
  return { id, name, clue: clueText };
}

function simpleScript(input: {
  id: ScriptId;
  title: string;
  type: string;
  duration: string;
  difficulty: string;
  playerCount: number;
  playerCounts?: number[];
  roles: [string, string, string, string][];
  locations: [string, string, string][];
  publicClues: string[];
  reveal: string;
}): ScriptPack {
  return {
    id: input.id,
    title: input.title,
    type: input.type,
    duration: input.duration,
    difficulty: input.difficulty,
    playerCount: input.playerCount,
    playerCounts: input.playerCounts,
    roles: input.roles.map(([id, name, publicIdentity, secret]) => role(id, name, publicIdentity, "适合朋友桌游局，按阶段阅读自己的私密信息。", {
      role: roleCard(input.title, name, publicIdentity, secret),
      intro: `自我介绍参考：我是${name}，${publicIdentity}。你可以说明自己为什么来到现场、和死者或事件有什么公开关系。不要主动说出自己的隐藏秘密。`,
      act2: `${secret} 中段重点：围绕时间线、动机和是否撒谎进行自辩，不能编造主持人未公布的新事实。`,
      reveal: secret
    })),
    locations: input.locations.map(([id, name, clueText]) => clue(id, name, clueText)),
    publicClues: input.publicClues,
    reveal: input.reveal
  };
}

function roleCard(title: string, name: string, publicIdentity: string, secret: string) {
  return [
    `【开场可照读】我是${name}，${publicIdentity}。今晚我出现在《${title}》这场事件里，不是来看热闹的。死者出事前，我确实和这件事有关系，但我希望各位先听事实，不要只凭身份和动机判断我。`,
    `【你知道的事】${secret}`,
    "【这一阶段你的目标】先把自己的公开身份讲清楚，承认那些迟早会被发现的公开关系；对真正敏感的隐藏秘密，可以先保留，等别人追问或线索出现后再解释。",
    "【不要主动暴露】不要直接说出自己的隐藏秘密、关键物证来源、真实动机或案发关键时间点。你可以质疑别人，但不能编造主持人没有公布的新事实。"
  ].join("<br><br>");
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
  async create(code: string, scriptId: ScriptId, nickname: string, playerCount?: number) {
    const existing = await this.ctx.storage.get<RoomState>("state");
    if (existing) return this.snapshot(existing, existing.players[0]?.id);
    const script = SCRIPTS[scriptId];
    const count = normalizePlayerCount(script, playerCount);
    const state: RoomState = {
      code,
      scriptId,
      playerCount: count,
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
    const count = this.roomPlayerCount(state);
    if (state.players.length >= count) throw new Error("房间已满。");
    const player: Player = {
      id: randomToken(12),
      nickname,
      roleId: null,
      joinedAt: Date.now(),
      isOwner: state.players.length === 0,
      readyPhase: null
    };
    state.players.push(player);
    if (state.players.length === count) this.assignRoles(state);
    await this.save(state);
    return this.snapshot(state, player.id);
  }

  async start(playerId: string) {
    const state = await this.requireState();
    this.requireOwner(state, playerId);
    const count = this.roomPlayerCount(state);
    if (state.players.length !== count) throw new Error(`需要 ${count} 名玩家到齐后才能开始。`);
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
    const count = this.roomPlayerCount(state);
    if (state.players.length === count && state.players.every((candidate) => candidate.readyPhase === state.phaseIndex)) {
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
    if (!this.scriptRoles(state).some((roleItem) => roleItem.id === targetRoleId)) throw new Error("未知投票对象。");
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
    const roles = shuffle(this.scriptRoles(state).map((item) => item.id));
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

  private roomPlayerCount(state: RoomState) {
    return normalizePlayerCount(SCRIPTS[state.scriptId], state.playerCount);
  }

  private scriptRoles(state: RoomState) {
    return SCRIPTS[state.scriptId].roles.slice(0, this.roomPlayerCount(state));
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
    const count = this.roomPlayerCount(state);
    const roles = this.scriptRoles(state);
    const phase = PHASES[state.phaseIndex];
    const me = playerId ? state.players.find((player) => player.id === playerId) : null;
    const myRole = me?.roleId ? roles.find((roleItem) => roleItem.id === me.roleId) ?? null : null;
    const visibleRole = myRole ? {
      id: myRole.id,
      name: myRole.name,
      publicIdentity: myRole.publicIdentity,
      fit: myRole.fit,
      privateText: privateTextForPhase(myRole, phase.id)
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
          duration: script.duration,
          difficulty: script.difficulty,
          playerCount: count,
          playerCounts: script.playerCounts ?? [script.playerCount]
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
        roles: roles.map((roleItem) => publicRole(script, roleItem.id)),
        locations: phase.id === "investigate" ? script.locations.map(({ id, name }) => ({ id, name })) : [],
        publicClues: phase.id === "clue1" ? script.publicClues : [],
        reveal: phase.id === "reveal" ? script.reveal : "",
        phaseAudio: script.phaseAudio?.[phase.id] ?? "",
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

function privateTextForPhase(roleItem: Role, phaseId: string) {
  if (roleItem.privateByPhase[phaseId]) return roleItem.privateByPhase[phaseId];
  if (phaseId === "intro") {
    return `自我介绍参考：我是${roleItem.name}，${roleItem.publicIdentity}。请只介绍公开身份、来到现场的理由、案发前自己的公开状态。隐藏秘密先不要说。`;
  }
  return "";
}

async function parseJson<T extends Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return await request.json<T>();
  } catch {
    throw new Error("请求内容不是有效 JSON。");
  }
}

function normalizeScriptId(value: unknown): ScriptId {
  if (typeof value === "string" && SCRIPTS[value]) return value;
  throw new Error("未知剧本。");
}

function normalizePlayerCount(script: ScriptPack, value: unknown) {
  const allowed = script.playerCounts ?? [script.playerCount];
  const requested = Number(value);
  return allowed.includes(requested) ? requested : script.playerCount;
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
          difficulty: script.difficulty,
          playerCount: script.playerCount,
          playerCounts: script.playerCounts ?? [script.playerCount],
          roles: script.roles.map((roleItem) => publicRole(script, roleItem.id))
        }))
      });
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const body = await parseJson(request);
      const nickname = String(body.nickname ?? "").trim();
      if (!nickname) return badRequest("请输入昵称。");
      const scriptId = normalizeScriptId(body.scriptId);
      const playerCount = Number(body.playerCount);
      const code = roomCode();
      const stub = getRoomStub(env, code);
      return json(await stub.create(code, scriptId, nickname, playerCount));
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
  return \`
    <section class="topbar">
      <div>
        <p class="eyebrow">4-7人无主持人</p>
        <h1>剧本杀自动房间</h1>
      </div>
      <span class="pill">Cloudflare Workers 原型</span>
    </section>
    \${state.error ? "<p class=\\"error\\">" + state.error + "</p>" : ""}
    <section class="grid two">
      <form class="panel" data-create>
        <h2>创建房间</h2>
        <label>游戏人数<select name="playerCount" data-count-filter required>\${countOptions}</select></label>
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
        <p class="sub">\${room.script.type} · \${room.script.difficulty || ""} · \${room.script.duration} · \${room.script.playerCount}人局</p>
      </div>
      <button class="ghost" data-reset>退出本机身份</button>
    </section>
    \${state.error ? "<p class=\\"error\\">" + state.error + "</p>" : ""}
    <section class="phase">
      <div>
        <p class="eyebrow">当前阶段</p>
        <h2>\${room.phase.name}</h2>
        <p>\${room.phase.instruction}</p>
        \${room.phaseAudio ? "<audio class=\\"phase-audio\\" controls autoplay src=\\"" + room.phaseAudio + "\\"></audio>" : ""}
      </div>
      <div class="actions">
        \${room.phaseIndex === 0 && me?.isOwner ? "<button data-action=\\"start\\">" + room.script.playerCount + "人到齐后开始</button>" : ""}
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
    \${room.phase.id === "clue1" ? publicClueView(room) : ""}
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
      <div class="private">\${room.reveal}</div>
    </section>
  \`;
}

function publicClueView(room) {
  const rows = room.publicClues.map((clue, index) => \`<li><span>线索 \${index + 1}</span><strong>\${clue}</strong></li>\`).join("");
  return \`
    <section class="panel wide">
      <h2>公共线索</h2>
      <ol class="players">\${rows}</ol>
    </section>
  \`;
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
.phase-audio {
  display: block;
  width: min(520px, 100%);
  margin-top: 14px;
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
