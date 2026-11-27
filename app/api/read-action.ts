export async function readAction(request: Request, limit = 256000) {
  const reader = request.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let length = 0
  let text = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return JSON.parse(text + decoder.decode())
      length += value.byteLength
      if (length > limit) {
        void reader.cancel().catch(() => {})
        return Response.json(
          { error: 'Request too large' },
          { status: 413, headers: { 'Cache-Control': 'no-store' } },
        )
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    void reader.cancel().catch(() => {})
    return null
  } finally {
    reader.releaseLock()
  }
}
