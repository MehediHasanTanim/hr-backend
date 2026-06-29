import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import type { Readable } from 'node:stream';
import { AppConfigService } from '../../config/config.service';

export interface S3UploadParams {
  bucket: string;
  key: string;
  body: Readable | Buffer | string;
  contentType?: string;
  contentLength?: number;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    const s3Config = this.config.get('minio') ?? this.config.get('s3') ?? {};
    this.client = new S3Client({
      region: s3Config.region ?? 'us-east-1',
      endpoint: s3Config.endpoint,
      forcePathStyle: s3Config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: s3Config.accessKey ?? 'minioadmin',
        secretAccessKey: s3Config.secretKey ?? 'minioadmin',
      },
    });
    this.bucket = s3Config.bucket ?? 'hr-documents';
  }

  /**
   * Upload a file stream to S3 using @aws-sdk/lib-storage Upload (streaming, not buffering).
   */
  async uploadStream(params: S3UploadParams): Promise<void> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: params.bucket || this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      },
    });

    try {
      await upload.done();
      this.logger.log(`Uploaded to S3: ${params.key}`);
    } catch (err) {
      this.logger.error(`Failed to upload to S3: ${params.key}`, err);
      throw err;
    }
  }

  /**
   * Upload a buffer to S3 using PutObject.
   */
  async putObject(params: PutObjectCommandInput): Promise<void> {
    try {
      const { Bucket: _bucket, ...rest } = params;
      await this.client.send(
        new PutObjectCommand({
          Bucket: params.Bucket ?? this.bucket,
          ...rest,
        }),
      );
      this.logger.log(`PutObject to S3: ${params.Key}`);
    } catch (err) {
      this.logger.error(`Failed to PutObject to S3: ${params.Key}`, err);
      throw err;
    }
  }

  /**
   * Generate a pre-signed GET URL for an S3 object.
   * The signed URL is never persisted — it's generated on-the-fly.
   */
  async getSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      });
      return url;
    } catch (err) {
      this.logger.error(`Failed to generate signed URL for: ${key}`, err);
      throw err;
    }
  }

  getBucket(): string {
    return this.bucket;
  }
}
