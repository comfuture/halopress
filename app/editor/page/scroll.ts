import type { Editor } from '@tiptap/core'

export function scrollPageBlockIntoView(editor: Editor, position: number) {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return
    if (editor.state.doc.nodeAt(position)?.type.name !== 'pageBlock') return

    const element = editor.view.nodeDOM(position)
    if (!(element instanceof HTMLElement)) return
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}
