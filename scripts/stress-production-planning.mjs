import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const baseUrl =
  process.env.PACEPAL_BASE_URL ?? "https://pace-pal-eta.vercel.app";
const proxy = process.env.HTTPS_PROXY ?? "http://127.0.0.1:7897";
const repeat = Number(process.env.PACEPAL_STRESS_REPEAT ?? 20);
const concurrency = Number(process.env.PACEPAL_STRESS_CONCURRENCY ?? 4);
const selectedCases = new Set(
  (process.env.PACEPAL_STRESS_CASES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const outputPath =
  process.env.PACEPAL_STRESS_OUTPUT ?? "/tmp/pacepal-planning-stress.json";
const startedAt = new Date().toISOString();

function task(index, count = 10) {
  return {
    id: `T${index}`,
    title: `研究任务 ${index}`,
    description: `完成研究工作 ${index}，保留其必要产出。`,
    estimatedMinutes: 20 + index * 5,
    completionCriteria: `研究工作 ${index} 已完成。`,
    difficulty: index > count * 0.7 ? "high" : "medium",
    dependencies: index === 1 ? [] : [`T${index - 1}`],
    status: index === 1 ? "completed" : "todo",
    actualMinutes: index === 1 ? 25 : 0,
    activeSince: null,
    postponedUntil: null,
    phase: index <= count / 2 ? "研究" : "产出",
    taskPriority: index <= count / 2 ? "high" : "medium",
  };
}

function assignment(count = 10) {
  return {
    id: `stress-${count}`,
    createdAt: "2026-11-27T00:00:00.000Z",
    status: "scheduled",
    title: "AI 规划可靠性测试",
    requirements: "完成一份研究报告，所有既有任务内容都必须保留。",
    deliverable: "研究报告",
    deadline: "2026-12-20T18:00:00.000Z",
    priority: "high",
    subtasks: Array.from({ length: count }, (_, index) =>
      task(index + 1, count),
    ),
    schedule: [],
    scheduleVersion: 2,
    checkIn: { availableMinutes: 30, energy: "medium" },
    scheduleNotice: "",
    chatMessages: [],
    language: "zh",
    planVersion: 1,
    planHistory: [
      {
        version: 1,
        createdAt: "2026-11-27T00:00:00.000Z",
        source: "initial",
        summary: "可靠性测试基线",
        operationTypes: ["create_plan"],
      },
    ],
  };
}

function request(path, payload) {
  return new Promise((resolve) => {
    const child = spawn("curl", [
      "-x",
      proxy,
      "--http1.1",
      "-sS",
      "--max-time",
      "100",
      "-w",
      "\n__STATUS__:%{http_code}",
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      JSON.stringify(payload),
      `${baseUrl}${path}`,
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", () => {
      const marker = "\n__STATUS__:";
      const index = stdout.lastIndexOf(marker);
      const status =
        index < 0 ? 0 : Number(stdout.slice(index + marker.length));
      const raw = index < 0 ? stdout : stdout.slice(0, index);
      try {
        resolve({
          status,
          body: JSON.parse(raw),
          transportError: stderr || null,
        });
      } catch (error) {
        resolve({
          status,
          body: null,
          transportError:
            `${stderr} ${error instanceof Error ? error.message : error}`.trim(),
        });
      }
    });
  });
}

function planIssues(plan) {
  if (!plan || !Array.isArray(plan.subtasks)) return ["missing plan"];
  const ids = plan.subtasks.map((item) => item.id);
  const idSet = new Set(ids);
  const issues = ids.length === idSet.size ? [] : ["duplicate task ids"];
  for (const item of plan.subtasks) {
    for (const dependency of item.dependencies ?? []) {
      if (!idSet.has(dependency))
        issues.push(`missing dependency ${dependency}`);
      if (dependency === item.id) issues.push(`self dependency ${item.id}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(plan.subtasks.map((item) => [item.id, item]));
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((byId.get(id)?.dependencies ?? []).some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  if (ids.some(visit)) issues.push("dependency cycle");
  return issues;
}

const cases = [
  {
    id: "initial-plan",
    path: "/api/plan",
    payload: () => ({
      title: "课程研究报告",
      requirements:
        "两周内完成3000字报告，分析短视频推荐算法对大学生新闻获取的影响；至少引用6篇学术文献，使用APA格式，需要检索、分析、写作、复核和提交。",
      deliverable: "3000字报告",
      deadline: "2026-12-20T18:00:00.000Z",
      priority: "high",
    }),
    check: (response) =>
      response.status === 200 &&
      response.body?.needsClarification === false &&
      planIssues({ subtasks: response.body?.subtasks }).length === 0,
  },
  {
    id: "further-breakdown",
    path: "/api/refine",
    payload: () => ({
      assignment: assignment(),
      message: "把“研究任务 5”进一步拆细成几个可执行步骤。",
    }),
    check: (response) =>
      response.status === 200 &&
      response.body?.changed === true &&
      planIssues(response.body?.plan).length === 0,
  },
  {
    id: "progress-update",
    path: "/api/refine",
    payload: () => ({
      assignment: assignment(),
      message: "我已经完成了研究任务 2，请更新进度。",
    }),
    check: (response) =>
      response.status === 200 &&
      response.body?.plan?.subtasks.some(
        (item) => item.title === "研究任务 2" && item.status === "completed",
      ) &&
      planIssues(response.body?.plan).length === 0,
  },
  {
    id: "read-only-count",
    path: "/api/refine",
    payload: () => ({
      assignment: assignment(),
      message: "现在一共有多少个子任务？",
    }),
    check: (response) =>
      response.status === 200 &&
      response.body?.changed === false &&
      response.body?.appliedOperations?.length === 0 &&
      response.body?.plan?.subtasks.length === 10,
  },
  {
    id: "merge-10-to-6",
    path: "/api/refine",
    payload: () => ({
      assignment: assignment(),
      message:
        "这些任务有点太碎了，帮我合理合并成6个步骤，保留所有重要工作内容。",
    }),
    check: (response) => {
      const tasks = response.body?.plan?.subtasks ?? [];
      return (
        response.status === 200 &&
        response.body?.changed === true &&
        tasks.length === 6 &&
        tasks.some((item) => item.id === "T1" && item.status === "completed") &&
        tasks.reduce((total, item) => total + item.estimatedMinutes, 0) ===
          475 &&
        planIssues(response.body?.plan).length === 0
      );
    },
  },
];

const activeCases = cases.filter(
  (testCase) => selectedCases.size === 0 || selectedCases.has(testCase.id),
);
const jobs = activeCases.flatMap((testCase) =>
  Array.from({ length: repeat }, (_, index) => ({ testCase, run: index + 1 })),
);
const results = [];
for (let index = 0; index < jobs.length; index += concurrency) {
  const batch = jobs.slice(index, index + concurrency);
  const responses = await Promise.all(
    batch.map(({ testCase }) => request(testCase.path, testCase.payload())),
  );
  for (let offset = 0; offset < batch.length; offset += 1) {
    const { testCase, run } = batch[offset];
    const response = responses[offset];
    const responsePlan =
      testCase.path === "/api/plan"
        ? { subtasks: response.body?.subtasks }
        : response.body?.plan;
    const issues = planIssues(responsePlan);
    results.push({
      testId: testCase.id,
      run,
      prompt: testCase.payload().message ?? testCase.payload().requirements,
      passed: Boolean(testCase.check(response)),
      schemaValid: response.status === 200 && issues.length === 0,
      issues,
      response,
    });
    process.stdout.write(`${results.length}/${jobs.length}\r`);
  }
}

const successful = results.filter((result) => result.passed);
const usage = successful.reduce(
  (total, result) => {
    for (const key of Object.keys(total)) {
      total[key] += result.response.body?.usage?.[key] ?? 0;
    }
    return total;
  },
  { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
);
const noOp = results.filter((result) => result.testId === "read-only-count");
const mutations = results.filter((result) =>
  ["further-breakdown", "progress-update", "merge-10-to-6"].includes(
    result.testId,
  ),
);
const failures = results.filter((result) => !result.passed);
const validErrorCodes = new Set([
  "rate_limited",
  "timeout",
  "network_error",
  "invalid_output",
  "invalid_dependencies",
  "provider_unavailable",
]);
const failuresByCode = Object.fromEntries(
  Object.entries(
    Object.groupBy(
      failures,
      (result) =>
        result.response.body?.code ?? `http_${result.response.status}`,
    ),
  ).map(([code, entries]) => [code, entries.length]),
);
const rate = (passed, total) => (total === 0 ? null : passed / total);
const metrics = {
  interactions: results.length,
  firstAttemptSuccessRate: rate(successful.length, results.length),
  finalSuccessRate: rate(successful.length, results.length),
  schemaValidityRate: rate(
    results.filter((result) => result.schemaValid).length,
    results.length,
  ),
  mutationCorrectnessRate: rate(
    mutations.filter((result) => result.passed).length,
    mutations.length,
  ),
  dataIntegrityRate: rate(
    results.filter((result) => result.issues.length === 0).length,
    results.length,
  ),
  noOpCorrectnessRate: rate(
    noOp.filter((result) => result.passed).length,
    noOp.length,
  ),
  errorClassificationAccuracy:
    failures.length === 0
      ? 1
      : failures.filter((result) =>
          validErrorCodes.has(result.response.body?.code),
        ).length / failures.length,
  duplicateOperationRate: rate(
    results.filter((result) => result.issues.includes("duplicate task ids"))
      .length,
    results.length,
  ),
  failuresByCode,
  usage,
};
const report = {
  baseUrl,
  model: "deepseek/deepseek-v4.1-flash-1017",
  repeat,
  concurrency,
  startedAt,
  finishedAt: new Date().toISOString(),
  metrics,
  results,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${JSON.stringify(metrics, null, 2)}`);
console.log(`Report: ${outputPath}`);
