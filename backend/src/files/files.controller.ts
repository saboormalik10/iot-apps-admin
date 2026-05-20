import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtOrApiKeyGuard } from '../common/guards/jwt-or-apikey.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { FilesService } from './files.service';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../utils/storage.util';

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(_req: Express.Request, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), { code: 'INVALID_MIME', statusCode: 415 }),
        false,
      );
    }
  },
};

@ApiTags('Files')
@ApiBearerAuth()
@Controller()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // ─── NEP Session Files ──────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Upload a file to a NEP session (photo, map screenshot, thumbnail)' })
  @ApiConsumes('multipart/form-data')
  @Post('sessions/:id/files')
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadSessionFile(
    @Param('id') id: string,
    @Body() body: { fileType?: string; capturedAt?: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user?: JWTPayload,
  ) {
    if (!file) {
      throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    }
    const fileType = (body.fileType ?? 'photo') as 'map' | 'photo' | 'thumbnail';
    const allowed = ['map', 'photo', 'thumbnail'];
    if (!allowed.includes(fileType)) {
      throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: `fileType must be one of: ${allowed.join(', ')}` } });
    }
    const result = await this.filesService.uploadSessionFile(
      user!.organizationId,
      id,
      file,
      fileType,
      body.capturedAt,
    );
    return { data: result };
  }

  @ApiOperation({ summary: 'List all files for a NEP session' })
  @Get('sessions/:id/files')
  @UseGuards(JwtAuthGuard)
  async listSessionFiles(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const files = await this.filesService.listSessionFiles(user!.organizationId, id);
    return { data: files };
  }

  @ApiOperation({ summary: 'Delete a file from a NEP session' })
  @Delete('sessions/:id/files/:fileId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteSessionFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user?: JWTPayload,
  ): Promise<void> {
    await this.filesService.deleteSessionFile(user!.organizationId, id, fileId);
  }

  // ─── MET Record Pictures ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Upload a picture to a MET record' })
  @ApiConsumes('multipart/form-data')
  @Post('records/:id/pictures')
  @HttpCode(201)
  @UseGuards(JwtOrApiKeyGuard)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadRecordPicture(
    @Param('id') id: string,
    @Body() body: { takenAt?: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user?: JWTPayload,
  ) {
    if (!file) {
      throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    }
    const result = await this.filesService.uploadRecordPicture(
      user!.organizationId,
      id,
      file,
      body.takenAt,
    );
    return { data: result };
  }

  @ApiOperation({ summary: 'List all pictures for a MET record' })
  @Get('records/:id/pictures')
  @UseGuards(JwtAuthGuard)
  async listRecordPictures(@Param('id') id: string, @CurrentUser() user?: JWTPayload) {
    const pictures = await this.filesService.listRecordPictures(user!.organizationId, id);
    return { data: pictures };
  }

  @ApiOperation({ summary: 'Delete a picture from a MET record' })
  @Delete('records/:id/pictures/:pictureId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteRecordPicture(
    @Param('id') id: string,
    @Param('pictureId') pictureId: string,
    @CurrentUser() user?: JWTPayload,
  ): Promise<void> {
    await this.filesService.deleteRecordPicture(user!.organizationId, id, pictureId);
  }
}
