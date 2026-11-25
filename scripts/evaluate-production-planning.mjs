import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const baseUrl =
  process.env.PACEPAL_BASE_URL ?? "https://pace-pal-eta.vercel.app";
const proxy = process.env.HTTPS_PROXY ?? "http://127.0.0.1:7897";
const outputPath =
  process.env.PACEPAL_EVAL_OUTPUT ??
  "/tmp/pacepal-ai-planning-evaluation-2026-11-26.json";
const createdAt = "2026-11-26T00:00:00.000Z";
const deadline = "2026-12-10T10:00:00.000Z";

const report = {
  baseUrl,
  model: "deepseek/deepseek-v4.1-flash-1017",
  startedAt: new Date().toISOString(),
  tests: [],
};

function persist() {
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

function request(path, payload) {
  const result = spawnSync(
    "curl",
    [
      "-x",
      proxy,
      "-sS",
      "--max-time",
      "100",
      "-w",
      "\n__PACEPAL_HTTP_STATUS__:%{http_code}",
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      JSON.stringify(payload),
      `${baseUrl}${path}`,
    ],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 110_000,
    },
  );

  if (result.error) {
    return { body: null, error: result.error.message, status: 0 };
  }
  const marker = "\n__PACEPAL_HTTP_STATUS__:";
  const markerIndex = result.stdout.lastIndexOf(marker);
  const bodyText =
    markerIndex >= 0 ? result.stdout.slice(0, markerIndex) : result.stdout;
  const status =
    markerIndex >= 0
      ? Number(result.stdout.slice(markerIndex + marker.length).trim())
      : 0;
  let body = null;
  let parseError = null;
  try {
    body = JSON.parse(bodyText);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  return {
    body,
    error:
      result.status === 0 && !parseError
        ? null
        : [result.stderr.trim(), parseError].filter(Boolean).join(" | "),
    status,
  };
}

function task(
  id,
  title,
  status,
  estimatedMinutes = 90,
  dependencies = [],
  description = title,
) {
  return {
    id,
    title,
    description,
    estimatedMinutes,
    completionCriteria: `${title}已完成并留下可检查的成果。`,
    difficulty: "medium",
    dependencies,
    status,
    actualMinutes: status === "completed" ? estimatedMinutes : 0,
    activeSince: status === "in_progress" ? "2026-11-25T10:00:00.000Z" : null,
    postponedUntil: null,
    phase: "课程论文",
    taskPriority: "high",
  };
}

function assignment({
  id = "history-paper",
  title = "History Course Paper",
  requirements = "研究1970年代湖北农村农业发展、家庭收入、居住条件与住房变化之间的关系；至少6份资料。",
  deliverable = "2500字历史课程论文",
  due = deadline,
  dailyMinutes = 90,
  tasks,
  language = "zh",
}) {
  return {
    id,
    createdAt,
    status: "scheduled",
    title,
    requirements,
    deliverable,
    deadline: due,
    priority: "high",
    subtasks: tasks,
    availability: { dailyMinutes, preferredTime: "19:00" },
    schedule: [],
    unscheduledMinutes: 0,
    checkIn: { availableMinutes: 30, energy: "medium" },
    scheduleNotice: "",
    chatMessages: [],
    language,
    planVersion: 1,
    planHistory: [
      {
        version: 1,
        createdAt,
        source: "initial",
        summary: "Initial evaluation fixture",
        operationTypes: ["create_plan"],
      },
    ],
  };
}

function historyFixture() {
  return assignment({
    tasks: [
      task("T1", "Review assignment requirements", "completed", 30),
      task("T2", "Define research scope", "completed", 45, ["T1"]),
      task("T3", "Collect relevant historical sources", "completed", 180, [
        "T2",
      ]),
      task(
        "T4",
        "Read and summarize collected sources",
        "in_progress",
        240,
        ["T3"],
        "阅读并总结已收集的6份资料，记录与农业发展、家庭收入和住房变化有关的证据。",
      ),
      task(
        "T5",
        "Develop the central argument",
        "todo",
        90,
        ["T4"],
        "形成包含农业发展、家庭收入与农村住房变化机制的中心论点。",
      ),
      task(
        "T6",
        "Create a detailed outline",
        "todo",
        75,
        ["T5"],
        "围绕农业发展、家庭收入与住房变化建立详细论文大纲。",
      ),
      task("T7", "Draft the paper", "todo", 300, ["T6"]),
      task("T8", "Revise and finalize the paper", "todo", 120, ["T7"]),
    ],
  });
}

function fromInitial(input, response, id) {
  return assignment({
    id,
    title: input.title,
    requirements: input.requirements,
    deliverable: input.deliverable,
    due: input.deadline,
    tasks: response.subtasks,
    language: response.language,
  });
}

function mergePlan(source, response) {
  if (!response?.plan) return structuredClone(source);
  return {
    ...structuredClone(source),
    ...structuredClone(response.plan),
    status: source.status,
    schedule: source.schedule,
    unscheduledMinutes: source.unscheduledMinutes,
    checkIn: source.checkIn,
    scheduleNotice: source.scheduleNotice,
    chatMessages: source.chatMessages,
  };
}

function addConversation(source, message, assistantMessage) {
  const result = structuredClone(source);
  const sequence = result.chatMessages.length;
  result.chatMessages.push(
    {
      id: `user-${sequence + 1}`,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    },
    {
      id: `assistant-${sequence + 2}`,
      role: "assistant",
      content: assistantMessage,
      createdAt: new Date().toISOString(),
    },
  );
  return result;
}

function compactPlan(value) {
  if (!value) return null;
  return {
    title: value.title,
    requirements: value.requirements,
    deadline: value.deadline,
    availability: value.availability,
    planVersion: value.planVersion,
    tasks: value.subtasks.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      estimatedMinutes: item.estimatedMinutes,
      dependencies: item.dependencies,
      status: item.status,
      phase: item.phase,
    })),
  };
}

function record(entry) {
  report.tests.push(entry);
  persist();
  const response = entry.turns.at(-1)?.response;
  const message = response?.body?.assistantMessage ?? response?.body?.error;
  console.log(
    `[${entry.id}/15] ${entry.name}: HTTP ${response?.status ?? 0}; ${String(
      message ?? response?.error ?? "no response",
    )
      .slice(0, 180)
      .replaceAll("\n", " ")}`,
  );
}

function planTest(id, name, input, expected) {
  console.log(`[${id}/15] running ${name}`);
  const response = request("/api/plan", input);
  record({
    id,
    name,
    input,
    expected,
    turns: [
      { before: null, message: JSON.stringify(input), response, after: null },
    ],
  });
  return response;
}

function refineTurn(source, message) {
  const before = compactPlan(source);
  const response = request("/api/refine", { assignment: source, message });
  const merged =
    response.status === 200 ? mergePlan(source, response.body) : source;
  const next = addConversation(
    merged,
    message,
    response.body?.assistantMessage ?? response.body?.error ?? "Request failed",
  );
  return {
    next,
    turn: {
      before,
      message,
      response,
      after: compactPlan(merged),
    },
  };
}

function refineTest(id, name, source, messages, expected) {
  console.log(`[${id}/15] running ${name}`);
  const turns = [];
  let current = source;
  for (const message of messages) {
    const result = refineTurn(current, message);
    turns.push(result.turn);
    current = result.next;
  }
  record({ id, name, input: messages, expected, turns });
  return current;
}

const complexPaperInput = {
  title: "历史课程论文",
  requirements:
    "我需要在14天后提交一篇2500字的历史课程论文，主题是1970年代湖北农村农田水利建设与农户住房变化之间的关系。老师要求至少引用6份可靠资料，其中至少2份是一手史料，并使用Chicago脚注格式。我目前还没有开始做这篇论文。工作日每天最多可以花1.5小时，周末每天可以花3小时。请帮我制定一个合理的计划，把整个任务拆解成具体的步骤。",
  deliverable: "2500字历史课程论文",
  deadline,
  priority: "high",
};

planTest(
  1,
  "Complex Academic Assignment",
  complexPaperInput,
  "完整覆盖理解要求、资料收集、论证、写作、Chicago脚注、修订与提交；尊重14天时间和6份/2份一手史料约束。",
);

planTest(
  2,
  "Insufficient Task Information",
  {
    title: "课程项目",
    requirements:
      "我下周之前必须完成一个课程项目，但是我还没想好怎么做。你帮我制定一个计划吧。项目形式、主题和交付要求目前都未知。",
    deliverable: "尚未确定形式的课程项目",
    deadline: "2026-12-03T10:00:00.000Z",
    priority: "high",
  },
  "识别信息不足，只问一个聚焦澄清问题，不虚构详细任务。",
);

refineTest(
  3,
  "Natural Progress Update",
  historyFixture(),
  ["我已经找到了6份相关资料，其中4份已经读完并且做了笔记，另外2份还没有读。"],
  "T3保持完成；T4保持进行中并记录4/6；T5、T6不变；无重复任务。",
);

refineTest(
  4,
  "Change of Research Scope",
  historyFixture(),
  [
    "我重新考虑了一下，我想把论文范围缩小一些，重点讨论农田水利建设对农村住房选址和住宅结构的影响，不再讨论家庭收入变化。",
  ],
  "更新研究目标和相关未完成任务，删除家庭收入方向，保留已完成及无关任务与历史。",
);

refineTest(
  5,
  "Further Decomposition of a Difficult Subtask",
  historyFixture(),
  [
    "我觉得文献检索这一步还是太大了，我不知道具体应该从哪里开始。你能不能把它拆得更细一点？",
  ],
  "把文献检索拆成关键词、数据库/档案、筛选、一二手分类和书目信息整理等有意义步骤，不影响其他任务。",
);

refineTest(
  6,
  "Ambiguous Progress Update",
  historyFixture(),
  ["我这周已经做了一些文献方面的工作，可以帮我更新一下计划吗？"],
  "不改变计划；询问具体完成了检索、阅读、笔记还是论点整理。",
);

refineTest(
  7,
  "Contradictory Information",
  historyFixture(),
  ["我的文献综述已经完成了，但是我其实还没有读过收集到的那些资料。"],
  "识别矛盾、请求澄清、不错误更新状态。",
);

const constrainedTime = assignment({
  id: "time-conflict",
  due: "2026-12-04T10:00:00.000Z",
  dailyMinutes: 120,
  tasks: [
    task("T1", "完成必要资料检索", "todo", 240),
    task("T2", "整理证据与论点", "todo", 180, ["T1"]),
    task("T3", "完成详细提纲", "todo", 120, ["T2"]),
    task("T4", "完成论文初稿", "todo", 240, ["T3"]),
    task("T5", "复核格式并提交", "todo", 60, ["T4"]),
  ],
});
refineTest(
  8,
  "Major Change in Available Time",
  constrainedTime,
  [
    "我接下来三天都有考试，完全没有时间做这篇论文。之后五天每天最多能花两个小时。你帮我重新安排一下剩下的任务吧。",
  ],
  "明确剩余14小时大于可用10小时、指出约4小时缺口和截止风险，提供缩小范围/增加时间/延期等选择，不虚假排满。",
);

const prerequisitePlan = assignment({
  id: "prerequisite-plan",
  tasks: [
    task("T1", "Collect historical sources", "completed", 120),
    task("T2", "Read and organize sources", "todo", 180, ["T1"]),
    task("T3", "Develop the central argument", "todo", 90, ["T2"]),
    task("T4", "Create the paper outline", "todo", 90, ["T3"]),
    task("T5", "Draft the paper", "todo", 300, ["T2", "T3", "T4"]),
  ],
});
refineTest(
  9,
  "Removing an Important Prerequisite",
  prerequisitePlan,
  ["把整理文献并提炼证据这一步删掉吧，我想直接开始写正文。"],
  "解释删除前置任务的风险，询问证据是否已整理并建议轻量替代；确认前不得删除或破坏依赖。",
);

const idempotentPlan = assignment({
  id: "idempotency-plan",
  tasks: [task("T1", "Collect academic references", "in_progress", 120)],
});
refineTest(
  10,
  "Repeated Progress Update (Idempotency)",
  idempotentPlan,
  ["我已经完成了学术资料的收集。", "对了，资料已经全部找齐了。"],
  "第一次将T1标记完成；第二次保持完成，不产生重复任务、记录或无效操作。",
);

const rebuildPlan = assignment({
  id: "rebuild-plan",
  tasks: [
    task("T1", "Review assignment requirements", "completed", 30),
    task("T2", "Collect sources", "completed", 180, ["T1"]),
    task("T3", "Create research outline", "completed", 90, ["T2"]),
    task("T4", "Read and synthesize evidence", "todo", 180, ["T2"]),
    task("T5", "Draft paper", "todo", 300, ["T3", "T4"]),
    task("T6", "Revise and submit", "todo", 120, ["T5"]),
  ],
});
refineTest(
  11,
  "Explicit Request to Rebuild the Plan",
  rebuildPlan,
  [
    "我觉得之前的整体规划不太合理。我想完全换一种方式重新安排后续工作，但是已经完成的资料收集和论文大纲需要保留。",
  ],
  "识别主动重建请求，保留已完成任务和历史，只重做未完成工作及其依赖。",
);

const mixedLanguagePlan = assignment({
  id: "mixed-language-plan",
  tasks: [
    task("T1", "Collect research sources", "completed", 180),
    task("T2", "Complete outline", "completed", 90, ["T1"]),
    task("T3", "Organize evidence", "todo", 120, ["T1"]),
    task("T4", "Draft paper", "todo", 300, ["T2", "T3"]),
  ],
});
refineTest(
  12,
  "Chinese-English Mixed Conversation",
  mixedLanguagePlan,
  [
    "我已经完成了outline，但是我觉得现在的research scope还是太 broad 了。我想focus more on the relationship between agricultural development and rural housing structure.",
  ],
  "理解中英混合语义；用中文响应；保留已完成大纲；调整未完成任务以聚焦农业发展与住房结构。",
);

console.log("[13/15] running Switching Conversation Language");
const presentationInput = {
  title: "Reinforcement Learning Presentation",
  requirements:
    "I need to prepare a presentation about reinforcement learning. It is due in 7 days, and I haven't started yet. Can you help me break it down?",
  deliverable: "Presentation about reinforcement learning",
  deadline: "2026-12-03T10:00:00.000Z",
  priority: "high",
};
const presentationInitial = request("/api/plan", presentationInput);
const presentationTurns = [
  {
    before: null,
    message: presentationInput.requirements,
    response: presentationInitial,
    after: null,
  },
];
if (presentationInitial.status === 200) {
  let current = fromInitial(
    presentationInput,
    presentationInitial.body,
    "rl-presentation",
  );
  current = addConversation(
    current,
    presentationInput.requirements,
    presentationInitial.body.assistantMessage,
  );
  for (const message of [
    "我觉得这个presentation的准备工作太多了，可以先帮我找出最重要的三个步骤吗？",
    "Great. Let's keep discussing in English from now on.",
  ]) {
    const result = refineTurn(current, message);
    presentationTurns.push(result.turn);
    current = result.next;
  }
}
record({
  id: 13,
  name: "Switching Conversation Language",
  input: [
    presentationInput.requirements,
    "我觉得这个presentation的准备工作太多了，可以先帮我找出最重要的三个步骤吗？",
    "Great. Let's keep discussing in English from now on.",
  ],
  expected:
    "第一轮全英文计划；第二轮中文列出最重要三步且不新建作业；第三轮切回英文并保持同一上下文。",
  turns: presentationTurns,
});

const rlDiscussionPlan = assignment({
  id: "rl-discussion",
  title: "Reinforcement Learning Presentation",
  requirements: "Prepare a presentation about reinforcement learning.",
  deliverable: "Presentation",
  language: "zh",
  tasks: [
    task("T1", "Research reinforcement learning", "in_progress", 120),
    task("T2", "Create presentation outline", "todo", 60, ["T1"]),
    task("T3", "Build slides", "todo", 180, ["T2"]),
  ],
});
refineTest(
  14,
  "Unrelated Conversation",
  rlDiscussionPlan,
  ["顺便问一下，强化学习和监督学习有什么区别？"],
  "自然解释二者区别；不改变任何计划字段、状态或任务。",
);

refineTest(
  15,
  "User Feels Overwhelmed",
  historyFixture(),
  [
    "我知道自己应该开始写论文了，但是一想到还有这么多事情没做，就觉得特别焦虑，完全不想开始。",
  ],
  "共情、不责备、不增加长清单；只建议一个约10分钟的小行动，并保持计划不变。",
);

report.finishedAt = new Date().toISOString();
persist();
console.log(`Evaluation saved to ${outputPath}`);
