import { useState } from 'react'
import { LuTrash2 } from 'react-icons/lu'
import { toneFor } from '../../lib/cx'
import { uid } from '../../lib/id'
import { useFinance, useUi } from '../../store/contexts'
import { Avatar, HoldButton } from '../bits'
import { Money } from '../Money'
import { Field, FormActions } from './fields'

/** Someone you lend to or borrow from. Only the name is stored. */
export default function PersonForm({ person, onDone }) {
  const { state, dispatch, derived } = useFinance()
  const ui = useUi()
  const [name, setName] = useState(person?.name || '')
  const [tried, setTried] = useState(false)
  const trimmed = name.trim()
  const clash = state.people.find((p) => p.id !== person?.id && p.name.toLowerCase() === trimmed.toLowerCase())
  const error = !tried ? '' : !trimmed ? 'What do you call them?' : clash ? `You already have ${clash.name}.` : ''
  const live = person ? derived.people.find((p) => p.id === person.id) : null
  const net = live?.net || 0
  const settled = Math.abs(net) < 0.005

  const save = () => {
    if (!trimmed || clash) {
      setTried(true)
      return
    }
    if (person) dispatch({ type: 'person/update', person: { id: person.id, name: trimmed } })
    else dispatch({ type: 'person/add', person: { id: uid('p'), name: trimmed } })
    ui.toast(person ? 'Name updated' : `${trimmed} added`, { tone: 'mint' })
    onDone()
  }

  const remove = () => {
    dispatch({ type: 'person/delete', id: person.id })
    ui.toast(`${person.name} removed. Past entries are kept.`, { tone: 'rose' })
    onDone()
  }

  return (
    <form
      className="g-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="g-person-preview">
        <Avatar name={trimmed || '?'} tone={toneFor(person?.id || 'new-person')} />
        <Field label="Name" error={error} hint="Friends, family, colleagues: anyone money moves between.">
          {(id, describedBy) => (
            <input
              id={id}
              className="g-input"
              value={name}
              maxLength={40}
              placeholder="e.g. Kiran"
              autoComplete="off"
              autoFocus
              aria-describedby={describedBy}
              aria-invalid={Boolean(error) || undefined}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
      </div>

      {person && !settled && (
        <p className="g-form__note">
          {net > 0 ? `${person.name} still owes you ` : `You still owe ${person.name} `}
          <Money value={Math.abs(net)} />. Settle up before removing them.
        </p>
      )}

      <FormActions>
        {person && settled && (
          <HoldButton tone="rose" icon={LuTrash2} onConfirm={remove} className="g-form__danger">
            Hold to remove
          </HoldButton>
        )}
        <button type="button" className="g-btn g-btn--ghost g-press" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="g-btn g-btn--ink g-press">
          {person ? 'Save' : 'Add person'}
        </button>
      </FormActions>
    </form>
  )
}
