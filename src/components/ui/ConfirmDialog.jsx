import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Native modal supplies focus containment, Escape handling and background inertness. */
export default function ConfirmDialog({ title, description, confirmLabel = '确认', danger = false, fieldLabel, fieldType = 'text', optional = false, busy = false, error, onConfirm, onCancel }) {
  const ref = useRef(null)
  const headingId = useId()
  const bodyId = useId()
  const [value, setValue] = useState('')
  useEffect(() => {
    const previous = document.activeElement
    const dialog = ref.current
    dialog.showModal()
    dialog.querySelector('[data-dialog-cancel]')?.focus()
    return () => {
      dialog.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return createPortal(
    <dialog ref={ref} className="ui-dialog" aria-labelledby={headingId} aria-describedby={bodyId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel() }}
      onClick={(event) => { if (event.target === ref.current && !busy) { const r = ref.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onCancel() } }}>
      <form onSubmit={(event) => { event.preventDefault(); if (!busy) onConfirm(fieldLabel ? value : true) }}>
        <span className={`ui-dialog__icon ${danger ? 'ui-dialog__icon--danger' : ''}`} aria-hidden="true"><i className={`fa-solid ${danger ? 'fa-trash-can' : 'fa-circle-question'}`} /></span>
        <h2 id={headingId}>{title}</h2>
        <p id={bodyId}>{description}</p>
        {fieldLabel && <label className="ui-field"><span>{fieldLabel}</span><input type={fieldType} value={value} onChange={(e) => setValue(e.target.value)} required={!optional} autoComplete={fieldType === 'password' ? 'current-password' : 'off'} disabled={busy} /></label>}
        {error && <p className="ui-dialog__error" role="alert">{error}</p>}
        <footer className="ui-dialog__actions">
          <button type="button" className="game-soft-button" onClick={onCancel} disabled={busy} data-dialog-cancel>取消</button>
          <button type="submit" className={danger ? 'game-danger-button' : 'game-primary-button'} disabled={busy || (fieldLabel && !optional && !value.trim())}>{busy ? '处理中…' : confirmLabel}</button>
        </footer>
      </form>
    </dialog>, document.body
  )
}
