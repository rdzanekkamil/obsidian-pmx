const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Project ManagerX REST API',
    version: '1.0.0',
    description: 'CRUD API for Projects, Tasks, and Subtasks in Project ManagerX for Obsidian.'
  },
  servers: [{ url: 'http://localhost:{port}', variables: { port: { default: '8123' } } }],
  paths: {
    '/projects': {
      get: {
        summary: 'List all projects',
        tags: ['Projects'],
        responses: { '200': { description: 'Array of projects', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } } } }
      },
      post: {
        summary: 'Create a project',
        tags: ['Projects'],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, folder: { type: 'string' } } } } } },
        responses: { '201': { description: 'Created project', content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } } }
      }
    },
    '/projects/{id}': {
      get: {
        summary: 'Get a project by ID',
        tags: ['Projects'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Project', content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } }, '404': { description: 'Not found' } }
      },
      put: {
        summary: 'Update a project',
        tags: ['Projects'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectPatch' } } } },
        responses: { '200': { description: 'Updated project' } }
      },
      delete: {
        summary: 'Delete a project',
        tags: ['Projects'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Deleted' } }
      }
    },
    '/projects/{projectId}/tasks': {
      get: {
        summary: 'List all tasks in a project (flat)',
        tags: ['Tasks'],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Array of tasks' }, '404': { description: 'Project not found' } }
      },
      post: {
        summary: 'Create a task',
        tags: ['Tasks'],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Created task' } }
      }
    },
    '/projects/{projectId}/tasks/{taskId}': {
      get: {
        summary: 'Get a task',
        tags: ['Tasks'],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Task' }, '404': { description: 'Not found' } }
      },
      put: {
        summary: 'Update a task',
        tags: ['Tasks'],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'Updated task' } }
      },
      delete: {
        summary: 'Delete a task',
        tags: ['Tasks'],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: { '204': { description: 'Deleted' } }
      }
    },
    '/projects/{projectId}/tasks/{taskId}/subtasks': {
      post: {
        summary: 'Add a subtask to a task',
        tags: ['Subtasks'],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Created subtask' }, '404': { description: 'Not found' } }
      }
    }
  },
  components: {
    schemas: {
      Project: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } }
        }
      },
      ProjectPatch: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' }
        }
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string' },
          priority: { type: 'string' },
          due: { type: 'string' },
          progress: { type: 'number' },
          assignees: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          subtasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } }
        }
      }
    }
  }
}

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Project ManagerX API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/swagger.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout'
    })
  </script>
</body>
</html>`

export { OPENAPI_SPEC, SWAGGER_UI_HTML }
