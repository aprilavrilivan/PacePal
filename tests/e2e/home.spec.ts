import { expect, test } from "@playwright/test";

test("creates, approves, schedules, and persists an assignment", async ({
  page,
}) => {
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
    page.getByRole("heading", { name: "创建第一个任务" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "创建任务" }).click();
  await page.getByLabel("任务名称").fill("媒介研究课程论文");
  await page
    .getByLabel("任务要求")
    .fill("分析一个媒介现象，使用至少五个学术来源。");
  await page.getByLabel("成果形式").fill("2500 字课程论文");

  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 10);
  deadline.setHours(18, 0, 0, 0);
  const localDeadline = `${deadline.getFullYear()}-${String(
    deadline.getMonth() + 1,
  ).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T18:00`;

  await page.getByLabel("截止时间").fill(localDeadline);
  await page.getByRole("button", { name: "保存并生成任务" }).click();

  await expect(
    page.getByRole("heading", { name: "确认任务计划" }),
  ).toBeVisible();
  await expect(page.getByText("理解任务要求")).toBeVisible();
  await page.getByRole("button", { name: "确认任务计划" }).click();

  await expect(page.getByRole("heading", { name: "今日重点" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "此刻可用时间 / 精力状态" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "待完成任务" })).toBeVisible();
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

  await page.getByLabel("可用时间").selectOption("30");
  await page.getByRole("button", { name: "手动选择" }).click();
  await page.getByLabel("选择子任务").selectOption({ index: 2 });
  await page.getByRole("button", { exact: true, name: "开始" }).click();
  await expect(page.getByText("已进行", { exact: true })).toBeVisible();
  await expect(page.getByText("进行中", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { exact: true, name: "暂停" }).click();
  await expect(page.getByText("已暂停", { exact: true })).toBeVisible();
  await page.getByRole("button", { exact: true, name: "继续" }).click();
  await page.getByRole("button", { exact: true, name: "延期" }).click();
  await expect(page.getByText("任务已延至明天，后续安排已重排")).toHaveCount(0);

  await page.getByRole("button", { exact: true, name: "任务" }).click();
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

  await page.getByRole("button", { name: "安排" }).click();
  await page.getByRole("button", { exact: true, name: "锁定" }).first().click();
  await expect(page.getByText("已锁定", { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "今日重点" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "待完成任务" })).toBeVisible();
});

test("keeps multiple assignments and lets the user switch between them", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  async function createAssignment(title: string, daysFromNow: number) {
    await page
      .getByRole("button", { name: /创建任务|新建任务/ })
      .first()
      .click();
    await page.getByLabel("任务名称").fill(title);
    await page.getByLabel("任务要求").fill("完成资料整理、初稿和复核。 ");
    await page.getByLabel("成果形式").fill("课程报告");
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + daysFromNow);
    const value = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T18:00`;
    await page.getByLabel("截止时间").fill(value);
    await page.getByRole("button", { name: "保存并生成任务" }).click();
    await page.getByRole("button", { name: "确认任务计划" }).click();
  }

  await createAssignment("课程论文", 10);
  await createAssignment("项目汇报", 5);

  await expect(page.getByRole("heading", { name: "待完成任务" })).toBeVisible();
  await page.getByRole("button", { exact: true, name: "任务" }).click();
  await expect(page.getByRole("button", { name: /课程论文/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /项目汇报/ })).toBeVisible();
  await page.getByRole("button", { name: /课程论文/ }).click();
  await expect(page.getByText("课程论文").first()).toBeVisible();
});

test("reports a healthy mock foundation", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    aiProvider: "mock",
    app: "PacePal",
    commitSha: null,
    directGeminiConfigured: false,
    status: "ok",
  });
});

test("shows the local storage account state when cloud is not configured", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "本机保存" }).click();

  await expect(page.getByRole("heading", { name: "本机保存" })).toBeVisible();
});
