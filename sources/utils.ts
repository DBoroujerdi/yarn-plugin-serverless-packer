import {
  Cache,
  Configuration,
  Descriptor,
  LocatorHash,
  Package,
  Project,
  StreamReport,
  Workspace
} from "@yarnpkg/core";
import {
  ZipFS,
  JailFS,
  Filename,
  FakeFS,
  xfs,
  PortablePath,
  ppath,
  npath
} from "@yarnpkg/fslib";
import mm from "micromatch";

const ALWAYS_IGNORE = [
  `/package.tgz`,

  `.github`,
  `.git`,
  `.hg`,
  `node_modules`,

  `.npmignore`,
  `.gitignore`,

  `.#*`,
  `.DS_Store`,

  `.yarn`,
];

type IgnoreList = {
  accept: Array<string>;
  reject: Array<string>;
};

export async function getLambdaSrcFiles(src: PortablePath, workspace: Workspace) {
  const project = workspace.project;

  const globalList: IgnoreList = {
    accept: [],
    reject: [],
  };

  for (const pattern of ALWAYS_IGNORE)
    globalList.reject.push(pattern);


  // All child workspaces are ignored
  for (const otherWorkspace of project.workspaces) {
    const rel = ppath.relative(workspace.cwd, otherWorkspace.cwd);
    if (rel !== `` && !rel.match(/^(\.\.)?\//)) {
      globalList.reject.push(`/${rel}`);
    }
  }

  const cwdFs = new JailFS(PortablePath.root);

  const entries = await cwdFs.readdirPromise(workspace.cwd);

  const hasLambdaIgnore = entries.find((entry) => entry === '.lambdaignore') !== undefined;

  const ignoreList: IgnoreList = {
    accept: [],
    reject: [],
  };

  if (hasLambdaIgnore) {
    const rejectList = await loadIgnoreList(cwdFs, workspace.cwd, '.lambdaignore' as Filename);
    ignoreList.reject = [...ignoreList.reject, ...rejectList, '.lambdaignore'];
  }

  return await walk(src, globalList, ignoreList);
}

export async function addFilesToZip(src: PortablePath, files: PortablePath[], outputZip: ZipFS) {
  for (const fileRequest of files) {
    const file = ppath.normalize(fileRequest);
    const source = ppath.resolve(src, file);

    const stat = await xfs.lstatPromise(source);

    if (stat.isFile()) {
      const content = await xfs.readFilePromise(source);
      await outputZip.writeFilePromise(file, content);
    } else if (stat.isSymbolicLink()) {
      const content = await xfs.readlinkPromise(source)
      await outputZip.symlinkPromise(content, file);
    } else {
      throw new Error(`Unsupported file type ${stat.mode} for ${npath.fromPortablePath(file)}`);
    }

    await outputZip.utimesPromise(file, 0, 0);
  }

  return outputZip;
}

// TODO possible stack overflow here
async function walkFs(fs: FakeFS<PortablePath>, directory: PortablePath) {
  let collectedFiles = [];

  for (const file of (await fs.readdirPromise(directory))) {
    if ((await fs.statPromise(ppath.join(directory, file))).isDirectory()) {
      collectedFiles.push(ppath.join(directory, file));
      collectedFiles = [...collectedFiles, ...(await walkFs(fs, ppath.join(directory, file)))];
    } else {
      collectedFiles.push(ppath.join(directory, file));
    }
  }

  return collectedFiles;
}

export async function addPackagesToZip(outputZip: ZipFS, workspace: Workspace, project: Project, configuration: Configuration, report: StreamReport) {
  const depLocatorHashes: Set<LocatorHash> = new Set();

  function findPkg(project: Project, descriptor: Descriptor) {
    for (const locatorHash of project.storedResolutions.values()) {
      const pkg = project.storedPackages.get(locatorHash);
      if (pkg.identHash === descriptor.identHash) {
        return pkg
      }
    }
  }

  function walk(pkg: Package) {
    depLocatorHashes.add(pkg.locatorHash);

    for (const dependency of pkg.dependencies.values()) {
      const resolution = project.storedResolutions.get(dependency.descriptorHash);
      if (!resolution)
        throw new Error(`Assertion failed: The resolution should have been registered`);

      const nextPkg = project.storedPackages.get(resolution);
      if (!nextPkg)
        throw new Error(`Assertion failed: The package should have been registered`);

      walk(nextPkg);
    }
  }

  for (const descriptor of workspace.manifest.dependencies.values()) {
    const foundPkg = findPkg(project, descriptor);

    if (!foundPkg)
      throw new Error(`Unable to find package ${descriptor.name}`);

    walk(foundPkg);
  }

  const fetcher = configuration.makeFetcher();
  const fetcherOptions = {
    checksums: project.storedChecksums,
    project,
    cache: await Cache.find(configuration),
    fetcher,
    report
  }

  for (const locatorHash of depLocatorHashes) {
    const pkg = project.storedPackages.get(locatorHash);

    const fetchResult = await fetcher.fetch(pkg, fetcherOptions);

    const pkgRoot = fetchResult.localPath || PortablePath.root;

    const collected = await walkFs(fetchResult.packageFs, pkgRoot);

    const pkgFileSystem = fetchResult.packageFs;

    if (!(await pkgFileSystem.getRealPath()).endsWith(".zip")) {
      // TODO handle non zip workspace packages
      continue;
    }

    report.reportInfo(null, `${pkg.name}:${pkg.reference}`);
    report.reportJson({dependency: pkg.name, ref: pkg.reference});

    for (const file of collected) {
      const stat = await pkgFileSystem.lstatPromise(file);

      if (stat.isDirectory()) {
        await outputZip.mkdirpPromise(file);
      } else {
        const buffer = await pkgFileSystem.readFilePromise(file);
        await outputZip.writeFilePromise(file, buffer);
      }

      await outputZip.utimesPromise(file, stat.atime, stat.mtime);
    }
  }
}

async function loadIgnoreList(fs: FakeFS<PortablePath>, cwd: PortablePath, filename: PortablePath) {
  const rejectList = [];

  const data = await fs.readFilePromise(ppath.join(cwd, filename), `utf8`);

  for (const pattern of data.split(/\n/g))
    addIgnorePattern(rejectList, pattern, {cwd});

  return rejectList;
}

function normalizePattern(pattern: string, {cwd}: { cwd: PortablePath }) {
  const negated = pattern[0] === `!`;

  if (negated)
    pattern = pattern.slice(1);

  if (pattern.match(/\.{0,1}\//))
    pattern = ppath.resolve(cwd, pattern as PortablePath);

  if (negated)
    pattern = `!${pattern}`;

  return pattern;
}

function addIgnorePattern(target: Array<string>, pattern: string, {cwd}: { cwd: PortablePath }) {
  const trimed = pattern.trim();

  if (trimed === `` || trimed[0] === `#`)
    return;

  target.push(normalizePattern(trimed, {cwd}));
}

function isIgnored(cwd: string, {globalList, ignoreList}: { globalList: IgnoreList, ignoreList: IgnoreList }) {
  if (isMatch(cwd, globalList.accept))
    return false;
  if (isMatch(cwd, globalList.reject))
    return true;

  if (isMatch(cwd, ignoreList.accept))
    return false;
  if (isMatch(cwd, ignoreList.reject)) {
    return true;
  }

  return false;
}

function isMatch(path: string, patterns: Array<string>) {
  let inclusives = patterns;
  const exclusives = [];

  for (let t = 0; t < patterns.length; ++t) {
    if (patterns[t][0] !== `!`) {
      if (inclusives !== patterns) {
        inclusives.push(patterns[t]);
      }
    } else {
      if (inclusives === patterns)
        inclusives = patterns.slice(0, t);

      exclusives.push(patterns[t].slice(1));
    }
  }

  if (isMatchBasename(path, exclusives))
    return false;
  if (isMatchBasename(path, inclusives))
    return true;

  return false;
}


function isMatchBasename(path: string, patterns: Array<string>) {
  let paths = patterns;
  const basenames = [];

  for (let t = 0; t < patterns.length; ++t) {
    if (patterns[t].includes(`/`)) {
      if (paths !== patterns) {
        paths.push(patterns[t]);
      }
    } else {
      if (paths === patterns)
        paths = patterns.slice(0, t);

      basenames.push(patterns[t]);
    }
  }

  if (mm.isMatch(path, paths as any, {dot: true, nocase: true}))
    return true;
  if (mm.isMatch(path, basenames as any, {dot: true, basename: true, nocase: true}))
    return true;

  return false;
}

async function walk(dir: PortablePath, globalList: IgnoreList, ignoreList: IgnoreList) {
  const list: Array<PortablePath> = [];

  const cwdFs = new JailFS(dir);
  const cwdList = [PortablePath.root];

  while (cwdList.length > 0) {
    const cwd = cwdList.pop()!;
    const stat = await cwdFs.lstatPromise(cwd);

    if (isIgnored(cwd, {globalList, ignoreList}))
      continue;

    if (stat.isDirectory()) {
      const entries = await cwdFs.readdirPromise(cwd);

      for (const entry of entries) {
        cwdList.push(ppath.resolve(cwd, entry));
      }

      for (const entry of entries) {
        cwdList.push(ppath.resolve(cwd, entry));
      }
    } else if (stat.isFile() || stat.isSymbolicLink()) {
      list.push(ppath.relative(PortablePath.root, cwd));
    }
  }

  return list.sort();
}
