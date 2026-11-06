import { type Page, expect, test } from "@playwright/test";

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

// Waits until the page is interactive, because a click that lands before then is lost.
function open(page: Page, path: string) {
  return page.goto(path, { waitUntil: "networkidle" });
}

async function signIn(page: Page) {
  await open(page, "/admin/login");
  await page.getByLabel("Email").fill(email as string);
  await page.getByLabel("Password").fill(password as string);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function deleteFromDashboard(page: Page, projectTitle: string) {
  const row = page.getByTestId("project-row").filter({ hasText: projectTitle });
  await row.getByRole("button", { name: /^Delete/ }).click();
  await row.getByRole("button", { name: "Yes, delete" }).click();
  await expect(row).toHaveCount(0, { timeout: 60_000 });
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

// The public routes are the only server code a visitor can reach. Bad or hostile input must get a plain refusal, never an
// error that says how the site is built, and nothing that should stay private may be cached on the way.
test("public routes refuse bad input and give nothing away", async ({ request }) => {
  const unknown = "00000000-0000-4000-8000-000000000000";
  for (const path of ["/api/playback/not-a-uuid", `/api/playback/${unknown}`, "/api/playback/..%2F..%2Fetc%2Fpasswd"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(response.headers()["cache-control"], path).toContain("no-store");
    expect(await response.text(), path).not.toMatch(/r2\.cloudflarestorage|supabase|stack|Error:/i);
  }
  expect(await (await request.get("/api/subtitles/not-a-uuid")).json()).toEqual({ languages: [] });
  expect(await (await request.get(`/api/subtitles/${unknown}`)).json()).toEqual({ languages: [] });
  for (const path of [`/api/subtitles/${unknown}/en`, `/api/subtitles/${unknown}/zz`, `/api/subtitles/${unknown}/..%2F..%2Fsecrets`, "/api/subtitles/not-a-uuid/en"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  // The routes only read. Writing to them is refused outright.
  expect((await request.post(`/api/playback/${unknown}`)).status()).toBe(405);
  expect((await request.delete(`/api/subtitles/${unknown}/en`)).status()).toBe(405);
  // The video bucket is private: without a signature it answers nothing, not even a list of files.
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  if (accountId && bucket) {
    const bare = await request.get(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/`);
    expect(bare.status()).toBeGreaterThanOrEqual(400);
    expect(await bare.text()).not.toContain("<Key>");
  }
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
  await open(page, `/admin/projects/${projectId}`);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("publish-panel")).toContainText("Published");

  const visitor = await page.context().browser()!.newContext();
  const visitorPage = await visitor.newPage();
  const videoRequests: string[] = [];
  visitorPage.on("request", (request) => {
    if (request.url().includes(".r2.cloudflarestorage.com")) videoRequests.push(request.url());
  });
  await open(visitorPage, "/");
  const card = visitorPage.getByTestId("public-project").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Documentary · English");
  // The public page never says where a video is stored. Posters are public and do sit under the project's id.
  const html = await visitorPage.content();
  for (const location of [".mp4", "video_path", "r2.cloudflarestorage.com"]) expect(html).not.toContain(location);
  // A video's size cannot slow the page down, because nothing is downloaded until someone points at it or presses play.
  expect(videoRequests).toEqual([]);

  // Pointing at a card plays a few silent seconds.
  await card.getByTestId("card-play").hover();
  const preview = card.getByTestId("card-preview");
  await expect.poll(() => preview.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 60_000 }).toBeGreaterThan(0);
  expect(await preview.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);

  // Pressing play starts it right there in the card.
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

  // A full size option, and the way back.
  await visitorPage.getByTestId("video-player").hover();
  await visitorPage.getByTestId("player-fullscreen").click();
  const inFullscreen = () => visitorPage.evaluate(() => document.fullscreenElement?.getAttribute("data-testid") ?? null);
  await expect.poll(inFullscreen).toBe("video-player");
  await visitorPage.evaluate(() => document.exitFullscreen());
  await expect.poll(inFullscreen).toBeNull();
  await visitor.close();
});

test("details can be edited, and the change reaches the public page", async ({ page }) => {
  await signIn(page);
  await open(page, `/admin/projects/${projectId}`);
  await page.getByLabel("Language (optional)").fill("French");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  const visitor = await page.context().browser()!.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  await expect(visitorPage.getByTestId("public-project").filter({ hasText: title })).toContainText("Documentary · French");
  await visitor.close();
});

test("the owner adds subtitles in any script, and a visitor can turn them on", async ({ page }) => {
  await signIn(page);
  await open(page, `/admin/projects/${projectId}`);
  const panel = page.getByTestId("subtitles-panel");
  const srt = (text: string) => ({ name: "clip.srt", mimeType: "application/x-subrip", buffer: Buffer.from(`1\n00:00:00,000 --> 00:00:29,000\n${text}\n`) });

  await panel.getByTestId("subtitle-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not subtitles") });
  await expect(panel.getByRole("alert")).toContainText("no timed lines");

  await panel.getByLabel("Language").selectOption("es");
  await panel.getByTestId("subtitle-input").setInputFiles(srt("Hola, esto es una prueba."));
  await expect(panel.getByRole("status")).toContainText("Español subtitles saved");
  await panel.getByLabel("Language").selectOption("ar");
  await panel.getByTestId("subtitle-input").setInputFiles(srt("مرحبا، هذا اختبار."));
  await expect(panel.getByRole("status")).toContainText("العربية subtitles saved");

  const visitor = await page.context().browser()!.newContext();
  const visitorPage = await visitor.newPage();
  const subtitleFiles: string[] = [];
  visitorPage.on("request", (request) => {
    if (request.url().endsWith(".vtt") || /\/api\/subtitles\/[^/]+\/[a-z]+$/.test(request.url())) subtitleFiles.push(request.url().split("/").pop() as string);
  });
  await open(visitorPage, "/");
  await visitorPage.getByTestId("public-project").filter({ hasText: title }).getByTestId("card-play").click();
  const button = visitorPage.getByTestId("player-subtitles");
  await expect(button).toBeAttached({ timeout: 60_000 });
  // Held still, so the controls stay up while the menu is used.
  await visitorPage.getByTestId("video-element").evaluate((video: HTMLVideoElement) => video.pause());
  await button.click();
  const menu = visitorPage.getByTestId("player-subtitles-menu");
  await expect(menu.getByRole("menuitemradio")).toHaveText(["Off", "Español", "العربية"]);
  // Off by default, and nothing is downloaded until a language is chosen.
  expect(subtitleFiles).toEqual([]);

  await menu.getByRole("menuitemradio", { name: "العربية" }).click();
  const shown = visitorPage.getByTestId("player-subtitle");
  await expect(shown).toHaveText("مرحبا، هذا اختبار.", { timeout: 30_000 });
  expect(subtitleFiles).toEqual(["ar"]);

  // A file that fails the first time is asked for again by itself, because a browser would otherwise never retry it.
  let refusals = 1;
  await visitorPage.route(/\/api\/subtitles\/[^/]+\/es$/, async (route) => {
    if (refusals-- > 0) await route.fulfill({ status: 503, body: "" });
    else await route.continue();
  });
  await button.click();
  await menu.getByRole("menuitemradio", { name: "Español" }).click();
  await expect(shown).toHaveText("Hola, esto es una prueba.", { timeout: 30_000 });

  await button.click();
  await menu.getByRole("menuitemradio", { name: "Off" }).click();
  await expect(shown).toHaveCount(0);
  await visitor.close();
});

test("unpublishing removes it from the page and stops new video links", async ({ page }) => {
  await signIn(page);
  await open(page, `/admin/projects/${projectId}`);
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(page.getByTestId("publish-panel")).toContainText("Draft");

  const visitor = await page.context().browser()!.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto("/");
  await expect(visitorPage.getByText(title)).toHaveCount(0);
  expect((await visitor.request.get(`/api/playback/${projectId}`)).status()).toBe(404);
  expect(await (await visitor.request.get(`/api/subtitles/${projectId}`)).json()).toEqual({ languages: [] });
  expect((await visitor.request.get(`/api/subtitles/${projectId}/es`)).status()).toBe(404);
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
  await open(page, "/admin");
  await deleteFromDashboard(page, title);
});

test("visitors see no owner controls on the reel", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("owner-upload")).toHaveCount(0);
});

test("the owner can upload straight from a frame on the reel, and its name and time appear", async ({ page }) => {
  const reelTitle = `${title} from the reel`;
  await signIn(page);
  await open(page, "/");
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
  await open(page, "/admin");
  await deleteFromDashboard(page, reelTitle);
});
