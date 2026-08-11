import http from 'http'
import { randomUUID } from 'node:crypto'
import type { TaskSource } from '../../store/TaskSource'
import type { PMSettings, Project, Task, Version } from '../../types'
import { flattenTasks } from '../../store/TaskTreeOps'
import { findTaskById } from '../../store/TaskIndex'
import { makeTask, makeProject } from '../../types'

// ── Router ───────────────────────────────────────────────────────────────────
type Params = Record<string, string>
type Handler = (req: http.IncomingMessage, res: http.ServerResponse, params: Params) => void | Promise<void>

class Router {
  private routes: { method: string; path: string | RegExp; handler: Handler }[] = []

  get(path: string | RegExp, handler: Handler) { this.routes.push({ method: 'GET', path, handler }); return this }
  post(path: string | RegExp, handler: Handler) { this.routes.push({ method: 'POST', path, handler }); return this }
  put(path: string | RegExp, handler: Handler) { this.routes.push({ method: 'PUT', path, handler }); return this }
  delete(path: string | RegExp, handler: Handler) { this.routes.push({ method: 'DELETE', path, handler }); return this }

  async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? '/'
    const method = req.method ?? 'GET'
    for (const route of this.routes) {
      if (route.method !== method) continue
      const params = this.match(route.path, url)
      if (params !== null) {
        await route.handler(req, res, params)
        return
      }
    }
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }

  private match(pattern: string | RegExp, url: string): Record<string, string> | null {
    if (pattern instanceof RegExp) {
      const m = url.match(pattern)
      if (!m) return null
      const params: Record<string, string> = {}
      for (let i = 1; i < m.length; i++) if (m[i] !== undefined) params[i.toString()] = m[i]
      return params
    }
    const urlParts = url.split('?')[0].split('/')
    const patParts = pattern.split('/')
    if (urlParts.length !== patParts.length) return null
    const params: Record<string, string> = {}
    for (let i = 0; i < patParts.length; i++) {
      if (patParts[i].startsWith(':')) { params[patParts[i].slice(1)] = urlParts[i]; continue }
      if (patParts[i] !== urlParts[i]) return null
    }
    return params
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

function noContent(res: http.ServerResponse): void {
  res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
  res.end()
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) } catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

function httpError(res: http.ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify({ error: message }))
}

async function loadProject(store: TaskSource, settings: PMSettings, id: string): Promise<Project | null> {
  const projects = await store.loadAllProjects(settings.projectsFolder)
  return projects.find((x) => x.id === id) ?? null
}

// ── Projects ─────────────────────────────────────────────────────────────────
function projectsRouter(store: TaskSource, settings: () => PMSettings) {
  const r = new Router()

  // GET /api/v2/projects
  r.get('/projects', async (_req, res) => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    json(res, projects.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      color: p.color,
      icon: p.icon,
      taskCount: flattenTasks(p.tasks).length,
      versionCount: p.versions.length,
      createdAt: p.created,
      updatedAt: p.updated
    })))
  })

  // GET /api/v2/projects/:id
  r.get('/projects/:id', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.id)
    if (!project) return httpError(res, 404, 'Project not found')
    json(res, project)
  })

  // POST /api/v2/projects
  r.post('/projects', async (req, res) => {
    const body = await readBody(req) as { title?: string; description?: string; color?: string; icon?: string }
    if (!body?.title) return httpError(res, 400, 'title is required')
    const slug = body.title.replace(/[\\/:*?"<>|]/g, '-')
    const project = makeProject(body.title, `${settings().projectsFolder}/${slug}.md`)
    if (body.description) project.description = body.description
    if (body.color) project.color = body.color
    if (body.icon) project.icon = body.icon
    await store.ensureFolder(settings().projectsFolder)
    await store.saveProject(project)
    json(res, project, 201)
  })

  // PUT /api/v2/projects/:id
  r.put('/projects/:id', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.id)
    if (!project) return httpError(res, 404, 'Project not found')
    const body = await readBody(req) as Partial<Project>
    await store.updateProject(project, body)
    json(res, project)
  })

  // DELETE /api/v2/projects/:id
  r.delete('/projects/:id', async (_req, res, p) => {
    const project = await loadProject(store, settings(), p.id)
    if (!project) return httpError(res, 404, 'Project not found')
    await store.deleteProject(project)
    noContent(res)
  })

  // PUT /api/v2/projects/:id/custom-fields
  r.put('/projects/:id/custom-fields', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.id)
    if (!project) return httpError(res, 404, 'Project not found')
    const body = await readBody(req) as { customFields: Project['customFields'] }
    if (!Array.isArray(body?.customFields)) return httpError(res, 400, 'customFields must be an array')
    await store.updateProject(project, { customFields: body.customFields })
    json(res, project)
  })

  return r
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
function tasksRouter(store: TaskSource, settings: () => PMSettings) {
  const r = new Router()

  // GET /api/v2/projects/:projectId/tasks
  r.get('/projects/:projectId/tasks', async (_req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    json(res, flattenTasks(project.tasks).map((f) => f.task))
  })

  // POST /api/v2/projects/:projectId/tasks
  r.post('/projects/:projectId/tasks', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const body = await readBody(req) as Partial<Task> & { parentId?: string }
    const task = makeTask(body)
    await store.insertTask(project, task, body.parentId ?? null)
    json(res, task, 201)
  })

  // GET /api/v2/projects/:projectId/tasks/:taskId
  r.get('/projects/:projectId/tasks/:taskId', async (_req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    json(res, task)
  })

  // PUT /api/v2/projects/:projectId/tasks/:taskId
  r.put('/projects/:projectId/tasks/:taskId', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    const body = await readBody(req) as Partial<Task>
    await store.updateTask(project, p.taskId, body)
    json(res, task)
  })

  // DELETE /api/v2/projects/:projectId/tasks/:taskId
  r.delete('/projects/:projectId/tasks/:taskId', async (_req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    await store.deleteTask(project, p.taskId)
    noContent(res)
  })

  // POST /api/v2/projects/:projectId/tasks/:taskId/status
  r.post('/projects/:projectId/tasks/:taskId/status', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    const body = await readBody(req) as { status: string }
    if (!body?.status) return httpError(res, 400, 'status is required')
    await store.updateTask(project, p.taskId, { status: body.status })
    json(res, task)
  })

  // POST /api/v2/projects/:projectId/tasks/:taskId/version
  r.post('/projects/:projectId/tasks/:taskId/version', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    const body = await readBody(req) as { versionId: string | null }
    await store.updateTask(project, p.taskId, { versionId: body.versionId ?? undefined } as Partial<Task>)
    json(res, task)
  })

  return r
}

// ── Subtasks ──────────────────────────────────────────────────────────────────
function subtasksRouter(store: TaskSource, settings: () => PMSettings) {
  const r = new Router()

  // GET /api/v2/projects/:projectId/tasks/:parentId/subtasks
  r.get('/projects/:projectId/tasks/:parentId/subtasks', async (_req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const parent = findTaskById(project.tasks, p.parentId)
    if (!parent) return httpError(res, 404, 'Task not found')
    json(res, parent.subtasks ?? [])
  })

  // POST /api/v2/projects/:projectId/tasks/:parentId/subtasks
  r.post('/projects/:projectId/tasks/:parentId/subtasks', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const parent = findTaskById(project.tasks, p.parentId)
    if (!parent) return httpError(res, 404, 'Task not found')
    const body = await readBody(req) as Partial<Task>
    const task = makeTask(body)
    await store.insertTask(project, task, p.parentId)
    json(res, task, 201)
  })

  // PUT /api/v2/projects/:projectId/tasks/:parentId/subtasks/:subtaskId
  r.put('/projects/:projectId/tasks/:parentId/subtasks/:subtaskId', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.subtaskId)
    if (!task) return httpError(res, 404, 'Subtask not found')
    const body = await readBody(req) as Partial<Task>
    await store.updateTask(project, p.subtaskId, body)
    json(res, task)
  })

  // DELETE /api/v2/projects/:projectId/tasks/:parentId/subtasks/:subtaskId
  r.delete('/projects/:projectId/tasks/:parentId/subtasks/:subtaskId', async (_req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.subtaskId)
    if (!task) return httpError(res, 404, 'Subtask not found')
    await store.deleteTask(project, p.subtaskId)
    noContent(res)
  })

  return r
}

// ── Versions ──────────────────────────────────────────────────────────────────
function versionsRouter(store: TaskSource, settings: () => PMSettings) {
  const r = new Router()

  // GET /api/v2/projects/:projectId/versions
  r.get('/projects/:projectId/versions', async (_req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    json(res, project.versions)
  })

  // POST /api/v2/projects/:projectId/versions
  r.post('/projects/:projectId/versions', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const body = await readBody(req) as Partial<Version> & { name: string }
    if (!body?.name) return httpError(res, 400, 'name is required')
    const version: Version = {
      id: randomUUID().slice(0, 8),
      name: body.name,
      description: body.description ?? '',
      plannedReleaseDate: body.plannedReleaseDate ?? '',
      releasedAt: '',
      taskIds: [],
      createdAt: new Date().toISOString()
    }
    await store.createVersion(project, version)
    json(res, version, 201)
  })

  // PUT /api/v2/projects/:projectId/versions/:vid
  r.put('/projects/:projectId/versions/:vid', async (req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const version = project.versions.find((v) => v.id === p.vid)
    if (!version) return httpError(res, 404, 'Version not found')
    const body = await readBody(req) as Partial<Version>
    await store.updateVersion(project, p.vid, body)
    json(res, version)
  })

  // DELETE /api/v2/projects/:projectId/versions/:vid
  r.delete('/projects/:projectId/versions/:vid', async (_req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    await store.deleteVersion(project, p.vid)
    noContent(res)
  })

  // POST /api/v2/projects/:projectId/versions/:vid/release
  r.post('/projects/:projectId/versions/:vid/release', async (_req, res, p) => {
    const project = await loadProject(store, settings(), p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const version = project.versions.find((v) => v.id === p.vid)
    if (!version) return httpError(res, 404, 'Version not found')
    await store.releaseVersion(project, p.vid)
    json(res, version)
  })

  return r
}

// ── Server ────────────────────────────────────────────────────────────────────
let server: http.Server | null = null

export function startApiServer(store: TaskSource, settings: () => PMSettings, port: number): void {
  if (server) return

  const pr = projectsRouter(store, settings)
  const tr = tasksRouter(store, settings)
  const sr = subtasksRouter(store, settings)
  const vr = versionsRouter(store, settings)

  server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      })
      res.end()
      return
    }

    const url = req.url ?? '/'

    // Strip /api/v2 prefix for routing
    const path = url.replace(/^\/api\/v2/, '') || '/'
    const prefixReq = { ...req, url }

    try {
      await pr.handle(prefixReq, res)
      if (res.writableEnded) return
      await tr.handle(prefixReq, res)
      if (res.writableEnded) return
      await sr.handle(prefixReq, res)
      if (res.writableEnded) return
      await vr.handle(prefixReq, res)
    } catch (e) {
      httpError(res, 500, String(e))
    }
  })

  server.listen(port, () => {
    console.log(`[PMX API v2] http://localhost:${port}/api/v2`)
  })
}

export function stopApiServer(): void {
  server?.close()
  server = null
}
