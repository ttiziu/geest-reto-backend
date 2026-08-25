import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          lastName: dto.lastName,
          email: dto.email,
        },
      });

      return {
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'EMAIL_ALREADY_EXISTS',
          'A user with this email already exists',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      include: {
        assignments: {
          where: {
            completed: false,
            task: { status: 'open' },
          },
          include: {
            task: true,
          },
        },
      },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      pendingTasks: user.assignments.map((a) => ({
        id: a.task.id,
        title: a.task.title,
        description: a.task.description,
        status: a.task.status,
      })),
    }));
  }

  async findTasksByUser(idUser: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: idUser },
      select: { id: true },
    });

    if (!user) {
      throw new AppException(
        'USER_NOT_FOUND',
        `User with id ${idUser} was not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const assignments = await this.prisma.taskAssignment.findMany({
      where: { userId: idUser },
      orderBy: { taskId: 'asc' },
      include: {
        task: true,
      },
    });

    return assignments.map((a) => ({
      id: a.task.id,
      title: a.task.title,
      description: a.task.description,
      status: a.task.status,
      completed: a.completed,
    }));
  }
}
