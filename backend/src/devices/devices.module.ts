import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
// Deleting a station disables its SFTP login, which is a provisioning job.
import { ProvisionModule } from '../provision/provision.module';

@Module({
  imports: [ProvisionModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
