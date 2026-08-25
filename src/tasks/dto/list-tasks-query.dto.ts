import { IsEnum, IsOptional } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class ListTasksQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus, { message: 'status must be open or archived' })
  status?: TaskStatus;
}
