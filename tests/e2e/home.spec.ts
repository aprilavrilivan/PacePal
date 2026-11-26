import { expect, type Page, test } from "@playwright/test";

function fixtureTasks() {
  const titles = [
    "理解任务要求",
    "确定完成思路",
    "收集并筛选必要资料",
    "整理要点与证据",
    "完成详细大纲",
    "完成成果初稿",
    "修订内容与格式",
    "提交前最终检查",
  ];
  return titles.map((title, index) => ({
    id: `fixture-task-${index + 1}`,
    title,
    description: `完成“${title}”。`,
    estimatedMinutes: 30 + index * 10,
    completionCriteria: `“${title}”已完成。`,
    difficulty: index < 2 ? "low" : index < 6 ? "medium" : "high",
    dependencies: index === 0 ? [] : [`fixture-task-${index}`],
    status: "todo",
    actualMinutes: 0,
    activeSince: null,
    postponedUntil: null,
    phase: index < 2 ? "理解与定向" : index < 5 ? "资料与结构" : "产出与提交",
    taskPriority: index < 6 ? "high" : "medium",
  }));
}

async function mockPlanningApi(page: Page) {
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        model: "deepseek/deepseek-v4.1-flash-1017",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
        },
        needsClarification: false,
        language: "zh",
        assistantMessage: "我已理解任务要求，并按依赖关系生成计划。",
        assumptions: [],
        planVersion: 1,
        planHistory: [
          {
            version: 1,
            createdAt: "2026-11-26T00:00:00.000Z",
            source: "initial",
            summary: "生成初始计划",
            operationTypes: ["create_plan"],
          },
        ],
        subtasks: fixtureTasks(),
      }),
      status: 200,
    });
  });

  await page.route("**/api/refine", async (route) => {
    const request = route.request().postDataJSON() as {
      assignment: {
        title: string;
        requirements: string;
        deliverable: string;
        deadline: string;
        priority: "low" | "medium" | "high";
        availability: { dailyMinutes: number; preferredTime: string };
        subtasks: ReturnType<typeof fixtureTasks>;
        language?: "zh" | "en";
        planVersion?: number;
        planHistory?: Array<{
          version: number;
          createdAt: string;
          source: "initial" | "assistant";
          summary: string;
          operationTypes: string[];
        }>;
      };
    };
    const assignment = request.assignment;
    const target = assignment.subtasks.find(
      (task) => task.title === "理解任务要求",
    );
    const nextVersion = (assignment.planVersion ?? 1) + 1;
    const operations = target
      ? [
          {
            type: "set_status" as const,
            taskId: target.id,
            status: "completed" as const,
          },
          { type: "reschedule" as const },
        ]
      : [];

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        model: "deepseek/deepseek-v4.1-flash-1017",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
        },
        assistantMessage:
          "我理解为“理解任务要求”已经完成。我已将“理解任务要求”标记为完成，并重新计算后续安排。",
        changed: operations.length > 0,
        confirmationRequired: false,
        appliedOperations: operations,
        plan: {
          title: assignment.title,
          requirements: assignment.requirements,
          deliverable: assignment.deliverable,
          deadline: assignment.deadline,
          priority: assignment.priority,
          availability: assignment.availability,
          subtasks: assignment.subtasks.map((task) =>
            task.id === target?.id ? { ...task, status: "completed" } : task,
          ),
          language: assignment.language ?? "zh",
          planVersion: nextVersion,
          planHistory: [
            ...(assignment.planHistory ?? []),
            {
              version: nextVersion,
              createdAt: "2026-11-26T00:01:00.000Z",
              source: "assistant",
              summary: "更新任务进度",
              operationTypes: operations.map((operation) => operation.type),
            },
          ],
        },
      }),
      status: 200,
    });
  });
}

test("creates a project shell, generates its first breakdown in chat, and persists it", async ({
  page,
}) => {
  await mockPlanningApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "开始新的任务计划" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { exact: true, name: "任务" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "创建第一个项目" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page.getByLabel("项目名称")).toBeVisible();
  await expect(page.getByLabel("任务要求")).toHaveCount(0);
  await expect(page.getByLabel("成果形式")).toHaveCount(0);
  await expect(page.getByLabel("优先级")).toHaveCount(0);
  await page.getByLabel("项目名称").fill("尚未保存的项目");
  await page.getByRole("button", { name: "返回任务页" }).click();
  await expect(
    page.getByRole("heading", { name: "开始新的任务计划" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByLabel("项目名称").fill("媒介研究课程论文");

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 10);
  deadline.setHours(18, 0, 0, 0);
  const localDeadline = `${deadline.getFullYear()}-${String(
    deadline.getMonth() + 1,
  ).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T18:00`;

  await page.getByLabel("截止时间").fill(localDeadline);
  await page.getByRole("button", { name: "创建项目" }).click();

  await expect(
    page.getByRole("heading", { exact: true, name: "任务" }),
  ).toBeVisible();
  await expect(page.getByText("还没有任务拆解")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "任务拆解将在对话后生成" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "确认任务计划" })).toHaveCount(
    0,
  );
  const priority = page.getByLabel("媒介研究课程论文优先级");
  await expect(priority).toHaveValue("medium");
  await priority.selectOption("high");
  await expect(priority).toHaveValue("high");
  await priority.selectOption("medium");

  await page
    .getByLabel("给 AI 助手的消息")
    .fill("完成一篇 2500 字课程论文，分析一个媒介现象并使用至少五个学术来源。");
  await page.getByRole("button", { name: "发送" }).click();
  const initialAssistantPanel = page.getByRole("complementary", {
    name: "AI 对话调整",
  });
  await expect(
    initialAssistantPanel.getByText("我已理解任务要求，并按依赖关系生成计划。"),
  ).toBeVisible();
  await expect(page.getByText("还没有任务拆解")).toHaveCount(0);
  await expect(page.getByText("理解任务要求", { exact: true })).toBeVisible();

  await page.getByRole("button", { exact: true, name: "概览" }).click();

  await expect(page.getByRole("heading", { name: "当前推荐" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "此刻可用时间 / 精力状态" }),
  ).toHaveCount(0);
  await expect(page.getByText("接下来最值得推进", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("当前可推进", { exact: true })).toHaveCount(0);
  await expect(page.getByText("匹配当前精力", { exact: true })).toHaveCount(0);
  await expect(page.getByText("适合可用时间", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("在下方调整可用时间，再开始本轮专注。", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel("计划用时")).toBeVisible();
  await expect(page.getByLabel("精力")).toBeVisible();
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    "倒计时 0小时30分0秒",
  );
  await expect(
    page.getByRole("button", { exact: true, name: "延期" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { exact: true, name: "卡住了" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "待完成任务" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "展开今日计划" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日计划" })).toHaveCount(0);
  const todayPlanTrigger = page.getByRole("button", {
    name: "展开今日计划",
  });
  const beforeDrag = await todayPlanTrigger.boundingBox();
  if (!beforeDrag) throw new Error("今日计划悬浮窗不可见");
  await page.mouse.move(
    beforeDrag.x + beforeDrag.width / 2,
    beforeDrag.y + beforeDrag.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(beforeDrag.x - 70, beforeDrag.y - 50, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await todayPlanTrigger.boundingBox();
  if (!afterDrag) throw new Error("拖动后的今日计划悬浮窗不可见");
  expect(afterDrag.x).toBeLessThan(beforeDrag.x - 30);
  expect(afterDrag.y).toBeLessThan(beforeDrag.y - 20);
  await expect(page.getByRole("heading", { name: "今日计划" })).toHaveCount(0);
  await page.waitForTimeout(180);
  await todayPlanTrigger.click();
  await expect(page.getByRole("heading", { name: "今日计划" })).toBeVisible();
  await expect(page.getByText("09:00", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "手动调整今日计划" }).click();
  await page.getByLabel("开始时间").fill("10:15");
  await page
    .getByLabel(/今日计划分钟/)
    .first()
    .fill("25");
  await page.getByRole("button", { name: "保存今日计划" }).click();
  await expect(page.getByText("10:15", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "今日任务进度" }),
  ).toBeVisible();
  await page.getByRole("heading", { name: "当前推荐" }).click();
  await expect(
    page.getByRole("button", { name: "展开今日计划" }),
  ).toBeVisible();

  await page.getByLabel("计划用时").selectOption("30");
  await page.getByRole("button", { name: "手动选择" }).click();
  await page.getByLabel("选择子任务").selectOption({ index: 2 });
  await page.getByRole("button", { exact: true, name: "开始" }).click();
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    /倒计时 0小时29分5[89]秒/,
    { timeout: 3_000 },
  );
  const focusMode = page.getByTestId("focus-mode");
  await expect(focusMode).toBeVisible();
  await expect(focusMode.getByRole("button")).toHaveCount(1);
  await expect(
    focusMode.getByRole("button", { exact: true, name: "暂停" }),
  ).toBeVisible();
  await expect(page.getByLabel("计划用时")).toHaveCount(0);
  await expect(
    page.getByRole("button", { exact: true, name: "完成" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "手动选择" })).toHaveCount(0);
  await page.getByRole("button", { exact: true, name: "暂停" }).click();
  await expect(focusMode).toHaveCount(0);
  await expect(
    page.getByRole("button", { exact: true, name: "继续" }),
  ).toBeVisible();
  await expect(page.getByLabel("计划用时")).toBeEnabled();
  await page.getByRole("button", { exact: true, name: "继续" }).click();
  await expect(page.getByLabel("计划用时")).toHaveCount(0);
  await page.getByRole("button", { exact: true, name: "暂停" }).click();

  await page.getByRole("button", { exact: true, name: "任务" }).click();
  await expect(
    page.getByRole("progressbar", { name: "媒介研究课程论文完成进度" }),
  ).toBeVisible();
  await expect(page.getByLabel("媒介研究课程论文优先级")).toHaveValue("medium");
  const assistantPanel = page.getByRole("complementary", {
    name: "AI 对话调整",
  });
  await expect(assistantPanel).toBeVisible();
  await page.getByRole("button", { name: "AI任务调整" }).click();
  await expect(assistantPanel).toBeHidden();
  await page.getByRole("button", { name: "AI任务调整" }).click();
  await expect(assistantPanel).toBeVisible();

  await page.getByRole("button", { name: "手动任务调整" }).click();
  await expect(assistantPanel).toBeHidden();
  await page.getByLabel("任务名称 2").fill("资料检索与核实");
  await page.getByLabel("任务名称 2").press("Tab");
  const manualRows = page.locator('[data-testid^="manual-subtask-"]');
  await manualRows.nth(2).scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "拖动 理解任务要求" })
    .dragTo(manualRows.nth(2));
  await expect(page.getByLabel("任务名称 3")).toHaveValue("理解任务要求");
  await page.getByRole("button", { name: "添加子任务" }).click();
  await expect(page.getByLabel("任务名称 9")).toHaveValue("新子任务");

  await page.getByRole("button", { name: "AI任务调整" }).click();
  await expect(assistantPanel).toBeVisible();
  await expect(page.getByText("资料检索与核实")).toBeVisible();
  await expect(page.getByRole("heading", { name: "PacePal" })).toBeVisible();
  await page.getByLabel("给 AI 助手的消息").fill("我已经完成了理解任务要求");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(
    page.getByText(/我理解为.*“理解任务要求”.*已经完成/),
  ).toBeVisible();
  await expect(
    page.getByText(/我已将.*“理解任务要求”.*标记为完成.*重新计算后续安排/),
  ).toBeVisible();

  const retryPrompt = "请把下一步缩短为 20 分钟";
  let retryRequestCount = 0;
  await page.route("**/api/refine", async (route) => {
    const request = route.request().postDataJSON() as {
      assignment: { chatMessages: Array<{ content: string }> };
      message: string;
    };
    if (request.message !== retryPrompt) {
      await route.fallback();
      return;
    }

    retryRequestCount += 1;
    expect(
      request.assignment.chatMessages.some(
        (message) => message.content === retryPrompt,
      ),
    ).toBe(false);
    if (retryRequestCount === 1) {
      await route.fulfill({
        body: JSON.stringify({
          code: "model_unavailable",
          error: "当前 AI 模型不可用，请稍后重试。",
          reason: "unavailable",
        }),
        contentType: "application/json",
        status: 503,
      });
      return;
    }
    await route.fallback();
  });

  await page.getByLabel("给 AI 助手的消息").fill(retryPrompt);
  await page.getByRole("button", { name: "发送" }).click();
  await expect(
    page.getByText("当前 AI 模型不可用，请稍后重试。 你的计划没有变化。"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
  await expect(page.getByText(retryPrompt, { exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: "重试" }).click();
  await expect.poll(() => retryRequestCount, { timeout: 3_000 }).toBe(2);
  await expect(page.getByRole("button", { name: "重试" })).toHaveCount(0);
  await expect(
    page.getByText("当前 AI 模型不可用，请稍后重试。 你的计划没有变化。"),
  ).toHaveCount(0);
  await expect(page.getByText(retryPrompt, { exact: true })).toHaveCount(1);
  await expect(page.getByText("正在分析进度与依赖…")).toHaveCount(0);

  await page.getByRole("button", { name: "日历" }).click();
  await expect(page.getByRole("heading", { name: "日历" })).toBeVisible();
  await expect(page.getByRole("button", { name: "上个月" })).toBeVisible();
  await expect(page.getByRole("button", { name: "下个月" })).toBeVisible();
  await expect(page.getByText("资料检索与核实").first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "当前推荐" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "展开今日计划" }),
  ).toBeVisible();
});

test("keeps multiple assignments and lets the user switch between them", async ({
  page,
}) => {
  await mockPlanningApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  async function createAssignment(title: string, daysFromNow: number) {
    await page
      .getByRole("button", { name: /创建项目|新建项目/ })
      .first()
      .click();
    await page.getByLabel("项目名称").fill(title);
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + daysFromNow);
    const value = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T18:00`;
    await page.getByLabel("截止时间").fill(value);
    await page.getByRole("button", { name: "创建项目" }).click();
  }

  await createAssignment("课程论文", 10);
  await createAssignment("项目汇报", 5);

  await expect(
    page.getByRole("heading", { exact: true, name: "任务" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /课程论文/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /项目汇报/ })).toBeVisible();
  await page.getByRole("button", { name: /课程论文/ }).click();
  await expect(page.getByText("课程论文").first()).toBeVisible();

  await expect(page.getByText("还没有任务拆解")).toBeVisible();
});

test("reports the configured production model", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    app: "PacePal",
    commitSha: null,
    planningModel: "deepseek/deepseek-v4.1-flash-1017",
    provider: "vercel-ai-gateway",
    status: "ok",
  });
});

test("shows model unavailable without creating a fallback plan", async ({
  page,
}) => {
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        code: "model_unavailable",
        error: "当前 AI 模型不可用，请稍后重试。",
      }),
      contentType: "application/json",
      status: 503,
    });
  });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByLabel("项目名称").fill("课程论文");
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  await page
    .getByLabel("截止时间")
    .fill(
      `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T18:00`,
    );
  await page.getByRole("button", { name: "创建项目" }).click();
  await page
    .getByLabel("给 AI 助手的消息")
    .fill("完成一篇课程报告，需要资料整理、初稿和复核。");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(
    page.getByText("当前 AI 模型不可用，请稍后重试。 你的计划没有变化。"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
  await expect(page.getByText("还没有任务拆解")).toBeVisible();
});

test("asks one clarification without creating a fabricated plan", async ({
  page,
}) => {
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        model: "deepseek/deepseek-v4.1-flash-1017",
        usage: {
          inputTokens: 100,
          outputTokens: 40,
          reasoningTokens: 10,
          cacheReadTokens: 0,
          totalTokens: 140,
        },
        needsClarification: true,
        language: "zh",
        assistantMessage:
          "这个课程项目最终需要提交什么成果，例如论文、展示还是软件？",
        assumptions: [],
        planVersion: 1,
        planHistory: [],
        subtasks: [],
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByLabel("项目名称").fill("课程项目");
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 7);
  await page
    .getByLabel("截止时间")
    .fill(
      `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T18:00`,
    );
  await page.getByRole("button", { name: "创建项目" }).click();
  await page
    .getByLabel("给 AI 助手的消息")
    .fill("下周前要完成，但目前还不知道具体成果形式。");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(
    page.getByText(
      "这个课程项目最终需要提交什么成果，例如论文、展示还是软件？",
    ),
  ).toBeVisible();
  await expect(page.getByText("还没有任务拆解")).toBeVisible();
  await expect(page.getByRole("heading", { name: "理解任务要求" })).toHaveCount(
    0,
  );
});

test("shows the local storage account state when cloud is not configured", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "本机保存" }).click();

  await expect(page.getByRole("heading", { name: "本机保存" })).toBeVisible();
});
