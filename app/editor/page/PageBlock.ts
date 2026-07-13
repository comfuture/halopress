import { Node, mergeAttributes } from '@tiptap/core'
import type { PageBlockAttrs, PageBlockComponentKey } from './types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBlock: {
      insertPageBlock: (attrs: Partial<PageBlockAttrs> & { component: PageBlockComponentKey }) => ReturnType
    }
  }
}

export default Node.create({
  name: 'pageBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      component: { default: 'pageHero' },
      props: { default: {} },
      advanced: { default: {} },
      media: { default: { url: '', alt: '' } }
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="page-block"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'page-block' })]
  },
  addCommands() {
    return {
      insertPageBlock: (attrs) => ({ commands }) => {
        return commands.insertContent({ type: this.name, attrs })
      }
    }
  }
})
