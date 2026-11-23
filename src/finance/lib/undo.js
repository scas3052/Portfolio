/**
 * `ui` whose toasts' Undo also runs `extra`. Filing a captured payment uses it so that undoing the saved
 * entry puts the payment back in the list too.
 */
export function undoAlso(ui, extra) {
  const toast = (message, options = {}) => {
    const action = options.action
    if (!action) return ui.toast(message, options)
    return ui.toast(message, {
      ...options,
      action: {
        ...action,
        run: () => {
          action.run()
          extra()
        },
      },
    })
  }
  return { ...ui, toast }
}
