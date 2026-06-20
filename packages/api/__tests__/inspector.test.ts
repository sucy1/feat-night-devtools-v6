import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AddInspectorOptions,
  addInspector,
  getRegisteredInspectors,
  getTarget,
  normalizeData,
  normalizeNode,
} from '../src/index'

describe('addInspector', () => {
  beforeEach(() => {
    const target = getTarget() as any
    target.__VUE_DEVTOOLS_PLUGINS__ = undefined
    target.__VUE_DEVTOOLS_GLOBAL_HOOK__ = undefined
  })

  it('should register an inspector', () => {
    const options: AddInspectorOptions = {
      id: 'test-inspector',
      label: 'Test Inspector',
      resolve: () => ({ foo: 'bar' }),
    }

    addInspector(options)

    const inspectors = getRegisteredInspectors()
    expect(inspectors).toHaveLength(1)
    expect(inspectors[0].id).toBe('test-inspector')
    expect(inspectors[0].label).toBe('Test Inspector')
  })

  it('should not register duplicate inspector ids', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const options1: AddInspectorOptions = {
      id: 'duplicate-id',
      label: 'First',
      resolve: () => ({}),
    }
    const options2: AddInspectorOptions = {
      id: 'duplicate-id',
      label: 'Second',
      resolve: () => ({}),
    }

    addInspector(options1)
    addInspector(options2)

    const inspectors = getRegisteredInspectors()
    expect(inspectors).toHaveLength(1)
    expect(inspectors[0].label).toBe('First')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Inspector with id \'duplicate-id\' already exists'),
    )

    warnSpy.mockRestore()
  })

  it('should support key-value data resolve', async () => {
    const mockApp = { _uid: 1 }
    const options: AddInspectorOptions = {
      id: 'kv-inspector',
      label: 'KV Inspector',
      resolve: (app) => {
        expect(app).toBeDefined()
        return {
          count: 42,
          name: 'test',
          enabled: true,
        }
      },
    }

    addInspector(options)
    const data = await options.resolve(mockApp as any)
    expect(data).toEqual({
      count: 42,
      name: 'test',
      enabled: true,
    })
  })

  it('should support tree data resolve', async () => {
    const options: AddInspectorOptions = {
      id: 'tree-inspector',
      label: 'Tree Inspector',
      resolve: () => [
        {
          id: 'root',
          label: 'Root',
          extra: 'data',
          children: [
            {
              id: 'child',
              label: 'Child',
              value: 123,
            },
          ],
        },
      ],
    }

    addInspector(options)
    const data = await options.resolve({} as any)
    expect(Array.isArray(data)).toBe(true)
    expect((data as any[])[0].id).toBe('root')
    expect((data as any[])[0].children[0].id).toBe('child')
  })

  it('should support async resolve', async () => {
    const options: AddInspectorOptions = {
      id: 'async-inspector',
      label: 'Async Inspector',
      resolve: async () => {
        await Promise.resolve()
        return { async: true }
      },
    }

    addInspector(options)
    const data = await options.resolve({} as any)
    expect(data).toEqual({ async: true })
  })
})

describe('normalizeData', () => {
  describe('key-value (plain object)', () => {
    it('should wrap plain object into a root node with state', () => {
      const result = normalizeData({
        count: 42,
        name: 'hello',
        enabled: true,
      })

      expect(result.tree).toHaveLength(1)
      expect(result.tree[0].id).toBe('root')
      expect(result.tree[0].label).toBe('Data')

      expect(result.stateMap.has('root')).toBe(true)
      const state = result.stateMap.get('root')!
      expect(state.count).toEqual([{ key: 'count', value: 42 }])
      expect(state.name).toEqual([{ key: 'name', value: 'hello' }])
      expect(state.enabled).toEqual([{ key: 'enabled', value: true }])
    })

    it('should handle empty object', () => {
      const result = normalizeData({})

      expect(result.tree).toHaveLength(1)
      expect(result.tree[0].id).toBe('root')
      expect(result.stateMap.has('root')).toBe(true)
      expect(Object.keys(result.stateMap.get('root')!)).toHaveLength(0)
    })
  })

  describe('single inspector node', () => {
    it('should convert single node with state fields', () => {
      const result = normalizeData({
        id: 'mynode',
        label: 'My Node',
        value: 123,
        active: true,
      })

      expect(result.tree).toHaveLength(1)
      expect(result.tree[0].id).toBe('mynode')
      expect(result.tree[0].label).toBe('My Node')
      expect(result.tree[0].children).toBeUndefined()

      expect(result.stateMap.has('mynode')).toBe(true)
      const state = result.stateMap.get('mynode')!
      expect(state.value).toEqual([{ key: 'value', value: 123 }])
      expect(state.active).toEqual([{ key: 'active', value: true }])
    })

    it('should convert single node with nested children', () => {
      const result = normalizeData({
        id: 'parent',
        label: 'Parent',
        extra: 'info',
        children: [
          {
            id: 'kid',
            label: 'Kid',
            age: 10,
          },
        ],
      })

      expect(result.tree).toHaveLength(1)
      expect(result.tree[0].id).toBe('parent')
      expect(result.tree[0].children).toHaveLength(1)
      expect(result.tree[0].children![0].id).toBe('parent.kid')

      expect(result.stateMap.has('parent')).toBe(true)
      expect(result.stateMap.has('parent.kid')).toBe(true)
      expect(result.stateMap.get('parent.kid')!.age).toEqual([{ key: 'age', value: 10 }])
    })
  })

  describe('tree array (InspectorNode[])', () => {
    it('should convert array of nodes', () => {
      const result = normalizeData([
        {
          id: 'a',
          label: 'Node A',
          value: 1,
        },
        {
          id: 'b',
          label: 'Node B',
          value: 2,
        },
      ])

      expect(result.tree).toHaveLength(2)
      expect(result.tree[0].id).toBe('a')
      expect(result.tree[1].id).toBe('b')

      expect(result.stateMap.get('a')!.value).toEqual([{ key: 'value', value: 1 }])
      expect(result.stateMap.get('b')!.value).toEqual([{ key: 'value', value: 2 }])
    })

    it('should build nested tree with unique scoped ids', () => {
      const result = normalizeData([
        {
          id: 'root',
          label: 'Root',
          meta: 'root-meta',
          children: [
            {
              id: 'child-1',
              label: 'First Child',
              weight: 10,
            },
            {
              id: 'child-2',
              label: 'Second Child',
              weight: 20,
              children: [
                {
                  id: 'grandchild',
                  label: 'Grandchild',
                  nested: true,
                },
              ],
            },
          ],
        },
      ])

      expect(result.tree).toHaveLength(1)
      const root = result.tree[0]
      expect(root.id).toBe('root')
      expect(root.children).toHaveLength(2)
      expect(root.children![0].id).toBe('root.child-1')
      expect(root.children![1].id).toBe('root.child-2')
      expect(root.children![1].children).toHaveLength(1)
      expect(root.children![1].children![0].id).toBe('root.child-2.grandchild')

      expect(result.stateMap.get('root')!.meta).toEqual([{ key: 'meta', value: 'root-meta' }])
      expect(result.stateMap.get('root.child-1')!.weight).toEqual([{ key: 'weight', value: 10 }])
      expect(result.stateMap.get('root.child-2')!.weight).toEqual([{ key: 'weight', value: 20 }])
      expect(result.stateMap.get('root.child-2.grandchild')!.nested).toEqual([{ key: 'nested', value: true }])
    })

    it('should not add state entry for nodes with only id/label/children', () => {
      const result = normalizeData([
        {
          id: 'container',
          label: 'Container',
          children: [
            {
              id: 'leaf',
              label: 'Leaf',
            },
          ],
        },
      ])

      expect(result.stateMap.has('container')).toBe(false)
      expect(result.stateMap.has('container.leaf')).toBe(false)
    })
  })
})

describe('normalizeNode', () => {
  it('should compute full id with parent prefix', () => {
    const result = normalizeNode({
      id: 'child',
      label: 'Child',
    }, 'parent.scope')

    expect(result.tree[0].id).toBe('parent.scope.child')
  })

  it('should recursively collect state from all descendants', () => {
    const result = normalizeNode({
      id: 'a',
      label: 'A',
      aData: 1,
      children: [
        {
          id: 'b',
          label: 'B',
          bData: 2,
          children: [
            {
              id: 'c',
              label: 'C',
              cData: 3,
            },
          ],
        },
      ],
    })

    expect(result.stateMap.size).toBe(3)
    expect(result.stateMap.get('a')!.aData).toEqual([{ key: 'aData', value: 1 }])
    expect(result.stateMap.get('a.b')!.bData).toEqual([{ key: 'bData', value: 2 }])
    expect(result.stateMap.get('a.b.c')!.cData).toEqual([{ key: 'cData', value: 3 }])
  })
})
