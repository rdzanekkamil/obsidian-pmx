import http from 'http'
import type { TaskSource } from '../store/TaskSource'
import type { PMSettings, Task } from '../types'
import { flattenTasks } from '../store/TaskTreeOps'
import { findTaskById } from '../store/TaskIndex'
import { makeTask } from '../types'

// ── Minimal router (no external deps) ───────────────────────────────────────
type Params = Record<string, string>
type Handler = (req: http.IncomingMessage, res: http.ServerResponse, params: Params) => void | Promise<void>

class Router {
  private routes: { method: string; path: string | RegExp; handler: Handler }[] = []

  get(path: string | RegExp, handler: Handler) { this.routes.push({ method: 'GET', path, handler }); return this }
  post(path: string | RegExp, handler: Handler) { this.routes.push({ method: 'POST', path, handler }); return this }
  put(path: string | RegExp, handler: Handler) { this.routes.push({ method: 'PUT', path, handler }); return this }
  delete(path: string | RegExp, handler: Handler) { this.routes.push({ method: 'DELETE', path, handler }); return this }
  use(handler: Handler) { this.routes.push({ method: '*', path: '*', handler }); return this }

  async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? '/'
    const method = req.method ?? 'GET'
    for (const route of this.routes) {
      if (route.method !== '*' && route.method !== method) continue
      const params = this.match(route.path, url)
      if (params !== null) {
        await route.handler(req, res, params)
        return
      }
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
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

// ── Helpers ──────────────────────────────────────────────────────────────────
function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
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

// ── OpenAPI spec + Swagger UI ────────────────────────────────────────────────
const SPEC = {
  openapi: '3.0.3',
  info: { title: 'Project ManagerX REST API', version: '1.0.0', description: 'CRUD API for Projects, Tasks, and Subtasks.' },
  servers: [{ url: 'http://localhost:{port}', variables: { port: { default: '17171' } } }],
  paths: {
    '/projects': { get: { summary: 'List all projects (no tasks)', tags: ['Projects'], responses: { 200: { description: 'Array of project summaries' } } }, post: { summary: 'Create a project', tags: ['Projects'], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } } } } }, responses: { 201: { description: 'Created project' } } } },
    '/projects/{id}': { get: { summary: 'Get a project (use ?includeTasks=true for tasks)', tags: ['Projects'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'includeTasks', in: 'query', schema: { type: 'string', enum: ['true'] }, description: 'Include tasks' }], responses: { 200: { description: 'Project' }, 404: { description: 'Not found' } } }, put: { summary: 'Update a project', tags: ['Projects'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated project' } } }, delete: { summary: 'Delete a project', tags: ['Projects'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } } },
    '/projects/{projectId}/tasks': { get: { summary: 'List tasks (flattened)', tags: ['Tasks'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Array of tasks' } } }, post: { summary: 'Create a task', tags: ['Tasks'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 201: { description: 'Created task' } } } },
    '/projects/{projectId}/tasks/{taskId}': { get: { summary: 'Get a task', tags: ['Tasks'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Task' } } }, put: { summary: 'Update a task', tags: ['Tasks'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Updated task' } } }, delete: { summary: 'Delete a task', tags: ['Tasks'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } } },
    '/projects/{projectId}/tasks/{taskId}/subtasks': { post: { summary: 'Add subtask', tags: ['Subtasks'], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 201: { description: 'Created subtask' } } } }
  }
}

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Project ManagerX API</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 24px; color: #333; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 8px; }
  h2 { font-size: 1rem; font-weight: 600; margin: 24px 0 8px; }
  p { font-size: 0.875rem; color: #666; line-height: 1.6; }
  a { color: #5c6bc0; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 0.875em; }
  pre { background: #f5f5f5; padding: 16px; border-radius: 8px; font-size: 0.8rem; overflow-x: auto; }
  hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }
  .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-bottom: 16px; }
</style>
</head>
<body>
  <div class="badge">v1.0.0</div>
  <h1>Project ManagerX REST API</h1>
  <p>Serve your projects and tasks over HTTP. Full OpenAPI spec below.</p>

  <h2>OpenAPI spec</h2>
  <p>Copy the URL below and paste into:</p>
  <pre>${window.location.origin}/swagger.json</pre>
  <p>
    <a href="https://petstore.swagger.io/" target="_blank">Swagger Editor</a> ·
    <a href="https://hoppscotch.io/" target="_blank">Hoppscotch</a> ·
    <a href="https://insomnia.rest/" target="_blank">Insomnia</a>
  </p>

  <hr>
  <h2>Endpoints</h2>
  <p><strong>Projects</strong></p>
  <pre>GET    /projects               List all (no tasks)
GET    /projects/:id            Get one (use ?includeTasks=true)
POST   /projects               Create
PUT    /projects/:id           Update
DELETE /projects/:id           Delete</pre>
  <p><strong>Tasks</strong></p>
  <pre>GET    /projects/:id/tasks           All tasks flattened
GET    /projects/:id/tasks/:tid       Get one
POST   /projects/:id/tasks            Create
PUT    /projects/:id/tasks/:tid       Update
DELETE /projects/:id/tasks/:tid      Delete</pre>
  <p><strong>Subtasks</strong></p>
  <pre>POST   /projects/:id/tasks/:tid/subtasks  Add subtask</pre>
</body>
</html>`

// ── Projects router ──────────────────────────────────────────────────────────
function projectsRouter(store: TaskSource, settings: () => PMSettings) {
  const r = new Router()
  r.get('/projects', async (_req, res) => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const list = projects.map(({ id, title, path, created, updated }: { id: string; title: string; path: string; created: number; updated: number }) => ({ id, title, path, created, updated }))
    json(res, list)
  })
  r.get('/projects/:id', async (req, res, p) => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const project = projects.find((x: { id: string }) => x.id === p.id)
    if (!project) return httpError(res, 404, 'Project not found')
    const url = new URL(req.url ?? '', 'http://localhost')
    if (url.searchParams.get('includeTasks') === 'true') {
      json(res, project)
    } else {
      const { id, title, path, created, updated } = project
      json(res, { id, title, path, created, updated })
    }
  })
  r.post('/projects', async (req, res) => {
    const body = await readBody(req) as { title?: string }
    if (!body?.title) return httpError(res, 400, 'title is required')
    json(res, await store.createProject(body.title, settings().projectsFolder), 201)
  })
  r.put('/projects/:id', async (req, res, p) => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const project = projects.find((x: { id: string }) => x.id === p.id)
    if (!project) return httpError(res, 404, 'Project not found')
    const body = await readBody(req)
    await store.updateProject(project, body as Parameters<typeof store.updateProject>[1])
    json(res, project)
  })
  r.delete('/projects/:id', async (_req, res, p) => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const project = projects.find((x: { id: string }) => x.id === p.id)
    if (!project) return httpError(res, 404, 'Project not found')
    await store.deleteProject(project)
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
    res.end()
  })
  return r
}

// ── Tasks router ─────────────────────────────────────────────────────────────
function tasksRouter(store: TaskSource, settings: () => PMSettings) {
  const r = new Router()
  async function getProject(id: string) {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    return projects.find((x: { id: string }) => x.id === id) ?? null
  }
  r.get('/projects/:projectId/tasks', async (_req, res, p) => {
    const project = await getProject(p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    json(res, flattenTasks(project.tasks).map((f: { task: Task }) => f.task))
  })
  r.get('/projects/:projectId/tasks/:taskId', async (_req, res, p) => {
    const project = await getProject(p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    json(res, task)
  })
  r.post('/projects/:projectId/tasks', async (req, res, p) => {
    const project = await getProject(p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const body = await readBody(req)
    const task = makeTask(body as Parameters<typeof makeTask>[0])
    await store.insertTask(project, task)
    json(res, task, 201)
  })
  r.put('/projects/:projectId/tasks/:taskId', async (req, res, p) => {
    const project = await getProject(p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    const body = await readBody(req)
    await store.updateTask(project, p.taskId, body as Parameters<typeof store.updateTask>[2])
    json(res, task)
  })
  r.delete('/projects/:projectId/tasks/:taskId', async (_req, res, p) => {
    const project = await getProject(p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    await store.deleteTask(project, p.taskId)
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
    res.end()
  })
  return r
}

// ── Subtasks router ──────────────────────────────────────────────────────────
function subtasksRouter(store: TaskSource, settings: () => PMSettings) {
  const r = new Router()
  async function getProject(id: string) {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    return projects.find((x: { id: string }) => x.id === id) ?? null
  }
  r.post('/projects/:projectId/tasks/:taskId/subtasks', async (req, res, p) => {
    const project = await getProject(p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    if (!findTaskById(project.tasks, p.taskId)) return httpError(res, 404, 'Task not found')
    const body = await readBody(req)
    const task = makeTask(body as Parameters<typeof makeTask>[0])
    await store.insertTask(project, task, p.taskId)
    json(res, task, 201)
  })
  r.put('/projects/:projectId/tasks/:taskId', async (req, res, p) => {
    const project = await getProject(p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    const body = await readBody(req)
    await store.updateTask(project, p.taskId, body as Parameters<typeof store.updateTask>[2])
    json(res, task)
  })
  r.delete('/projects/:projectId/tasks/:taskId', async (_req, res, p) => {
    const project = await getProject(p.projectId)
    if (!project) return httpError(res, 404, 'Project not found')
    const task = findTaskById(project.tasks, p.taskId)
    if (!task) return httpError(res, 404, 'Task not found')
    await store.deleteTask(project, p.taskId)
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
    res.end()
  })
  return r
}

// ── Server ───────────────────────────────────────────────────────────────────
let server: http.Server | null = null

export function startApiServer(store: TaskSource, settings: () => PMSettings, port: number): void {
  if (server) return

  const pr = projectsRouter(store, settings)
  const tr = tasksRouter(store, settings)
  const sr = subtasksRouter(store, settings)

  server = http.createServer(async (req, res) => {
    // CORS preflight
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    const url = req.url ?? '/'
    if (url === '/swagger.json') { json(res, SPEC); return }
    if (url === '/' || url.startsWith('/swagger-ui')) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(SWAGGER_HTML)
      return
    }

    try {
      // Try each router in order
      await pr.handle(req, res)
      if (res.writableEnded) return
      await tr.handle(req, res)
      if (res.writableEnded) return
      await sr.handle(req, res)
    } catch (e) {
      httpError(res, 500, String(e))
    }
  })

  server.listen(port, () => { console.log(`[PMX API] http://localhost:${port}`) })
}

export function stopApiServer(): void {
  server?.close()
  server = null
}
