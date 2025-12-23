// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      // MVP: allow faster iteration (tighten later).
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/no-mutating-props': 'off',
      'vue/max-attributes-per-line': 'off',
      '@stylistic/no-multiple-empty-lines': 'off',
      '@stylistic/member-delimiter-style': 'off',
      '@stylistic/operator-linebreak': 'off',
      '@stylistic/quote-props': 'off',
      '@stylistic/arrow-parens': 'off',
      'nuxt/nuxt-config-keys-order': 'off'
    }
  }
)
