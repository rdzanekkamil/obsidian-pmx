import { createRouter, getRouterParam, readBody, json, createError } from 'h3'
import type { H3Event } from 'h3'
import type { TaskSource } from '../../store/TaskSource'
import type { PMSettings, Task } from '../../types'
import { flattenTasks } from '../../store/TaskTreeOps'
import { findTaskById } from '../../store/TaskIndex'
import { makeTask } from '../../types'

export function createTasksRouter(store: TaskSource, settings: () => PMSettings) {
  const router = createRouter()

  async function getProjectById(projectId: string): Promise<{ id: string } | null> {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    return projects.find((p: { id: string }) => p.id === projectId) ?? null
  }

  router.get('/', async (event: H3Event) => {
    const projectId = getRouterParam(event, 'projectId')
    const project = await getProjectById(projectId!)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    return json(flattenTasks(project.tasks).map((f: { task: Task }) => f.task))
  })

  router.get('/:taskId', async (event: H3Event) => {
    const projectId = getRouterParam(event, 'projectId')
    const taskId = getRouterParam(event, 'taskId')
    const project = await getProjectById(projectId!)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    const task = findTaskById(project.tasks, taskId!)
    if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    return json(task)
  })

  router.post('/', async (event: H3Event) => {
    const projectId = getRouterParam(event, 'projectId')
    const body = await readBody(event)
    const project = await getProjectById(projectId!)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    const task = makeTask(body)
    await store.insertTask(project, task)
    return json(task, 201)
  })

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
