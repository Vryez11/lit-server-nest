import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { R2StorageService } from '../../../common/storage/r2-storage.service';

/**
 * multer 업로드 파일의 최소 형태. `@types/multer` 미설치라 Express.Multer.File 대신 사용.
 * (친구가 `@types/multer`를 설치하면 Express.Multer.File[]로 교체 가능.)
 */
export interface UploadedPhotoFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

/**
 * 비회원 예약 짐 사진을 Cloudflare R2에 업로드한다.
 *
 * 예약 생성 *전* 짐 선택 단계에서 클라이언트가 uploadToken으로 사진을 백그라운드 업로드한다.
 * 키는 `guest-luggage/<uploadToken>/<uuid>.<ext>` — 요청이 파일별로 나뉘어도 충돌하지 않는다.
 * 30일 폐기는 R2 버킷 라이프사이클 규칙(prefix `guest-luggage/`)이 담당한다.
 */
const ALLOWED_EXT = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const MAX_FILES = 3;
const MAX_SIZE = 4 * 1024 * 1024;
const TOKEN_RE = /^[a-zA-Z0-9_-]{8,64}$/;

@Injectable()
export class LuggagePhotoService {
  constructor(private readonly r2: R2StorageService) {}

  async uploadForToken(
    uploadToken: string,
    files: UploadedPhotoFile[],
  ): Promise<string[]> {
    if (!uploadToken || !TOKEN_RE.test(uploadToken)) {
      throw new BadRequestException('invalid uploadToken');
    }
    if (!files?.length) {
      throw new BadRequestException('no files provided');
    }
    if (files.length > MAX_FILES) {
      throw new BadRequestException(`maximum ${MAX_FILES} files allowed`);
    }
    for (const file of files) {
      const ext = ALLOWED_EXT.get(file.mimetype);
      if (!ext) {
        throw new BadRequestException(`unsupported file type: ${file.mimetype}`);
      }
      if (file.size > MAX_SIZE) {
        throw new BadRequestException('file too large (max 4MB each)');
      }
    }
    return Promise.all(
      files.map((file) =>
        this.r2.upload(
          `guest-luggage/${uploadToken}/${randomUUID()}.${ALLOWED_EXT.get(file.mimetype)}`,
          file.buffer,
          file.mimetype,
        ),
      ),
    );
  }
}
