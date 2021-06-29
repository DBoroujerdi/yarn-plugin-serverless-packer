import {FakeFS, PortablePath, ppath, ZipFS} from "@yarnpkg/fslib";
import {Cache, Configuration, Descriptor, LocatorHash, Package, Project, StreamReport, Workspace} from "@yarnpkg/core";
import {UsageError} from "clipanion";

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

export default async function addPackagesToZip(outputZip: ZipFS, workspace: Workspace, project: Project, configuration: Configuration, report: StreamReport) {
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

        if (descriptor.range.startsWith("workspace")) {
            depLocatorHashes.add(foundPkg.locatorHash);
        } else {
            walk(foundPkg);
        }
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

        report.reportInfo(null, `${pkg.name}:${pkg.reference}`);
        report.reportJson({dependency: pkg.name, ref: pkg.reference});

        const pkgFileSystem = fetchResult.packageFs;
        const pkgPath = await pkgFileSystem.getRealPath();

        if (!pkgPath.endsWith(".zip")) {
            const pkgWorkspace = project.workspaces.find(w => w.manifest.name.name === pkg.name);

            if (!pkgWorkspace)
                throw new UsageError(`${pkg.name} workspace not found, have you configured yarn workspaces correctly?`);

            const rawManifest = pkgWorkspace.manifest.raw

            if (!rawManifest.directories)
                throw new UsageError(`"directories" not defined for workspace ${pkg.name}`);

            if (!rawManifest.directories.lib)
                throw new UsageError(`"directories.lib" not defined for workspace ${pkg.name}`);

            const outputZipLibPath = ppath.join("node_modules" as PortablePath, pkg.name as PortablePath);
            await outputZip.mkdirpPromise(outputZipLibPath);

            for await (let entry of fetchResult.packageFs.genTraversePromise(ppath.join(pkgPath, rawManifest.directories.lib), {stableSort: true})) {
                const relativeEntry = ppath.relative(ppath.join(pkgPath, rawManifest.directories.lib), entry);
                const stat = await pkgFileSystem.lstatPromise(entry);
                const outEntryFile = ppath.join(outputZipLibPath,  relativeEntry)

                if (stat.isDirectory()) {
                    await outputZip.mkdirpPromise(outEntryFile);
                } else {
                    const buffer = await pkgFileSystem.readFilePromise(entry);
                    await outputZip.writeFilePromise(outEntryFile, buffer);
                }

                await outputZip.utimesPromise(outEntryFile, stat.atime, stat.mtime);
            }
        } else {

            const pkgRoot = fetchResult.localPath || PortablePath.root;
            const collected = await walkFs(fetchResult.packageFs, pkgRoot);

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
}

