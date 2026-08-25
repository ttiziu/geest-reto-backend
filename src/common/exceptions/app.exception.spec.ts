import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';

describe('AppException', () => {
  it('exposes code and message in the response body', () => {
    const error = new AppException(
      'TASK_NOT_FOUND',
      'Task with id 1 was not found',
      HttpStatus.NOT_FOUND,
    );

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.getResponse()).toEqual({
      code: 'TASK_NOT_FOUND',
      message: 'Task with id 1 was not found',
    });
  });
});
