import {CommandContext, Configuration, Project, StreamReport} from "@yarnpkg/core";
import {getLibzipSync} from "@yarnpkg/libzip"
import {Filename, ppath, ZipFS, statUtils} from "@yarnpkg/fslib";
import {WorkspaceRequiredError} from "@yarnpkg/cli";
import {Command, Usage} from "clipanion";

import {addFilesToZip, getLambdaSrcFiles, addPackagesToZip} from "../utils";
import fileHash from "../fileHash";

export default class PackageLambdaCommand extends Command<CommandContext> {

  @Command.String('-o,--out', {description: "Create the zip at a specified path"})
  out?: string;

  @Command.String('-s,--src-dir', {description: "Location of lambda src"})
  srcDir?: string;

  @Command.Boolean('--deps-only', {description: "Only package dependencies"})
  depsOnly = false;

  @Command.Boolean('--json', {description: `Format the output as an NDJSON stream`})
  json: boolean = false;

  static usage: Usage = Command.Usage({
    description: `generate a lambda zip from the active workspace`,
    details: `
      This command will turn the active workspace into a compressed zip suitable for publishing to AWS. The archive will by default be stored at the root of the workspace (\`lambda.zip\`).
    `,
    examples: [
      [
        'Create a zip from the active workspace',
        'yarn packageLambda',
      ],
      [
        'Define a different name of the output zip',
        'yarn packageLambda --out output.zip',
      ],
      [
        'Package lambda source compiled with Typescript',
        'yarn packageLambda --out lambda.zip --src-dir dist/'
      ],
      [
        'Only package the dependencies in the zip - useful for layers only containing node_modules',
        'yarn packageLambda --deps-only --out layer.zip'
      ]
    ],
  });

  @Command.Path('packageLambda')
  async execute() {
    const configuration = await Configuration.find(this.context.cwd, this.context.plugins);
    const {project, workspace} = await Project.find(configuration, this.context.cwd);

    const target = typeof this.out !== 'undefined'
        ? ppath.resolve(this.context.cwd, this.out as Filename)
        : ppath.resolve(workspace.cwd, 'lambda.zip' as Filename);

    const srcPath = typeof this.srcDir !== 'undefined'
        ? ppath.resolve(this.context.cwd, this.srcDir as Filename)
        : workspace.cwd;

    if (!workspace)
      throw new WorkspaceRequiredError(project.cwd, this.context.cwd);

    await project.restoreInstallState();

    const pkg = project.storedPackages.get(workspace.anchoredLocator.locatorHash);

    if (!pkg)
      throw new Error(`Assertion failed: The package should have been registered`);

    const libzip = getLibzipSync();

    const outputZip = new ZipFS(target, {create: true, libzip, level: 'mixed', stats: statUtils.makeDefaultStats()});

    const report = await StreamReport.start({
      configuration,
      stdout: this.context.stdout,
      json: this.json,
    }, async report => {
      report.reportJson({workspace: workspace.cwd, src: srcPath});

      if (!this.depsOnly) {
        const files = await getLambdaSrcFiles(srcPath, workspace);

        for (const file of files) {
          report.reportInfo(null, file);
          report.reportJson({src: file});
        }

        await addFilesToZip(srcPath, files, outputZip)
      }

      await addPackagesToZip(outputZip, workspace, project, configuration, report);

      outputZip.saveAndClose();

      const outputZipHash = await fileHash(outputZip.getRealPath());

      report.reportInfo(null, `sha256: ${outputZipHash}`);
      report.reportJson({hash: outputZipHash});
    });

    return report.exitCode();
  }
}

