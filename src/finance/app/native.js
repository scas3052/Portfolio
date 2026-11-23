// Small, lazy wrappers around the Capacitor plugins the app uses. They are only imported by the app's own
// code (src/finance/app, src/finance/inbox), so none of this reaches the website's bundle.

/** Saves `text` as a file and opens Android's share sheet, so a backup can go to Drive, Files or a chat. */
export async function shareFile(name, text) {
  const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
  try {
    await Share.share({ title: name, files: [uri], dialogTitle: 'Save or send' })
  } catch (err) {
    if (!isCancel(err)) throw err
  }
}

/** Android's share sheet for plain text (the People reminder). */
export async function shareText(text) {
  const { Share } = await import('@capacitor/share')
  try {
    await Share.share({ text, dialogTitle: 'Send reminder' })
  } catch (err) {
    if (!isCancel(err)) throw err
  }
}

const isCancel = (err) => /cancel/i.test(String(err?.message || err || ''))
