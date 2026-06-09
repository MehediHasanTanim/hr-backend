import { Inject, Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfigService } from '../../../config/config.service';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    const minio = this.config.get('minio');
    this.bucket = minio.bucketName;
    this.client = new S3Client({
      endpoint: `http${minio.useSsl ? 's' : ''}://${minio.endpoint}:${minio.port}`,
      credentials: {
        accessKeyId: minio.accessKey,
        secretAccessKey: minio.secretKey,
      },
      region: 'auto',
      forcePathStyle: true,
    });
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      this.logger.log({ key, bucket: this.bucket }, 'File uploaded to storage');
      return key;
    } catch (err) {
      this.logger.error({ key, error: (err as Error).message }, 'Storage upload failed');
      throw err;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const url = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
      return url;
    } catch (err) {
      this.logger.error({ key, error: (err as Error).message }, 'Signed URL generation failed');
      throw err;
    }
  }
}
