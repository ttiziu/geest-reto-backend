import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpErrorFilter } from './../src/common/filters/http-error.filter';

describe('Geest API (e2e)', () => {
  let app: INestApplication<App>;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpErrorFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Validation', () => {
    it('POST /users rejects invalid email', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Jherry', lastName: 'Test', email: 'not-an-email' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /tasks rejects missing title', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .send({ description: 'no title' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Happy path: users, tasks, assign, complete, archive', () => {
    let userA: number;
    let userB: number;
    let taskId: number;

    it('POST /users creates two users', async () => {
      const a = await request(app.getHttpServer())
        .post('/users')
        .send({
          name: 'Alice',
          lastName: 'E2E',
          email: `alice-${suffix}@test.com`,
        })
        .expect(201);

      const b = await request(app.getHttpServer())
        .post('/users')
        .send({
          name: 'Bob',
          lastName: 'E2E',
          email: `bob-${suffix}@test.com`,
        })
        .expect(201);

      expect(a.body.id).toBeDefined();
      expect(b.body.id).toBeDefined();
      userA = a.body.id;
      userB = b.body.id;
    });

    it('POST /tasks creates a task with status open', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .send({
          title: `E2E task ${suffix}`,
          description: 'full flow',
        })
        .expect(201);

      expect(res.body.status).toBe('open');
      taskId = res.body.id;
    });

    it('POST /tasks/:id/assign assigns users', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/assign`)
        .send({ userIds: [userA, userB] })
        .expect(201);

      expect(res.body.message).toMatch(/assigned/i);
    });

    it('GET /tasks/:id shows assigned users not completed', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .expect(200);

      expect(res.body.users).toHaveLength(2);
      expect(res.body.users.every((u: { completed: boolean }) => !u.completed)).toBe(
        true,
      );
    });

    it('GET /users/:id/tasks lists assigned tasks', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${userA}/tasks`)
        .expect(200);

      expect(res.body.some((t: { id: number }) => t.id === taskId)).toBe(true);
    });

    it('POST /tasks/:id/complete marks one user and keeps open', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/complete`)
        .send({ userId: userA })
        .expect(201);

      expect(res.body.status).toBe('open');
    });

    it('POST /tasks/:id/complete archives when all users finish', async () => {
      const res = await request(app.getHttpServer())
        .post(`/tasks/${taskId}/complete`)
        .send({ userId: userB })
        .expect(201);

      expect(res.body.status).toBe('archived');
    });

    it('GET /tasks?status=archived includes the task', async () => {
      const res = await request(app.getHttpServer())
        .get('/tasks')
        .query({ status: 'archived' })
        .expect(200);

      expect(res.body.some((t: { id: number }) => t.id === taskId)).toBe(true);
    });

    it('GET /tasks/:id/notifications records notify attempts', async () => {
      const res = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/notifications`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].attemptNumber).toBe(1);
    });
  });

  describe('Error cases', () => {
    it('POST /tasks/:id/assign fails for missing task', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks/999999/assign')
        .send({ userIds: [1] })
        .expect(404);

      expect(res.body.error.code).toBe('TASK_NOT_FOUND');
    });

    it('POST /tasks/:id/complete fails if user not assigned', async () => {
      const user = await request(app.getHttpServer())
        .post('/users')
        .send({
          name: 'Solo',
          lastName: 'User',
          email: `solo-${suffix}@test.com`,
        })
        .expect(201);

      const task = await request(app.getHttpServer())
        .post('/tasks')
        .send({ title: `orphan-${suffix}` })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/tasks/${task.body.id}/complete`)
        .send({ userId: user.body.id })
        .expect(400);

      expect(res.body.error.code).toBe('USER_NOT_ASSIGNED');
    });
  });

  describe('Idempotency', () => {
    it('replays same response for same Idempotency-Key and body', async () => {
      const key = `idem-${suffix}`;
      const body = {
        name: 'Idem',
        lastName: 'E2E',
        email: `idem-${suffix}@test.com`,
      };

      const first = await request(app.getHttpServer())
        .post('/users')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/users')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      expect(second.body).toEqual(first.body);
    });

    it('rejects same Idempotency-Key with different body', async () => {
      const key = `idem-reuse-${suffix}`;

      await request(app.getHttpServer())
        .post('/users')
        .set('Idempotency-Key', key)
        .send({
          name: 'A',
          lastName: 'B',
          email: `idem-a-${suffix}@test.com`,
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/users')
        .set('Idempotency-Key', key)
        .send({
          name: 'C',
          lastName: 'D',
          email: `idem-b-${suffix}@test.com`,
        })
        .expect(409);

      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    });
  });
});
