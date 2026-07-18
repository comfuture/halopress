import PageBlock from '../page/PageBlock'
import type { AnyExtension } from '@tiptap/core'
import { createEditorProfile } from './merge'
import { richTextProfileDefinition } from './richText'
import type {
  EditorProfileCustomization,
  EditorProfileDefinition,
  EditorProfileToolbarGroup,
  EditorQuickMenuContext
} from './types'

const pageBlockToolbarKinds = new Set(['undo', 'redo'])

export function getPageToolbarGroups(
  groups: EditorProfileToolbarGroup[],
  selectedNodeType: string | null
) {
  if (selectedNodeType !== 'pageBlock') return groups
  return groups
    .map(group => group.filter(item => (
      'kind' in item
      && typeof item.kind === 'string'
      && pageBlockToolbarKinds.has(item.kind)
    )))
    .filter(group => group.length > 0)
}

const pageQuickMenuGroups = richTextProfileDefinition.quickMenuGroups.map((contribution) => {
  if (contribution.key !== 'transform') return contribution
  return {
    ...contribution,
    create: () => {
      const createTransformMenu = contribution.create()
      return (context: EditorQuickMenuContext) => context.node.type === 'pageBlock' ? [] : createTransformMenu(context)
    }
  }
})

export const pageProfileDefinition: EditorProfileDefinition = {
  ...richTextProfileDefinition,
  name: 'page',
  extensions: [
    ...richTextProfileDefinition.extensions,
    { key: 'pageBlock', create: () => PageBlock.configure({}) }
  ],
  readOnlyExtensions: [
    ...richTextProfileDefinition.readOnlyExtensions,
    { key: 'pageBlock', create: () => PageBlock.configure({}) }
  ],
  quickMenuGroups: pageQuickMenuGroups
}

export function createPageProfile(
  customization: EditorProfileCustomization = {},
  options: { pageBlockFactory?: () => AnyExtension, imageUploadFactory?: () => AnyExtension } = {}
) {
  const definition = {
    ...pageProfileDefinition,
    extensions: pageProfileDefinition.extensions.map((contribution) => {
      if (contribution.key === 'pageBlock' && options.pageBlockFactory) {
        return { ...contribution, create: options.pageBlockFactory }
      }
      if (contribution.key === 'imageUpload' && options.imageUploadFactory) {
        return { ...contribution, create: options.imageUploadFactory }
      }
      return contribution
    })
  }
  return createEditorProfile(definition, customization)
}
