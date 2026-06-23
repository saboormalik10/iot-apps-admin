import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DashboardLayout, IDashboardTile } from '../models/DashboardLayout';

export interface CreateLayoutInput {
  deviceId: string;
  name?: string;
  tiles: IDashboardTile[];
  isDefault?: boolean;
}

@Injectable()
export class DashboardLayoutsService {
  async list(organizationId: string, userId: string, deviceId?: string) {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(userId),
    };
    if (deviceId) query.deviceId = new Types.ObjectId(deviceId);
    const layouts = await DashboardLayout.find(query).sort({ isDefault: -1, updatedAt: -1 }).lean();
    return layouts;
  }

  async create(organizationId: string, userId: string, input: CreateLayoutInput) {
    if (!input.deviceId) throw new BadRequestException('deviceId is required');
    if (!Array.isArray(input.tiles) || input.tiles.length === 0) {
      throw new BadRequestException('tiles array is required');
    }
    const deviceObjId = new Types.ObjectId(input.deviceId);
    const orgObjId = new Types.ObjectId(organizationId);
    const userObjId = new Types.ObjectId(userId);

    if (input.isDefault) {
      await DashboardLayout.updateMany({ userId: userObjId, deviceId: deviceObjId }, { $set: { isDefault: false } });
    }
    const layout = await DashboardLayout.create({
      userId: userObjId,
      deviceId: deviceObjId,
      organizationId: orgObjId,
      name: input.name ?? 'My Layout',
      isDefault: input.isDefault ?? false,
      tiles: input.tiles,
    });
    return layout;
  }

  private async findOwned(organizationId: string, userId: string, id: string) {
    const layout = await DashboardLayout.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(userId),
    });
    if (!layout) throw new NotFoundException('Layout not found');
    return layout;
  }

  async update(organizationId: string, userId: string, id: string, body: { name?: string; tiles?: IDashboardTile[] }) {
    const layout = await this.findOwned(organizationId, userId, id);
    if (body.name !== undefined) layout.name = body.name;
    if (body.tiles !== undefined) layout.tiles = body.tiles;
    await layout.save();
    return layout;
  }

  async remove(organizationId: string, userId: string, id: string): Promise<void> {
    const layout = await this.findOwned(organizationId, userId, id);
    await DashboardLayout.deleteOne({ _id: layout._id });
  }

  async setDefault(organizationId: string, userId: string, id: string) {
    const layout = await this.findOwned(organizationId, userId, id);
    await DashboardLayout.updateMany(
      { userId: new Types.ObjectId(userId), deviceId: layout.deviceId },
      { $set: { isDefault: false } },
    );
    layout.isDefault = true;
    await layout.save();
    return layout;
  }
}
