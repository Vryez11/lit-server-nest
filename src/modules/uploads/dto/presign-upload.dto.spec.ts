import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GuestPresignUploadRequestDto } from './presign-upload.dto';

const build = (folder: string) =>
  plainToInstance(GuestPresignUploadRequestDto, {
    folder,
    fileName: 'photo.jpg',
    contentType: 'image/jpeg',
  });

describe('GuestPresignUploadRequestDto', () => {
  it.each(['reservations/2026-07', 'reviews/store_1'])(
    'accepts %s',
    async (folder) => {
      expect(await validate(build(folder))).toHaveLength(0);
    },
  );

  it.each(['stores/hongdae', 'etc/x', 'reviewsfake/x'])(
    'rejects %s',
    async (folder) => {
      expect((await validate(build(folder))).length).toBeGreaterThan(0);
    },
  );
});
