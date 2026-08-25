import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(code: string, message: string, status: HttpStatus) {
    super({ code, message }, status);
  }
}
