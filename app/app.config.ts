export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate'
    },
    button: {
      slots: {
        base: 'disabled:opacity-50 aria-disabled:opacity-50'
      }
    }
  }
})
