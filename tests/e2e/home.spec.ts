import { expect, test } from "@playwright/test";

test("renders the minimal PacePal foundation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "PacePal" })).toBeVisible();
});

test("reports a healthy mock foundation", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toEqual({
    aiProvider: "mock",
    app: "PacePal",
    status: "ok",
  });
});
