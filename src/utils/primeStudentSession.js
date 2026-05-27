let bootstrapModulePromise = null

export function primeStudentSession() {
  void import('../components/Game/GameWrapper')
  if (!bootstrapModulePromise) {
    bootstrapModulePromise = import('./gameSessionBootstrap')
  }
  void bootstrapModulePromise.then(({ bootstrapGameSession }) => {
    bootstrapGameSession()
  })
}
