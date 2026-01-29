import {
  Controller,
  Post,
  Delete,
  Param,
  UseGuards,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('파일 업로드')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('file')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '단일 파일 업로드' })
  @ApiResponse({ status: 201, description: '파일 업로드 성공' })
  async uploadFile(
    @UploadedFile() file: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.uploadService.uploadFile(file, userId);
  }

  @Post('files')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '다중 파일 업로드' })
  @ApiResponse({ status: 201, description: '파일 업로드 성공' })
  async uploadFiles(
    @UploadedFiles() files: any[],
    @CurrentUser('id') userId: string,
  ) {
    return this.uploadService.uploadFiles(files, userId);
  }

  @Delete(':fileId')
  @ApiOperation({ summary: '파일 삭제' })
  @ApiResponse({ status: 200, description: '파일 삭제 성공' })
  async deleteFile(
    @Param('fileId') fileId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.uploadService.deleteFile(fileId, userId);
  }
}
