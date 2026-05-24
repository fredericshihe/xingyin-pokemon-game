import OriginalGame from './OriginalGame'

export default function GameWrapper({ user, onLogout }) {
  return (
    <div className="h-screen w-full overflow-hidden">
      <OriginalGame
        user={user}
        onLogout={onLogout}
      />
    </div>
  )
}
