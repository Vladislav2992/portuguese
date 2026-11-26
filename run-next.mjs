import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const host = '127.0.0.1'
const preferredPort = Number(process.env.PORT ?? 4173)

function probePort(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(port, host, () => {
      const { port: availablePort } = probe.address()
      probe.close((error) => {
        if (error) reject(error)
        else resolve(availablePort)
      })
    })
  })
}

try {
  if (
    !Number.isInteger(preferredPort) ||
    preferredPort < 0 ||
    preferredPort > 65535
  ) {
    throw new Error('PORT должен быть целым числом от 0 до 65535.')
  }

  let port
  try {
    port = await probePort(preferredPort)
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error
    port = await probePort(0)
    console.log(
      `Порт ${preferredPort} занят. Новый адрес: http://${host}:${port}`,
    )
  }

  const cli = fileURLToPath(import.meta.resolve('next/dist/bin/next'))
  const child = spawn(
    process.execPath,
    [
      cli,
      process.argv[2],
      '--hostname',
      host,
      '--port',
      String(port),
      ...process.argv.slice(3),
    ],
    { stdio: 'inherit' },
  )
  child.once('error', (error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  child.once('exit', (code) => {
    process.exitCode = code ?? 1
  })
} catch (error) {
  console.error('Не удалось запустить Next.js:', error.message)
  process.exitCode = 1
}
