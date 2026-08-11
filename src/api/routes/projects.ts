import { createRouter, getRouterParam, readBody, json, createError } from 'h3'
import type { H3Event } from 'h3'
import type { TaskSource } from '../../store/TaskSource'
import type { PMSettings } from '../../types'

export function createProjectsRouter(store: TaskSource, settings: () => PMSettings) {
  const router = createRouter()

  router.get('/', async () => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    return json(projects)
  })

  router.get('/:id', async (event: H3Event) => {
    const id = getRouterParam(event, 'id')
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const project = projects.find((p: { id: string }) => p.id === id)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    return json(project)
  })

  router.post('/', async (event: H3Event) => {
    const body = await readBody(event)
    if (!body?.title) throw createError({ statusCode: 400, statusMessage: 'title is required' })
    const project = await store.createProject(body.title, settings().projectsFolder)
    return json(project, 201)
  })

  router.put('/:id', async (event: H3Event) => {
    const id = getRouterParam(event, 'id')
    const body = await readBody(event)
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const project = projects.find((p: { id: string }) => p.id === id)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    await store.updateProject(project, body)
    return json(project)
  })

  router.delete('/:id', async (event: H3Event) => {
    const id = getRouterParam(event, 'id')
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const project = projects.find((p: { id: string }) => p.id === id)
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    await store.deleteProject(project)
    return new Response(null, { status: 204 })
  })

  return router
}
