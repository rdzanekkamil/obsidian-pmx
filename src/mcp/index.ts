import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { TaskSource } from '../store/TaskSource'
import type { PMSettings } from '../types'
import { flattenTasks } from '../store/TaskTreeOps'

let server: ReturnType<typeof http.createServer> | null = null
const sessions = new Map<string, EventEmitter>()

// ── MCP Protocol helpers ──────────────────────────────────────────────────────

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id'
  })
  res.end(JSON.stringify(body))
}

function textResponse(res: ServerResponse, status: number, text: string, contentType = 'text/event-stream'): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id',
    'X-Accel-Buffering': 'no'
  })
  res.write(text)
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function sendResult(sessionId: string, requestId: string | number, result: unknown): void {
  const emitter = sessions.get(sessionId)
  if (!emitter) return
  emitter.emit('data', sseEvent('message', { jsonrpc: '2.0', id: requestId, result }))
}

function sendError(sessionId: string, requestId: string | number, code: number, message: string): void {
  const emitter = sessions.get(sessionId)
  if (!emitter) return
  emitter.emit('data', sseEvent('message', { jsonrpc: '2.0', id: requestId, error: { code, message } }))
}

function sendNotification(sessionId: string, method: string, params: unknown): void {
  const emitter = sessions.get(sessionId)
  if (!emitter) return
  emitter.emit('data', sseEvent('message', { jsonrpc: '2.0', method, params }))
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function buildToolResult(
  sessionId: string,
  method: string,
  params: unknown,
  store: TaskSource,
  settings: PMSettings
): Promise<unknown> {
  const p = params as Record<string, unknown>

  switch (method) {
    case 'initialize':
    case 'ping':
      return method === 'initialize'
        ? { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'project-managerx', version: '1.0.0' } }
        : {}

    case 'tools/list':
      return {
        tools: [
          { name: 'list_projects', description: 'List all projects.', inputSchema: { type: 'object', properties: {} } },
          { name: 'get_project', description: 'Get project details.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, includeTasks: { type: 'boolean' } }, required: ['id'] } },
          { name: 'create_project', description: 'Create a new project.', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
          { name: 'list_tasks', description: 'List tasks in a project.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
          { name: 'create_task', description: 'Create a task.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, due: { type: 'string' }, assignees: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } }, dependencies: { type: 'array', items: { type: 'string' } }, url: { type: 'string' }, goal: { type: 'string' }, blocker: { type: 'string' }, result: { type: 'string' }, acceptanceCriteria: { type: 'string' }, versionId: { type: 'string' } }, required: ['projectId', 'title'] } },
          { name: 'update_task', description: 'Update a task.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, status: { type: 'string' }, priority: { type: 'string' }, due: { type: 'string' }, progress: { type: 'number' }, assignees: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } }, dependencies: { type: 'array', items: { type: 'string' } }, url: { type: 'string' }, goal: { type: 'string' }, blocker: { type: 'string' }, result: { type: 'string' }, acceptanceCriteria: { type: 'string' }, versionId: { type: 'string' } }, required: ['projectId', 'taskId'] } },
          { name: 'get_project_config', description: 'Get project config (customFields, statuses, priorities).', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
          { name: 'set_project_custom_fields', description: 'Set project customFields definitions.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, customFields: { type: 'array' } }, required: ['id', 'customFields'] } },
          { name: 'list_versions', description: 'List versions in a project.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
          { name: 'create_version', description: 'Create a version.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, plannedReleaseDate: { type: 'string' } }, required: ['projectId', 'name'] } },
          { name: 'release_version', description: 'Release a version.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' } }, required: ['projectId', 'versionId'] } },
          { name: 'assign_tasks_to_version', description: 'Assign tasks to a version.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' }, taskIds: { type: 'array', items: { type: 'string' } } }, required: ['projectId', 'versionId', 'taskIds'] } }
        ]
      }

    case 'tools/call': {
      const { name, arguments: args = {} } = p as { name: string; arguments: Record<string, unknown> }
      switch (name) {
        case 'list_projects': {
          const projects = await store.loadAllProjects(settings.projectsFolder)
          return { content: [{ type: 'text', text: JSON.stringify(projects.map(({ id, title, description }) => ({ id, title, description })), null, 2) }] }
        }
        case 'get_project': {
          const { id, includeTasks } = args as { id: string; includeTasks?: boolean }
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === id)
          if (!project) throw new Error('Project not found')
          const data = includeTasks ? project : { id: project.id, title: project.title, description: project.description }
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
        }
        case 'create_project': {
          const { title } = args as { title: string }
          if (!title?.trim()) throw new Error('title is required')
          const project = await store.createProject(title, settings.projectsFolder)
          return { content: [{ type: 'text', text: JSON.stringify({ id: project.id, title: project.title }, null, 2) }] }
        }
        case 'list_tasks': {
          const { projectId } = args as { projectId: string }
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === projectId)
          if (!project) throw new Error('Project not found')
          return { content: [{ type: 'text', text: JSON.stringify(flattenTasks(project.tasks).map((f: { task: unknown }) => f.task), null, 2) }] }
        }
        case 'create_task': {
          const {
            projectId, title, description = '', status = 'todo', priority = 'medium', due = '', start = '',
            progress = 0, assignees = [], tags = [], dependencies = [], url = '', goal = '',
            blocker = '', result = '', acceptanceCriteria = ''
          } = args as Record<string, unknown>
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === projectId)
          if (!project) throw new Error('Project not found')
          const task = {
            id: randomUUID().slice(0, 8), title: String(title), description: String(description),
            status: String(status), priority: String(priority), type: 'task' as const,
            start: String(start), due: String(due), progress: Number(progress), completed: '',
            assignees: Array.isArray(assignees) ? assignees.map(String) : [],
            tags: Array.isArray(tags) ? tags.map(String) : [], subtasks: [], dependencies: Array.isArray(dependencies) ? dependencies.map(String) : [],
            customFields: {}, collapsed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            url: String(url), goal: String(goal), blocker: String(blocker), result: String(result),
            acceptanceCriteria: String(acceptanceCriteria)
          }
          await store.insertTask(project, task)
          return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] }
        }
        case 'update_task': {
          const {
            projectId, taskId, title, description, status, priority, due, start, progress,
            assignees, tags, dependencies, url, goal, blocker, result, acceptanceCriteria
          } = args as Record<string, unknown>
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === projectId)
          if (!project) throw new Error('Project not found')
          const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
          if (title !== undefined) patch.title = String(title)
          if (description !== undefined) patch.description = String(description)
          if (status !== undefined) patch.status = String(status)
          if (priority !== undefined) patch.priority = String(priority)
          if (due !== undefined) patch.due = String(due)
          if (start !== undefined) patch.start = String(start)
          if (progress !== undefined) patch.progress = Number(progress)
          if (assignees !== undefined) patch.assignees = Array.isArray(assignees) ? assignees.map(String) : []
          if (tags !== undefined) patch.tags = Array.isArray(tags) ? tags.map(String) : []
          if (dependencies !== undefined) patch.dependencies = Array.isArray(dependencies) ? dependencies.map(String) : []
          if (url !== undefined) patch.url = String(url)
          if (goal !== undefined) patch.goal = String(goal)
          if (blocker !== undefined) patch.blocker = String(blocker)
          if (result !== undefined) patch.result = String(result)
          if (acceptanceCriteria !== undefined) patch.acceptanceCriteria = String(acceptanceCriteria)
          await store.updateTask(project, String(taskId), patch as never)
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, taskId, patch }, null, 2) }] }
        }
        case 'get_project_config': {
          const { id } = args as { id: string }
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === id)
          if (!project) throw new Error('Project not found')
          const cfg = store.configFor(project)
          return { content: [{ type: 'text', text: JSON.stringify({
            customFields: project.customFields,
            statuses: cfg.statuses,
            priorities: cfg.priorities
          }, null, 2) }] }
        }
        case 'set_project_custom_fields': {
          const { id, customFields } = args as { id: string; customFields: unknown[] }
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === id)
          if (!project) throw new Error('Project not found')
          await store.updateProject(project, { customFields: customFields as never })
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, customFields }, null, 2) }] }
        }
        case 'list_versions': {
          const { projectId } = args as { projectId: string }
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === projectId)
          if (!project) throw new Error('Project not found')
          return { content: [{ type: 'text', text: JSON.stringify(project.versions, null, 2) }] }
        }
        case 'create_version': {
          const { projectId, name, description = '', plannedReleaseDate = '' } = args as Record<string, unknown>
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === projectId)
          if (!project) throw new Error('Project not found')
          const version = { id: randomUUID().slice(0, 8), name: String(name), description: String(description), plannedReleaseDate: String(plannedReleaseDate), releasedAt: '', taskIds: [], createdAt: new Date().toISOString() }
          await store.createVersion(project, version as never)
          return { content: [{ type: 'text', text: JSON.stringify(version, null, 2) }] }
        }
        case 'release_version': {
          const { projectId, versionId } = args as { projectId: string; versionId: string }
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === projectId)
          if (!project) throw new Error('Project not found')
          await store.releaseVersion(project, versionId)
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, versionId }, null, 2) }] }
        }
        case 'assign_tasks_to_version': {
          const { projectId, versionId, taskIds } = args as { projectId: string; versionId: string; taskIds: string[] }
          const projects = await store.loadAllProjects(settings.projectsFolder)
          const project = projects.find((x: { id: string }) => x.id === projectId)
          if (!project) throw new Error('Project not found')
          await store.assignTasksToVersion(project, versionId, taskIds)
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, versionId, taskIds }, null, 2) }] }
        }
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    }

    case 'resources/list':
      return {
        resources: [
          { uri: 'pmx://projects', name: 'All projects', mimeType: 'application/json' },
          { uri: 'pmx://statuses', name: 'Task statuses', mimeType: 'application/json' },
          { uri: 'pmx://priorities', name: 'Task priorities', mimeType: 'application/json' }
        ]
      }

    case 'resources/read': {
      const { uri } = p as { uri: string }
      let text = ''
      if (uri === 'pmx://projects') {
        const projects = await store.loadAllProjects(settings.projectsFolder)
        text = JSON.stringify(projects.map(({ id, title, description }) => ({ id, title, description })))
      } else if (uri === 'pmx://statuses') {
        text = JSON.stringify(settings.statuses)
      } else if (uri === 'pmx://priorities') {
        text = JSON.stringify(settings.priorities)
      }
      return { contents: [{ uri, mimeType: 'application/json', text }] }
    }

    default:
      throw new Error(`Method not found: ${method}`)
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

export function startMcpServer(store: TaskSource, settings: () => PMSettings, port: number): void {
  if (server) return

  server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/'

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id'
      })
      res.end()
      return
    }

    // POST /mcp — JSON-RPC request
    if (req.method === 'POST' && url === '/mcp') {
      let body = ''
      for await (const chunk of req) body += chunk
      let parsed: { id?: string | number; method: string; params?: unknown }
      try { parsed = JSON.parse(body) } catch { jsonResponse(res, 400, { error: 'Invalid JSON' }); return }

      const sessionId = req.headers['mcp-session-id'] as string | undefined

      if (!sessionId) {
        // First request — create session and return ID in header
        const newId = randomUUID()
        const emitter = new EventEmitter()
        emitter.setMaxListeners(100)
        sessions.set(newId, emitter)
        try {
          const result = await buildToolResult(newId, parsed.method, parsed.params ?? {}, store, settings())
          res.setHeader('Mcp-Session-Id', newId)
          jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, result })
        } catch (err) {
          res.setHeader('Mcp-Session-Id', newId)
          jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32603, message: String(err) } })
        }
        return
      }

      if (!sessions.has(sessionId)) {
        const emitter = new EventEmitter()
        emitter.setMaxListeners(100)
        sessions.set(sessionId, emitter)
      }

      // Return JSON directly — client is waiting for HTTP response
      try {
        const result = await buildToolResult(sessionId, parsed.method, parsed.params ?? {}, store, settings())
        jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, result })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.startsWith('Method not found')) {
          jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32601, message: msg } })
        } else {
          jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32603, message: msg } })
        }
      }
      return
    }

    // GET /mcp — SSE stream
    if (req.method === 'GET' && url === '/mcp') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid or missing session' }))
        return
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id'
      })

      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n')
      }, 15000)

      const emitter = sessions.get(sessionId)!
      const onData = (data: string) => { res.write(data) }
      emitter.on('data', onData)

      req.on('close', () => {
        clearInterval(heartbeat)
        emitter.off('data', onData)
      })
      return
    }

    // DELETE /mcp — close session
    if (req.method === 'DELETE' && url === '/mcp') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (sessionId) {
        sessions.delete(sessionId)
      }
      res.writeHead(204)
      res.end()
      return
    }

    // Landing page
    if (req.method === 'GET' && url === '/') {
      const cfg = settings()
      const endpoint = `http://localhost:${cfg.mcpPort}/mcp`
      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>PMX MCP Server</title>
<style>body{font-family:system-ui;max-width:600px;margin:60px auto;padding:0 20px}
h1{color:#8b72be}code{background:#f0f0f0;padding:2px 6px;border-radius:4px}
pre{background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;overflow-x:auto}
button{background:#8b72be;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;margin-top:8px}
</style></head>
<body>
<h1>PMX MCP Server</h1>
<p>Project ManagerX MCP endpoint</p>
<p><strong>Endpoint:</strong></p>
<pre id="url">${endpoint}</pre>
<button onclick="navigator.clipboard.writeText(document.getElementById('url').textContent)">Copy URL</button>
<p><strong>Protocol:</strong> JSON-RPC 2.0 over SSE</p>
<p><strong>Usage:</strong></p>
<pre>1. Client opens GET /mcp with Mcp-Session-Id header → SSE stream
2. Client sends POST /mcp with same Mcp-Session-Id + JSON body
3. Responses arrive as SSE events on the GET stream</pre>
</body></html>`
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
      return
    }

    jsonResponse(res, 404, { error: 'Not found' })
  })

  server.listen(port, () => {
    console.log(`[PMX MCP] http://localhost:${port}/mcp`)
  })
}

export function stopMcpServer(): void {
  sessions.clear()
  server?.close()
  server = null
}
