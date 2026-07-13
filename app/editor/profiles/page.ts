import PageBlock from '../page/PageBlock'
import type { AnyExtension } from '@tiptap/core'
import { createEditorProfile } from './merge'
import { richTextProfileDefinition } from './richText'
import type { EditorProfileCustomization, EditorProfileDefinition } from './types'

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
  ]
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
