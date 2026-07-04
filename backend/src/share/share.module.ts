import { Module } from '@nestjs/common';
import { ShareController } from './share.controller';
import { PublicController } from './public.controller';
import { ShareService } from './share.service';
import { PublicService } from './public.service';

@Module({
  controllers: [ShareController, PublicController],
  providers: [ShareService, PublicService],
})
export class ShareModule {}
