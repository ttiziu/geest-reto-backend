import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AssignUsersDto } from './dto/assign-users.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListTasksQueryDto) {
    return this.tasksService.findAll(query.status);
  }

  @Get(':idTask/notifications')
  listNotifications(@Param('idTask', ParseIntPipe) idTask: number) {
    return this.tasksService.listNotifications(idTask);
  }

  @Get(':idTask')
  findOne(@Param('idTask', ParseIntPipe) idTask: number) {
    return this.tasksService.findOne(idTask);
  }

  @Post(':idTask/assign')
  assign(
    @Param('idTask', ParseIntPipe) idTask: number,
    @Body() dto: AssignUsersDto,
  ) {
    return this.tasksService.assign(idTask, dto);
  }

  @Post(':idTask/complete')
  complete(
    @Param('idTask', ParseIntPipe) idTask: number,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.tasksService.complete(idTask, dto);
  }
}
