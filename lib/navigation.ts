const NAVIGATION_START_EVENT = 'fahes:navigation-start'

export function notifyNavigationStart(href: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<string>(NAVIGATION_START_EVENT, { detail: href }))
}

export { NAVIGATION_START_EVENT }
