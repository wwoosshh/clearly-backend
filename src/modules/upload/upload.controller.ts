import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    _req: any,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          '지원하지 않는 파일 형식입니다. JPEG, PNG, WebP만 허용됩니다.',
        ),
        false,
      );
    }
  },
};

@ApiTags('파일 업로드')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('file')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '단일 파일 업로드' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        bucket: {
          type: 'string',
          description:
            '업로드 카테고리 (profiles, companies, chat, reviews, estimates)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: '파일 업로드 성공' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @Body('bucket') bucket?: string,
  ) {
    return this.uploadService.uploadFile(file, userId, bucket || 'chat');
  }

  @Post('files')
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '다중 파일 업로드 (최대 10개)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        bucket: { type: 'string', description: '업로드 카테고리' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '파일 업로드 성공' })
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser('id') userId: string,
    @Body('bucket') bucket?: string,
  ) {
    return this.uploadService.uploadFiles(files, userId, bucket || 'chat');
  }

  @Delete(':filePath')
  @ApiOperation({ summary: '파일 삭제' })
  @ApiResponse({ status: 200, description: '파일 삭제 성공' })
  async deleteFile(@Param('filePath') filePath: string) {
    await this.uploadService.deleteFile(filePath);
    return { message: '파일이 삭제되었습니다.' };
  }
}
