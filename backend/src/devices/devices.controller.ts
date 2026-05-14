import { Request, Response, NextFunction } from 'express';
import * as DevicesService from './devices.service';

export async function listDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type, page, limit } = req.query as Record<string, string | undefined>;
    const result = await DevicesService.listDevices({
      organizationId: req.user!.organizationId,
      type: type as 'MET-LINK' | 'NEP-LINK' | undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function createDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await DevicesService.createDevice(
      req.user!.organizationId,
      req.body,
      { userId: req.user!.userId, email: req.user!.email ?? '' },
    );
    res.status(201).json({ data: device });
  } catch (err) {
    next(err);
  }
}

export async function getDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await DevicesService.getDevice(req.user!.organizationId, req.params.id);
    res.json({ data: device });
  } catch (err) {
    next(err);
  }
}

export async function updateDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const device = await DevicesService.updateDevice(
      req.user!.organizationId,
      req.params.id,
      req.body,
      { userId: req.user!.userId, email: req.user!.email ?? '' },
    );
    res.json({ data: device });
  } catch (err) {
    next(err);
  }
}

export async function deleteDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await DevicesService.deleteDevice(
      req.user!.organizationId,
      req.params.id,
      { userId: req.user!.userId, email: req.user!.email ?? '' },
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getDeviceStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await DevicesService.getDeviceStats(req.user!.organizationId, req.params.id);
    res.json({ data: stats });
  } catch (err) {
    next(err);
  }
}
