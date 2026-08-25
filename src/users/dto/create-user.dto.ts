import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'lastName is required' })
  lastName: string;

  @IsEmail({}, { message: 'email is not valid' })
  @IsNotEmpty({ message: 'email is required' })
  email: string;
}
