// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { mapEditorItems } from '@nuxt/ui/utils/editor'
import { afterEach, describe, expect, it } from 'vitest'

import PageBlock from '../app/editor/page/PageBlock'
import { clearPageBlockSelection } from '../app/editor/page/selection'
import type { PageBlockAttrs, PageBlockComponentKey } from '../app/editor/page/types'
import { createPageProfile } from '../app/editor/profiles'
import { clonePagePatternContent } from '../shared/page-patterns'

const editors: Editor[] = []
const testStarterKit = StarterKit.configure({ trailingNode: false })

function block(component: PageBlockComponentKey, title: string) {
  return {
    type: 'pageBlock',
    attrs: {
      component,
      props: { title },
      advanced: {},
      media: { url: '', alt: '' }
    }
  }
}

function createEditor(components: PageBlockComponentKey[] = ['pageHero', 'pageCard', 'pageCTA']) {
  const editor = new Editor({
    extensions: [testStarterKit, PageBlock],
    content: {
      type: 'doc',
      content: components.map(component => block(component, component))
    }
  })
  editors.push(editor)
  return editor
}

function positionAt(editor: Editor, index: number) {
  let position = -1
  editor.state.doc.forEach((_node, offset, childIndex) => {
    if (childIndex === index) position = offset
  })
  if (position < 0) throw new Error(`Missing document child ${index}`)
  return position
}

function selectAt(editor: Editor, index: number) {
  editor.commands.setNodeSelection(positionAt(editor, index))
}

function components(editor: Editor) {
  return (editor.getJSON().content ?? []).map(node => node.attrs?.component)
}

function titleAt(editor: Editor, index: number) {
  return (editor.getJSON().content?.[index]?.attrs?.props as { title?: string } | undefined)?.title
}

function expectSingleTransaction(editor: Editor, action: () => boolean) {
  let transactions = 0
  const handler = () => {
    transactions += 1
  }
  editor.on('transaction', handler)
  expect(action()).toBe(true)
  editor.off('transaction', handler)
  expect(transactions).toBe(1)
}

function dragMenuItems(editor: Editor, index: number) {
  const pos = positionAt(editor, index)
  const node = editor.state.doc.nodeAt(pos)
  if (!node) throw new Error(`Missing node at ${pos}`)
  const profile = createPageProfile()
  const groups = profile.quickMenuGroups.flatMap(create => create({
    editor,
    node: node.toJSON(),
    pos
  }))
  return mapEditorItems(editor, groups as any, profile.handlers) as any[][]
}

function dragMenuAction(editor: Editor, index: number, label: string) {
  const items = dragMenuItems(editor, index).flat()
  const matches = items.filter(item => item.label === label)
  expect(matches).toHaveLength(1)
  return matches[0]
}

afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

describe('page block transaction commands', () => {
  it('inserts registered blocks at exact top-level positions and selects the insertion', () => {
    const editor = createEditor(['pageHero', 'pageCTA'])
    const attrs: PageBlockAttrs & { component: PageBlockComponentKey } = {
      component: 'pageCard',
      props: { title: 'Inserted card' },
      advanced: {},
      media: { url: '', alt: '' }
    }

    expectSingleTransaction(editor, () => editor.commands.insertPageBlockAt(positionAt(editor, 1), attrs))

    expect(components(editor)).toEqual(['pageHero', 'pageCard', 'pageCTA'])
    expect(titleAt(editor, 1)).toBe('Inserted card')
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.state.selection.from).toBe(positionAt(editor, 1))
    expect(editor.commands.undo()).toBe(true)
    expect(components(editor)).toEqual(['pageHero', 'pageCTA'])
  })

  it('inserts a deep-cloned pattern in one transaction and removes it with one undo', () => {
    const editor = createEditor(['pageHero', 'pageCTA'])
    const pattern = clonePagePatternContent('testimonial-social-proof')
    const destination = positionAt(editor, 1)

    expectSingleTransaction(editor, () => editor.commands.insertPagePatternAt(destination, pattern))

    expect(components(editor)).toEqual(['pageHero', 'pageTestimonial', 'pageLogos', 'pageCTA'])
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.state.selection.from).toBe(positionAt(editor, 1))
    expect(editor.commands.undo()).toBe(true)
    expect(components(editor)).toEqual(['pageHero', 'pageCTA'])
    expect(pattern).toEqual(clonePagePatternContent('testimonial-social-proof'))
  })

  it('keeps every inserted pattern block independently selectable and editable', () => {
    const editor = createEditor(['pageHero'])
    expect(editor.commands.insertPagePatternAt(editor.state.doc.content.size, clonePagePatternContent('testimonial-social-proof'))).toBe(true)

    selectAt(editor, 2)
    expect(editor.commands.updatePageBlockAttributes({ props: { title: 'Updated proof' } })).toBe(true)
    expect(titleAt(editor, 2)).toBe('Updated proof')
    expect(components(editor)).toEqual(['pageHero', 'pageTestimonial', 'pageLogos'])
  })

  it('rejects malformed patterns and non-top-level pattern destinations without mutation', () => {
    const editor = new Editor({
      extensions: [testStarterKit, PageBlock],
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text' }] }] }
    })
    editors.push(editor)
    const before = editor.getJSON()
    const malformed = clonePagePatternContent('centered-hero') as any
    malformed[0].attrs.props.class = 'fixed inset-0'

    expect(editor.commands.insertPagePatternAt(0, malformed)).toBe(false)
    expect(editor.commands.insertPagePatternAt(1, clonePagePatternContent('centered-hero'))).toBe(false)
    expect(editor.commands.insertPagePatternAt(0, [])).toBe(false)
    expect(editor.getJSON()).toEqual(before)
  })

  it('rejects unknown component keys and non-top-level insertion positions', () => {
    const editor = new Editor({
      extensions: [testStarterKit, PageBlock],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text' }] }]
      }
    })
    editors.push(editor)
    const before = editor.getJSON()
    const attrs = {
      component: 'retiredBlock',
      props: {},
      advanced: {},
      media: {}
    } as any

    expect(editor.commands.insertPageBlockAt(0, attrs)).toBe(false)
    expect(editor.commands.insertPageBlockAt(1, { ...attrs, component: 'pageHero' })).toBe(false)
    expect(editor.getJSON()).toEqual(before)
  })

  it('duplicates the live selected block, selects the copy, and undoes in one step', () => {
    const editor = createEditor()
    selectAt(editor, 1)

    expectSingleTransaction(editor, () => editor.commands.duplicatePageBlock())

    expect(components(editor)).toEqual(['pageHero', 'pageCard', 'pageCard', 'pageCTA'])
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.state.selection.from).toBe(positionAt(editor, 2))
    expect(editor.commands.undo()).toBe(true)
    expect(components(editor)).toEqual(['pageHero', 'pageCard', 'pageCTA'])
  })

  it('deletes the live selected block and selects a neighboring page block', () => {
    const editor = createEditor()
    selectAt(editor, 1)

    expectSingleTransaction(editor, () => editor.commands.deletePageBlock())

    expect(components(editor)).toEqual(['pageHero', 'pageCTA'])
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.state.selection.from).toBe(positionAt(editor, 1))
    expect(editor.commands.undo()).toBe(true)
    expect(components(editor)).toEqual(['pageHero', 'pageCard', 'pageCTA'])

    selectAt(editor, 2)
    expect(editor.commands.deletePageBlock()).toBe(true)
    expect(editor.state.selection.from).toBe(positionAt(editor, 1))
  })

  it('moves the live selected block in either direction with stable selection', () => {
    const editor = createEditor()
    selectAt(editor, 1)

    expectSingleTransaction(editor, () => editor.commands.movePageBlockUp())
    expect(components(editor)).toEqual(['pageCard', 'pageHero', 'pageCTA'])
    expect(editor.state.selection.from).toBe(positionAt(editor, 0))
    expect(editor.commands.undo()).toBe(true)

    selectAt(editor, 1)
    expectSingleTransaction(editor, () => editor.commands.movePageBlockDown())
    expect(components(editor)).toEqual(['pageHero', 'pageCTA', 'pageCard'])
    expect(editor.state.selection.from).toBe(positionAt(editor, 2))
    expect(editor.commands.undo()).toBe(true)
    expect(components(editor)).toEqual(['pageHero', 'pageCard', 'pageCTA'])
  })

  it('updates selected block attributes without using a cached position', () => {
    const editor = createEditor()
    selectAt(editor, 2)

    expectSingleTransaction(editor, () => editor.commands.updatePageBlockAttributes({
      props: { title: 'Updated CTA' }
    }))

    expect(titleAt(editor, 2)).toBe('Updated CTA')
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.state.selection.from).toBe(positionAt(editor, 2))
    expect(editor.commands.undo()).toBe(true)
    expect(titleAt(editor, 2)).toBe('pageCTA')
  })

  it('clears an atomic page-block selection without mutating content', () => {
    const editor = createEditor()
    selectAt(editor, 1)
    const before = editor.getJSON()

    expect(clearPageBlockSelection(editor)).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(GapCursor)
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection)
    expect(editor.getJSON()).toEqual(before)
    expect(clearPageBlockSelection(editor)).toBe(false)
  })

  it('targets the clicked drag-handle position with one built-in action each', () => {
    const duplicateEditor = createEditor()
    selectAt(duplicateEditor, 0)
    dragMenuAction(duplicateEditor, 1, 'Duplicate').onSelect()
    expect(components(duplicateEditor)).toEqual(['pageHero', 'pageCard', 'pageCard', 'pageCTA'])
    expect(duplicateEditor.state.selection).toBeInstanceOf(NodeSelection)
    expect(duplicateEditor.state.selection.from).toBe(positionAt(duplicateEditor, 2))
    expect(duplicateEditor.commands.undo()).toBe(true)
    expect(components(duplicateEditor)).toEqual(['pageHero', 'pageCard', 'pageCTA'])

    const moveEditor = createEditor()
    expect(dragMenuAction(moveEditor, 0, 'Move up').disabled).toBe(true)
    expect(dragMenuAction(moveEditor, 2, 'Move down').disabled).toBe(true)
    dragMenuAction(moveEditor, 1, 'Move up').onSelect()
    expect(components(moveEditor)).toEqual(['pageCard', 'pageHero', 'pageCTA'])
    expect(moveEditor.state.selection.from).toBe(positionAt(moveEditor, 0))
    expect(moveEditor.commands.undo()).toBe(true)
    dragMenuAction(moveEditor, 1, 'Move down').onSelect()
    expect(components(moveEditor)).toEqual(['pageHero', 'pageCTA', 'pageCard'])
    expect(moveEditor.state.selection.from).toBe(positionAt(moveEditor, 2))
    expect(moveEditor.commands.undo()).toBe(true)

    const deleteEditor = createEditor()
    dragMenuAction(deleteEditor, 1, 'Delete').onSelect()
    expect(components(deleteEditor)).toEqual(['pageHero', 'pageCTA'])
    expect(deleteEditor.state.selection).toBeInstanceOf(NodeSelection)
    expect(deleteEditor.state.selection.from).toBe(positionAt(deleteEditor, 0))
    expect(deleteEditor.commands.undo()).toBe(true)
    expect(components(deleteEditor)).toEqual(['pageHero', 'pageCard', 'pageCTA'])
  })

  it('rejects commands without a registered page-block NodeSelection', () => {
    const editor = createEditor(['pageHero'])
    const before = editor.getJSON()
    editor.commands.selectAll()

    expect(editor.commands.duplicatePageBlock()).toBe(false)
    expect(editor.commands.deletePageBlock()).toBe(false)
    expect(editor.commands.movePageBlockUp()).toBe(false)
    expect(editor.commands.movePageBlockDown()).toBe(false)
    expect(editor.commands.updatePageBlockAttributes({ component: 'retiredBlock' } as any)).toBe(false)
    expect(editor.getJSON()).toEqual(before)
  })
})
