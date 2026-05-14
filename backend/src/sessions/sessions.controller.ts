import { Request, Response, NextFunction } from 'express';
import * as SessionsService from './sessions.service';

export async function listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deviceId, from, to, probeRange, page, limit } = req.query as Record<string, string | undefined>;
    const result = await SessionsService.listSessions({
      organizationId: req.user!.organizationId,
      deviceId,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      probeRange: probeRange as 'R1' | 'R2' | 'R3' | undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await SessionsService.createSession(req.user!.organizationId, req.body);
    res.status(201).json({ data: session });
  } catch (err) {
    next(err);
  }
}

export async function getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await SessionsService.getSession(req.user!.organizationId, req.params.id);
    res.json({ data: session });
  } catch (err) {
    next(err);
  }
}

export async function updateSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await SessionsService.updateSession(
      req.user!.organizationId,
      req.params.id,
      req.body,
    );
    res.json({ data: session });
  } catch (err) {
    next(err);
  }
}

export async function deleteSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await SessionsService.deleteSession(
      req.user!.organizationId,
      req.params.id,
      { userId: req.user!.userId, email: req.user!.email ?? '' },
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function bulkInsertSamples(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await SessionsService.bulkInsertSamples(
      req.user!.organizationId,
      req.params.id,
      req.body.samples,
    );
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

export async function getSamples(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, downsample } = req.query as Record<string, string | undefined>;
    const result = await SessionsService.getSamples({
      organizationId: req.user!.organizationId,
      sessionId: req.params.id,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 1000) : 500,
      downsample: downsample === 'true',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const csv = await SessionsService.exportSessionCsv(req.user!.organizationId, req.params.id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="NEP-Link-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}
