import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty({ message: 'title is required' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
