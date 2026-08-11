import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { TaskSource } from '../store/TaskSource'
import type { PMSettings, Project, Task, Version } from '../types'
import { flattenTasks } from '../store/TaskTreeOps'
import { findTaskById } from '../store/TaskIndex'
import { makeTask, makeProject } from '../types'

// ── Tool registry ─────────────────────────────────────────────────────────────
type ToolHandler = (params: Record<string, unknown>, store: TaskSource, settings: PMSettings) => Promise<unknown>

const tools: Record<string, ToolHandler> = {}

// ── Project tools ─────────────────────────────────────────────────────────────
tools['list_projects'] = async (_p, store, settings) => {
  const projects = await store.loadAllProjects(settings.projectsFolder)
  return projects.map((p) => ({
    id: p.id, title: p.title, description: p.description,
    color: p.color, icon: p.icon,
    taskCount: flattenTasks(p.tasks).length, versionCount: p.versions.length,
    createdAt: p.created, updatedAt: p.updated
  }))
}

tools['get_project'] = async (p, store) => {
  const { id } = p as { id: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === id)
  if (!project) throw new Error('Project not found')
  return project
}

tools['create_project'] = async (p, store, settings) => {
  const { title, description, color, icon } = p as { title: string; description?: string; color?: string; icon?: string }
  if (!title?.trim()) throw new Error('title is required')
  const slug = title.replace(/[\\/:*?"<>|]/g, '-')
  const project = makeProject(title, `${settings.projectsFolder}/${slug}.md`)
  if (description) project.description = description
  if (color) project.color = color
  if (icon) project.icon = icon
  await store.ensureFolder(settings.projectsFolder)
  await store.saveProject(project)
  return project
}

tools['update_project'] = async (p, store) => {
  const { id, ...patch } = p as { id: string } & Partial<Project>
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === id)
  if (!project) throw new Error('Project not found')
  await store.updateProject(project, patch)
  return project
}

tools['delete_project'] = async (p, store) => {
  const { id } = p as { id: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === id)
  if (!project) throw new Error('Project not found')
  await store.deleteProject(project)
  return { ok: true }
}

// ── Task tools ────────────────────────────────────────────────────────────────
tools['list_tasks'] = async (p, store) => {
  const { projectId } = p as { projectId: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  return flattenTasks(project.tasks).map((f) => f.task)
}

tools['get_task'] = async (p, store) => {
  const { projectId, taskId } = p as { projectId: string; taskId: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const task = findTaskById(project.tasks, taskId)
  if (!task) throw new Error('Task not found')
  return task
}

tools['create_task'] = async (p, store) => {
  const { projectId, parentId, ...rest } = p as { projectId: string; parentId?: string } & Partial<Task>
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const task = makeTask(rest as Partial<Task>)
  await store.insertTask(project, task, parentId ?? null)
  return task
}

tools['update_task'] = async (p, store) => {
  const { projectId, taskId, ...patch } = p as { projectId: string; taskId: string } & Partial<Task>
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const task = findTaskById(project.tasks, taskId)
  if (!task) throw new Error('Task not found')
  await store.updateTask(project, taskId, patch as Partial<Task>)
  return task
}

tools['delete_task'] = async (p, store) => {
  const { projectId, taskId } = p as { projectId: string; taskId: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  await store.deleteTask(project, taskId)
  return { ok: true }
}

tools['change_task_status'] = async (p, store) => {
  const { projectId, taskId, status } = p as { projectId: string; taskId: string; status: string }
  if (!status) throw new Error('status is required')
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const task = findTaskById(project.tasks, taskId)
  if (!task) throw new Error('Task not found')
  await store.updateTask(project, taskId, { status })
  return task
}

tools['assign_task_version'] = async (p, store) => {
  const { projectId, taskId, versionId } = p as { projectId: string; taskId: string; versionId: string | null }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const task = findTaskById(project.tasks, taskId)
  if (!task) throw new Error('Task not found')
  await store.updateTask(project, taskId, { versionId: versionId ?? undefined } as Partial<Task>)
  return task
}

// ── Subtask tools ─────────────────────────────────────────────────────────────
tools['list_subtasks'] = async (p, store) => {
  const { projectId, parentId } = p as { projectId: string; parentId: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const parent = findTaskById(project.tasks, parentId)
  if (!parent) throw new Error('Task not found')
  return parent.subtasks ?? []
}

tools['create_subtask'] = async (p, store) => {
  const { projectId, parentId, ...rest } = p as { projectId: string; parentId: string } & Partial<Task>
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const parent = findTaskById(project.tasks, parentId)
  if (!parent) throw new Error('Parent task not found')
  const task = makeTask(rest as Partial<Task>)
  await store.insertTask(project, task, parentId)
  return task
}

tools['update_subtask'] = async (p, store) => {
  const { projectId, subtaskId, ...patch } = p as { projectId: string; subtaskId: string } & Partial<Task>
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const task = findTaskById(project.tasks, subtaskId)
  if (!task) throw new Error('Subtask not found')
  await store.updateTask(project, subtaskId, patch as Partial<Task>)
  return task
}

tools['delete_subtask'] = async (p, store) => {
  const { projectId, subtaskId } = p as { projectId: string; subtaskId: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  await store.deleteTask(project, subtaskId)
  return { ok: true }
}

// ── Version tools ─────────────────────────────────────────────────────────────
tools['list_versions'] = async (p, store) => {
  const { projectId } = p as { projectId: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  return project.versions
}

tools['get_version'] = async (p, store) => {
  const { projectId, versionId } = p as { projectId: string; versionId: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const version = project.versions.find((v) => v.id === versionId)
  if (!version) throw new Error('Version not found')
  return version
}

tools['create_version'] = async (p, store) => {
  const { projectId, name, description, plannedReleaseDate } = p as {
    projectId: string; name: string; description?: string; plannedReleaseDate?: string
  }
  if (!name?.trim()) throw new Error('name is required')
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const version: Version = {
    id: randomUUID().slice(0, 8),
    name: name.trim(),
    description: description ?? '',
    plannedReleaseDate: plannedReleaseDate ?? '',
    releasedAt: '',
    taskIds: [],
    createdAt: new Date().toISOString()
  }
  await store.createVersion(project, version)
  return version
}

tools['update_version'] = async (p, store) => {
  const { projectId, versionId, ...patch } = p as { projectId: string; versionId: string } & Partial<Version>
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const version = project.versions.find((v) => v.id === versionId)
  if (!version) throw new Error('Version not found')
  await store.updateVersion(project, versionId, patch as Partial<Version>)
  return version
}

tools['delete_version'] = async (p, store) => {
  const { projectId, versionId } = p as { projectId: string; versionId: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  await store.deleteVersion(project, versionId)
  return { ok: true }
}

tools['release_version'] = async (p, store) => {
  const { projectId, versionId } = p as { projectId: string; versionId: string }
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  const version = project.versions.find((v) => v.id === versionId)
  if (!version) throw new Error('Version not found')
  await store.releaseVersion(project, versionId)
  return version
}

// ── Custom fields ─────────────────────────────────────────────────────────────
tools['set_project_custom_fields'] = async (p, store) => {
  const { projectId, customFields } = p as { projectId: string; customFields: Project['customFields'] }
  if (!Array.isArray(customFields)) throw new Error('customFields must be an array')
  const projects = await store.loadAllProjects('')
  const project = projects.find((x) => x.id === projectId)
  if (!project) throw new Error('Project not found')
  await store.updateProject(project, { customFields })
  return project
}

// ── Server ────────────────────────────────────────────────────────────────────
let server: ReturnType<typeof http.createServer> | null = null
const sessions = new Map<string, EventEmitter>()

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id'
  })
  res.end(JSON.stringify(body))
}

function sendError(res: ServerResponse, id: string | number | null, code: number, message: string): void {
  jsonResponse(res, 200, { jsonrpc: '2.0', id, error: { code, message } })
}

export function startMcpServer(store: TaskSource, settings: () => PMSettings, port: number): void {
  if (server) return

  server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/'

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id'
      })
      res.end()
      return
    }

    // POST — JSON-RPC request
    if (req.method === 'POST' && url === '/mcp') {
      let body = ''
      for await (const chunk of req) body += chunk
      let parsed: { id?: string | number; method: string; params?: Record<string, unknown> }
      try { parsed = JSON.parse(body) } catch { jsonResponse(res, 400, { error: 'Invalid JSON' }); return }

      const sessionId = req.headers['mcp-session-id'] as string | undefined

      if (!sessionId) {
        // First request — create session
        const newId = randomUUID()
        const emitter = new EventEmitter()
        emitter.setMaxListeners(100)
        sessions.set(newId, emitter)
        res.setHeader('Mcp-Session-Id', newId)

        if (parsed.method === 'initialize') {
          jsonResponse(res, 200, {
            jsonrpc: '2.0', id: parsed.id ?? null,
            result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'project-managerx', version: '2.0.0' } }
          })
          return
        }

        if (parsed.method === 'ping') {
          jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, result: {} })
          return
        }

        if (parsed.method === 'tools/list') {
          jsonResponse(res, 200, {
            jsonrpc: '2.0', id: parsed.id ?? null,
            result: {
              tools: [
                { name: 'list_projects', description: 'List all projects (no tasks)', inputSchema: { type: 'object', properties: {} } },
                { name: 'get_project', description: 'Get a project by id', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
                { name: 'create_project', description: 'Create a new project', inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, color: { type: 'string' }, icon: { type: 'string' } }, required: ['title'] } },
                { name: 'update_project', description: 'Update a project', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: true } },
                { name: 'delete_project', description: 'Delete a project', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
                { name: 'list_tasks', description: 'List all tasks in a project', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
                { name: 'get_task', description: 'Get a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' } }, required: ['projectId', 'taskId'] } },
                { name: 'create_task', description: 'Create a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, parentId: { type: 'string' } }, additionalProperties: true } },
                { name: 'update_task', description: 'Update a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' } }, additionalProperties: true } },
                { name: 'delete_task', description: 'Delete a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' } }, required: ['projectId', 'taskId'] } },
                { name: 'change_task_status', description: 'Change task status', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' }, status: { type: 'string' } }, required: ['projectId', 'taskId', 'status'] } },
                { name: 'assign_task_version', description: 'Assign task to a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' }, versionId: { type: 'string', nullable: true } }, required: ['projectId', 'taskId'] } },
                { name: 'list_subtasks', description: 'List subtasks of a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, parentId: { type: 'string' } }, required: ['projectId', 'parentId'] } },
                { name: 'create_subtask', description: 'Create a subtask', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, parentId: { type: 'string' } }, additionalProperties: true } },
                { name: 'update_subtask', description: 'Update a subtask', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, subtaskId: { type: 'string' } }, additionalProperties: true } },
                { name: 'delete_subtask', description: 'Delete a subtask', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, subtaskId: { type: 'string' } }, required: ['projectId', 'subtaskId'] } },
                { name: 'list_versions', description: 'List versions in a project', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
                { name: 'get_version', description: 'Get a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' } }, required: ['projectId', 'versionId'] } },
                { name: 'create_version', description: 'Create a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, plannedReleaseDate: { type: 'string' } }, required: ['projectId', 'name'] } },
                { name: 'update_version', description: 'Update a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' } }, additionalProperties: true } },
                { name: 'delete_version', description: 'Delete a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' } }, required: ['projectId', 'versionId'] } },
                { name: 'release_version', description: 'Release a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' } }, required: ['projectId', 'versionId'] } },
                { name: 'set_project_custom_fields', description: 'Set project custom fields', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, customFields: { type: 'array' } }, required: ['projectId', 'customFields'] } }
              ]
            }
          })
          return
        }

        if (parsed.method === 'tools/call') {
          const { name, arguments: args = {} } = parsed.params as { name: string; arguments: Record<string, unknown> }
          const handler = tools[name]
          if (!handler) {
            jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32601, message: `Unknown tool: ${name}` } })
            return
          }
          try {
            const result = await handler(args, store, settings())
            jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[PMX MCP] tool error:', msg, err instanceof Error ? err.stack : '')
            jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32603, message: msg } })
          }
          return
        }

        jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32601, message: `Method not found: ${parsed.method}` } })
        return
      }

      // Subsequent requests with session
      if (!sessions.has(sessionId)) {
        const emitter = new EventEmitter()
        emitter.setMaxListeners(100)
        sessions.set(sessionId, emitter)
      }

      // Handle these methods even when session exists (stateless mode)
      if (parsed.method === 'initialize') {
        jsonResponse(res, 200, {
          jsonrpc: '2.0', id: parsed.id ?? null,
          result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'project-managerx', version: '2.0.0' } }
        })
        return
      }

      if (parsed.method === 'ping') {
        jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, result: {} })
        return
      }

      if (parsed.method === 'tools/list') {
        jsonResponse(res, 200, {
          jsonrpc: '2.0', id: parsed.id ?? null,
          result: {
            tools: [
              { name: 'list_projects', description: 'List all projects (no tasks)', inputSchema: { type: 'object', properties: {} } },
              { name: 'get_project', description: 'Get a project by id', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
              { name: 'create_project', description: 'Create a new project', inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, color: { type: 'string' }, icon: { type: 'string' } }, required: ['title'] } },
              { name: 'update_project', description: 'Update a project', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: true } },
              { name: 'delete_project', description: 'Delete a project', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
              { name: 'list_tasks', description: 'List all tasks in a project', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
              { name: 'get_task', description: 'Get a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' } }, required: ['projectId', 'taskId'] } },
              { name: 'create_task', description: 'Create a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, parentId: { type: 'string' } }, additionalProperties: true } },
              { name: 'update_task', description: 'Update a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' } }, additionalProperties: true } },
              { name: 'delete_task', description: 'Delete a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' } }, required: ['projectId', 'taskId'] } },
              { name: 'change_task_status', description: 'Change task status', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' }, status: { type: 'string' } }, required: ['projectId', 'taskId', 'status'] } },
              { name: 'assign_task_version', description: 'Assign task to a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, taskId: { type: 'string' }, versionId: { type: 'string', nullable: true } }, required: ['projectId', 'taskId'] } },
              { name: 'list_subtasks', description: 'List subtasks of a task', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, parentId: { type: 'string' } }, required: ['projectId', 'parentId'] } },
              { name: 'create_subtask', description: 'Create a subtask', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, parentId: { type: 'string' } }, additionalProperties: true } },
              { name: 'update_subtask', description: 'Update a subtask', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, subtaskId: { type: 'string' } }, additionalProperties: true } },
              { name: 'delete_subtask', description: 'Delete a subtask', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, subtaskId: { type: 'string' } }, required: ['projectId', 'subtaskId'] } },
              { name: 'list_versions', description: 'List versions in a project', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
              { name: 'get_version', description: 'Get a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' } }, required: ['projectId', 'versionId'] } },
              { name: 'create_version', description: 'Create a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, plannedReleaseDate: { type: 'string' } }, required: ['projectId', 'name'] } },
              { name: 'update_version', description: 'Update a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' } }, additionalProperties: true } },
              { name: 'delete_version', description: 'Delete a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' } }, required: ['projectId', 'versionId'] } },
              { name: 'release_version', description: 'Release a version', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, versionId: { type: 'string' } }, required: ['projectId', 'versionId'] } },
              { name: 'set_project_custom_fields', description: 'Set project custom fields', inputSchema: { type: 'object', properties: { projectId: { type: 'string' }, customFields: { type: 'array' } }, required: ['projectId', 'customFields'] } }
            ]
          }
        })
        return
      }

      if (parsed.method === 'tools/call') {
        const { name, arguments: args = {} } = parsed.params as { name: string; arguments: Record<string, unknown> }
        const handler = tools[name]
        if (!handler) {
          jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32601, message: `Unknown tool: ${name}` } })
          return
        }
        try {
          const result = await handler(args, store, settings())
          jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[PMX MCP] tool error:', msg, err instanceof Error ? err.stack : '')
          jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32603, message: msg } })
        }
        return
      }

      jsonResponse(res, 200, { jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32601, message: `Method not found: ${parsed.method}` } })
      return
    }

    // GET — SSE stream
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

      const heartbeat = setInterval(() => { res.write(': heartbeat\n\n') }, 15000)
      const emitter = sessions.get(sessionId)!
      const onData = (data: string) => { res.write(data) }
      emitter.on('data', onData)

      req.on('close', () => {
        clearInterval(heartbeat)
        emitter.off('data', onData)
      })
      return
    }

    // DELETE — close session
    if (req.method === 'DELETE' && url === '/mcp') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (sessionId) sessions.delete(sessionId)
      res.writeHead(204)
      res.end()
      return
    }

    // Landing page
    if (req.method === 'GET' && (url === '/' || url === '')) {
      const cfg = settings()
      const endpoint = `http://localhost:${cfg.mcpPort}/mcp`
      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>PMX MCP Server v2</title>
<style>body{font-family:system-ui;max-width:600px;margin:60px auto;padding:0 20px}
h1{color:#8b72be}code{background:#f0f0f0;padding:2px 6px;border-radius:4px}
pre{background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;overflow-x:auto}
button{background:#8b72be;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;margin-top:8px}
</style></head>
<body>
<h1>PMX MCP Server v2</h1>
<p>Direct store access — no HTTP overhead.</p>
<p><strong>Endpoint:</strong></p>
<pre id="url">${endpoint}</pre>
<button onclick="navigator.clipboard.writeText(document.getElementById('url').textContent)">Copy URL</button>
<p><strong>Protocol:</strong> JSON-RPC 2.0 over SSE (same interface as REST API v2)</p>
<p><strong>Tools:</strong> list_projects, get_project, create_project, update_project, delete_project, list_tasks, create_task, update_task, delete_task, change_task_status, assign_task_version, list_versions, create_version, update_version, delete_version, release_version, set_project_custom_fields, list_subtasks, create_subtask, update_subtask, delete_subtask</p>
</body></html>`
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
      return
    }

    jsonResponse(res, 404, { error: 'Not found' })
  })

  server.listen(port, () => {
    console.log(`[PMX MCP v2] http://localhost:${port}/mcp`)
  })
}

export function stopMcpServer(): void {
  sessions.clear()
  server?.close()
  server = null
}
