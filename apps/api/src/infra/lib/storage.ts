import { S3Client } from "@aws-sdk/client-s3";

let cachedS3Client: S3Client | undefined;

/**
 * Lazily initializes the Cloudflare R2 S3 client on first runtime use so build-time
 * Next.js route collection does not fail when R2 credentials are absent.
 */
export function getS3Client(): S3Client {
  if (!cachedS3Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("Cloudflare R2 credentials are missing.");
    }

    cachedS3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  return cachedS3Client;
}
