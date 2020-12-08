import {
  Hooks as CoreHooks,
  Plugin,
  Workspace,
} from '@yarnpkg/core';
import PackageLambdaCommand from "./commands/packLambda";

export interface Hooks {
  beforeWorkspacePacking?: (
      workspace: Workspace,
      rawManifest: object,
  ) => Promise<void>|void;
}

const beforeWorkspacePacking = (workspace: Workspace, rawManifest: any) => {
  console.log("hooking into beforeWorkspacePacking")
}

const plugin: Plugin<CoreHooks & Hooks> = {
  hooks: {
    beforeWorkspacePacking
  },
  commands: [
    PackageLambdaCommand,
  ],
};

export default plugin;
