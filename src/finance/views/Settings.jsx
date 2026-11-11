import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LuCloud,
  LuDatabase,
  LuDownload,
  LuEye,
  LuEyeOff,
  LuFeather,
  LuFileSpreadsheet,
  LuFlaskConical,
  LuInfo,
  LuKeyboard,
  LuKeyRound,
  LuLock,
  LuMoon,
  LuPalette,
  LuShieldCheck,
  LuSun,
  LuTrash2,
  LuUndo2,
  LuUpload,
  LuUserRound,
} from 'react-icons/lu'
import { clearChat } from '../agent/agentConfig'
import AssistantSettings from '../components/agent/AssistantSettings'
import { HoldButton, Segmented, ViewHeader } from '../components/bits'
import SyncSettings from '../components/cloud/SyncSettings'
import { useActions } from '../hooks/useActions'
import { parseBackup } from '../lib/backup'
import { cx } from '../lib/cx'
import { monthLabel } from '../lib/dates'
import { spotlight } from '../lib/dom'
import { plural } from '../lib/format'
import { useCloud, useFinance, useUi } from '../store/contexts'

// Links like #/settings?focus=sync land on one group and light it up.
const FOCUS_TARGETS = { assistant: 'g-settings-munshi', sync: 'g-settings-sync' }

function Group({ icon: Icon, title, index, className, children, ...rest }) {
  return (
    <section className={cx('g-settings__group', className)} style={{ '--i': index }} aria-label={title} {...rest}>
      <h2 className="g-settings__title">
        <span className="g-tile__icon" aria-hidden="true">
          <Icon />
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function NameField({ initial, onSave }) {
  const [draft, setDraft] = useState(initial)
  const commit = () => {
    const name = draft.trim().slice(0, 40)
    if (name !== initial) onSave(name)
    setDraft(name)
  }
  return (
    <label className="g-settings__row g-settings__row--stack">
      <span className="g-settings__label">What should Gullak call you?</span>
      <input
        className="g-input"
        value={draft}
        maxLength={40}
        placeholder="Your first name"
        autoComplete="given-name"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

export default function Settings({ params }) {
  const { state, dispatch, derived, today } = useFinance()
  const ui = useUi()
  const cloud = useCloud()
  const { exportJSON, exportCSV, lockNow, goPortfolio } = useActions()
  const fileInput = useRef(null)
  const hasPin = Boolean(state.settings.pinHash)
  const linked = cloud.linked
  const showSync = cloud.available || linked
  const focus = params?.focus

  // Munshi's gear button and the sync badge land here with ?focus=…: bring that group into view once the page has settled.
  useEffect(() => {
    const target = focus && Object.hasOwn(FOCUS_TARGETS, focus) ? FOCUS_TARGETS[focus] : null
    if (!target) return undefined
    const timer = setTimeout(() => spotlight(target), 320)
    return () => clearTimeout(timer)
  }, [focus])

  const bytes = useMemo(() => new Blob([JSON.stringify(state)]).size, [state])
  const counts = [
    plural(state.transactions.length, 'entry', 'entries'),
    plural(state.accounts.length, 'account'),
    plural(state.loans.length, 'loan'),
    plural(state.people.length, 'person', 'people'),
    plural(state.goals.length, 'goal'),
  ]

  const saveName = (name) => {
    dispatch({ type: 'settings/update', patch: { name } })
    ui.toast(name ? `Hello, ${name}!` : 'Name cleared', { tone: 'lime' })
  }

  const restore = async (event) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const next = parseBackup(await file.text())
      ui.openSheet('confirm', {
        title: 'Restore this backup?',
        body: (
          <p>
            It has {plural(next.transactions.length, 'entry', 'entries')}, {plural(next.accounts.length, 'account')} and{' '}
            {plural(next.loans.length, 'loan')}. Everything currently in Gullak will be replaced
            {linked && ', on every device that syncs'}. Your PIN stays as it is.
          </p>
        ),
        confirmLabel: 'Hold to restore',
        tone: 'butter',
        hold: true,
        onConfirm: () => {
          dispatch({ type: 'data/import', state: next })
          ui.toast('Backup restored', { tone: 'mint' })
        },
      })
    } catch (error) {
      ui.toast(error instanceof Error ? error.message : 'Couldn’t read that file.', { tone: 'rose' })
    }
  }

  const loadSample = () =>
    ui.openSheet('confirm', {
      title: 'Load the sample data?',
      body: (
        <p>
          This swaps everything{linked && ' (on every device that syncs)'} for a made-up month of entries so you can
          explore. Download a backup first if you want to keep what you have.
        </p>
      ),
      confirmLabel: 'Hold to load sample',
      tone: 'sky',
      hold: true,
      onConfirm: () => {
        dispatch({ type: 'onboard/sample', today, name: state.settings.name })
        ui.toast('Sample data loaded', { tone: 'sky' })
      },
    })

  const erase = () => {
    ui.closeSheet()
    ui.setAgentOpen(false)
    clearChat()
    dispatch({ type: 'data/clear' })
  }

  return (
    <div className="g-view g-settings-view">
      <ViewHeader
        title="Settings"
        tone="gray"
        sub={
          showSync
            ? 'Your name, the look, the lock, your data, sync and Munshi.'
            : 'Your name, the look, the lock, Munshi and your data.'
        }
      />

      <div className="g-settings">
        <Group icon={LuUserRound} title="You" index={0}>
          <NameField key={state.settings.name} initial={state.settings.name || ''} onSave={saveName} />
        </Group>

        <Group icon={LuPalette} title="Look" index={1}>
          <div className="g-settings__row">
            <span className="g-settings__label">Theme</span>
            <Segmented
              label="Theme"
              size="sm"
              value={ui.theme}
              onChange={(value) => {
                if (value !== ui.theme) ui.toggleTheme()
              }}
              options={[
                { value: 'paper', label: 'Paper', icon: LuSun },
                { value: 'ink', label: 'Ink', icon: LuMoon },
              ]}
            />
          </div>
          <div className="g-settings__row">
            <span className="g-settings__label" id="g-privacy-label">
              Hide amounts
              <small>Masks every number until you switch it off. Handy in public.</small>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={ui.privacy}
              aria-labelledby="g-privacy-label"
              className={cx('g-switch', ui.privacy && 'is-on')}
              onClick={ui.togglePrivacy}
            >
              <span className="g-switch__knob" aria-hidden="true">
                {ui.privacy ? <LuEyeOff /> : <LuEye />}
              </span>
            </button>
          </div>
        </Group>

        <Group icon={LuShieldCheck} title="Lock" index={2}>
          <p className="g-settings__note">
            {hasPin
              ? 'A PIN is set. Gullak locks when you open it and after 2 minutes in the background.'
              : 'Add a 4-digit PIN so nobody can peek when they borrow your laptop or phone.'}
            {linked && ' The PIN syncs, so it’s the same on every device.'}
          </p>
          <div className="g-settings__actions">
            <button type="button" className="g-btn g-press" onClick={() => ui.openSheet('pin')}>
              <LuKeyRound aria-hidden="true" /> {hasPin ? 'Change or remove PIN' : 'Set a PIN'}
            </button>
            {hasPin && (
              <button type="button" className="g-btn g-btn--ink g-press" onClick={lockNow}>
                <LuLock aria-hidden="true" /> Lock now
              </button>
            )}
          </div>
          <p className="g-settings__fine">
            The PIN is a curtain, not a safe: it hides the screen but doesn’t encrypt what’s stored in this browser
            {linked && ' or in the cloud'}.
          </p>
        </Group>

        <Group icon={LuDatabase} title="Backup" index={3}>
          <p className="g-settings__note">
            {linked
              ? 'Your book syncs to the cloud, but a backup file is still the copy nobody else holds. Download one every so often and keep it safe.'
              : 'Everything lives only in this browser, on this device. Download a backup every so often and keep it safe.'}
          </p>
          <div className="g-settings__actions">
            <button type="button" className="g-btn g-btn--ink g-press" onClick={exportJSON}>
              <LuDownload aria-hidden="true" /> Download backup
            </button>
            <button type="button" className="g-btn g-press" onClick={exportCSV} disabled={!state.transactions.length}>
              <LuFileSpreadsheet aria-hidden="true" /> Entries as CSV
            </button>
            <button type="button" className="g-btn g-press" onClick={() => fileInput.current?.click()}>
              <LuUpload aria-hidden="true" /> Restore a backup
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={restore}
            />
          </div>
          <p className="g-settings__fine">
            {counts.join(' · ')} · about {Math.max(1, Math.round(bytes / 1024))} KB
            {derived.firstMonth && state.transactions.length > 0 && ` · since ${monthLabel(derived.firstMonth, 'short')}`}
          </p>
        </Group>

        {showSync && (
          <Group
            id="g-settings-sync"
            icon={LuCloud}
            title="Sync"
            index={4}
            className="g-settings__group--sync"
            tabIndex={-1}
          >
            <SyncSettings />
          </Group>
        )}

        <Group
          id="g-settings-munshi"
          icon={LuFeather}
          title="Munshi"
          index={showSync ? 5 : 4}
          className="g-settings__group--munshi"
          tabIndex={-1}
        >
          <AssistantSettings />
        </Group>

        <Group icon={LuInfo} title="About" index={showSync ? 6 : 5}>
          <p className="g-settings__note">
            {linked
              ? 'Gullak is a private money notebook with no tracking. Your entries live in this browser and sync to a cloud copy only your Google account can open.'
              : showSync
                ? 'Gullak is a private money notebook with no tracking. Sign-in is optional: until you turn on sync, your entries stay in this browser.'
                : 'Gullak is a private money notebook: no sign-in, no tracking, and your entries stay in this browser.'}{' '}
            Only what you ask Munshi goes anywhere else, through your own relay. Press <kbd className="g-kbd">?</kbd> for
            shortcuts.
          </p>
          <div className="g-settings__actions">
            <button type="button" className="g-btn g-press" onClick={() => ui.openSheet('shortcuts')}>
              <LuKeyboard aria-hidden="true" /> Shortcuts
            </button>
            <button type="button" className="g-btn g-btn--ghost g-press" onClick={goPortfolio}>
              <LuUndo2 aria-hidden="true" /> Back to the portfolio
            </button>
          </div>
        </Group>

        <Group icon={LuTrash2} title="Danger zone" index={showSync ? 7 : 6} className="g-settings__group--danger">
          <div className="g-settings__row">
            <span className="g-settings__label">
              Try the sample data
              <small>Replaces what’s here with a realistic demo month.</small>
            </span>
            <button type="button" className="g-btn g-press" onClick={loadSample}>
              <LuFlaskConical aria-hidden="true" /> Load sample
            </button>
          </div>
          <div className="g-settings__row">
            <span className="g-settings__label">
              Erase everything
              <small>
                {linked
                  ? 'Deletes every entry, account, loan, goal and the PIN here, in the cloud and on every synced device, plus Munshi’s chat. There’s no undo. To only take the book off this device, sign out in Sync instead.'
                  : 'Deletes every entry, account, loan, goal, the PIN and Munshi’s chat. There’s no undo.'}
              </small>
            </span>
            <HoldButton tone="rose" icon={LuTrash2} onConfirm={erase} duration={1600}>
              Hold to erase
            </HoldButton>
          </div>
        </Group>
      </div>
    </div>
  )
}
