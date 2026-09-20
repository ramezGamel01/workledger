import { expect, test } from "@playwright/test";

test("loads the WorkLedger product shell and first-run workflow", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await expect(page.getByText("Build your billing foundation")).toBeVisible();
  await page.getByRole("link", { name: "Timer" }).click();
  await expect(page.getByRole("heading", { name: "Timer" })).toBeVisible();
  await expect(
    page.getByText("Create a project before tracking"),
  ).toBeVisible();
});
