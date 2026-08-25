import { IsInt } from 'class-validator';

export class CompleteTaskDto {
  @IsInt({ message: 'userId must be an integer' })
  userId: number;
}
