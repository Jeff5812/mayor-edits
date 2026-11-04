import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObject,
  isR2Configured,
  listObjectKeys,
  listUploadedParts,
  signGetUrl,
  signPartUrl,
  storedObjectSize,
} from "./r2";

const KEY = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.mp4";
const SECRET = "not-a-real-secret";
const BUCKET_URL = "https://account.r2.cloudflarestorage.com/videos";

let requests: Request[];
let reply: (request: Request) => Response;

beforeEach(() => {
  vi.stubEnv("R2_ACCOUNT_ID", "account");
  vi.stubEnv("R2_ACCESS_KEY_ID", "key-id");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", SECRET);
  vi.stubEnv("R2_BUCKET", "videos");
  requests = [];
  reply = () => new Response(null, { status: 200 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      requests.push(input);
      return reply(input);
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  it("knows when a setting is missing, and refuses to run", async () => {
    expect(isR2Configured()).toBe(true);
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    expect(isR2Configured()).toBe(false);
    await expect(createMultipartUpload(KEY, "video/mp4")).rejects.toThrow(/not configured/);
    expect(requests).toHaveLength(0);
  });
});

describe("starting an upload", () => {
  it("asks for a new upload with the video's type, and returns its id", async () => {
    reply = () => new Response("<InitiateMultipartUploadResult><UploadId>abc123</UploadId></InitiateMultipartUploadResult>");
    expect(await createMultipartUpload(KEY, "video/mp4")).toBe("abc123");
    const [request] = requests;
    expect(request.method).toBe("POST");
    expect(request.url).toContain(`${BUCKET_URL}/${KEY}?uploads`);
    expect(request.headers.get("content-type")).toBe("video/mp4");
    expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);
  });

  it("reports R2's error code, not the secret", async () => {
    reply = () => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
    const failure = await createMultipartUpload(KEY, "video/mp4").catch((error: Error) => error.message);
    expect(failure).toContain("AccessDenied");
    expect(failure).not.toContain(SECRET);
  });
});

describe("listing parts", () => {
  it("reads what R2 holds, keeping each ETag exactly as written", async () => {
    reply = () =>
      new Response(
        `<ListPartsResult><Part><PartNumber>1</PartNumber><ETag>&quot;aaa&quot;</ETag><Size>8388608</Size></Part>` +
          `<Part><PartNumber>2</PartNumber><ETag>"bbb"</ETag><Size>100</Size></Part></ListPartsResult>`,
      );
    expect(await listUploadedParts(KEY, "abc123")).toEqual([
      { partNumber: 1, etag: "&quot;aaa&quot;", size: 8388608 },
      { partNumber: 2, etag: '"bbb"', size: 100 },
    ]);
    expect(requests[0].url).toContain("uploadId=abc123");
  });

  it("treats an empty upload as no parts, and a vanished one as null", async () => {
    reply = () => new Response("<ListPartsResult></ListPartsResult>");
    expect(await listUploadedParts(KEY, "abc123")).toEqual([]);
    reply = () => new Response("<Error><Code>NoSuchUpload</Code></Error>", { status: 404 });
    expect(await listUploadedParts(KEY, "abc123")).toBeNull();
  });
});

describe("finishing an upload", () => {
  const parts = [
    { partNumber: 2, etag: '"bbb"', size: 100 },
    { partNumber: 1, etag: '"aaa"', size: 100 },
  ];

  it("sends the parts in order", async () => {
    reply = () => new Response("<CompleteMultipartUploadResult></CompleteMultipartUploadResult>");
    await completeMultipartUpload(KEY, "abc123", parts);
    const body = await requests[0].text();
    expect(requests[0].method).toBe("POST");
    expect(body).toBe(
      `<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"aaa"</ETag></Part>` +
        `<Part><PartNumber>2</PartNumber><ETag>"bbb"</ETag></Part></CompleteMultipartUpload>`,
    );
  });

  it("notices a failure reported inside a 200 answer", async () => {
    reply = () => new Response("<Error><Code>InternalError</Code></Error>");
    await expect(completeMultipartUpload(KEY, "abc123", parts)).rejects.toThrow(/InternalError/);
  });
});

describe("other operations", () => {
  it("treats cancelling or deleting something already gone as success", async () => {
    reply = () => new Response(null, { status: 404 });
    await expect(abortMultipartUpload(KEY, "abc123")).resolves.toBeUndefined();
    await expect(deleteObject(KEY)).resolves.toBeUndefined();
  });

  it("reports a failed delete", async () => {
    reply = () => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
    await expect(deleteObject(KEY)).rejects.toThrow(/AccessDenied/);
  });

  it("reads a stored file's size, or null if there is none", async () => {
    reply = () => new Response(null, { headers: { "content-length": "4096" } });
    expect(await storedObjectSize(KEY)).toBe(4096);
    expect(requests[0].method).toBe("HEAD");
    reply = () => new Response(null, { status: 404 });
    expect(await storedObjectSize(KEY)).toBeNull();
  });

  it("lists the files under a folder", async () => {
    reply = () => new Response("<ListBucketResult><Contents><Key>a/1.mp4</Key></Contents><Contents><Key>a/2.mp4</Key></Contents></ListBucketResult>");
    expect(await listObjectKeys("a/")).toEqual(["a/1.mp4", "a/2.mp4"]);
    expect(requests[0].url).toContain("list-type=2");
    expect(requests[0].url).toContain("prefix=a%2F");
  });
});

describe("signed links", () => {
  it("signs one part of one upload, for a limited time", async () => {
    const url = new URL(await signPartUrl(KEY, "abc123", 7, 3600));
    expect(url.origin + url.pathname).toBe(`${BUCKET_URL}/${KEY}`);
    expect(url.searchParams.get("partNumber")).toBe("7");
    expect(url.searchParams.get("uploadId")).toBe("abc123");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.toString()).not.toContain(SECRET);
    expect(requests).toHaveLength(0);
  });

  it("signs a read of one file", async () => {
    const url = new URL(await signGetUrl(KEY, 600));
    expect(url.pathname).toBe(`/videos/${KEY}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.toString()).not.toContain(SECRET);
  });

  it("gives different signatures for reading and writing", async () => {
    const read = new URL(await signGetUrl(KEY, 600)).searchParams.get("X-Amz-Signature");
    const write = new URL(await signPartUrl(KEY, "abc123", 1, 600)).searchParams.get("X-Amz-Signature");
    expect(read).not.toBe(write);
  });
});
