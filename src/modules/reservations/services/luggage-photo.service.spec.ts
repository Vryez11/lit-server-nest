import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  LuggagePhotoService,
  UploadedPhotoFile,
} from './luggage-photo.service';
import { R2StorageService } from '../../../common/storage/r2-storage.service';

function file(
  mimetype: string,
  size = 1000,
  buffer = Buffer.from('x'),
): UploadedPhotoFile {
  return { mimetype, size, buffer };
}

describe('LuggagePhotoService', () => {
  let service: LuggagePhotoService;
  const r2 = {
    upload: jest
      .fn()
      .mockImplementation((key: string) => Promise.resolve(`https://cdn.example/${key}`)),
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        LuggagePhotoService,
        { provide: R2StorageService, useValue: r2 },
      ],
    }).compile();
    service = mod.get(LuggagePhotoService);
    r2.upload.mockClear();
  });

  it('토큰 프리픽스 + 고유 키로 각 파일을 R2에 올리고 URL 배열을 반환한다', async () => {
    const files = [file('image/jpeg'), file('image/png')];
    const urls = await service.uploadForToken('tok12345', files);

    expect(r2.upload).toHaveBeenCalledTimes(2);
    const [key0, body0, ct0] = r2.upload.mock.calls[0];
    expect(key0).toMatch(/^guest-luggage\/tok12345\/[a-f0-9-]+\.jpg$/);
    expect(body0).toBe(files[0].buffer);
    expect(ct0).toBe('image/jpeg');
    expect(urls).toHaveLength(2);
  });

  it('허용되지 않은 mime 타입은 거부한다', async () => {
    await expect(
      service.uploadForToken('tok12345', [file('application/pdf')]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('4MB를 초과하면 거부한다', async () => {
    await expect(
      service.uploadForToken('tok12345', [file('image/jpeg', 5 * 1024 * 1024)]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('잘못된 토큰은 거부한다', async () => {
    await expect(
      service.uploadForToken('short', [file('image/jpeg')]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('3장을 초과하면 거부한다', async () => {
    await expect(
      service.uploadForToken('tok12345', [
        file('image/jpeg'),
        file('image/jpeg'),
        file('image/jpeg'),
        file('image/jpeg'),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
