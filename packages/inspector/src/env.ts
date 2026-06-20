export function getDevtoolsGlobalHook(): any {
  return (getTarget() as any).__VUE_DEVTOOLS_GLOBAL_HOOK__
}

export function getTarget(): any {
  return (typeof navigator !== 'undefined' && typeof window !== 'undefined')
    ? window
    : typeof globalThis !== 'undefined'
      ? globalThis
      : {}
}
