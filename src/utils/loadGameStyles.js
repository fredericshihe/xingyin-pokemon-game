let gameStylesPromise = null

export function loadGameStyles() {
  if (!gameStylesPromise) {
    gameStylesPromise = import('../game.css')
  }
  return gameStylesPromise
}
