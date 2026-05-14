import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
