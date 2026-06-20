import { getDevtoolsGlobalHook, getTarget, isProxyAvailable } from './env.js'
import { HOOK_SETUP } from './const.js'
import type { App, CustomInspectorNode, CustomInspectorState, DevtoolsPluginApi } from './api/index.js'
import { ApiProxy } from './proxy.js'
import type { ExtractSettingsTypes, PluginDescriptor, PluginSettingsItem } from './plugin.js'

export * from './api/index.js'
export * from './plugin.js'
export * from './time.js'
export { PluginQueueItem, getDevtoolsGlobalHook, getTarget } from './env.js'

// https://github.com/microsoft/TypeScript/issues/30680#issuecomment-752725353
type Cast<A, B> = A extends B ? A : B
type Narrowable =
  | string
  | number
  | bigint
  | boolean
type Narrow<A> = Cast<A, | []
  | (A extends Narrowable ? A : never)
  | ({ [K in keyof A]: Narrow<A[K]> })>

// Prevent properties not in PluginDescriptor
// We need this because of the `extends` in the generic TDescriptor
type Exact<C, T> = {
  [K in keyof C]: K extends keyof T ? T[K] : never
}

export type SetupFunction<TSettings = any> = (api: DevtoolsPluginApi<TSettings>) => void

export function setupDevtoolsPlugin<
  TDescriptor extends Exact<TDescriptor, PluginDescriptor>,
  TSettings = ExtractSettingsTypes<TDescriptor extends { settings: infer S } ? S extends Record<string, PluginSettingsItem> ? S : Record<string, PluginSettingsItem> : Record<string, PluginSettingsItem>>,
>(pluginDescriptor: Narrow<TDescriptor>, setupFn: SetupFunction<TSettings>) {
  const descriptor = pluginDescriptor as unknown as PluginDescriptor
  const target = getTarget()
  const hook = getDevtoolsGlobalHook()
  const enableProxy = isProxyAvailable && descriptor.enableEarlyProxy
  if (hook && (target.__VUE_DEVTOOLS_PLUGIN_API_AVAILABLE__ || !enableProxy)) {
    hook.emit(HOOK_SETUP, pluginDescriptor, setupFn)
  }
  else {
    const proxy = enableProxy ? new ApiProxy(descriptor, hook) : null

    const list = target.__VUE_DEVTOOLS_PLUGINS__ = target.__VUE_DEVTOOLS_PLUGINS__ || []
    list.push({
      pluginDescriptor: descriptor,
      setupFn,
      proxy,
    })

    if (proxy) {
      setupFn(proxy.proxiedTarget as DevtoolsPluginApi<TSettings>)
    }
  }
}

// --- Simple Inspector API ---

export interface InspectorNode {
  id: string
  label: string
  children?: InspectorNode[]
  [key: string]: any
}

export type InspectorData = InspectorNode[] | InspectorNode | Record<string, any>

export interface AddInspectorOptions {
  id: string
  label: string
  icon?: string
  resolve: (app: App) => InspectorData | Promise<InspectorData>
}

export interface NormalizedInspectorData {
  tree: CustomInspectorNode[]
  stateMap: Map<string, CustomInspectorState>
}

const PLUGIN_PREFIX = 'org.vuejs.devtools.inspector.'
const HOOK_APP_ADD = 'app:add'

const registeredInspectors = new Map<string, AddInspectorOptions>()
const processedApps = new WeakSet<object>()

function isTreeArray(data: InspectorData): data is InspectorNode[] {
  return Array.isArray(data)
}

function isInspectorNode(data: InspectorData): data is InspectorNode {
  return data
    && typeof data === 'object'
    && !Array.isArray(data)
    && 'id' in data
    && 'label' in data
}

function normalizeNode(node: InspectorNode, parentId = ''): NormalizedInspectorData {
  const stateMap = new Map<string, CustomInspectorState>()
  const fullId = parentId ? `${parentId}.${node.id}` : node.id

  const treeNode: CustomInspectorNode = {
    id: fullId,
    label: node.label,
  }

  if (node.children && node.children.length > 0) {
    treeNode.children = []
    for (const child of node.children) {
      const result = normalizeNode(child, fullId)
      treeNode.children.push(...result.tree)
      result.stateMap.forEach((value, key) => stateMap.set(key, value))
    }
  }

  const state: CustomInspectorState = {}
  for (const key of Object.keys(node)) {
    if (key !== 'id' && key !== 'label' && key !== 'children') {
      state[key] = [{
        key,
        value: node[key],
      }]
    }
  }
  if (Object.keys(state).length > 0) {
    stateMap.set(fullId, state)
  }

  return {
    tree: [treeNode],
    stateMap,
  }
}

function normalizeData(data: InspectorData): NormalizedInspectorData {
  const stateMap = new Map<string, CustomInspectorState>()

  if (isTreeArray(data)) {
    const allTree: CustomInspectorNode[] = []
    for (const node of data) {
      const result = normalizeNode(node)
      allTree.push(...result.tree)
      result.stateMap.forEach((value, key) => stateMap.set(key, value))
    }
    return { tree: allTree, stateMap }
  }

  if (isInspectorNode(data)) {
    return normalizeNode(data)
  }

  const rootId = 'root'
  const state: CustomInspectorState = {}
  for (const [key, value] of Object.entries(data as Record<string, any>)) {
    state[key] = [{
      key,
      value,
    }]
  }
  stateMap.set(rootId, state)

  return {
    tree: [{
      id: rootId,
      label: 'Data',
    }],
    stateMap,
  }
}

async function resolveInspectorData(
  app: App,
  options: AddInspectorOptions,
): Promise<NormalizedInspectorData> {
  const data = await options.resolve(app)
  return normalizeData(data)
}

function setupPluginForApp(app: App, inspectorOptions: AddInspectorOptions): void {
  const pluginDescriptor: PluginDescriptor = {
    id: `${PLUGIN_PREFIX}${inspectorOptions.id}`,
    label: inspectorOptions.label,
    app,
    disableAppScope: true,
  }

  setupDevtoolsPlugin(pluginDescriptor, (api: DevtoolsPluginApi<any>) => {
    api.addInspector({
      id: inspectorOptions.id,
      label: inspectorOptions.label,
      icon: inspectorOptions.icon,
    })

    api.on.getInspectorTree(async (payload) => {
      if (payload.inspectorId === inspectorOptions.id) {
        const resolved = await resolveInspectorData(app, inspectorOptions)
        payload.rootNodes = resolved.tree
      }
    })

    api.on.getInspectorState(async (payload) => {
      if (payload.inspectorId === inspectorOptions.id) {
        const resolved = await resolveInspectorData(app, inspectorOptions)
        payload.state = resolved.stateMap.get(payload.nodeId) || {}
      }
    })
  })
}

function processApp(app: App): void {
  if (processedApps.has(app as object)) {
    return
  }
  processedApps.add(app as object)

  for (const inspector of registeredInspectors.values()) {
    setupPluginForApp(app, inspector)
  }
}

let listeningForApps = false

function listenForNewApps(): void {
  if (listeningForApps) {
    return
  }
  listeningForApps = true

  try {
    const hook = getDevtoolsGlobalHook()
    if (hook && hook.on) {
      hook.on(HOOK_APP_ADD, (app: App) => {
        processApp(app)
      })

      if (hook.apps && Array.isArray(hook.apps)) {
        for (const appRecord of hook.apps) {
          if (appRecord.app) {
            processApp(appRecord.app)
          }
        }
      }
    }
  }
  catch (e) {
    // noop
  }
}

export function addInspector(options: AddInspectorOptions): void {
  if (registeredInspectors.has(options.id)) {
    console.warn(`[vue-devtools] Inspector with id '${options.id}' already exists.`)
    return
  }

  registeredInspectors.set(options.id, options)
  listenForNewApps()

  try {
    const hook = getDevtoolsGlobalHook()
    if (hook && hook.apps && Array.isArray(hook.apps)) {
      for (const appRecord of hook.apps) {
        if (appRecord.app) {
          setupPluginForApp(appRecord.app, options)
        }
      }
    }
  }
  catch (e) {
    // noop
  }
}

export function getRegisteredInspectors(): AddInspectorOptions[] {
  return Array.from(registeredInspectors.values())
}

export { normalizeNode, normalizeData }
