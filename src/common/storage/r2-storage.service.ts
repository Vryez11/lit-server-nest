import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string | null;

  constructor(private readonly config: ConfigService) {
    const accountId = config.getOrThrow<string>('CF_R2_ACCOUNT_ID');
    this.bucket = config.getOrThrow<string>('CF_R2_BUCKET');
    this.publicUrl = config.get<string>('CF_R2_PUBLIC_URL') ?? null;

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.getOrThrow<string>('CF_R2_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('CF_R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async upload(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
  ): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    this.logger.log({ event: 'r2.upload', key, bucket: this.bucket });

    // 퍼블릭 URL이 설정된 경우 바로 반환, 아니면 서명 URL 반환 (1시간)
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/$/, '')}/${key}`;
    }
    return this.getSignedUrl(key, 3600);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.log({ event: 'r2.delete', key, bucket: this.bucket });
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }
}
