import type { H3Event } from 'h3'
import type { TaskSource } from '../../store/TaskSource'
import type { PMSettings, Task } from '../../types'
import { flattenTasks } from '../../store/TaskTreeOps'
import { findTaskById } from '../../store/TaskIndex'
import { makeTask } from '../../types'

export function createTasksRouter(store: TaskSource, settings: () => PMSettings) {
  const { createRouter, getRouterParam, readBody, json, createError } = require('h3')

  const router = createRouter()

  async function getProjectById(projectId: string): Promise<{ id: string } | null> {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    return projects.find((p: { id: string }) => p.id === projectId) ?? null
  }

  // GET /projects/:projectId/tasks
  router.get('/', async (event: H3Event) => {
    const projectId = getRouterParam(event, 'projectId')
    const project = await getProjectById(projectId!)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    return json(flattenTasks(project.tasks).map((f: { task: Task }) => f.task))
  })

  // GET /projects/:projectId/tasks/:taskId
  router.get('/:taskId', async (event: H3Event) => {
    const projectId = getRouterParam(event, 'projectId')
    const taskId = getRouterParam(event, 'taskId')
    const project = await getProjectById(projectId!)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    const task = findTaskById(project.tasks, taskId!)
    if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    return json(task)
  })

  // POST /projects/:projectId/tasks
  router.post('/', async (event: H3Event) => {
    const projectId = getRouterParam(event, 'projectId')
    const body = await readBody(event)
    const project = await getProjectById(projectId!)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    const task = makeTask(body)
    await store.insertTask(project, task)
    return json(task, 201)
  })

  // PUT /projects/:projectId/tasks/:taskId
  router.put('/:taskId', async (event: H3Event) => {
    const projectId = getRouterParam(event, 'projectId')
    const taskId = getRouterParam(event, 'taskId')
    const body = await readBody(event)
    const project = await getProjectById(projectId!)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    const task = findTaskById(project.tasks, taskId!)
    if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    await store.updateTask(project, taskId!, body)
    return json(task)
  })

  // DELETE /projects/:projectId/tasks/:taskId
  router.delete('/:taskId', async (event: H3Event) => {
    const projectId = getRouterParam(event, 'projectId')
    const taskId = getRouterParam(event, 'taskId')
    const project = await getProjectById(projectId!)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    const task = findTaskById(project.tasks, taskId!)
    if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    await store.deleteTask(project, taskId!)
    return new Response(null, { status: 204 })
  })

  return router
}
