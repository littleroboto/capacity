import type { OrgFunction } from './types';

/** Default national-office functions mapped onto existing YAML load buckets. */
export const DEFAULT_ORG_FUNCTIONS: OrgFunction[] = [
  {
    id: 'lab_engineering',
    label: 'Lab / engineering',
    bucket: 'labs',
    description: 'Build, test, and release engineering capacity (YAML resources.labs).',
  },
  {
    id: 'delivery_teams',
    label: 'Delivery teams',
    bucket: 'teams',
    description: 'PO / SM / BA capacity (YAML resources.teams sum).',
  },
  {
    id: 'platform_backend',
    label: 'Platform & backend',
    bucket: 'backend',
    description: 'Shared services, integrations, operational stability.',
  },
  {
    id: 'field_ops',
    label: 'Operations',
    bucket: 'ops',
    description: 'Restaurant operations, deployment, field coordination.',
  },
  {
    id: 'commercial_marketing',
    label: 'Commercial / marketing',
    bucket: 'commercial',
    description: 'Campaigns, pricing, promo execution.',
  },
];
