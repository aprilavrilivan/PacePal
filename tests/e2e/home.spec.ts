import { expect, test } from "@playwright/test";

test("creates, approves, schedules, and persists an assignment", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "开始新的作业计划" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 助手" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "创建第一份作业" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "创建作业" }).click();
  await page.getByLabel("作业名称").fill("媒介研究课程论文");
  await page
    .getByLabel("作业要求")
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
  await expect(page.getByText("理解作业要求")).toBeVisible();
  await page.getByRole("button", { name: "确认任务计划" }).click();

  await expect(
    page.getByRole("heading", { name: "安排学习时间" }),
  ).toBeVisible();
  await page.getByLabel("每天可用时间").selectOption("60");
  await page.getByLabel("开始时间").fill("18:00");
  await page.getByRole("button", { name: "生成安排" }).click();

  await expect(
    page.getByRole("heading", { name: "媒介研究课程论文" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "此刻状态" })).toBeVisible();

  await page.getByLabel("可用时间").selectOption("30");
  await page.getByRole("button", { exact: true, name: "开始" }).click();
  await expect(page.getByText("进行中", { exact: true })).toBeVisible();
  await page.getByRole("button", { exact: true, name: "暂停" }).click();
  await expect(page.getByText("已暂停", { exact: true })).toBeVisible();
  await page.getByRole("button", { exact: true, name: "继续" }).click();
  await page.getByRole("button", { exact: true, name: "延期" }).click();
  await expect(page.getByText("任务已延至明天，后续安排已重排")).toBeVisible();

  await page.getByRole("button", { exact: true, name: "AI 助手" }).click();
  await expect(page.getByRole("heading", { name: "PacePal" })).toBeVisible();
  await page.getByRole("button", { name: "我每天只有 30 分钟" }).click();
  await expect(
    page.getByText("已把每天可用时间调整为 30 分钟，并重排后续任务。"),
  ).toBeVisible();
  await expect(
    page.getByText("30 分钟", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "安排" }).click();
  await page.getByRole("button", { exact: true, name: "锁定" }).first().click();
  await expect(page.getByText("已锁定", { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "媒介研究课程论文" }),
  ).toBeVisible();
});

test("reports a healthy mock foundation", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    aiProvider: "mock",
    app: "PacePal",
    commitSha: null,
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
