import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
  url: string;
  thumbnailUrl?: string;
  path: string;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;
const THUMBNAIL_WIDTH = 400;
const BUCKET_NAME = 'clearly-uploads';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private supabase: SupabaseClient;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_KEY');

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.logger.log('Supabase Storage 클라이언트 초기화 완료');
    } else {
      this.logger.warn(
        'SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 설정되지 않았습니다.',
      );
    }
  }

  validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('파일이 제공되지 않았습니다.');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        '지원하지 않는 파일 형식입니다. JPEG, PNG, WebP만 허용됩니다.',
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('파일 크기는 10MB를 초과할 수 없습니다.');
    }
  }

  private getExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return map[mimetype] || 'jpg';
  }

  private buildPath(
    category: string,
    userId: string,
    ext: string,
  ): string {
    const timestamp = Date.now();
    const id = uuidv4().slice(0, 8);
    return `${category}/${userId}/${id}_${timestamp}.${ext}`;
  }

  private getPublicUrl(path: string): string {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    return `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${path}`;
  }

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    category: string = 'chat',
  ): Promise<UploadResult> {
    this.validateFile(file);

    if (!this.supabase) {
      throw new InternalServerErrorException(
        'Storage 서비스가 초기화되지 않았습니다.',
      );
    }

    const ext = this.getExtension(file.mimetype);
    const filePath = this.buildPath(category, userId, ext);

    // 메인 파일 업로드
    const { error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      this.logger.error(`파일 업로드 실패: ${error.message}`);
      throw new InternalServerErrorException('파일 업로드에 실패했습니다.');
    }

    const url = this.getPublicUrl(filePath);

    // 채팅 이미지인 경우 썸네일 생성
    let thumbnailUrl: string | undefined;
    if (category === 'chat') {
      try {
        const thumbnailBuffer = await sharp(file.buffer)
          .resize(THUMBNAIL_WIDTH, THUMBNAIL_WIDTH, { fit: 'inside' })
          .jpeg({ quality: 70 })
          .toBuffer();

        const thumbPath = this.buildPath('thumbnails', userId, 'jpg');
        const { error: thumbError } = await this.supabase.storage
          .from(BUCKET_NAME)
          .upload(thumbPath, thumbnailBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (!thumbError) {
          thumbnailUrl = this.getPublicUrl(thumbPath);
        }
      } catch (e) {
        this.logger.warn(`썸네일 생성 실패: ${e}`);
      }
    }

    this.logger.log(`파일 업로드 성공: ${filePath}`);
    return { url, thumbnailUrl, path: filePath };
  }

  async uploadFiles(
    files: Express.Multer.File[],
    userId: string,
    category: string = 'chat',
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('파일이 제공되지 않았습니다.');
    }
    if (files.length > MAX_FILES) {
      throw new BadRequestException(`최대 ${MAX_FILES}개의 파일만 업로드할 수 있습니다.`);
    }

    const results: UploadResult[] = [];
    for (const file of files) {
      const result = await this.uploadFile(file, userId, category);
      results.push(result);
    }
    return results;
  }

  async deleteFile(filePath: string): Promise<void> {
    if (!this.supabase) {
      throw new InternalServerErrorException(
        'Storage 서비스가 초기화되지 않았습니다.',
      );
    }

    const { error } = await this.supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      this.logger.error(`파일 삭제 실패: ${error.message}`);
      throw new InternalServerErrorException('파일 삭제에 실패했습니다.');
    }

    this.logger.log(`파일 삭제 성공: ${filePath}`);
  }
}
