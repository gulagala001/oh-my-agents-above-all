import { Group } from '@deepseek-ai/cordis-plugin-loader';

// Native filesystem/shell tools capture the policy when they mount. The loader
// starts sibling rows concurrently, so their group must wait for our isolated
// provider instead of relying on the order of rows in the patch.
export default class WorkingTools extends Group {
  static inject = ['sandboxPolicy', 'omaa'];
  constructor(ctx, config) {
    const adapted = config.map(row => row.id === 'delegation' ? { ...row, config: [
      ...row.config.filter(child => ['workflow-ptc', 'tool-workflow'].includes(child.id)).map(child => ({ ...child, disabled: true })),
      { id: 'workflow-controller', name: 'oh-my-agents-above-all/workflow-controller', config: {
        native: row.config.filter(child => ['workflow-ptc', 'tool-workflow'].includes(child.id)),
      } },
      ...row.config.filter(child => !['workflow-ptc', 'tool-workflow'].includes(child.id)),
    ] } : row);
    super(ctx, adapted);
  }
}
