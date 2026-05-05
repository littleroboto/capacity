/**
 * Column definitions for schema-driven fragment grids (admin market detail).
 * Single source for FragmentTable + loading skeleton column counts.
 */
export type FragmentSchemaColumn = { key: string; label: string; editable?: boolean };

export function getColumnsForTable(table: string): FragmentSchemaColumn[] {
  switch (table) {
    case 'campaign_configs':
      return [
        { key: 'name', label: 'Name', editable: true },
        { key: 'start_date', label: 'Start', editable: true },
        { key: 'duration_days', label: 'Duration', editable: true },
        { key: 'promo_weight', label: 'Weight', editable: true },
        { key: 'impact', label: 'Impact', editable: true },
      ];
    case 'tech_programme_configs':
      return [
        { key: 'name', label: 'Name', editable: true },
        { key: 'start_date', label: 'Start', editable: true },
        { key: 'duration_days', label: 'Duration', editable: true },
      ];
    case 'resource_configs':
      return [
        { key: 'labs_capacity', label: 'Labs', editable: true },
        { key: 'staff_capacity', label: 'Staff', editable: true },
        { key: 'testing_capacity', label: 'Testing', editable: true },
        { key: 'staff_monthly_pattern_basis', label: 'Staff basis' },
        { key: 'staff_monthly_pattern', label: 'Staff monthly' },
      ];
    case 'bau_configs':
      return [
        { key: 'days_in_use', label: 'Days in use' },
        { key: 'weekly_cycle', label: 'Weekly cycle' },
        { key: 'market_it_weekly_load', label: 'IT load' },
      ];
    case 'trading_configs':
      return [
        { key: 'campaign_store_boost_prep', label: 'Boost prep', editable: true },
        { key: 'campaign_store_boost_live', label: 'Boost live', editable: true },
        { key: 'campaign_effect_scale', label: 'Effect scale', editable: true },
        { key: 'payday_month_peak_multiplier', label: 'Payday mult', editable: true },
        { key: 'monthly_pattern', label: 'Monthly' },
        { key: 'weekly_pattern', label: 'Weekly' },
        { key: 'seasonal', label: 'Seasonal' },
      ];
    case 'holiday_calendars':
      return [
        { key: 'calendar_type', label: 'Type' },
        { key: 'auto_import', label: 'Auto Import' },
        { key: 'staffing_multiplier', label: 'Staff Mult', editable: true },
        { key: 'trading_multiplier', label: 'Trade Mult', editable: true },
      ];
    case 'national_leave_band_configs':
      return [
        { key: 'label', label: 'Label', editable: true },
        { key: 'from_date', label: 'From', editable: true },
        { key: 'to_date', label: 'To', editable: true },
        { key: 'capacity_multiplier', label: 'Multiplier', editable: true },
        { key: 'weeks', label: 'Weeks' },
      ];
    case 'deployment_risk_configs':
      return [
        { key: 'deployment_risk_week_weight', label: 'Week weight', editable: true },
        { key: 'deployment_resourcing_strain_weight', label: 'Strain weight', editable: true },
        { key: 'events', label: 'Events' },
        { key: 'blackouts', label: 'Blackouts' },
      ];
    case 'operating_window_configs':
      return [
        { key: 'name', label: 'Name', editable: true },
        { key: 'start_date', label: 'Start', editable: true },
        { key: 'end_date', label: 'End', editable: true },
      ];
    default:
      return [{ key: 'id', label: 'ID' }];
  }
}
