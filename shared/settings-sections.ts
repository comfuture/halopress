export type SettingsSectionId =
  | 'overview'
  | 'site'
  | 'appearance'
  | 'navigation'
  | 'footer'
  | 'authentication'
  | 'membership'
  | 'publishing'
  | 'integrations'
  | 'operations'

export type SettingsSection = {
  id: SettingsSectionId
  label: string
  description: string
  icon: string
  to: string
  availability: 'available' | 'extension'
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Configuration status across HaloPress.',
    icon: 'i-lucide-layout-grid',
    to: '/_desk/settings',
    availability: 'available'
  },
  {
    id: 'site',
    label: 'Site',
    description: 'Public identity, metadata, and site shell.',
    icon: 'i-lucide-globe-2',
    to: '/_desk/settings/site',
    availability: 'available'
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme, colors, typography, and color mode.',
    icon: 'i-lucide-palette',
    to: '/_desk/settings/appearance',
    availability: 'available'
  },
  {
    id: 'navigation',
    label: 'Navigation',
    description: 'Public header links and their order.',
    icon: 'i-lucide-menu',
    to: '/_desk/settings/navigation',
    availability: 'available'
  },
  {
    id: 'footer',
    label: 'Footer',
    description: 'Footer layout, links, and copyright.',
    icon: 'i-lucide-panel-bottom',
    to: '/_desk/settings/footer',
    availability: 'available'
  },
  {
    id: 'authentication',
    label: 'Authentication',
    description: 'Administrator sign-in providers and recovery access.',
    icon: 'i-lucide-shield-check',
    to: '/_desk/settings/authentication',
    availability: 'available'
  },
  {
    id: 'membership',
    label: 'Membership',
    description: 'Public registration, invitations, approval, and member roles.',
    icon: 'i-lucide-users-round',
    to: '/_desk/settings/membership',
    availability: 'available'
  },
  {
    id: 'publishing',
    label: 'Publishing',
    description: 'Reserved for publication defaults and workflow policy.',
    icon: 'i-lucide-send',
    to: '/_desk/settings/publishing',
    availability: 'extension'
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'Reserved for external services and delivery hooks.',
    icon: 'i-lucide-plug',
    to: '/_desk/settings/integrations',
    availability: 'extension'
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Reserved for advanced deployment and maintenance controls.',
    icon: 'i-lucide-wrench',
    to: '/_desk/settings/operations',
    availability: 'extension'
  }
] as const

export function findSettingsSection(id: string) {
  return SETTINGS_SECTIONS.find(section => section.id === id)
}
