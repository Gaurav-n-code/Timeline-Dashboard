import type { AssetTreeNode, DashboardFilterOption } from './types';

function getNodeLabel(node: AssetTreeNode) {
  return node.codename?.trim() || node.name?.trim() || node.id;
}

export function flattenAssetTree(nodes: AssetTreeNode[]) {
  const options: DashboardFilterOption[] = [];

  function visit(node: AssetTreeNode) {
    options.push({
      id: node.id,
      label: `${getNodeLabel(node)} · level ${node.assetlevel_id}`,
      assetLevelId: node.assetlevel_id,
    });

    for (const child of node.children ?? []) {
      visit(child);
    }
  }

  for (const node of nodes) {
    visit(node);
  }

  return options;
}
