import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import type { TaskSource } from '../store/TaskSource'
import type { PMSettings } from '../types'
import { flattenTasks } from '../store/TaskTreeOps'
import type { Express } from 'express'

let server: McpServer | null = null
let transport: StreamableHTTPServerTransport | null = null
let app: Express | null = null

export function startMcpServer(store: TaskSource, settings: () => PMSettings, port: number): void {
  if (server) return

  server = new McpServer({
    name: 'project-managerx',
    version: '1.0.0'
  })

  // ── Resources ────────────────────────────────────────────────────────────────
  server.registerResource(
    'projects-list',
    'pmx://projects',
    { title: 'All projects', mimeType: 'application/json' },
    async () => {
      const projects = await store.loadAllProjects(settings().projectsFolder)
      return {
        contents: [{
          uri: 'pmx://projects',
          text: JSON.stringify(projects.map(({ id, title, description }) => ({ id, title, description })))
        }]
      }
    }
  )

  server.registerResource(
    'statuses',
    'pmx://statuses',
    { title: 'Global task statuses', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'pmx://statuses',
        text: JSON.stringify(settings().statuses)
      }]
    })
  )

  server.registerResource(
    'priorities',
    'pmx://priorities',
    { title: 'Global task priorities', mimeType: 'application/json' },
    async () => ({
      contents: [{
        uri: 'pmx://priorities',
        text: JSON.stringify(settings().priorities)
      }]
    })
  )

  // ── Tools ────────────────────────────────────────────────────────────────────
  server.registerTool('list_projects', {
    title: 'List all projects',
    description: 'Returns all projects with id, title, description.',
  }, async () => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    return { content: [{ type: 'text', text: JSON.stringify(projects.map(({ id, title, description }) => ({ id, title, description })), null, 2) }] }
  })

  server.registerTool('get_project', {
    title: 'Get a project',
    description: 'Returns project details. Use includeTasks=true to include tasks.',
  }, async ({ id, includeTasks }: { id: string; includeTasks?: boolean }) => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const project = projects.find((x: { id: string }) => x.id === id)
    if (!project) return { content: [{ type: 'text', text: `Project ${id} not found` }], isError: true }
    if (includeTasks) {
      return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] }
    }
    const { id: pid, title, description } = project
    return { content: [{ type: 'text', text: JSON.stringify({ id: pid, title, description }, null, 2) }] }
  })

  server.registerTool('create_project', {
    title: 'Create a project',
    description: 'Creates a new project.',
  }, async ({ title }: { title: string }) => {
    if (!title?.trim()) return { content: [{ type: 'text', text: 'title is required' }], isError: true }
    const project = await store.createProject(title, settings().projectsFolder)
    return { content: [{ type: 'text', text: JSON.stringify({ id: project.id, title: project.title, description: project.description }, null, 2) }] }
  })

  server.registerTool('list_tasks', {
    title: 'List tasks in a project',
    description: 'Returns all tasks flattened (includes subtasks).',
  }, async ({ projectId }: { projectId: string }) => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const project = projects.find((x: { id: string }) => x.id === projectId)
    if (!project) return { content: [{ type: 'text', text: `Project ${projectId} not found` }], isError: true }
    return { content: [{ type: 'text', text: JSON.stringify(flattenTasks(project.tasks).map((f: { task: unknown }) => f.task), null, 2) }] }
  })

  server.registerTool('create_task', {
    title: 'Create a task',
    description: 'Creates a task in a project.',
  }, async ({ projectId, title }: { projectId: string; title: string }) => {
    const projects = await store.loadAllProjects(settings().projectsFolder)
    const project = projects.find((x: { id: string }) => x.id === projectId)
    if (!project) return { content: [{ type: 'text', text: `Project ${projectId} not found` }], isError: true }
    const task = { id: randomUUID().slice(0, 8), title, description: '', status: 'todo', priority: 'medium', type: 'task' as const,
      start: '', due: '', progress: 0, completed: '', assignees: [], tags: [], subtasks: [], dependencies: [],
      customFields: {}, collapsed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    await store.insertTask(project, task)
    return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] }
  })

  // ── Transport ────────────────────────────────────────────────────────────────
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: () => {}
  })

  app = createMcpExpressApp()
  app.post('/mcp', async (req, res) => {
    await transport!.handleRequest(req, res, req.body)
  })
  app.get('/mcp', async (req, res) => {
    await transport!.handleRequest(req, res)
  })
  app.delete('/mcp', async (req, res) => {
    await transport!.handleRequest(req, res)
  })

  server.connect(transport).then(() => {
    app!.listen(port, () => { console.log(`[PMX MCP] http://localhost:${port}/mcp`) })
  })
}

export function stopMcpServer(): void {
  transport?.close()
  transport = null
  server = null
  app = null
}
