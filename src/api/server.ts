import { serve } from 'h3'
import { readBody } from 'h3'
import type { TaskSource } from '../store/TaskSource'
import type { PMSettings } from '../types'
import { createProjectsRouter } from './routes/projects'
import { createTasksRouter } from './routes/tasks'
import { createSubtasksRouter } from './routes/subtasks'
import { OPENAPI_SPEC, SWAGGER_UI_HTML } from './swagger'

let server: ReturnType<typeof serve> | null = null

export function startApiServer(store: TaskSource, settings: () => PMSettings, port: number): void {
  if (server) return

  const app = createApp(store, settings)
  server = serve({ fetch: app, port }, () => {
    console.log(`[PMX API] running on http://localhost:${port}`)
  })
}

export function stopApiServer(): void {
  server?.close()
  server = null
}

function createApp(store: TaskSource, settings: () => PMSettings) {
  const { createApp: h3CreateApp, json } = require('h3')

  const app = h3CreateApp()

  // Swagger JSON spec
  app.use((req: Request, next: () => Response) => {
    if (req.url === '/swagger.json') return json(OPENAPI_SPEC)
    return next()
  })

  // Swagger UI
  app.use((req: Request, next: () => Response) => {
    if (req.url === '/' || req.url?.startsWith('/swagger-ui')) {
      return new Response(SWAGGER_UI_HTML, {
        headers: { 'Content-Type': 'text/html' }
      })
    }
    return next()
  })

  // Routes
  app.use('/projects', createProjectsRouter(store, settings))
  app.use('/projects/:projectId/tasks', createTasksRouter(store, settings))
  app.use('/projects/:projectId/tasks', createSubtasksRouter(store, settings))

  // 404
  app.use((req: Request) => {
    return json({ error: 'Not found' }, 404)
  })

  return app
}
