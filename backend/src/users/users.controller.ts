import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JWTPayload } from '../utils/jwt';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto';

const PROFILE_EXAMPLE = {
  id: '664a1f2e3c4d5e6f7a8b9c0d',
  email: 'admin@observator.com',
  firstName: 'Dana',
  lastName: 'Galbraith',
  role: 'admin',
  organizationId: '664a1f2e3c4d5e6f7a8b9c0e',
  isActive: true,
  lastLoginAt: '2026-06-23T09:00:00.000Z',
  createdAt: '2026-05-01T09:00:00.000Z',
};

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiOkResponse({ description: 'Current user profile', schema: { example: { data: PROFILE_EXAMPLE } } })
  @ApiErrors('unauthorized')
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user?: JWTPayload) {
    const data = await this.usersService.getProfile(user!.userId);
    return { data };
  }

  @ApiOperation({ summary: 'Update own profile (name) and/or change password' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ description: 'Updated profile', schema: { example: { data: PROFILE_EXAMPLE } } })
  @ApiErrors('badRequest', 'unauthorized')
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @Body() body: UpdateProfileDto,
    @CurrentUser() user?: JWTPayload,
  ) {
    const data = await this.usersService.updateProfile(user!.userId, body, {
      userId: user!.userId,
      email: user!.email ?? '',
    });
    return { data };
  }
}
