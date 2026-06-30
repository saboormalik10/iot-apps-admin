import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Get the current user profile' })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user?: JWTPayload) {
    const data = await this.usersService.getProfile(user!.userId);
    return { data };
  }

  @ApiOperation({ summary: 'Update own profile (name) and/or change password' })
  @ApiBody({ type: UpdateProfileDto })
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
