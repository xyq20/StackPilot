import { readFile } from 'node:fs/promises'

export async function downloadChatHelper(store, appId, res, fail) {
  const projects =
    appId === null
      ? store.all('SELECT id,name FROM apps ORDER BY name,id')
      : store.all('SELECT id,name FROM apps WHERE id=?', appId)
  if (appId !== null && !projects.length) throw fail(404, '找不到该项目')
  const template = await readFile(
    new URL('./portable-chat-helper.py', import.meta.url),
    'utf8',
  )
  const encoded = Buffer.from(JSON.stringify(projects), 'utf8').toString(
    'base64',
  )
  const source = template.replace('__STACKPILOT_PROJECTS_B64__', encoded)
  res.writeHead(200, {
    'Content-Type': 'text/x-python; charset=utf-8',
    'Content-Disposition': 'attachment; filename="StackPilot-Chat-Link.py"',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(source)
}
