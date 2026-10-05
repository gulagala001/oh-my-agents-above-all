import { Group } from '@deepseek-ai/cordis-plugin-loader';

// Native filesystem/shell tools capture the policy when they mount. The loader
// starts sibling rows concurrently, so their group must wait for our isolated
// provider instead of relying on the order of rows in the patch.
export default class WorkingTools extends Group {
  static inject = ['sandboxPolicy', 'omaa'];
  constructor(ctx, config) {
    const workflow = ctx.get('trisoulX')?.omaaWorkflowComposition;
    const adapted = typeof workflow === 'function' ? config.map(row => row.id === 'delegation' ? { ...row, config: [
      ...workflow(), ...row.config.filter(child => !['workflow-ptc', 'tool-workflow'].includes(child.id)),
    ] } : row) : config;
    super(ctx, adapted);
  }
}
