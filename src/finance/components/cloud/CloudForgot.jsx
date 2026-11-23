import { useEffect, useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { LuLoaderCircle, LuMonitorSmartphone, LuRotateCw, LuX } from 'react-icons/lu'
import { linkingWords } from '../../cloud/describe'
import { plural } from '../../lib/format'
import { useCloud } from '../../store/contexts'
import { HoldButton } from '../bits'

function ConfirmButton({ cloud, confirming, onConfirm }) {
  if (confirming) {
    return (
      <button type="button" className="g-btn g-btn--ink g-sync-google" disabled>
        <LuLoaderCircle className="g-sync-spin" aria-hidden="true" /> Waiting for Google…
      </button>
    )
  }
  if (cloud.sdk === 'failed') {
    return (
      <button type="button" className="g-btn g-btn--ink g-press g-sync-google" onClick={cloud.prepare}>
        <LuRotateCw aria-hidden="true" /> Try again
      </button>
    )
  }
  if (cloud.sdk !== 'ready') {
    return (
      <button type="button" className="g-btn g-btn--ink g-sync-google" disabled>
        <LuLoaderCircle className="g-sync-spin" aria-hidden="true" /> Getting ready…
      </button>
    )
  }
  return (
    <button type="button" className="g-btn g-btn--ink g-press g-sync-google" onClick={onConfirm} disabled={Boolean(cloud.linking)}>
      <span className="g-sync-google__g" aria-hidden="true">
        <FcGoogle />
      </span>
      Confirm with Google
    </button>
  )
}

/** "Forgot PIN?" on a syncing device: prove it's the owner to drop the PIN everywhere, or take the book off this device. */
export default function CloudForgot({ onCancel }) {
  const cloud = useCloud()
  const { prepare } = cloud
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const busy = linkingWords(cloud.linking)

  useEffect(() => {
    prepare()
  }, [prepare])

  // Google's popup only opens if this runs straight from the click.
  const confirm = () => {
    if (confirming) return
    setConfirming(true)
    setError('')
    cloud.confirmWithGoogle().then((result) => {
      setConfirming(false)
      if (!result.ok) setError(result.message)
    })
  }

  return (
    <div className="g-lock__forgot g-sync-forgot">
      {cloud.available ? (
        <>
          <p>
            Your PIN syncs, so it can’t be reset from this device alone. Confirm it’s you with Google
            {cloud.email ? <strong> ({cloud.email})</strong> : null} and the PIN is removed on every device.
          </p>
          <div className="g-sync-forgot__go">
            <ConfirmButton cloud={cloud} confirming={confirming} onConfirm={confirm} />
            {cloud.sdk === 'failed' && !confirming && (
              <p className="g-field__error" role="alert">
                Google sign-in didn’t load. Check your connection and try again.
              </p>
            )}
            {error && (
              <p className="g-field__error" role="alert">
                {error}
              </p>
            )}
          </div>
        </>
      ) : (
        <p>Your PIN syncs, and this copy of Gullak can’t reach the cloud, so the PIN can’t be reset here.</p>
      )}

      <p className="g-sync-forgot__or">
        {cloud.available ? 'Or take the book off this device.' : 'You can take the book off this device instead.'} It
        stays safe in the cloud, and signing in again brings it back.
        {cloud.pending > 0 &&
          ` ${plural(cloud.pending, 'change hasn’t', 'changes haven’t')} reached the cloud yet, and ${cloud.pending === 1 ? 'it' : 'they'} will be lost.`}
      </p>
      <HoldButton
        tone="coral"
        duration={1600}
        icon={LuMonitorSmartphone}
        disabled={Boolean(cloud.linking) || confirming}
        onConfirm={() => cloud.signOutDevice({ confirmed: true })}
      >
        Remove from this device
      </HoldButton>
      {busy && (
        <p className="g-sync-forgot__busy" role="status">
          <LuLoaderCircle className="g-sync-spin" aria-hidden="true" /> {busy}
        </p>
      )}

      <button type="button" className="g-btn g-btn--ghost g-btn--sm g-press" onClick={onCancel} disabled={confirming}>
        <LuX aria-hidden="true" /> Never mind
      </button>
    </div>
  )
}
