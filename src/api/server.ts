import { serve, createApp, json } from 'h3'
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
  const app = createApp()

  app.use((req: Request, next: () => Response) => {
    if (req.url === '/swagger.json') return json(OPENAPI_SPEC)
    return next()
  })

  app.use((req: Request, next: () => Response) => {
    if (req.url === '/' || req.url?.startsWith('/swagger-ui')) {
      return new Response(SWAGGER_UI_HTML, {
        headers: { 'Content-Type': 'text/html' }
      })
    }
    return next()
  })

  app.use('/projects', createProjectsRouter(store, settings))
  app.use('/projects/:projectId/tasks', createTasksRouter(store, settings))
  app.use('/projects/:projectId/tasks', createSubtasksRouter(store, settings))

  app.use((req: Request) => {
    return json({ error: 'Not found' }, 404)
  })

  return app
}
