/** Only transport failures may retry; rejected or expired leases stay authoritative. */
export function isPlaytimeTransportError(error) {
  const status = Number(error?.status)
  const message = typeof error === 'string' ? error : String(error?.message || error?.details || error?.name || '')
  return status === 408 || status === 429 || status >= 500 && status < 600 ||
    /load failed|failed to fetch|networkerror|network request failed|fetch failed|timeout|timed out|aborted|aborterror|校验超时/i.test(message)
}

export async function retryPlaytimeTransport(request, { retry = false, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  try { return await request() } catch (error) {
    if (!retry || !isPlaytimeTransportError(error)) throw error
    await wait(400)
    return request()
  }
}
