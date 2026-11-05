import "server-only";
import { AwsClient } from "aws4fetch";

// Everything that talks to Cloudflare R2, which holds the video files. Server only, because it holds
// the secret key. Browsers only ever receive short-lived signed links for one file or one part.

export interface StoredPart {
  partNumber: number;
  // Kept exactly as R2 wrote it in its XML, so it can be sent straight back when finishing the upload.
  etag: string;
  size: number;
}

export function isR2Configured(): boolean {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

function connect() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error("Cloudflare R2 is not configured.");
  }
  return {
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
      retries: 3,
    }),
    bucketUrl: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
  };
}

function objectUrl(bucketUrl: string, key: string, query: Record<string, string> = {}): string {
  const url = new URL(`${bucketUrl}/${key.split("/").map(encodeURIComponent).join("/")}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  return url.toString();
}

function tag(xml: string, name: string): string | null {
  return new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? null;
}

async function readOk(response: Response, action: string): Promise<string> {
  const body = await response.text();
  if (!response.ok) throw new Error(`R2 could not ${action}: ${response.status} ${tag(body, "Code") ?? ""}`.trim());
  return body;
}

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const { client, bucketUrl } = connect();
  const response = await client.fetch(objectUrl(bucketUrl, key, { uploads: "" }), {
    method: "POST",
    headers: { "content-type": contentType },
  });
  const uploadId = tag(await readOk(response, "start an upload"), "UploadId");
  if (!uploadId) throw new Error("R2 started an upload without giving it an id.");
  return uploadId;
}

// Null means the upload no longer exists: it finished, was cancelled, or R2 dropped it after 7 days.
export async function listUploadedParts(key: string, uploadId: string): Promise<StoredPart[] | null> {
  const { client, bucketUrl } = connect();
  const response = await client.fetch(objectUrl(bucketUrl, key, { uploadId }));
  if (response.status === 404) return null;
  const body = await readOk(response, "list an upload's parts");
  return [...body.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map(([, part]) => ({
    partNumber: Number(tag(part, "PartNumber")),
    etag: tag(part, "ETag") ?? "",
    size: Number(tag(part, "Size")),
  }));
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: StoredPart[]): Promise<void> {
  const { client, bucketUrl } = connect();
  const items = [...parts]
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((part) => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${part.etag}</ETag></Part>`)
    .join("");
  const response = await client.fetch(objectUrl(bucketUrl, key, { uploadId }), {
    method: "POST",
    headers: { "content-type": "application/xml" },
    body: `<CompleteMultipartUpload>${items}</CompleteMultipartUpload>`,
  });
  const body = await readOk(response, "finish an upload");
  // S3-style services can answer 200 and report the failure in the body.
  if (body.includes("<Error>")) throw new Error(`R2 could not finish an upload: ${tag(body, "Code") ?? "unknown"}`);
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const { client, bucketUrl } = connect();
  const response = await client.fetch(objectUrl(bucketUrl, key, { uploadId }), { method: "DELETE" });
  if (response.status !== 404) await readOk(response, "cancel an upload");
}

// The stored size in bytes, or null if there is no such file.
export async function storedObjectSize(key: string): Promise<number | null> {
  const { client, bucketUrl } = connect();
  const response = await client.fetch(objectUrl(bucketUrl, key), { method: "HEAD" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 could not check a file: ${response.status}`);
  return Number(response.headers.get("content-length"));
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucketUrl } = connect();
  const response = await client.fetch(objectUrl(bucketUrl, key), { method: "DELETE" });
  if (response.status !== 404) await readOk(response, "delete a file");
}

// For small text files, such as subtitles. Video goes through the multipart upload instead.
export async function putTextObject(key: string, text: string, contentType: string): Promise<void> {
  const { client, bucketUrl } = connect();
  const response = await client.fetch(objectUrl(bucketUrl, key), { method: "PUT", headers: { "content-type": contentType }, body: text });
  await readOk(response, "save a file");
}

// The file's text, or null if there is no such file.
export async function getTextObject(key: string): Promise<string | null> {
  const { client, bucketUrl } = connect();
  const response = await client.fetch(objectUrl(bucketUrl, key));
  if (response.status === 404) return null;
  return readOk(response, "read a file");
}

export async function listObjectKeys(prefix: string): Promise<string[]> {
  const { client, bucketUrl } = connect();
  const url = new URL(bucketUrl);
  url.searchParams.set("list-type", "2");
  url.searchParams.set("prefix", prefix);
  const body = await readOk(await client.fetch(url.toString()), "list files");
  return [...body.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map(([, key]) => key);
}

async function presign(url: string, method: string, seconds: number): Promise<string> {
  const { client } = connect();
  const expiring = new URL(url);
  expiring.searchParams.set("X-Amz-Expires", String(seconds));
  const signed = await client.sign(expiring.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

// A link that lets a browser send one part of one upload, and nothing else.
export function signPartUrl(key: string, uploadId: string, partNumber: number, seconds: number): Promise<string> {
  const { bucketUrl } = connect();
  return presign(objectUrl(bucketUrl, key, { partNumber: String(partNumber), uploadId }), "PUT", seconds);
}

// A link that lets a browser read one file.
export function signGetUrl(key: string, seconds: number): Promise<string> {
  const { bucketUrl } = connect();
  return presign(objectUrl(bucketUrl, key), "GET", seconds);
}
