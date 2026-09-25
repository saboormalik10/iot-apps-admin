import {
  Controller,
  Get,
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
  ApiAcceptedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ApiErrors } from '../common/decorators/api-errors.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JWTPayload } from '../utils/jwt';
import { AuthService, AuthResult, selfSignupEnabled } from './auth.service';
import {
  LoginDto,
  RefreshDto,
  LogoutDto,
  ForgotPasswordDto,
  VerifyResetCodeDto,
  ResetPasswordDto,
  SignupDto,
} from './dto';
import { isEmailConfigured } from '../utils/mailer';

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const AUTH_RESULT_EXAMPLE = {
  data: {
    user: { id: '664a1f2e3c4d5e6f7a8b9c0d', email: 'admin@observator.com', firstName: 'Dana', lastName: 'Galbraith', role: 'admin', organizationId: '664a1f2e3c4d5e6f7a8b9c0e', mustChangePassword: false },
    accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
    refreshToken: 'a1b2c3d4e5f6…(64-char hex)',
  },
};

@ApiTags('Auth')
@Controller('auth')
/**
 * ThrottlerGuard is applied HERE because it is not registered globally in this
 * app (the same note appears on ingest, provision and the public share routes).
 *
 * Without it the `@Throttle` decorators below are inert metadata: they configure
 * a guard that never runs. Measured before this line existed — 30 consecutive
 * failed logins all returned 401 and not one 429, so `POST /auth/login` accepted
 * unlimited password guesses while the Swagger description claimed it was
 * "rate-limited to 10 requests/min". `throttle-coverage.e2e-spec.ts` now fails
 * the build if any route carries @Throttle without a guard in scope.
 *
 * Guard order matters: this is listed FIRST so a request is counted before any
 * authentication work happens. Behind it, bcrypt runs at cost 12 (~250 ms) on
 * every attempt, which is itself the thing an attacker would use to exhaust the
 * event loop.
 */
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      /**
       * Follows the site's own TLS switch, NOT `NODE_ENV`.
       *
       * A site PC normally serves plain http — most site networks have no
       * certificate authority — and a `Secure` cookie is never stored or sent
       * back over http, so keying this to `NODE_ENV=production` made the cookie
       * silently useless in the ordinary deployment. The portal's session cookie
       * already reads `SESSION_COOKIE_SECURE`; one switch now governs both, and
       * it is set to true when WEB_TLS_CERT/KEY are in use.
       *
       * The portal itself never relies on this cookie (its BFF keeps the refresh
       * token server-side), so this only affects something talking to the API
       * directly, such as the Swagger page on the PC.
       */
      secure: process.env.SESSION_COOKIE_SECURE === 'true',
      sameSite: 'strict',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/v1/auth',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
  }

  @ApiOperation({
    summary: 'What the sign-in page may offer',
    description:
      'Public. `selfSignup`: people may create their own account (STANDALONE_SELF_SIGNUP). ' +
      '`emailReset`: an email server is configured, so "forgot password" can send a code; without ' +
      'one, an administrator resets passwords from the Users screen.',
  })
  @ApiOkResponse({ description: 'Options', schema: { example: { data: { selfSignup: false, emailReset: false } } } })
  @Get('options')
  options(): { data: { selfSignup: boolean; emailReset: boolean } } {
    return { data: { selfSignup: selfSignupEnabled(), emailReset: isEmailConfigured() } };
  }

  @ApiOperation({
    summary: 'Create your own account (when the site allows it)',
    description:
      'Only when STANDALONE_SELF_SIGNUP=true; otherwise 404. The account starts inactive, as a Viewer, ' +
      'until an administrator approves it on the Users screen. The answer is the same whether or not ' +
      'the email already has an account.',
  })
  @ApiBody({ type: SignupDto })
  @ApiAcceptedResponse({ description: 'Received; waiting for approval' })
  @ApiErrors('badRequest', 'notFound', 'tooManyRequests')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  @HttpCode(202)
  async signup(@Body() body: SignupDto, @Req() req: Request): Promise<{ data: { status: 'pending' } }> {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '';
    await this.authService.signup(body, ipAddress);
    return { data: { status: 'pending' } };
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
    @Body() body: LoginDto,
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
  // Several tabs can refresh near-simultaneously when an access token expires.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() body: RefreshDto,
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
    @Body() body: LogoutDto,
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
  @ApiBody({ type: ForgotPasswordDto })
  @ApiNoContentResponse({ description: 'If the email exists, a reset code was sent' })
  @ApiErrors('badRequest')
  // Tighter than the default on purpose. This sends mail to a third party, so
  // it is both an email-bombing vector and the way an attacker mints fresh reset
  // codes — each new code buys another 5 verify attempts, so an unbounded mint
  // rate would defeat the attempt ceiling on the code itself.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(204)
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
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
  @ApiBody({ type: VerifyResetCodeDto })
  @ApiOkResponse({ description: 'Code valid — reset token issued', schema: { example: { data: { resetToken: 'a1b2c3…' } } } })
  @ApiErrors('badRequest')
  // The code is 6 digits from a CSPRNG with a 5-attempt ceiling per record;
  // this bounds guessing ACROSS records, which that ceiling does not.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-reset-code')
  @HttpCode(200)
  async verifyResetCode(@Body() body: VerifyResetCodeDto, @Req() req: Request): Promise<{ data: { resetToken: string } }> {
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
  @ApiBody({ type: ResetPasswordDto })
  @ApiNoContentResponse({ description: 'Password reset' })
  @ApiErrors('badRequest')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(
    @Body() body: ResetPasswordDto,
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
  // Looser: a flaky connection legitimately re-tickets on reconnect backoff,
  // and throttling that would break realtime for the user who can least afford it.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('ws-ticket')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  async wsTicket(@CurrentUser() user: JWTPayload): Promise<{ data: { ticket: string; expiresInSec: number } }> {
    return { data: this.authService.mintWsTicket(user) };
  }
}

