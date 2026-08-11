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

async function handleToolRequest(
  sessionId: string,
  requestId: string | number,
  method: string,
  params: unknown,
  store: TaskSource,
  settings: PMSettings
): Promise<void> {
  const p = params as Record<string, unknown>

  switch (method) {
    case 'tools/list': {
      sendResult(sessionId, requestId, {
        tools: [
          { name: 'list_projects', description: 'List all projects.', inputSchema: { type: 'object', properties: {} } },
          { name: 'get_project', description: 'Get project details.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, includeTasks: { type: 'boolean' } }, required: ['id'] } },
          { name: 'create_project', description: 'Create a new project.', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
          { name: 'list_tasks', description: 'List tasks in a project.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
          { name: 'create_task', description: 'Create a task.', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, title: { type: 'string' } }, required: ['projectId', 'title'] } }
        ]
      })
      break
    }

    case 'tools/call': {
      const { name, arguments: args = {} } = p as { name: string; arguments: Record<string, unknown> }
      try {
        let result: unknown
        switch (name) {
          case 'list_projects': {
            const projects = await store.loadAllProjects(settings.projectsFolder)
            result = { content: [{ type: 'text', text: JSON.stringify(projects.map(({ id, title, description }) => ({ id, title, description })), null, 2) }] }
            break
          }
          case 'get_project': {
            const { id, includeTasks } = args as { id: string; includeTasks?: boolean }
            const projects = await store.loadAllProjects(settings.projectsFolder)
            const project = projects.find((x: { id: string }) => x.id === id)
            if (!project) { sendError(sessionId, requestId, -32602, 'Project not found'); return }
            const data = includeTasks ? project : { id: project.id, title: project.title, description: project.description }
            result = { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
            break
          }
          case 'create_project': {
            const { title } = args as { title: string }
            if (!title?.trim()) { sendError(sessionId, requestId, -32602, 'title is required'); return }
            const project = await store.createProject(title, settings.projectsFolder)
            result = { content: [{ type: 'text', text: JSON.stringify({ id: project.id, title: project.title }, null, 2) }] }
            break
          }
          case 'list_tasks': {
            const { projectId } = args as { projectId: string }
            const projects = await store.loadAllProjects(settings.projectsFolder)
            const project = projects.find((x: { id: string }) => x.id === projectId)
            if (!project) { sendError(sessionId, requestId, -32602, 'Project not found'); return }
            result = { content: [{ type: 'text', text: JSON.stringify(flattenTasks(project.tasks).map((f: { task: unknown }) => f.task), null, 2) }] }
            break
          }
          case 'create_task': {
            const { projectId, title } = args as { projectId: string; title: string }
            const projects = await store.loadAllProjects(settings.projectsFolder)
            const project = projects.find((x: { id: string }) => x.id === projectId)
            if (!project) { sendError(sessionId, requestId, -32602, 'Project not found'); return }
            const task = {
              id: randomUUID().slice(0, 8), title, description: '', status: 'todo', priority: 'medium', type: 'task' as const,
              start: '', due: '', progress: 0, completed: '', assignees: [], tags: [], subtasks: [], dependencies: [],
              customFields: {}, collapsed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            }
            await store.insertTask(project, task)
            result = { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] }
            break
          }
          default:
            sendError(sessionId, requestId, -32601, `Unknown tool: ${name}`)
            return
        }
        sendResult(sessionId, requestId, result)
      } catch (err) {
        sendError(sessionId, requestId, -32603, String(err))
      }
      break
    }

    case 'resources/list': {
      sendResult(sessionId, requestId, {
        resources: [
          { uri: 'pmx://projects', name: 'All projects', mimeType: 'application/json' },
          { uri: 'pmx://statuses', name: 'Task statuses', mimeType: 'application/json' },
          { uri: 'pmx://priorities', name: 'Task priorities', mimeType: 'application/json' }
        ]
      })
      break
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
      sendResult(sessionId, requestId, { contents: [{ uri, mimeType: 'application/json', text }] })
      break
    }

    case 'initialize': {
      sendResult(sessionId, requestId, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'project-managerx', version: '1.0.0' }
      })
      sendNotification(sessionId, 'notifications/initialized', {})
      break
    }

    case 'ping':
      sendResult(sessionId, requestId, {})
      break

    default:
      sendError(sessionId, requestId, -32601, `Method not found: ${method}`)
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
      const sessionId = req.headers['mcp-session-id'] as string | undefined

      let body = ''
      for await (const chunk of req) body += chunk
      let parsed: { id?: string | number; method: string; params?: unknown }
      try { parsed = JSON.parse(body) } catch { jsonResponse(res, 400, { error: 'Invalid JSON' }); return }

      if (!sessionId) {
        jsonResponse(res, 400, { error: 'Missing Mcp-Session-Id header' })
        return
      }

      if (parsed.method === 'initialize' || !sessions.has(sessionId)) {
        // Initialize or reconnect — start/keep session
        const emitter = new EventEmitter()
        emitter.setMaxListeners(100)
        sessions.set(sessionId, emitter)
      }

      await handleToolRequest(sessionId, parsed.id ?? '', parsed.method, parsed.params ?? {}, store, settings())
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
