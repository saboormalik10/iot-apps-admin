import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { AuthService, RegisterInput, LoginInput, AuthResult } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  LogoutDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const AUTH_RESULT_EXAMPLE = {
  data: {
    user: { id: '664a1f2e3c4d5e6f7a8b9c0d', email: 'admin@observator.com', firstName: 'Dana', lastName: 'Galbraith', role: 'admin', organizationId: '664a1f2e3c4d5e6f7a8b9c0e' },
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
    refreshToken: 'a1b2c3d4e5f6…(64-char hex)',
  },
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/v1/auth',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
  }

  @ApiOperation({
    summary: 'Register a new organization and admin user',
    description: 'Admin-panel only. Also sets an httpOnly `refreshToken` cookie (`Set-Cookie`, path `/v1/auth`, 30-day).',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ description: 'Org + admin created (auto-login)', schema: { example: AUTH_RESULT_EXAMPLE } })
  @ApiErrors('badRequest')
  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: AuthResult }> {
    if (!body.orgName || !body.email || !body.password || !body.firstName || !body.lastName || !body.country) {
      const err = new Error('All fields are required: orgName, email, password, firstName, lastName, country');
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).statusCode = 400;
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).code = 'VALIDATION_ERROR';
      throw err;
    }
    if (body.password.length < 8) {
      const err = new Error('Password must be at least 8 characters');
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).statusCode = 400;
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).code = 'WEAK_PASSWORD';
      throw err;
    }

    const result = await this.authService.register(body);
    this.setRefreshCookie(res, result.refreshToken);
    return { data: result };
  }

  @ApiOperation({
    summary: 'Login and get access + refresh tokens',
    description: 'Admin-panel only. Rate-limited to 10 requests/min. Also sets an httpOnly `refreshToken` cookie (`Set-Cookie`, path `/v1/auth`, 30-day).',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Authenticated', schema: { example: AUTH_RESULT_EXAMPLE } })
  @ApiErrors('badRequest', 'unauthorized', 'tooManyRequests')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: AuthResult }> {
    if (!body.email || !body.password) {
      const err = new Error('email and password are required');
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).statusCode = 400;
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).code = 'VALIDATION_ERROR';
      throw err;
    }

    const userAgent = req.headers['user-agent'] ?? '';
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '';

    const result = await this.authService.login({ ...body, userAgent, ipAddress });
    this.setRefreshCookie(res, result.refreshToken);
    return { data: result };
  }

  @ApiOperation({
    summary: 'Refresh access token using refresh token',
    description: 'Admin-panel only. Reads the raw token from the body, or falls back to the httpOnly `refreshToken` cookie.',
  })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ description: 'New access token', schema: { example: { data: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' } } } })
  @ApiErrors('badRequest', 'unauthorized')
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
  ): Promise<{ data: { accessToken: string } }> {
    const rawToken: string | undefined =
      body.refreshToken ?? (req.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE];

    if (!rawToken) {
      const err = new Error('refreshToken is required');
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).statusCode = 400;
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).code = 'VALIDATION_ERROR';
      throw err;
    }

    const result = await this.authService.refreshAccessToken(rawToken);
    return { data: result };
  }

  @ApiOperation({ summary: 'Logout and revoke refresh token', description: 'Admin-panel only. Clears the httpOnly `refreshToken` cookie.' })
  @ApiBody({ type: LogoutDto })
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Logged out; refresh token revoked' })
  @ApiErrors('unauthorized')
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawToken: string | undefined =
      body.refreshToken ?? (req.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE];

    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    this.clearRefreshCookie(res);
  }

  @ApiOperation({ summary: 'Request a password reset email', description: 'Admin-panel only. Always 204 (in dev returns 200 with a devToken).' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiNoContentResponse({ description: 'If the email exists, a reset link was sent' })
  @ApiErrors('badRequest')
  @Post('forgot-password')
  @HttpCode(204)
  async forgotPassword(
    @Body() body: { email?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void | object> {
    if (!body.email) {
      const err = new Error('email is required');
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).statusCode = 400;
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).code = 'VALIDATION_ERROR';
      throw err;
    }

    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '';

    const result = await this.authService.forgotPassword(body.email, ipAddress);

    if (process.env.NODE_ENV === 'development' && result.devToken) {
      res.status(200).json({
        message: 'Reset token generated (DEV only — email not sent)',
        devToken: result.devToken,
      });
      return;
    }
  }

  @ApiOperation({ summary: 'Reset password using a valid token', description: 'Admin-panel only.' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiNoContentResponse({ description: 'Password reset' })
  @ApiErrors('badRequest')
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(
    @Body() body: { token?: string; newPassword?: string },
  ): Promise<void> {
    if (!body.token || !body.newPassword) {
      const err = new Error('token and newPassword are required');
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).statusCode = 400;
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).code = 'VALIDATION_ERROR';
      throw err;
    }
    if (body.newPassword.length < 8) {
      const err = new Error('Password must be at least 8 characters');
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).statusCode = 400;
      (err as NodeJS.ErrnoException & { statusCode: number; code: string }).code = 'WEAK_PASSWORD';
      throw err;
    }

    await this.authService.resetPassword(body.token, body.newPassword);
  }
}

