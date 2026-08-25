import { HttpStatus, Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { AssignUsersDto } from './dto/assign-users.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { NotificationsService } from './notifications.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateTaskDto) {
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
      },
    });

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
    };
  }

  async findAll(status?: TaskStatus) {
    const tasks = await this.prisma.task.findMany({
      where: status ? { status } : undefined,
      orderBy: { id: 'asc' },
      include: {
        assignments: {
          include: {
            user: true,
          },
        },
      },
    });

    return tasks.map((task) => this.mapTask(task));
  }

  async findOne(idTask: number) {
    const task = await this.prisma.task.findUnique({
      where: { id: idTask },
      include: {
        assignments: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!task) {
      throw new AppException(
        'TASK_NOT_FOUND',
        `Task with id ${idTask} was not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    return this.mapTask(task);
  }

  async assign(idTask: number, dto: AssignUsersDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: idTask },
    });

    if (!task) {
      throw new AppException(
        'TASK_NOT_FOUND',
        `Task with id ${idTask} was not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const uniqueUserIds = [...new Set(dto.userIds)];

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true },
    });

    if (users.length !== uniqueUserIds.length) {
      const found = new Set(users.map((u) => u.id));
      const missing = uniqueUserIds.filter((id) => !found.has(id));
      throw new AppException(
        'USER_NOT_FOUND',
        `User(s) not found: ${missing.join(', ')}`,
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.taskAssignment.createMany({
      data: uniqueUserIds.map((userId) => ({
        taskId: idTask,
        userId,
      })),
      skipDuplicates: true,
    });

    return {
      message: 'Users assigned successfully',
      taskId: idTask,
      userIds: uniqueUserIds,
    };
  }

  async complete(idTask: number, dto: CompleteTaskDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: idTask },
        include: { assignments: true },
      });

      if (!task) {
        throw new AppException(
          'TASK_NOT_FOUND',
          `Task with id ${idTask} was not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      const user = await tx.user.findUnique({
        where: { id: dto.userId },
      });

      if (!user) {
        throw new AppException(
          'USER_NOT_FOUND',
          `User with id ${dto.userId} was not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      const assignment = task.assignments.find((a) => a.userId === dto.userId);

      if (!assignment) {
        throw new AppException(
          'USER_NOT_ASSIGNED',
          `User ${dto.userId} is not assigned to task ${idTask}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!assignment.completed) {
        await tx.taskAssignment.update({
          where: { id: assignment.id },
          data: {
            completed: true,
            completedAt: new Date(),
          },
        });
      }

      const pendingCount = await tx.taskAssignment.count({
        where: {
          taskId: idTask,
          completed: false,
        },
      });

      let justArchived = false;
      let archivedAt: Date | null = null;

      if (pendingCount === 0 && task.assignments.length > 0) {
        // Solo un request concurrente gana el archivado
        const archiveResult = await tx.task.updateMany({
          where: { id: idTask, status: TaskStatus.open },
          data: {
            status: TaskStatus.archived,
            archivedAt: new Date(),
          },
        });

        justArchived = archiveResult.count === 1;

        if (justArchived) {
          const updated = await tx.task.findUnique({ where: { id: idTask } });
          archivedAt = updated?.archivedAt ?? null;
        }
      }

      return {
        taskId: idTask,
        userId: dto.userId,
        title: task.title,
        justArchived,
        archivedAt,
      };
    });

    if (result.justArchived && result.archivedAt) {
      await this.notifications.notifyTaskArchived(
        result.taskId,
        result.title,
        result.archivedAt,
      );
    }

    const task = await this.prisma.task.findUnique({
      where: { id: idTask },
      select: { status: true },
    });

    return {
      message: 'Task participation marked as completed',
      taskId: result.taskId,
      userId: result.userId,
      status: task?.status ?? TaskStatus.open,
    };
  }

  async listNotifications(idTask: number) {
    const task = await this.prisma.task.findUnique({
      where: { id: idTask },
      select: { id: true },
    });

    if (!task) {
      throw new AppException(
        'TASK_NOT_FOUND',
        `Task with id ${idTask} was not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    return this.notifications.listByTask(idTask);
  }

  private mapTask(task: {
    id: number;
    title: string;
    description: string | null;
    status: TaskStatus;
    assignments: Array<{
      completed: boolean;
      user: {
        id: number;
        name: string;
        lastName: string;
        email: string;
      };
    }>;
  }) {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      users: task.assignments.map((a) => ({
        id: a.user.id,
        name: a.user.name,
        lastName: a.user.lastName,
        email: a.user.email,
        completed: a.completed,
      })),
    };
  }
}
