const voice = 'pt-BR-FranciscaNeural'
const outputFormat = 'audio-24khz-48kbitrate-mono-mp3'
export const speechVersion = voice + ':' + outputFormat + ':-10%'

export function azureSettings() {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION?.trim().toLowerCase()
  return key && region && /^[a-z0-9]+$/.test(region) ? { key, region } : null
}

export async function synthesize(
  text: string,
  settings: { key: string; region: string },
) {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  const response = await fetch(
    'https://' +
      settings.region +
      '.tts.speech.microsoft.com/cognitiveservices/v1',
    {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Ocp-Apim-Subscription-Key': settings.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': outputFormat,
        'User-Agent': 'portuguese-mvp',
      },
      body: `<speak version="1.0" xml:lang="pt-BR"><voice name="${voice}"><prosody rate="-10%">${escaped}</prosody></voice></speak>`,
      signal: AbortSignal.timeout(12_000),
    },
  )
  if (!response.ok) throw new Error('Azure Speech request failed')
  const audio = await response.arrayBuffer()
  if (!audio.byteLength || audio.byteLength > 1048576)
    throw new Error('Unexpected audio size')
  return Buffer.from(audio)
}
