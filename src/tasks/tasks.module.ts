import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, NotificationsService],
  exports: [TasksService],
})
export class TasksModule {}
