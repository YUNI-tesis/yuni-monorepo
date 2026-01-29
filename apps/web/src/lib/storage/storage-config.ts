import { z } from "zod";

const StorageConfigSchema = z.object({
  provider: z.literal("s3"),
  s3: z.object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    bucketName: z.string().min(1),
    region: z.string().min(1),
  }),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export function loadStorageConfig(): StorageConfig {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  const region = process.env.AWS_REGION || "us-east-1";

  if (!accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      "Missing required S3 environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME"
    );
  }

  return StorageConfigSchema.parse({
    provider: "s3",
    s3: {
      accessKeyId,
      secretAccessKey,
      bucketName,
      region,
    },
  });
}
