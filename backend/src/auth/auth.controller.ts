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
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService, RegisterInput, LoginInput, AuthResult } from './auth.service';

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

  @ApiOperation({ summary: 'Register a new organization and admin user' })
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

  @ApiOperation({ summary: 'Login and get access + refresh tokens' })
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

  @ApiOperation({ summary: 'Refresh access token using refresh token' })
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

  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiBearerAuth()
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

  @ApiOperation({ summary: 'Request a password reset email' })
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

  @ApiOperation({ summary: 'Reset password using a valid token' })
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


function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/v1/auth',
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { orgName, email, password, firstName, lastName, country } = req.body as {
      orgName: string;
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      country: string;
    };

    if (!orgName || !email || !password || !firstName || !lastName || !country) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'All fields are required: orgName, email, password, firstName, lastName, country' } });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' } });
      return;
    }

    const result = await authService.register({ orgName, email, password, firstName, lastName, country });
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'email and password are required' } });
      return;
    }

    const userAgent = req.headers['user-agent'] ?? '';
    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? '';

    const result = await authService.login({ email, password, userAgent, ipAddress });
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Accept token from body OR cookie
    const rawToken: string | undefined =
      (req.body as { refreshToken?: string }).refreshToken ?? req.cookies?.[REFRESH_COOKIE];

    if (!rawToken) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required' } });
      return;
    }

    const result = await authService.refreshAccessToken(rawToken);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken: string | undefined =
      (req.body as { refreshToken?: string }).refreshToken ?? req.cookies?.[REFRESH_COOKIE];

    if (rawToken) {
      await authService.logout(rawToken);
    }
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body as { email: string };
    if (!email) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'email is required' } });
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? '';

    const result = await authService.forgotPassword(email, ipAddress);

    // In development, expose the token for testing (Resend not yet configured)
    if (process.env.NODE_ENV === 'development' && result.devToken) {
      res.status(200).json({ message: 'Reset token generated (DEV only — email not sent)', devToken: result.devToken });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    if (!token || !newPassword) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'token and newPassword are required' } });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' } });
      return;
    }

    await authService.resetPassword(token, newPassword);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
