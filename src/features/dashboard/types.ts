export type AssetTreeNode = {
  id: string;
  name?: string;
  codename?: string;
  assetlevel_id: number;
  hierarchy?: string | null;
  children?: AssetTreeNode[];
};

export type ShiftDefinition = {
  id: string;
  code: string;
  name: string;
  shift_timings: [string, string];
  is_active: boolean;
};

export type DashboardFilterOption = {
  id: string;
  label: string;
  assetLevelId: number;
};
