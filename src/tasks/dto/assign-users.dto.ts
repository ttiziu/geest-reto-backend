import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class AssignUsersDto {
  @IsArray({ message: 'userIds must be an array' })
  @ArrayNotEmpty({ message: 'userIds must not be empty' })
  @IsInt({ each: true, message: 'each userId must be an integer' })
  userIds: number[];
}
