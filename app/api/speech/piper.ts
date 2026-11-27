import { execFile } from 'node:child_process'
import { basename, resolve } from 'node:path'

export function piperSettings() {
  const model = process.env.PIPER_MODEL?.trim()
  if (!model) return null
  const python =
    process.env.PIPER_PYTHON?.trim() ||
    (process.platform === 'win32' ? 'python' : 'python3')
  return {
    model: resolve(model),
    python,
    version: 'piper:mp3-v1:' + basename(model),
  }
}

export function synthesizePiper(
  text: string,
  settings: NonNullable<ReturnType<typeof piperSettings>>,
) {
  return new Promise<Buffer>((resolveAudio, reject) => {
    const child = execFile(
      settings.python,
      [resolve('scripts/piper-speech.py'), settings.model],
      {
        encoding: 'buffer',
        windowsHide: true,
        timeout: 15_000,
        maxBuffer: 1048576,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          WINDIR: process.env.WINDIR,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
        },
      },
      (error, audio) => {
        if (error || !audio.length) reject(new Error('Piper synthesis failed'))
        else resolveAudio(audio)
      },
    )
    child.stdin?.on('error', () => {})
    child.stdin?.end(text, 'utf8')
  })
}
