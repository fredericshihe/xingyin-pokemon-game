export const TEACHER_UPDATE_EVENTS = Object.freeze({
  resourcesChanged: 'resources_changed',
  rewardsChanged: 'rewards_changed',
  playtimeChanged: 'playtime_changed'
})

export const getStudentTeacherUpdateChannelName = (studentId) => (
  `student-teacher-updates:${studentId}`
)

export async function broadcastStudentTeacherUpdate(supabaseClient, studentId, eventName) {
  const normalizedStudentId = typeof studentId === 'string' ? studentId : String(studentId || '')
  if (!supabaseClient?.channel || !normalizedStudentId || !eventName) return false

  const channel = supabaseClient.channel(getStudentTeacherUpdateChannelName(normalizedStudentId))
  let timeoutId = null

  try {
    return await new Promise((resolve) => {
      let settled = false
      const finish = (success) => {
        if (settled) return
        settled = true
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        resolve(success)
      }

      timeoutId = setTimeout(() => finish(false), 1800)

      channel.subscribe(async (status) => {
        if (settled) return
        if (status === 'SUBSCRIBED') {
          try {
            await channel.send({
              type: 'broadcast',
              event: eventName,
              payload: { sentAt: new Date().toISOString() }
            })
            finish(true)
          } catch (error) {
            console.warn('Failed to broadcast teacher update:', error)
            finish(false)
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          finish(false)
        }
      })
    })
  } finally {
    try {
      await supabaseClient.removeChannel(channel)
    } catch (error) {
      console.warn('Failed to remove teacher update channel:', error)
    }
  }
}
