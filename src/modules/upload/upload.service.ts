import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly prisma: PrismaService) {}

  // TODO: 파일 업로드 (S3 또는 로컬)
  async uploadFile(file: any, userId: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 다중 파일 업로드
  async uploadFiles(files: any[], userId: string) {
    // TODO: 구현 예정
    return [];
  }

  // TODO: 파일 삭제
  async deleteFile(fileId: string, userId: string) {
    // TODO: 구현 예정
    return null;
  }

  // TODO: 파일 메타데이터 조회
  async getFileInfo(fileId: string) {
    // TODO: 구현 예정
    return null;
  }
}
