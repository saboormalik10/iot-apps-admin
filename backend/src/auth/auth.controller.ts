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
import { Consumers } from '../common/decorators/consumers.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { AuthService, RegisterInput, LoginInput, MobileSignupInput, AuthResult } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  MobileSignupDto,
  MobileRefreshDto,
  RefreshDto,
  LogoutDto,
  ForgotPasswordDto,
  VerifyResetCodeDto,
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 400 validation error in the shape the global exception filter expects. */
function validationError(message: string, code = 'VALIDATION_ERROR'): Error {
  return Object.assign(new Error(message), { statusCode: 400, code });
}

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

  // ── Mobile auth ─────────────────────────────────────────────────────────────
  // The MET-LINK / NEP-LINK apps authenticate with their OWN per-user JWTs (no
  // shared API key). Tokens are returned in the BODY (no httpOnly cookie) since a
  // native app stores them itself; the app then sends `Authorization: Bearer …`.

  @ApiOperation({
    summary: 'Mobile signup — create a field user account',
    description:
      '**For the MET-LINK / NEP-LINK apps — call this from your "Create account" screen.**\n\n' +
      'Send the person\'s name, email and a password (8+ characters), plus `appType` — the name of ' +
      'your app ("MET-LINK" or "NEP-LINK") — so the admin panel can list them under the right tab.\n\n' +
      'What you get back: the new user profile plus an `accessToken` and a `refreshToken`, so the ' +
      'user is signed in straight away — no separate login call needed. **Store both tokens securely ' +
      'on the phone** and send `Authorization: Bearer <accessToken>` on every other API call.\n\n' +
      'If the email is already registered you get a **409** — show a "try logging in instead" message. ' +
      'The account joins the organisation configured on the server, so everything this user uploads ' +
      'shows up in that organisation\'s dashboard, tagged with their user id.',
  })
  @Consumers('nep-link', 'met-link')
  @ApiBody({ type: MobileSignupDto })
  @ApiCreatedResponse({ description: 'User created (auto-login)', schema: { example: AUTH_RESULT_EXAMPLE } })
  @ApiErrors('badRequest', 'unauthorized')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('mobile/signup')
  @HttpCode(201)
  async mobileSignup(@Body() body: MobileSignupInput, @Req() req: Request): Promise<{ data: AuthResult }> {
    if (!body.email || !body.password || !body.firstName || !body.lastName) {
      throw validationError('email, password, firstName and lastName are required');
    }
    if (!EMAIL_RE.test(body.email)) throw validationError('A valid email is required', 'INVALID_EMAIL');
    if (body.password.length < 8) throw validationError('Password must be at least 8 characters', 'WEAK_PASSWORD');

    const userAgent = req.headers['user-agent'] ?? '';
    const result = await this.authService.mobileSignup({ ...body, userAgent });
    return { data: result };
  }

  @ApiOperation({
    summary: 'Mobile login — sign an existing user in',
    description:
      '**For the MET-LINK / NEP-LINK apps — call this from your "Sign in" screen.**\n\n' +
      'Send email + password. You get back the user profile plus an `accessToken` (valid 15 minutes) ' +
      'and a `refreshToken` (valid 30 days). **Store both tokens securely on the phone** and send ' +
      '`Authorization: Bearer <accessToken>` on every other API call.\n\n' +
      'Wrong email/password returns **401** — show a friendly "check your details" message. ' +
      'Login attempts are limited to 10 per minute per device.',
  })
  @Consumers('nep-link', 'met-link')
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Authenticated', schema: { example: AUTH_RESULT_EXAMPLE } })
  @ApiErrors('badRequest', 'unauthorized', 'tooManyRequests')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('mobile/login')
  @HttpCode(200)
  async mobileLogin(@Body() body: LoginInput, @Req() req: Request): Promise<{ data: AuthResult }> {
    if (!body.email || !body.password) throw validationError('email and password are required');
    const userAgent = req.headers['user-agent'] ?? '';
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '';
    const result = await this.authService.login({ ...body, userAgent, ipAddress });
    return { data: result };
  }

  @ApiOperation({
    summary: 'Mobile refresh — get a new access token without logging in again',
    description:
      '**When to call this:** the `accessToken` from login/signup expires after **15 minutes**. ' +
      'When any API call returns **401 TOKEN_INVALID**, call this endpoint with your saved ' +
      '`refreshToken`, save the new `accessToken` it returns, then retry the original call. ' +
      'You can also call it proactively (e.g. every ~12–14 minutes, or on app resume) so the ' +
      'user never notices a hiccup.\n\n' +
      'The `refreshToken` itself lasts **30 days** and does not change here. If THIS call fails ' +
      'with 401, the refresh token has expired or been revoked — clear both stored tokens and ' +
      'send the user back to the login screen.',
  })
  @Consumers('nep-link', 'met-link')
  @ApiBody({ type: MobileRefreshDto })
  @ApiOkResponse({ description: 'New access token', schema: { example: { data: { accessToken: 'eyJhbGci…' } } } })
  @ApiErrors('badRequest', 'unauthorized')
  @Post('mobile/refresh')
  @HttpCode(200)
  async mobileRefresh(@Body() body: { refreshToken?: string }): Promise<{ data: { accessToken: string } }> {
    if (!body.refreshToken) throw validationError('refreshToken is required');
    const result = await this.authService.refreshAccessToken(body.refreshToken);
    return { data: result };
  }

  @ApiOperation({
    summary: 'Mobile logout — sign the user out',
    description:
      '**Call this when the user taps "Log out".** Send the saved `refreshToken`; the server ' +
      'revokes it so it can never be used again. Then delete both tokens from the phone\'s ' +
      'storage. Always returns 204, even if the token was already gone — safe to call.',
  })
  @Consumers('nep-link', 'met-link')
  @ApiBody({ type: MobileRefreshDto })
  @ApiNoContentResponse({ description: 'Refresh token revoked' })
  @Post('mobile/logout')
  @HttpCode(204)
  async mobileLogout(@Body() body: { refreshToken?: string }): Promise<void> {
    if (body.refreshToken) await this.authService.logout(body.refreshToken);
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

  @ApiOperation({
    summary: 'Request a password-reset code (Step 1 of 3)',
    description:
      'Works for both admin and mobile users. Emails a **6-digit code** (valid 15 min) if the address is ' +
      'registered. Always returns 204 to avoid revealing whether an email exists (in dev it returns 200 ' +
      'with a `devCode` so the flow can be tested). Next: `POST /auth/verify-reset-code`.',
  })
  @Consumers('nep-link', 'met-link', 'admin')
  @ApiBody({ type: ForgotPasswordDto })
  @ApiNoContentResponse({ description: 'If the email exists, a reset code was sent' })
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

    // The reset code is emailed in every environment. In development we ALSO echo
    // it back as `devCode` so the flow can be tested without opening the inbox.
    if (process.env.NODE_ENV === 'development' && result.devCode) {
      res.status(200).json({
        message: 'Reset code emailed (devCode included in development only)',
        devCode: result.devCode,
      });
      return;
    }
  }

  @ApiOperation({
    summary: 'Verify a password-reset code (Step 2 of 3)',
    description:
      'Works for both admin and mobile users. Checks the 6-digit code from the reset email and, on ' +
      'success, returns a single-use `resetToken` to pass to `POST /auth/reset-password`. The code is ' +
      'consumed here (cannot be reused) and is rate-limited — after 5 wrong attempts it is invalidated ' +
      'and a new code must be requested.',
  })
  @Consumers('nep-link', 'met-link', 'admin')
  @ApiBody({ type: VerifyResetCodeDto })
  @ApiOkResponse({ description: 'Code valid — reset token issued', schema: { example: { data: { resetToken: 'a1b2c3…' } } } })
  @ApiErrors('badRequest')
  @Post('verify-reset-code')
  @HttpCode(200)
  async verifyResetCode(@Body() body: { email?: string; code?: string }, @Req() req: Request): Promise<{ data: { resetToken: string } }> {
    if (!body.email || !body.code) {
      const err = new Error('email and code are required') as NodeJS.ErrnoException & { statusCode: number; code: string };
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (!/^\d{6}$/.test(body.code)) {
      const err = new Error('code must be 6 digits') as NodeJS.ErrnoException & { statusCode: number; code: string };
      err.statusCode = 400;
      err.code = 'INVALID_RESET_CODE';
      throw err;
    }
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '';
    const result = await this.authService.verifyResetCode(body.email, body.code, ipAddress);
    return { data: result };
  }

  @ApiOperation({
    summary: 'Reset password with a verified reset token (Step 3 of 3)',
    description:
      'Works for both admin and mobile users. Use the `resetToken` returned by `POST /auth/verify-reset-code`. ' +
      'All existing refresh tokens for the account are revoked after a successful reset.',
  })
  @Consumers('nep-link', 'met-link', 'admin')
  @ApiBody({ type: ResetPasswordDto })
  @ApiNoContentResponse({ description: 'Password reset' })
  @ApiErrors('badRequest')
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(
    @Body() body: { resetToken?: string; newPassword?: string },
  ): Promise<void> {
    if (!body.resetToken || !body.newPassword) {
      const err = new Error('resetToken and newPassword are required');
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

    await this.authService.resetPassword(body.resetToken, body.newPassword);
  }

  @ApiOperation({
    summary: 'Mint a short-lived WebSocket auth ticket (~60s)',
    description:
      'Admin-panel only. JWT-guarded. Returns a short-lived access token for the socket.io ' +
      'handshake (auth.token) so the long-lived access token never leaves the server under the ' +
      'BFF model. The /v1/ws gateway verifies it with the normal access-token secret.',
  })
  @ApiBearerAuth()
  @ApiCreatedResponse({ description: 'Ticket minted', schema: { example: { data: { ticket: 'eyJhbGci…', expiresInSec: 60 } } } })
  @ApiErrors('unauthorized')
  @Post('ws-ticket')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  async wsTicket(@CurrentUser() user: JWTPayload): Promise<{ data: { ticket: string; expiresInSec: number } }> {
    return { data: this.authService.mintWsTicket(user) };
  }
}

