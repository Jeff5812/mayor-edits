import { expect, test } from "@playwright/test";

// The owner's whole journey against the real Supabase project and the real R2 bucket. It writes real data,
// so it only runs when pointed at a test administrator and a real H.264 MP4, and it deletes what it makes:
//
//   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD  a temporary administrator
//   E2E_VIDEO_PATH                       an H.264 MP4, over 8 MB so it needs more than one part
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;
const videoPath = process.env.E2E_VIDEO_PATH;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

test.skip(!email || !password || !videoPath, "Needs E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD and E2E_VIDEO_PATH");
test.describe.configure({ mode: "serial" });

const title = `Live test ${Date.now()}`;
let projectId = "";

test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email as string);
  await page.getByLabel("Password").fill(password as string);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("a signed-out visitor cannot reach the admin area", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin/projects/new");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("anonymous visitors cannot change anything in the database or storage", async ({ request }) => {
  const headers = { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, "content-type": "application/json" };
  const insert = await request.post(`${supabaseUrl}/rest/v1/projects`, { headers, data: { title: "hack", category: "hack" } });
  expect(insert.status()).toBeGreaterThanOrEqual(400);
  const poster = await request.post(`${supabaseUrl}/storage/v1/object/posters/hack/hack.jpg`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, "content-type": "image/jpeg" },
    data: Buffer.from("not an image"),
  });
  expect(poster.status()).toBeGreaterThanOrEqual(400);
  const drafts = await request.get(`${supabaseUrl}/rest/v1/projects?status=eq.draft&select=id`, { headers });
  expect(await drafts.json()).toEqual([]);
});

test("the owner uploads a video with visible progress, and it stays private as a draft", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Add a project" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").fill("Documentary");
  await page.getByLabel("Language (optional)").fill("English");
  await page.getByTestId("new-video-input").setInputFiles(videoPath as string);
  await page.getByRole("button", { name: "Create draft and upload" }).click();

  await page.waitForURL(/\/admin\/projects\/[0-9a-f-]{36}$/);
  projectId = page.url().split("/").pop() as string;
  await expect(page.getByTestId("upload-progress")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("upload-success")).toBeVisible({ timeout: 8 * 60 * 1000 });

  // A frame from the video became the poster, and the owner can watch the draft.
  await expect(page.getByAltText("Current poster")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Watch this video" }).click();
  await expect(page.locator("video[src]")).toBeVisible();

  // A draft is not on the public page and has no public video link.
  const visitor = await page.context().browser()!.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  await expect(visitorPage.getByText(title)).toHaveCount(0);
  expect((await visitor.request.get(`/api/playback/${projectId}`)).status()).toBe(404);
  await visitor.close();
});

test("a published video appears at once and really plays, including after a seek", async ({ page }) => {
  await signIn(page);
  await page.goto(`/admin/projects/${projectId}`);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("publish-panel")).toContainText("Published");

  const visitor = await page.context().browser()!.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  const card = visitorPage.getByTestId("public-project").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Documentary · English");
  // The public page never carries the video's storage key.
  expect(await visitorPage.content()).not.toContain(projectId + "/");

  await card.getByTestId("card-play").click();
  const video = visitorPage.getByTestId("video-element");
  await expect(visitorPage.getByTestId("player-controls")).toBeAttached({ timeout: 60_000 });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 60_000 }).toBeGreaterThan(0).catch(async () => {
    // Chrome can refuse to start with sound in an automated browser, so the visible button starts it.
    await visitorPage.getByTestId("player-start").click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 60_000 }).toBeGreaterThan(0);
  });

  const duration = await video.evaluate((v: HTMLVideoElement) => v.duration);
  expect(duration).toBeGreaterThan(1);
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = v.duration * 0.75;
  });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 60_000 }).toBeGreaterThan(duration * 0.75);
  await expect(visitorPage.getByTestId("player-error")).toHaveCount(0);
  await visitor.close();
});

test("details can be edited, and the change reaches the public page", async ({ page }) => {
  await signIn(page);
  await page.goto(`/admin/projects/${projectId}`);
  await page.getByLabel("Language (optional)").fill("French");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  const visitor = await page.context().browser()!.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  await expect(visitorPage.getByTestId("public-project").filter({ hasText: title })).toContainText("Documentary · French");
  await visitor.close();
});

test("unpublishing removes it from the page and stops new video links", async ({ page }) => {
  await signIn(page);
  await page.goto(`/admin/projects/${projectId}`);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByTestId("publish-panel")).toContainText("Draft");

  const visitor = await page.context().browser()!.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  await expect(visitorPage.getByText(title)).toHaveCount(0);
  expect((await visitor.request.get(`/api/playback/${projectId}`)).status()).toBe(404);
  await visitor.close();
});

test("a repeat upload of the same file is caught before anything is sent", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Add a project" }).click();
  await page.getByTestId("new-video-input").setInputFiles(videoPath as string);
  await expect(page.getByRole("alert").filter({ hasText: "already been uploaded" })).toBeVisible({ timeout: 60_000 });
});

test("a file that is not an MP4 is refused with a clear reason", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Add a project" }).click();
  await page.getByTestId("new-video-input").setInputFiles({ name: "clip.mov", mimeType: "video/quicktime", buffer: Buffer.from("not a video") });
  await expect(page.getByRole("alert").filter({ hasText: "not an MP4" })).toBeVisible();
});

test("deleting removes the project and its files", async ({ page }) => {
  await signIn(page);
  const row = page.getByTestId("project-row").filter({ hasText: title });
  await row.getByRole("button", { name: /^Delete/ }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(row).toHaveCount(0, { timeout: 60_000 });
});

test("visitors see no owner controls on the reel", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("owner-upload")).toHaveCount(0);
});

test("the owner can upload straight from a frame on the reel, and its name and time appear", async ({ page }) => {
  const reelTitle = `${title} from the reel`;
  await signIn(page);
  await page.goto("/");
  await expect(page.getByTestId("owner-upload").first()).toBeAttached({ timeout: 30_000 });
  await page.getByTestId("owner-video-input").first().setInputFiles(videoPath as string);

  const dialog = page.getByTestId("owner-upload-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title").fill(reelTitle);
  await dialog.getByLabel("Category").fill("Brand");
  await expect(dialog.getByRole("button", { name: "Create draft and upload" })).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: "Create draft and upload" }).click();
  await expect(dialog.getByTestId("upload-success")).toBeVisible({ timeout: 8 * 60 * 1000 });
  await dialog.getByRole("button", { name: "Publish" }).click();
  await expect(dialog.getByTestId("publish-panel")).toContainText("Published");
  await dialog.getByRole("button", { name: "Close" }).click();

  const card = page.getByTestId("public-project").filter({ hasText: reelTitle });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator("time")).toBeVisible();

  // Clean up through the same dashboard the owner uses.
  await page.goto("/admin");
  const row = page.getByTestId("project-row").filter({ hasText: reelTitle });
  await row.getByRole("button", { name: /^Delete/ }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(row).toHaveCount(0, { timeout: 60_000 });
});
