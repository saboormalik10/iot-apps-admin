import { Module } from '@nestjs/common';

import { ProvisionController } from './provision.controller';
import { ProvisionService } from './provision.service';
import { StationsService } from './stations.service';
import { StationsController } from './stations.controller';
import { StreamTypesService } from './stream-types.service';
import { StreamTypesController } from './stream-types.controller';
import { StreamTypesOrgController } from './stream-types-org.controller';

@Module({
  controllers: [ProvisionController, StationsController, StreamTypesController, StreamTypesOrgController],
  providers: [ProvisionService, StationsService, StreamTypesService],
  exports: [ProvisionService, StationsService],
})
export class ProvisionModule {}
