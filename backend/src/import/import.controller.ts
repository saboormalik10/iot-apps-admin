import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { assertAllowedFileType } from '../utils/storage.util';
import { JWTPayload } from '../utils/jwt';
import { ImportService } from './import.service';

const CSV_MIME = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv']);

const multerOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(_req: Express.Request, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) {
    if (CSV_MIME.has(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), { code: 'INVALID_MIME', statusCode: 415 }), false);
  },
};

const FILE_BODY = {
  schema: {
    type: 'object',
    required: ['file', 'deviceId'],
    properties: {
      file: { type: 'string', format: 'binary' },
      deviceId: { type: 'string', description: 'Target device ObjectId' },
    },
  },
};

const SUMMARY_EXAMPLE = { data: { inserted: 3600, upserted: 1, skipped: 0, errors: [] } };

@ApiTags('Import')
@ApiBearerAuth()
@Controller('import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @ApiOperation({
    summary: 'Import historical NEP sessions from a CSV (admin)',
    description: 'Accepts the NEP export header (`SessionId,Timestamp,Turbidity_NTU,…`). Idempotent per SessionId. multipart with `file` + `deviceId`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiCreatedResponse({ description: 'Import summary', schema: { example: SUMMARY_EXAMPLE } })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound', 'unsupportedMediaType')
  @Post('nep')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async importNep(
    @Body() body: { deviceId: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JWTPayload,
  ) {
    if (!file) throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    await assertAllowedFileType(file.buffer, file.mimetype);
    const data = await this.importService.importNep(user.organizationId, body.deviceId, file.buffer, {
      userId: user.userId,
      email: user.email ?? '',
    });
    return { data };
  }

  @ApiOperation({
    summary: 'Import historical MET measures from a CSV (admin)',
    description: 'Accepts the MET export header (`Timestamp,Temp_C,Humidity_%,…`). Creates one MetRecord for the file. multipart with `file` + `deviceId`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FILE_BODY)
  @ApiCreatedResponse({ description: 'Import summary', schema: { example: { data: { inserted: 240, upserted: 1, skipped: 0, errors: [] } } } })
  @ApiErrors('badRequest', 'unauthorized', 'forbidden', 'notFound', 'unsupportedMediaType')
  @Post('met')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async importMet(
    @Body() body: { deviceId: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JWTPayload,
  ) {
    if (!file) throw new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    await assertAllowedFileType(file.buffer, file.mimetype);
    const data = await this.importService.importMet(user.organizationId, body.deviceId, file.buffer, {
      userId: user.userId,
      email: user.email ?? '',
    });
    return { data };
  }
}
